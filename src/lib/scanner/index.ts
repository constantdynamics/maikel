import { createServiceClient } from '../supabase';
import { fetchTopLosers, fetchHighDeclineStocks, fetchCanadianLosers, fetchCanadianHighDecline } from './tradingview';
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
import type { Settings, StockScanDetail } from '../types';

const ALLOWED_EXCHANGES = new Set([
  'NYSE', 'NASDAQ', 'AMEX', 'NYSE ARCA', 'NYSE MKT',
  'TSX', 'TSXV', 'NEO',
]);

/** Max time (ms) to wait for a single Yahoo Finance call before skipping */
const PER_STOCK_TIMEOUT_MS = 25_000;

/** If no progress for this many ms, stop scanning and finish with current results */
const STALL_TIMEOUT_MS = 180_000; // 3 minutes

/** How often to save scan details to DB (every N stocks) */
const SAVE_INTERVAL = 10;

/**
 * Detect leveraged/inverse ETF-like products by name patterns.
 */
function isLikelyLeveragedProduct(name: string, ticker: string): boolean {
  const patterns = [
    /\b\d+x\b/i,
    /\bultra\b/i,
    /\bleveraged\b/i,
    /\binverse\b/i,
    /\bdaily\b.*\b(bull|bear|long|short)\b/i,
    /\b(bull|bear)\b.*\b\d+x\b/i,
    /\bproshares\b/i,
    /\bdirexion\b/i,
    /\bgranite\s?shares\b/i,
    /\bvolatility\s+shares\b/i,
    /\bdefiance\b/i,
    /\bteucrium\b/i,
  ];
  return patterns.some((p) => p.test(name) || p.test(ticker));
}

