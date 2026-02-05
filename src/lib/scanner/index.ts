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

/** Hard timeout for entire scan - must finish before Vercel kills us (60s limit on Hobby) */
const TOTAL_SCAN_TIMEOUT_MS = 50_000; // 50s, leaving 10s buffer

/** Max time for a single Yahoo Finance call */
const PER_STOCK_TIMEOUT_MS = 15_000;

/** How often to save scan details to DB (every N stocks) */
const SAVE_INTERVAL = 5;

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
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms),
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
    ath_decline_max: 100,
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

async function updateProgress(
  supabase: ReturnType<typeof createServiceClient>,
  scanId: string | undefined,
  fields: Record<string, unknown>,
) {
  if (!scanId) return;
  await supabase.from('scan_logs').update(fields).eq('id', scanId);
}

/**
 * Deep scan a single stock: fetch Yahoo history, analyze growth events, save to DB if match.
 * Returns the scan detail entry.
 */
async function deepScanStock(
  tvStock: TradingViewStock,
  source: 'tradingview_losers' | 'tradingview_high_decline' | 'both',
  settings: Settings,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ detail: StockScanDetail; isMatch: boolean; apiCallsYahoo: number; apiCallsAlphaVantage: number }> {
  const ticker = tvStock.ticker;
  const tvATH = tvStock.allTimeHigh;
  const tvDecline = tvATH && tvATH > 0
    ? ((tvATH - tvStock.close) / tvATH) * 100
    : null;
  let apiCallsYahoo = 0;
  let apiCallsAlphaVantage = 0;

  const baseDetail = {
    ticker,
    name: tvStock.name,
    source,
    tvPrice: tvStock.close,
    tvChange: tvStock.change,
    tvATH,
    tvDeclineFromATH: tvDecline,
    sector: tvStock.sector,
    phase: 'deep_scan' as const,
  };

  // Get historical data with timeout
  let history;
  try {
    history = await withTimeout(
      yahoo.getHistoricalData(ticker, 5),
      PER_STOCK_TIMEOUT_MS,
      `Yahoo ${ticker}`,
    );
    apiCallsYahoo++;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      detail: { ...baseDetail, result: 'error', errorMessage: errMsg, yahooHistoryDays: 0 },
      isMatch: false,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }

  if (history.length === 0) {
    return {
      detail: { ...baseDetail, result: 'error', errorMessage: 'No historical data from Yahoo Finance', yahooHistoryDays: 0 },
      isMatch: false,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }

  const historyValidation = validatePriceHistory(history);
  if (!historyValidation.isValid) {
    return {
      detail: { ...baseDetail, result: 'error', errorMessage: historyValidation.errors.join(', '), yahooHistoryDays: history.length },
      isMatch: false,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }

  // Check minimum age (1 year)
  const minHistoryDate = new Date();
  minHistoryDate.setFullYear(minHistoryDate.getFullYear() - 1);
  const oldestDate = new Date(history[0].date);
  if (oldestDate > minHistoryDate) {
    return {
      detail: { ...baseDetail, result: 'rejected', rejectReason: `Less than 1 year of history (oldest: ${history[0].date})`, yahooHistoryDays: history.length },
      isMatch: false,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }

  // Calculate ATH
  const yahooATHResult = calculateATH(history);
  const effectiveATH = tvATH && yahooATHResult
    ? Math.max(tvATH, yahooATHResult.price)
    : tvATH || yahooATHResult?.price || null;

  if (!effectiveATH || effectiveATH <= 0) {
    return {
      detail: { ...baseDetail, result: 'rejected', rejectReason: 'Could not determine ATH', yahooHistoryDays: history.length, yahooATH: yahooATHResult?.price },
      isMatch: false,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }

  const currentPrice = tvStock.close;
  const athDeclinePct = ((effectiveATH - currentPrice) / effectiveATH) * 100;

  if (athDeclinePct < settings.ath_decline_min || athDeclinePct > settings.ath_decline_max) {
    return {
      detail: {
        ...baseDetail, result: 'rejected',
        rejectReason: `ATH decline ${athDeclinePct.toFixed(1)}% outside range ${settings.ath_decline_min}-${settings.ath_decline_max}% (effective ATH: $${effectiveATH.toFixed(2)})`,
        yahooHistoryDays: history.length, yahooATH: yahooATHResult?.price,
        yahooDeclineFromATH: yahooATHResult ? ((yahooATHResult.price - currentPrice) / yahooATHResult.price) * 100 : undefined,
      },
      isMatch: false,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }

  // Detect stock splits
  detectStockSplit(history);

  // Analyze growth events
  const growthAnalysis = analyzeGrowthEvents(
    history,
    settings.growth_threshold_pct,
    settings.min_consecutive_days,
    settings.growth_lookback_years,
  );

  if (growthAnalysis.events.length < settings.min_growth_events) {
    return {
      detail: {
        ...baseDetail, result: 'rejected',
        rejectReason: `Only ${growthAnalysis.events.length} growth events (need ${settings.min_growth_events}+)`,
        yahooHistoryDays: history.length, yahooATH: yahooATHResult?.price, yahooDeclineFromATH: athDeclinePct,
        growthEvents: growthAnalysis.events.length, growthScore: growthAnalysis.score, highestGrowthPct: growthAnalysis.highestGrowthPct,
      },
      isMatch: false,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }

  // MATCH! Save to database
  const fiveYearLow = calculateFiveYearLow(history);
  const purchaseLimit = fiveYearLow ? fiveYearLow.price * settings.purchase_limit_multiplier : null;

  let confidenceScore = 100;
  if (alphavantage.getRemainingCalls() > 0) {
    const avVerification = await alphavantage.verifyPrice(ticker, currentPrice);
    apiCallsAlphaVantage++;
    if (avVerification.price !== null) {
      confidenceScore = crossValidatePrice(currentPrice, avVerification.price).confidence;
    }
  }

  const validation = validateStockData({ price: currentPrice, marketCap: tvStock.marketCap, allTimeHigh: effectiveATH, athDeclinePct });

  if (!validation.isValid) {
    return {
      detail: {
        ...baseDetail, result: 'error',
        errorMessage: `Validation failed: ${validation.errors.join(', ')}`,
        yahooHistoryDays: history.length, yahooATH: yahooATHResult?.price, yahooDeclineFromATH: athDeclinePct,
        growthEvents: growthAnalysis.events.length, growthScore: growthAnalysis.score, highestGrowthPct: growthAnalysis.highestGrowthPct,
      },
      isMatch: false,
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }

  let needsReview = false;
  let reviewReason: string | null = null;
  if (validation.warnings.length > 0) { needsReview = true; reviewReason = validation.warnings.join('; '); }
  if (growthAnalysis.highestGrowthPct > 1000) { needsReview = true; reviewReason = `Extreme growth: ${growthAnalysis.highestGrowthPct.toFixed(0)}%`; }

  await supabase.from('stocks').upsert({
    ticker,
    company_name: tvStock.name || ticker,
    sector: tvStock.sector || null,
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
  }, { onConflict: 'ticker' });

  await supabase.from('growth_events').delete().eq('ticker', ticker);
  if (growthAnalysis.events.length > 0) {
    await supabase.from('growth_events').insert(
      growthAnalysis.events.map((event) => ({
        ticker, start_date: event.start_date, end_date: event.end_date,
        start_price: event.start_price, peak_price: event.peak_price,
        growth_pct: event.growth_pct, consecutive_days_above: event.consecutive_days_above,
        is_valid: event.is_valid,
      })),
    );
  }

  // Store price history in batches
  const priceRecords = history.map((d) => ({
    ticker, trade_date: d.date, open_price: d.open, high_price: d.high,
    low_price: d.low, close_price: d.close, volume: d.volume,
  }));
  for (let i = 0; i < priceRecords.length; i += 500) {
    await supabase.from('price_history').upsert(priceRecords.slice(i, i + 500), { onConflict: 'ticker,trade_date' });
  }

  return {
    detail: {
      ...baseDetail, result: 'match',
      yahooHistoryDays: history.length, yahooATH: yahooATHResult?.price, yahooDeclineFromATH: athDeclinePct,
      growthEvents: growthAnalysis.events.length, growthScore: growthAnalysis.score, highestGrowthPct: growthAnalysis.highestGrowthPct,
    },
    isMatch: true,
    apiCallsYahoo,
    apiCallsAlphaVantage,
  };
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

  const { data: scanLog } = await supabase
    .from('scan_logs')
    .insert({ status: 'running', stocks_scanned: 0, stocks_found: 0 })
    .select()
    .single();
  const scanId = scanLog?.id;

  /** Check if we're running out of time */
  const isTimedOut = () => Date.now() - startTime > TOTAL_SCAN_TIMEOUT_MS;

  /** Save current state to DB */
  const saveProgress = async (final: boolean = false) => {
    if (!scanId) return;
    const fields: Record<string, unknown> = {
      stocks_scanned: stocksScanned,
      stocks_found: stocksFound,
      details: scanDetails,
    };
    if (final) {
      fields.completed_at = new Date().toISOString();
      fields.status = errors.length === 0 ? 'completed' : 'partial';
      fields.errors = errors.slice(0, 50);
      fields.duration_seconds = Math.round((Date.now() - startTime) / 1000);
      fields.api_calls_yahoo = apiCallsYahoo;
      fields.api_calls_alphavantage = apiCallsAlphaVantage;
    }
    await supabase.from('scan_logs').update(fields).eq('id', scanId);
  };

  try {
    const settings = await getSettings(supabase);

    // =========================================================
    // PHASE 1: Fetch candidates from TradingView (USA + Canada)
    // =========================================================
    console.log('Phase 1: Fetching candidates from TradingView (US + Canada)...');
    await updateProgress(supabase, scanId, { status: 'running', stocks_scanned: 0, stocks_found: 0 });

    const [topLosers, highDecline, canadianLosers, canadianHighDecline] = await Promise.all([
      fetchTopLosers(300),
      fetchHighDeclineStocks(settings.ath_decline_min, 500),
      fetchCanadianLosers(200),
      fetchCanadianHighDecline(settings.ath_decline_min, 300),
    ]);

    const sourceMap = new Map<string, 'tradingview_losers' | 'tradingview_high_decline' | 'both'>();
    for (const stock of [...topLosers, ...canadianLosers]) {
      sourceMap.set(stock.ticker, 'tradingview_losers');
    }
    for (const stock of [...highDecline, ...canadianHighDecline]) {
      sourceMap.set(stock.ticker, sourceMap.has(stock.ticker) ? 'both' : 'tradingview_high_decline');
    }

    const candidateMap = new Map<string, TradingViewStock>();
    for (const stock of [...topLosers, ...highDecline, ...canadianLosers, ...canadianHighDecline]) {
      if (!candidateMap.has(stock.ticker)) candidateMap.set(stock.ticker, stock);
    }

    const allCandidates = Array.from(candidateMap.values());
    stocksFromSource = allCandidates.length;
    console.log(`TradingView: ${topLosers.length} US losers + ${highDecline.length} US decline + ${canadianLosers.length} CA losers + ${canadianHighDecline.length} CA decline = ${stocksFromSource} unique`);

    if (stocksFromSource === 0) {
      errors.push('TradingView returned 0 candidates');
    }

    // =========================================================
    // PHASE 2: Pre-filter using TradingView data (no API calls)
    // =========================================================
    console.log('Phase 2: Pre-filtering...');
    const preFiltered: TradingViewStock[] = [];

    for (const stock of allCandidates) {
      const source = sourceMap.get(stock.ticker) || 'tradingview_losers';
      const tvATH = stock.allTimeHigh;
      const tvDecline = tvATH && tvATH > 0 ? ((tvATH - stock.close) / tvATH) * 100 : null;

      const ex = stock.exchange.toUpperCase();
      if (!ALLOWED_EXCHANGES.has(ex) && !ex.includes('NYSE') && !ex.includes('NASDAQ') && !ex.includes('AMEX') && !ex.includes('TSX')) {
        scanDetails.push({ ticker: stock.ticker, name: stock.name, source, tvPrice: stock.close, tvChange: stock.change, tvATH, tvDeclineFromATH: tvDecline, sector: stock.sector, phase: 'pre_filter', result: 'rejected', rejectReason: `Exchange not supported: ${stock.exchange}` });
        continue;
      }

      if (isLikelyLeveragedProduct(stock.name, stock.ticker)) {
        scanDetails.push({ ticker: stock.ticker, name: stock.name, source, tvPrice: stock.close, tvChange: stock.change, tvATH, tvDeclineFromATH: tvDecline, sector: stock.sector, phase: 'pre_filter', result: 'rejected', rejectReason: `Leveraged/inverse product: ${stock.name}` });
        continue;
      }

      if (stock.sector && settings.excluded_sectors.includes(stock.sector)) {
        scanDetails.push({ ticker: stock.ticker, name: stock.name, source, tvPrice: stock.close, tvChange: stock.change, tvATH, tvDeclineFromATH: tvDecline, sector: stock.sector, phase: 'pre_filter', result: 'rejected', rejectReason: `Excluded sector: ${stock.sector}` });
        continue;
      }

      if (stock.close <= 0) {
        scanDetails.push({ ticker: stock.ticker, name: stock.name, source, tvPrice: stock.close, tvChange: stock.change, tvATH, tvDeclineFromATH: tvDecline, sector: stock.sector, phase: 'pre_filter', result: 'rejected', rejectReason: `Price <= 0: $${stock.close}` });
        continue;
      }

      if (tvDecline !== null) {
        if (tvDecline < settings.ath_decline_min * 0.9) {
          scanDetails.push({ ticker: stock.ticker, name: stock.name, source, tvPrice: stock.close, tvChange: stock.change, tvATH, tvDeclineFromATH: tvDecline, sector: stock.sector, phase: 'pre_filter', result: 'rejected', rejectReason: `ATH decline ${tvDecline.toFixed(1)}% too low (min ${settings.ath_decline_min}%)` });
          continue;
        }
        if (tvDecline > settings.ath_decline_max + 0.5) {
          scanDetails.push({ ticker: stock.ticker, name: stock.name, source, tvPrice: stock.close, tvChange: stock.change, tvATH, tvDeclineFromATH: tvDecline, sector: stock.sector, phase: 'pre_filter', result: 'rejected', rejectReason: `ATH decline ${tvDecline.toFixed(1)}% > ${settings.ath_decline_max}%` });
          continue;
        }
      }

      preFiltered.push(stock);
    }

    candidatesAfterPreFilter = preFiltered.length;
    console.log(`${candidatesAfterPreFilter} candidates after pre-filter, starting deep scan...`);

    // Save pre-filter results immediately
    await saveProgress();

    // =========================================================
    // PHASE 3: Deep scan with time-boxed parallel processing
    // Process in batches of 3 to stay within time limits
    // =========================================================
    const BATCH_SIZE = 3;

    for (let i = 0; i < preFiltered.length; i += BATCH_SIZE) {
      // Check time limit before each batch
      if (isTimedOut()) {
        const timeoutMsg = `Time limit reached after ${stocksScanned}/${preFiltered.length} stocks (${Math.round((Date.now() - startTime) / 1000)}s). Results saved.`;
        console.warn(timeoutMsg);
        errors.push(timeoutMsg);
        break;
      }

      const batch = preFiltered.slice(i, i + BATCH_SIZE);
      console.log(`[${stocksScanned + 1}-${stocksScanned + batch.length}/${preFiltered.length}] Deep scanning batch...`);

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map((stock) =>
          deepScanStock(stock, sourceMap.get(stock.ticker) || 'tradingview_losers', settings, supabase)
        ),
      );

      for (let j = 0; j < results.length; j++) {
        stocksScanned++;
        const result = results[j];

        if (result.status === 'fulfilled') {
          scanDetails.push(result.value.detail);
          apiCallsYahoo += result.value.apiCallsYahoo;
          apiCallsAlphaVantage += result.value.apiCallsAlphaVantage;
          if (result.value.isMatch) {
            stocksFound++;
            console.log(`  >>> MATCH: ${result.value.detail.ticker}`);
          }
        } else {
          const ticker = batch[j].ticker;
          errors.push(`${ticker}: ${result.reason}`);
          scanDetails.push({
            ticker,
            name: batch[j].name,
            source: sourceMap.get(ticker) || 'tradingview_losers',
            tvPrice: batch[j].close,
            tvChange: batch[j].change,
            tvATH: batch[j].allTimeHigh,
            tvDeclineFromATH: null,
            sector: batch[j].sector,
            phase: 'deep_scan',
            result: 'error',
            errorMessage: String(result.reason),
          });
        }
      }

      // Save progress every SAVE_INTERVAL stocks
      if (stocksScanned % SAVE_INTERVAL < BATCH_SIZE) {
        await saveProgress();
      }

      // Small delay between batches to avoid hammering Yahoo
      await sleep(100);
    }

    // Final save
    await saveProgress(true);

    if (errors.length > 0) {
      await supabase.from('error_logs').insert(
        errors.slice(0, 20).map((e) => ({ source: 'scanner', message: e, severity: 'warning' })),
      );
    }

    return {
      status: errors.length === 0 ? 'completed' : 'partial',
      stocksScanned,
      stocksFound,
      stocksFromSource,
      candidatesAfterPreFilter,
      errors,
      durationSeconds: Math.round((Date.now() - startTime) / 1000),
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // Emergency save - make sure we don't lose data
    if (scanId) {
      await supabase.from('scan_logs').update({
        completed_at: new Date().toISOString(),
        status: 'failed',
        stocks_scanned: stocksScanned,
        stocks_found: stocksFound,
        errors: [errMsg],
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        details: scanDetails,
      }).eq('id', scanId);
    }

    return {
      status: 'failed',
      stocksScanned,
      stocksFound,
      stocksFromSource,
      candidatesAfterPreFilter,
      errors: [errMsg, ...errors],
      durationSeconds: Math.round((Date.now() - startTime) / 1000),
      apiCallsYahoo,
      apiCallsAlphaVantage,
    };
  }
}
