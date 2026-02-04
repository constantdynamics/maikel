import { createServiceClient } from '../supabase';
import { getTickerUniverse, getSectorForTicker } from './tickers';
import * as yahoo from './yahoo';
import * as alphavantage from './alphavantage';
import { analyzeGrowthEvents, calculateATH, calculateFiveYearLow } from './scorer';
import {
  validateStockData,
  validatePriceHistory,
  checkIsNYSEOrNASDAQ,
  checkMinimumAge,
  crossValidatePrice,
  detectStockSplit,
} from './validator';
import { sleep } from '../utils';
import type { Settings } from '../types';

interface ScanResult {
  status: 'completed' | 'failed' | 'partial';
  stocksScanned: number;
  stocksFound: number;
  errors: string[];
  durationSeconds: number;
  apiCallsYahoo: number;
  apiCallsAlphaVantage: number;
}

async function getSettings(supabase: ReturnType<typeof createServiceClient>): Promise<Settings> {
  const { data } = await supabase.from('settings').select('key, value');

  const defaults: Settings = {
    ath_decline_min: 95,
    ath_decline_max: 99,
    growth_threshold_pct: 200,
    min_growth_events: 2,
    min_consecutive_days: 5,
    growth_lookback_years: 3,
    purchase_limit_multiplier: 1.20,
    scan_times: ['10:30', '15:00'],
    excluded_sectors: [],
  };

  if (!data) return defaults;

  for (const row of data) {
    const key = row.key as keyof Settings;
    if (key in defaults) {
      try {
        (defaults as unknown as Record<string, unknown>)[key] = typeof defaults[key] === 'number'
          ? Number(row.value)
          : JSON.parse(String(row.value));
      } catch {
        // Keep default
      }
    }
  }

  return defaults;
}

