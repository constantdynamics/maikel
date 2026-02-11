import { createServiceClient } from '../supabase';
import { fetchMultiMarketLosers, fetchMultiMarketHighDecline, MARKETS, DEFAULT_MARKETS } from './tradingview';
import type { TradingViewStock } from './tradingview';
import * as yahoo from './yahoo';
import * as alphavantage from './alphavantage';
import { analyzeGrowthEvents, calculateATH, calculateFiveYearLow, analyzeStableWithSpikes } from './scorer';
import {
  validateStockData,
  validatePriceHistory,
  crossValidatePrice,
  detectStockSplit,
} from './validator';
import { sleep } from '../utils';
import type { Settings, StockScanDetail } from '../types';
import { MARKET_CAP_CATEGORIES, DEFAULT_VOLATILE_SECTORS } from '../types';

// All exchanges we support across all markets
const ALLOWED_EXCHANGES = new Set([
  // US
  'NYSE', 'NASDAQ', 'AMEX', 'NYSE ARCA', 'NYSE MKT',
  // Canada
  'TSX', 'TSXV', 'NEO',
  // UK
  'LSE',
  // Germany
  'XETR', 'FWB',
  // France
  'EURONEXT',
  // Hong Kong
  'HKEX',
  // South Korea
  'KRX', 'KOSDAQ',
  // South Africa
  'JSE',
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
  markets: string[];
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
    included_volatile_sectors: [],  // Empty = don't scan any volatile sectors
    market_cap_categories: ['micro', 'small', 'mid', 'large'],  // All by default
    auto_scan_interval_minutes: 5,
    // NovaBay-type filter defaults
    enable_stable_spike_filter: false,
    stable_max_decline_pct: 10,    // Max 10% decline allowed
    stable_min_spike_pct: 100,     // Require 100% spike (2x)
    stable_lookback_months: 12,    // Look back 12 months
    // Scanner variety
    skip_recently_scanned_hours: 0, // Don't skip by default
  };

  if (!data) return defaults;

  for (const row of data) {
    const key = row.key as keyof Settings;
    if (key in defaults) {
      try {
        const val = row.value;
        if (typeof defaults[key] === 'boolean') {
          (defaults as unknown as Record<string, unknown>)[key] = val === 'true' || val === true;
        } else if (typeof defaults[key] === 'number') {
          (defaults as unknown as Record<string, unknown>)[key] = Number(val);
        } else if (Array.isArray(defaults[key])) {
          (defaults as unknown as Record<string, unknown>)[key] = JSON.parse(String(val));
        }
      } catch {
        // Keep default
      }
    }
  }

  return defaults;
}

/**
 * Get the scan number for today (1st scan = 1, 2nd = 2, etc.)
 */
async function getTodayScanNumber(supabase: ReturnType<typeof createServiceClient>): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabase
    .from('scan_logs')
    .select('*', { count: 'exact', head: true })
    .gte('started_at', `${today}T00:00:00Z`)
    .lt('started_at', `${today}T23:59:59Z`);

  return (count || 0) + 1;
}

/**
 * Get recently scanned tickers to skip
 */