/**
 * Wrap a promise with a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

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
    ath_decline_min: 85,
    ath_decline_max: 99.9999,
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
  const scanDetails: StockScanDetail[] = [];
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
    // PHASE 1: Fetch candidates from TradingView (USA + Canada)
    // =========================================================
    console.log('Phase 1: Fetching candidates from TradingView (US + Canada)...');
    await updateProgress(supabase, scanId, {
      status: 'running',
      stocks_scanned: 0,
      stocks_found: 0,
    });

    // Fetch US + Canadian stocks in parallel
    const [topLosers, highDecline, canadianLosers, canadianHighDecline] = await Promise.all([
      fetchTopLosers(300),
      fetchHighDeclineStocks(settings.ath_decline_min, 500),
      fetchCanadianLosers(200),
      fetchCanadianHighDecline(settings.ath_decline_min, 300),
    ]);

    // Track which source each stock came from
    const sourceMap = new Map<string, 'tradingview_losers' | 'tradingview_high_decline' | 'both'>();
    for (const stock of [...topLosers, ...canadianLosers]) {
      sourceMap.set(stock.ticker, 'tradingview_losers');
    }
    for (const stock of [...highDecline, ...canadianHighDecline]) {
      if (sourceMap.has(stock.ticker)) {
        sourceMap.set(stock.ticker, 'both');
      } else {
        sourceMap.set(stock.ticker, 'tradingview_high_decline');
      }
    }

    // Merge and deduplicate by ticker
    const candidateMap = new Map<string, TradingViewStock>();
    for (const stock of [...topLosers, ...highDecline, ...canadianLosers, ...canadianHighDecline]) {
      if (!candidateMap.has(stock.ticker)) {
        candidateMap.set(stock.ticker, stock);
      }
    }

    const allCandidates = Array.from(candidateMap.values());
    stocksFromSource = allCandidates.length;
    console.log(`TradingView returned ${topLosers.length} US losers + ${highDecline.length} US high-decline + ${canadianLosers.length} CA losers + ${canadianHighDecline.length} CA high-decline = ${stocksFromSource} unique candidates`);

    if (stocksFromSource === 0) {
      errors.push('TradingView returned 0 candidates - API may be blocked or down');
    }

    // =========================================================
    // PHASE 2: Pre-filter using TradingView data (no API calls)
    // =========================================================
    console.log('Phase 2: Pre-filtering candidates using TradingView ATH...');

    const preFiltered: TradingViewStock[] = [];

    for (const stock of allCandidates) {
      const source = sourceMap.get(stock.ticker) || 'tradingview_losers';
      const tvATH = stock.allTimeHigh;
      const tvDecline = tvATH && tvATH > 0
        ? ((tvATH - stock.close) / tvATH) * 100
        : null;

      // Must be on allowed exchange (server-side safety net)
      const ex = stock.exchange.toUpperCase();
      if (!ALLOWED_EXCHANGES.has(ex) && !ex.includes('NYSE') && !ex.includes('NASDAQ') && !ex.includes('AMEX') && !ex.includes('TSX')) {
        scanDetails.push({
          ticker: stock.ticker,
          name: stock.name,
          source,
          tvPrice: stock.close,
          tvChange: stock.change,
          tvATH,
          tvDeclineFromATH: tvDecline,
          sector: stock.sector,
          phase: 'pre_filter',
          result: 'rejected',
          rejectReason: `Exchange not supported: ${stock.exchange}`,
        });
        continue;
      }

      // Filter out leveraged/inverse ETF-like products
      if (isLikelyLeveragedProduct(stock.name, stock.ticker)) {
        scanDetails.push({
          ticker: stock.ticker,
          name: stock.name,
          source,
          tvPrice: stock.close,
          tvChange: stock.change,
          tvATH,
          tvDeclineFromATH: tvDecline,
          sector: stock.sector,
          phase: 'pre_filter',
          result: 'rejected',
          rejectReason: `Leveraged/inverse product: ${stock.name}`,
        });
        continue;
      }

      // Skip excluded sectors
      if (stock.sector && settings.excluded_sectors.includes(stock.sector)) {
        scanDetails.push({
          ticker: stock.ticker,
          name: stock.name,
          source,
          tvPrice: stock.close,
          tvChange: stock.change,
          tvATH,
          tvDeclineFromATH: tvDecline,
          sector: stock.sector,
          phase: 'pre_filter',
          result: 'rejected',
          rejectReason: `Excluded sector: ${stock.sector}`,
        });
        continue;
      }

      // Price must be positive
      if (stock.close <= 0) {
        scanDetails.push({
          ticker: stock.ticker,
          name: stock.name,
          source,
          tvPrice: stock.close,
          tvChange: stock.change,
          tvATH,
          tvDeclineFromATH: tvDecline,
          sector: stock.sector,
          phase: 'pre_filter',
          result: 'rejected',
          rejectReason: `Price <= 0: $${stock.close}`,
        });
        continue;
      }

      // Use TradingView ATH for pre-filtering: skip stocks clearly outside range
      if (tvDecline !== null) {
        if (tvDecline < settings.ath_decline_min * 0.9) {
          scanDetails.push({
            ticker: stock.ticker,
            name: stock.name,
            source,
            tvPrice: stock.close,
            tvChange: stock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: stock.sector,
            phase: 'pre_filter',
            result: 'rejected',
            rejectReason: `ATH decline ${tvDecline.toFixed(1)}% < ${settings.ath_decline_min}% (TradingView ATH: $${tvATH?.toFixed(2)})`,
          });
          continue;
        }
        if (tvDecline > settings.ath_decline_max + 0.5) {
          scanDetails.push({
            ticker: stock.ticker,
            name: stock.name,
            source,
            tvPrice: stock.close,
            tvChange: stock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: stock.sector,
            phase: 'pre_filter',
            result: 'rejected',
            rejectReason: `ATH decline ${tvDecline.toFixed(1)}% > ${settings.ath_decline_max}% (TradingView ATH: $${tvATH?.toFixed(2)})`,
          });
          continue;
        }
      }

      preFiltered.push(stock);
    }

    candidatesAfterPreFilter = preFiltered.length;
    const totalToScan = preFiltered.length;
    console.log(`${candidatesAfterPreFilter} candidates after pre-filter, starting deep scan...`);

    // Save pre-filter details immediately so they're visible while scan runs
    await updateProgress(supabase, scanId, {
      stocks_scanned: 0,
      stocks_found: 0,
      details: scanDetails,
    });

    // =========================================================
    // PHASE 3: Deep scan each candidate (Yahoo historical data)
    // With per-stock timeout and stall detection
    // =========================================================
    let lastProgressTime = Date.now();

    for (const tvStock of preFiltered) {
      // Stall detection: if no progress for 3 minutes, stop
      if (Date.now() - lastProgressTime > STALL_TIMEOUT_MS) {
        const stallMsg = `Scan stalled after ${stocksScanned} stocks (no progress for ${STALL_TIMEOUT_MS / 1000}s). Finishing with current results.`;
        console.warn(stallMsg);
        errors.push(stallMsg);
        break;
      }

      const ticker = tvStock.ticker;
      const source = sourceMap.get(ticker) || 'tradingview_losers';
      const tvATH = tvStock.allTimeHigh;
      const tvDecline = tvATH && tvATH > 0
        ? ((tvATH - tvStock.close) / tvATH) * 100
        : null;

      try {
        stocksScanned++;
        lastProgressTime = Date.now(); // Reset stall timer on each attempt

        // Update progress every 5 stocks
        if (stocksScanned % 5 === 0 || stocksScanned === 1) {
          await updateProgress(supabase, scanId, {
            stocks_scanned: stocksScanned,
            stocks_found: stocksFound,
          });
        }

        // Save details progressively every SAVE_INTERVAL stocks
        if (stocksScanned % SAVE_INTERVAL === 0) {
          await updateProgress(supabase, scanId, {
            details: scanDetails,
          });
        }

        console.log(`[${stocksScanned}/${totalToScan}] Deep scanning ${ticker}...`);

        // Get 5-year historical data from Yahoo Finance WITH TIMEOUT
        await sleep(300); // Rate limiting
        let history;
        try {
          history = await withTimeout(
            yahoo.getHistoricalData(ticker, 5),
            PER_STOCK_TIMEOUT_MS,
            `Yahoo history for ${ticker}`,
          );
        } catch (timeoutError) {
          const errMsg = timeoutError instanceof Error ? timeoutError.message : String(timeoutError);
          errors.push(`${ticker}: ${errMsg}`);
          scanDetails.push({
            ticker,
            name: tvStock.name,
            source,
            tvPrice: tvStock.close,
            tvChange: tvStock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: tvStock.sector,
            phase: 'deep_scan',
            result: 'error',
            errorMessage: errMsg,
            yahooHistoryDays: 0,
          });
          continue;
        }
        apiCallsYahoo++;

        if (history.length === 0) {
          const errMsg = `No historical data from Yahoo Finance`;
          errors.push(`${ticker}: ${errMsg}`);
          scanDetails.push({
            ticker,
            name: tvStock.name,
            source,
            tvPrice: tvStock.close,
            tvChange: tvStock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: tvStock.sector,
            phase: 'deep_scan',
            result: 'error',
            errorMessage: errMsg,
            yahooHistoryDays: 0,
          });
          continue;
        }

        // Validate price history
        const historyValidation = validatePriceHistory(history);
        if (!historyValidation.isValid) {
          const errMsg = historyValidation.errors.join(', ');
          errors.push(`${ticker}: ${errMsg}`);
          scanDetails.push({
            ticker,
            name: tvStock.name,
            source,
            tvPrice: tvStock.close,
            tvChange: tvStock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: tvStock.sector,
            phase: 'deep_scan',
            result: 'error',
            errorMessage: errMsg,
            yahooHistoryDays: history.length,
          });
          continue;
        }

        // Check minimum age - need at least 1 year of data
        const minHistoryDate = new Date();
        minHistoryDate.setFullYear(minHistoryDate.getFullYear() - 1);
        const oldestDate = new Date(history[0].date);
        if (oldestDate > minHistoryDate) {
          scanDetails.push({
            ticker,
            name: tvStock.name,
            source,
            tvPrice: tvStock.close,
            tvChange: tvStock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: tvStock.sector,
            phase: 'deep_scan',
            result: 'rejected',
            rejectReason: `Less than 1 year of history (oldest: ${history[0].date})`,
            yahooHistoryDays: history.length,
          });
          continue;
        }

        // Calculate ATH from Yahoo history
        const yahooATHResult = calculateATH(history);
        const effectiveATH = tvATH && yahooATHResult
          ? Math.max(tvATH, yahooATHResult.price)
          : tvATH || yahooATHResult?.price || null;

        if (!effectiveATH || effectiveATH <= 0) {
          scanDetails.push({
            ticker,
            name: tvStock.name,
            source,
            tvPrice: tvStock.close,
            tvChange: tvStock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: tvStock.sector,
            phase: 'deep_scan',
            result: 'rejected',
            rejectReason: 'Could not determine ATH',
            yahooHistoryDays: history.length,
            yahooATH: yahooATHResult?.price,
          });
          continue;
        }

        const currentPrice = tvStock.close;
        const athDeclinePct = ((effectiveATH - currentPrice) / effectiveATH) * 100;

        // Check if decline is in our range
        if (
          athDeclinePct < settings.ath_decline_min ||
          athDeclinePct > settings.ath_decline_max
        ) {
          scanDetails.push({
            ticker,
            name: tvStock.name,
            source,
            tvPrice: tvStock.close,
            tvChange: tvStock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: tvStock.sector,
            phase: 'deep_scan',
            result: 'rejected',
            rejectReason: `ATH decline ${athDeclinePct.toFixed(1)}% outside range ${settings.ath_decline_min}-${settings.ath_decline_max}% (effective ATH: $${effectiveATH.toFixed(2)})`,
            yahooHistoryDays: history.length,
            yahooATH: yahooATHResult?.price,
            yahooDeclineFromATH: yahooATHResult ? ((yahooATHResult.price - currentPrice) / yahooATHResult.price) * 100 : undefined,
          });
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
          scanDetails.push({
            ticker,
            name: tvStock.name,
            source,
            tvPrice: tvStock.close,
            tvChange: tvStock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: tvStock.sector,
            phase: 'deep_scan',
            result: 'rejected',
            rejectReason: `Only ${growthAnalysis.events.length} growth events (need ${settings.min_growth_events}+)`,
            yahooHistoryDays: history.length,
            yahooATH: yahooATHResult?.price,
            yahooDeclineFromATH: athDeclinePct,
            growthEvents: growthAnalysis.events.length,
            growthScore: growthAnalysis.score,
            highestGrowthPct: growthAnalysis.highestGrowthPct,
          });
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

        const sector = tvStock.sector || null;

        // Validate final data
        const validation = validateStockData({
          price: currentPrice,
          marketCap: tvStock.marketCap,
          allTimeHigh: effectiveATH,
          athDeclinePct,
        });

        let needsReview = false;
        let reviewReason: string | null = null;

        if (!validation.isValid) {
          errors.push(`${ticker}: ${validation.errors.join(', ')}`);
          scanDetails.push({
            ticker,
            name: tvStock.name,
            source,
            tvPrice: tvStock.close,
            tvChange: tvStock.change,
            tvATH,
            tvDeclineFromATH: tvDecline,
            sector: tvStock.sector,
            phase: 'deep_scan',
            result: 'error',
            errorMessage: `Validation failed: ${validation.errors.join(', ')}`,
            yahooHistoryDays: history.length,
            yahooATH: yahooATHResult?.price,
            yahooDeclineFromATH: athDeclinePct,
            growthEvents: growthAnalysis.events.length,
            growthScore: growthAnalysis.score,
            highestGrowthPct: growthAnalysis.highestGrowthPct,
          });
          continue;
        }

        if (validation.warnings.length > 0) {
          needsReview = true;
          reviewReason = validation.warnings.join('; ');
        }

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
            all_time_high: effectiveATH,
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

        // Store growth events
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

        // Log the match
        scanDetails.push({
          ticker,
          name: tvStock.name,
          source,
          tvPrice: tvStock.close,
          tvChange: tvStock.change,
          tvATH,
          tvDeclineFromATH: tvDecline,
          sector: tvStock.sector,
          phase: 'deep_scan',
          result: 'match',
          yahooHistoryDays: history.length,
          yahooATH: yahooATHResult?.price,
          yahooDeclineFromATH: athDeclinePct,
          growthEvents: growthAnalysis.events.length,
          growthScore: growthAnalysis.score,
          highestGrowthPct: growthAnalysis.highestGrowthPct,
        });

        // Update progress + details after every match
        await updateProgress(supabase, scanId, {
          stocks_scanned: stocksScanned,
          stocks_found: stocksFound,
          details: scanDetails,
        });

        await sleep(200);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${ticker}: ${errMsg}`);
        console.error(`Error scanning ${ticker}:`, errMsg);

        scanDetails.push({
          ticker,
          name: tvStock.name,
          source,
          tvPrice: tvStock.close,
          tvChange: tvStock.change,
          tvATH,
          tvDeclineFromATH: tvDecline,
          sector: tvStock.sector,
          phase: 'deep_scan',
          result: 'error',
          errorMessage: errMsg,
        });
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const status = errors.length === 0 ? 'completed' : 'partial';

    // Final scan log update with all details
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
        details: scanDetails,
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
        details: scanDetails,
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