export async function runScan(): Promise<ScanResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();
  const errors: string[] = [];
  let stocksScanned = 0;
  let stocksFound = 0;
  let apiCallsYahoo = 0;
  let apiCallsAlphaVantage = 0;

  // Create scan log entry
  const { data: scanLog } = await supabase
    .from('scan_logs')
    .insert({ status: 'running' })
    .select()
    .single();

  const scanId = scanLog?.id;

  try {
    const settings = await getSettings(supabase);
    const tickers = getTickerUniverse();

    console.log(`Starting scan of ${tickers.length} tickers...`);

    for (const ticker of tickers) {
      try {
        stocksScanned++;
        console.log(`[${stocksScanned}/${tickers.length}] Scanning ${ticker}...`);

        // Step 1: Get basic quote from Yahoo
        const quote = await yahoo.getStockQuote(ticker);
        apiCallsYahoo++;

        if (!quote || !quote.price) {
          continue;
        }

        // Step 2: Exchange check
        if (quote.exchange && !checkIsNYSEOrNASDAQ(quote.exchange)) {
          continue;
        }

        // Step 3: Get historical data
        await sleep(300); // Rate limiting
        const history = await yahoo.getHistoricalData(ticker, 5);
        apiCallsYahoo++;

        if (history.length === 0) {
          errors.push(`${ticker}: No historical data available`);
          continue;
        }

        // Validate price history
        const historyValidation = validatePriceHistory(history);
        if (!historyValidation.isValid) {
          errors.push(`${ticker}: ${historyValidation.errors.join(', ')}`);
          continue;
        }

        // Step 4: Check minimum age (3 years of data)
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        const oldestDate = new Date(history[0].date);
        if (oldestDate > threeYearsAgo) {
          continue; // Stock doesn't have 3 years of history
        }

        // Step 5: Calculate ATH and decline
        const ath = calculateATH(history);
        if (!ath) continue;

        const athDeclinePct =
          ((ath.price - quote.price) / ath.price) * 100;

        // Check if decline is in our range
        if (
          athDeclinePct < settings.ath_decline_min ||
          athDeclinePct > settings.ath_decline_max
        ) {
          continue;
        }

        // Step 6: Detect stock splits
        const splits = detectStockSplit(history);
        if (splits.length > 0) {
          // Log but continue - prices from Yahoo should already be adjusted
          console.log(`${ticker}: Detected ${splits.length} potential split(s)`);
        }

        // Step 7: Analyze growth events
        const growthAnalysis = analyzeGrowthEvents(
          history,
          settings.growth_threshold_pct,
          settings.min_consecutive_days,
          settings.growth_lookback_years,
        );

        if (growthAnalysis.events.length < settings.min_growth_events) {
          continue;
        }

        // Step 8: Calculate 5-year low and purchase limit
        const fiveYearLow = calculateFiveYearLow(history);
        const purchaseLimit = fiveYearLow
          ? fiveYearLow.price * settings.purchase_limit_multiplier
          : null;

        // Step 9: Cross-validate with Alpha Vantage (if calls available)
        let confidenceScore = 100;
        if (alphavantage.getRemainingCalls() > 0) {
          const avVerification = await alphavantage.verifyPrice(
            ticker,
            quote.price,
          );
          apiCallsAlphaVantage++;

          if (avVerification.price !== null) {
            const crossValidation = crossValidatePrice(
              quote.price,
              avVerification.price,
            );
            confidenceScore = crossValidation.confidence;
          }
        }

        // Step 10: Get sector info
        let sector = getSectorForTicker(ticker);
        if (!sector) {
          const profile = await yahoo.getStockProfile(ticker);
          apiCallsYahoo++;
          sector = profile?.sector || null;
        }

        // Check sector exclusions
        if (sector && settings.excluded_sectors.includes(sector)) {
          continue;
        }

        // Step 11: Validate final data
        const validation = validateStockData({
          price: quote.price,
          marketCap: quote.marketCap,
          allTimeHigh: ath.price,
          athDeclinePct,
        });

        let needsReview = false;
        let reviewReason: string | null = null;

        if (!validation.isValid) {
          errors.push(`${ticker}: ${validation.errors.join(', ')}`);
          continue;
        }

        if (validation.warnings.length > 0) {
          needsReview = true;
          reviewReason = validation.warnings.join('; ');
        }

        // Check for extreme volatility
        if (growthAnalysis.highestGrowthPct > 1000) {
          needsReview = true;
          reviewReason = `Extreme growth: ${growthAnalysis.highestGrowthPct.toFixed(0)}%`;
        }

        // Step 12: Upsert stock into database
        const { error: upsertError } = await supabase.from('stocks').upsert(
          {
            ticker,
            company_name: quote.name,
            sector,
            current_price: quote.price,
            all_time_high: ath.price,
            ath_decline_pct: athDeclinePct,
            five_year_low: fiveYearLow?.price || null,
            purchase_limit: purchaseLimit,
            score: growthAnalysis.score,
            growth_event_count: growthAnalysis.events.length,
            highest_growth_pct: growthAnalysis.highestGrowthPct,
            highest_growth_date: growthAnalysis.highestGrowthDate,
            last_updated: new Date().toISOString(),
            confidence_score: confidenceScore,
            needs_review: needsReview,
            review_reason: reviewReason,
            exchange: quote.exchange,
            market_cap: quote.marketCap,
          },
          { onConflict: 'ticker' },
        );

        if (upsertError) {
          errors.push(`${ticker}: DB upsert error: ${upsertError.message}`);
          continue;
        }

        // Step 13: Store growth events
        for (const event of growthAnalysis.events) {
          await supabase.from('growth_events').upsert(
            {
              ticker,
              start_date: event.start_date,
              end_date: event.end_date,
              start_price: event.start_price,
              peak_price: event.peak_price,
              growth_pct: event.growth_pct,
              consecutive_days_above: event.consecutive_days_above,
              is_valid: event.is_valid,
            },
            { onConflict: 'ticker' },
          );
        }

        // Step 14: Store price history (batch insert)
        const priceRecords = history.map((d) => ({
          ticker,
          trade_date: d.date,
          open_price: d.open,
          high_price: d.high,
          low_price: d.low,
          close_price: d.close,
          volume: d.volume,
        }));

        // Insert in batches of 500
        for (let i = 0; i < priceRecords.length; i += 500) {
          const batch = priceRecords.slice(i, i + 500);
          await supabase.from('price_history').upsert(batch, {
            onConflict: 'ticker,trade_date',
          });
        }

        stocksFound++;
        console.log(
          `✓ ${ticker}: Score=${growthAnalysis.score}, ATH Decline=${athDeclinePct.toFixed(1)}%, Events=${growthAnalysis.events.length}`,
        );

        // Rate limiting between stocks
        await sleep(500);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${ticker}: ${errMsg}`);
        console.error(`Error scanning ${ticker}:`, errMsg);
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const status = errors.length === 0 ? 'completed' : 'partial';

    // Update scan log
    if (scanId) {
      await supabase.from('scan_logs').update({
        completed_at: new Date().toISOString(),
        status,
        stocks_scanned: stocksScanned,
        stocks_found: stocksFound,
        errors: errors.slice(0, 50), // Limit stored errors
        duration_seconds: durationSeconds,
        api_calls_yahoo: apiCallsYahoo,
        api_calls_alphavantage: apiCallsAlphaVantage,
      }).eq('id', scanId);
    }

    // Log errors
    if (errors.length > 0) {
      await supabase.from('error_logs').insert(
        errors.slice(0, 20).map((e) => ({
          source: 'scanner',
          message: e,
          severity: 'warning',
        })),
      );
    }

    return {
      status,
      stocksScanned,
      stocksFound,
      errors,
      durationSeconds,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    if (scanId) {
      await supabase.from('scan_logs').update({
        completed_at: new Date().toISOString(),
        status: 'failed',
        stocks_scanned: stocksScanned,
        stocks_found: stocksFound,
        errors: [errMsg],
        duration_seconds: durationSeconds,
      }).eq('id', scanId);
    }

    await supabase.from('error_logs').insert({
      source: 'scanner',
      message: `Scan failed: ${errMsg}`,
      severity: 'critical',
    });

    return {
      status: 'failed',
      stocksScanned,
      stocksFound,
      errors: [errMsg, ...errors],
      durationSeconds,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }
}