async function getRecentlyScannedTickers(
  supabase: ReturnType<typeof createServiceClient>,
  hoursAgo: number,
): Promise<Set<string>> {
  if (hoursAgo <= 0) return new Set();

  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('stocks')
    .select('ticker')
    .gte('last_updated', cutoff);

  return new Set((data || []).map(s => s.ticker));
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
 */
async function deepScanStock(
  tvStock: TradingViewStock,
  source: 'tradingview_losers' | 'tradingview_high_decline' | 'both',
  settings: Settings,
  supabase: ReturnType<typeof createServiceClient>,
  scanNumber: number = 1,
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

  // NovaBay-type analysis: stable base with upward spikes
  const stableSpikeAnalysis = analyzeStableWithSpikes(
    history,
    settings.stable_max_decline_pct,
    settings.stable_min_spike_pct,
    settings.stable_lookback_months,
  );

  const today = new Date().toISOString().split('T')[0];

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
    // Scan tracking
    scan_number: scanNumber,
    scan_date: today,
    // NovaBay-type analysis
    twelve_month_low: stableSpikeAnalysis.twelveMontLow > 0 ? stableSpikeAnalysis.twelveMontLow : null,
    twelve_month_max_decline_pct: stableSpikeAnalysis.maxDeclineFromAverage,
    twelve_month_max_spike_pct: stableSpikeAnalysis.maxSpikeAboveAverage,
    is_stable_with_spikes: stableSpikeAnalysis.isStableWithSpikes,
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

/**
 * Run a scan for specified markets.
 * @param selectedMarkets - Array of market IDs to scan (e.g., ['us', 'ca', 'uk'])
 */
export async function runScan(selectedMarkets?: string[]): Promise<ScanResult> {
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

  // Validate and filter markets
  const markets = (selectedMarkets && selectedMarkets.length > 0 ? selectedMarkets : DEFAULT_MARKETS)
    .filter((m) => MARKETS[m]);

  if (markets.length === 0) {
    return {
      status: 'failed',
      stocksScanned: 0,
      stocksFound: 0,
      stocksFromSource: 0,
      candidatesAfterPreFilter: 0,
      errors: ['No valid markets selected'],
      durationSeconds: 0,
      apiCallsYahoo: 0,
      apiCallsAlphaVantage: 0,
      markets: [],
    };
  }

  const marketNames = markets.map((m) => MARKETS[m].name).join(', ');

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

    // Get scan number for today (1st, 2nd, 3rd scan, etc.)
    const scanNumber = await getTodayScanNumber(supabase);
    console.log(`Starting scan #${scanNumber} for today`);

    // Get recently scanned tickers to skip (for more variety)
    const recentlyScanned = await getRecentlyScannedTickers(supabase, settings.skip_recently_scanned_hours);
    if (recentlyScanned.size > 0) {
      console.log(`Skipping ${recentlyScanned.size} recently scanned stocks for variety`);
    }

    // =========================================================
    // PHASE 1: Fetch candidates from TradingView (selected markets)
    // =========================================================
    console.log(`Phase 1: Fetching candidates from TradingView (${marketNames})...`);
    await updateProgress(supabase, scanId, { status: 'running', stocks_scanned: 0, stocks_found: 0 });

    const [losers, highDecline] = await Promise.all([
      fetchMultiMarketLosers(markets, 200),
      fetchMultiMarketHighDecline(markets, settings.ath_decline_min, 300),
    ]);

    const sourceMap = new Map<string, 'tradingview_losers' | 'tradingview_high_decline' | 'both'>();
    for (const stock of losers) {
      sourceMap.set(stock.ticker, 'tradingview_losers');
    }
    for (const stock of highDecline) {
      sourceMap.set(stock.ticker, sourceMap.has(stock.ticker) ? 'both' : 'tradingview_high_decline');
    }

    const candidateMap = new Map<string, TradingViewStock>();
    for (const stock of [...losers, ...highDecline]) {
      // Skip recently scanned stocks for variety
      if (recentlyScanned.has(stock.ticker)) continue;
      if (!candidateMap.has(stock.ticker)) candidateMap.set(stock.ticker, stock);
    }

    const allCandidates = Array.from(candidateMap.values());
    stocksFromSource = allCandidates.length;
    console.log(`TradingView: ${losers.length} losers + ${highDecline.length} high-decline = ${stocksFromSource} unique from ${marketNames}`);

    if (stocksFromSource === 0) {
      errors.push(`TradingView returned 0 candidates from ${marketNames}`);
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
      if (!ALLOWED_EXCHANGES.has(ex)) {
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

      // Check volatile sectors - only allow if explicitly included
      if (stock.sector) {
        const isVolatileSector = DEFAULT_VOLATILE_SECTORS.some(vs =>
          stock.sector?.toLowerCase().includes(vs.toLowerCase())
        );
        if (isVolatileSector) {
          const isIncluded = settings.included_volatile_sectors.some(vs =>
            stock.sector?.toLowerCase().includes(vs.toLowerCase())
          );
          if (!isIncluded) {
            scanDetails.push({ ticker: stock.ticker, name: stock.name, source, tvPrice: stock.close, tvChange: stock.change, tvATH, tvDeclineFromATH: tvDecline, sector: stock.sector, phase: 'pre_filter', result: 'rejected', rejectReason: `Volatile sector not included: ${stock.sector}` });
            continue;
          }
        }
      }

      // Check market cap categories
      if (stock.marketCap !== null && settings.market_cap_categories.length > 0) {
        const cap = stock.marketCap;
        const inSelectedCategory = settings.market_cap_categories.some(catKey => {
          const cat = MARKET_CAP_CATEGORIES[catKey as keyof typeof MARKET_CAP_CATEGORIES];
          return cap >= cat.min && cap < cat.max;
        });
        if (!inSelectedCategory) {
          const capLabel = cap < 300_000_000 ? 'Micro' : cap < 2_000_000_000 ? 'Small' : cap < 10_000_000_000 ? 'Mid' : 'Large';
          scanDetails.push({ ticker: stock.ticker, name: stock.name, source, tvPrice: stock.close, tvChange: stock.change, tvATH, tvDeclineFromATH: tvDecline, sector: stock.sector, phase: 'pre_filter', result: 'rejected', rejectReason: `Market cap category '${capLabel}' ($${(cap / 1e6).toFixed(0)}M) not selected` });
          continue;
        }
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
    // =========================================================
    const BATCH_SIZE = 3;

    for (let i = 0; i < preFiltered.length; i += BATCH_SIZE) {
      if (isTimedOut()) {
        const timeoutMsg = `Time limit reached after ${stocksScanned}/${preFiltered.length} stocks (${Math.round((Date.now() - startTime) / 1000)}s). Results saved.`;
        console.warn(timeoutMsg);
        errors.push(timeoutMsg);
        break;
      }

      const batch = preFiltered.slice(i, i + BATCH_SIZE);
      console.log(`[${stocksScanned + 1}-${stocksScanned + batch.length}/${preFiltered.length}] Deep scanning batch...`);

      const results = await Promise.allSettled(
        batch.map((stock) =>
          deepScanStock(stock, sourceMap.get(stock.ticker) || 'tradingview_losers', settings, supabase, scanNumber)
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

      if (stocksScanned % SAVE_INTERVAL < BATCH_SIZE) {
        await saveProgress();
      }

      await sleep(100);
    }

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
      markets,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

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
      markets,
    };
  }
}
