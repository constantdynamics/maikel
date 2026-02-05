import { createServiceClient } from '../supabase';
import { fetchTopLosers, fetchHighDeclineStocks } from './tradingview';
import type { TradingViewStock } from './tradingview';
import * as yahoo from './yahoo';
import * as alphavantage from './alphavantage';
import { analyzeGrowthEvents, calculateATH, calculateFiveYearLow } from './scorer';
import {
  validateStockData,
  validatePriceHistory,
  crossValidatePrice,
  detectStockSplit,
} from './validator';
import { sleep } from '../utils';
import type { Settings } from '../types';

interface ScanResult {
  status: 'completed' | 'failed' | 'partial';
  stocksScanned: number;
  stocksFound: number;
  stocksFromSource: number;
  candidatesAfterPreFilter: number;
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

/**
 * Update scan_logs with current progress so the frontend can poll it.
 */
async function updateProgress(
  supabase: ReturnType<typeof createServiceClient>,
  scanId: string | undefined,
  fields: Record<string, unknown>,
) {
  if (!scanId) return;
  await supabase.from('scan_logs').update(fields).eq('id', scanId);
}

export async function runScan(): Promise<ScanResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();
  const errors: string[] = [];
  let stocksScanned = 0;
  let stocksFound = 0;
  let stocksFromSource = 0;
  let candidatesAfterPreFilter = 0;
  let apiCallsYahoo = 0;
  let apiCallsAlphaVantage = 0;

  // Create scan log entry
  const { data: scanLog } = await supabase
    .from('scan_logs')
    .insert({ status: 'running', stocks_scanned: 0, stocks_found: 0 })
    .select()
    .single();

  const scanId = scanLog?.id;

  try {
    const settings = await getSettings(supabase);

    // =========================================================
    // PHASE 1: Fetch candidates from TradingView (the source)
    // =========================================================
    console.log('Phase 1: Fetching candidates from TradingView...');
    await updateProgress(supabase, scanId, {
      status: 'running',
      stocks_scanned: 0,
      stocks_found: 0,
    });

    // Fetch both top losers AND high-decline stocks from TradingView
    const [topLosers, highDecline] = await Promise.all([
      fetchTopLosers(300),
      fetchHighDeclineStocks(settings.ath_decline_min, 500),
    ]);

    // Merge and deduplicate by ticker
    const candidateMap = new Map<string, TradingViewStock>();
    for (const stock of [...topLosers, ...highDecline]) {
      if (!candidateMap.has(stock.ticker)) {
        candidateMap.set(stock.ticker, stock);
      }
    }

    const allCandidates = Array.from(candidateMap.values());
    stocksFromSource = allCandidates.length;
    console.log(`TradingView returned ${stocksFromSource} unique candidates`);

    if (stocksFromSource === 0) {
      errors.push('TradingView returned 0 candidates - API may be down');
    }

    // =========================================================
    // PHASE 2: Pre-filter using TradingView data (no API calls)
    // =========================================================
    console.log('Phase 2: Pre-filtering candidates...');

    const preFiltered = allCandidates.filter((stock) => {
      // Must be on NYSE/NASDAQ (TradingView already filtered, but double-check)
      const ex = stock.exchange.toUpperCase();
      if (!ex.includes('NYSE') && !ex.includes('NASDAQ') && !ex.includes('AMEX')) {
        return false;
      }

      // Skip excluded sectors
      if (stock.sector && settings.excluded_sectors.includes(stock.sector)) {
        return false;
      }

      // Price must be positive
      if (stock.close <= 0) return false;

      return true;
    });

    candidatesAfterPreFilter = preFiltered.length;
    const totalToScan = preFiltered.length;
    console.log(`${candidatesAfterPreFilter} candidates after pre-filter, starting deep scan...`);

    await updateProgress(supabase, scanId, {
      stocks_scanned: 0,
      stocks_found: 0,
    });

    // =========================================================
    // PHASE 3: Deep scan each candidate (Yahoo historical data)
    // =========================================================
    for (const tvStock of preFiltered) {
      const ticker = tvStock.ticker;

      try {
        stocksScanned++;

        // Update progress every 5 stocks so frontend can poll
        if (stocksScanned % 5 === 0 || stocksScanned === 1) {
          await updateProgress(supabase, scanId, {
            stocks_scanned: stocksScanned,
            stocks_found: stocksFound,
          });
        }

        console.log(`[${stocksScanned}/${totalToScan}] Deep scanning ${ticker}...`);

        // Get 5-year historical data from Yahoo Finance
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

        // Check minimum age (3 years of data)
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        const oldestDate = new Date(history[0].date);
        if (oldestDate > threeYearsAgo) {
          continue;
        }

        // Calculate ATH and decline from full history
        const ath = calculateATH(history);
        if (!ath) continue;

        const currentPrice = tvStock.close;
        const athDeclinePct = ((ath.price - currentPrice) / ath.price) * 100;

        // Check if decline is in our range
        if (
          athDeclinePct < settings.ath_decline_min ||
          athDeclinePct > settings.ath_decline_max
        ) {
          continue;
        }

        // Detect stock splits
        const splits = detectStockSplit(history);
        if (splits.length > 0) {
          console.log(`${ticker}: Detected ${splits.length} potential split(s)`);
        }

        // Analyze growth events
        const growthAnalysis = analyzeGrowthEvents(
          history,
          settings.growth_threshold_pct,
          settings.min_consecutive_days,
          settings.growth_lookback_years,
        );

        if (growthAnalysis.events.length < settings.min_growth_events) {
          continue;
        }

        // Calculate 5-year low and purchase limit
        const fiveYearLow = calculateFiveYearLow(history);
        const purchaseLimit = fiveYearLow
          ? fiveYearLow.price * settings.purchase_limit_multiplier
          : null;

        // Cross-validate with Alpha Vantage (if calls available)
        let confidenceScore = 100;
        if (alphavantage.getRemainingCalls() > 0) {
          const avVerification = await alphavantage.verifyPrice(ticker, currentPrice);
          apiCallsAlphaVantage++;

          if (avVerification.price !== null) {
            const crossValidation = crossValidatePrice(currentPrice, avVerification.price);
            confidenceScore = crossValidation.confidence;
          }
        }

        // Use sector from TradingView (already available, no extra API call needed)
        const sector = tvStock.sector || null;

        // Validate final data
        const validation = validateStockData({
          price: currentPrice,
          marketCap: tvStock.marketCap,
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

        // Upsert stock into database
        const { error: upsertError } = await supabase.from('stocks').upsert(
          {
            ticker,
            company_name: tvStock.name || ticker,
            sector,
            current_price: currentPrice,
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
            exchange: tvStock.exchange,
            market_cap: tvStock.marketCap,
          },
          { onConflict: 'ticker' },
        );

        if (upsertError) {
          errors.push(`${ticker}: DB upsert error: ${upsertError.message}`);
          continue;
        }

        // Store growth events - delete old ones first, then insert fresh
        await supabase.from('growth_events').delete().eq('ticker', ticker);
        if (growthAnalysis.events.length > 0) {
          await supabase.from('growth_events').insert(
            growthAnalysis.events.map((event) => ({
              ticker,
              start_date: event.start_date,
              end_date: event.end_date,
              start_price: event.start_price,
              peak_price: event.peak_price,
              growth_pct: event.growth_pct,
              consecutive_days_above: event.consecutive_days_above,
              is_valid: event.is_valid,
            })),
          );
        }

        // Store price history (batch upsert)
        const priceRecords = history.map((d) => ({
          ticker,
          trade_date: d.date,
          open_price: d.open,
          high_price: d.high,
          low_price: d.low,
          close_price: d.close,
          volume: d.volume,
        }));

        for (let i = 0; i < priceRecords.length; i += 500) {
          const batch = priceRecords.slice(i, i + 500);
          await supabase.from('price_history').upsert(batch, {
            onConflict: 'ticker,trade_date',
          });
        }

        stocksFound++;
        console.log(
          `  >>> MATCH: ${ticker} | Score=${growthAnalysis.score} | ATH Decline=${athDeclinePct.toFixed(1)}% | Events=${growthAnalysis.events.length}`,
        );

        // Update progress after every match
        await updateProgress(supabase, scanId, {
          stocks_scanned: stocksScanned,
          stocks_found: stocksFound,
        });

        await sleep(200);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${ticker}: ${errMsg}`);
        console.error(`Error scanning ${ticker}:`, errMsg);
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const status = errors.length === 0 ? 'completed' : 'partial';

    // Final scan log update
    if (scanId) {
      await supabase.from('scan_logs').update({
        completed_at: new Date().toISOString(),
        status,
        stocks_scanned: stocksScanned,
        stocks_found: stocksFound,
        errors: errors.slice(0, 50),
        duration_seconds: durationSeconds,
        api_calls_yahoo: apiCallsYahoo,
        api_calls_alphavantage: apiCallsAlphaVantage,
      }).eq('id', scanId);
    }

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
      stocksFromSource,
      candidatesAfterPreFilter,
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
      stocksFromSource,
      candidatesAfterPreFilter,
      errors: [errMsg, ...errors],
      durationSeconds,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }
}
