/**
 * Sector Scanner - Combined Kuifje + Zonnebloem analysis for sector-specific scanning
 *
 * Scans specific markets for stocks in target sectors (BioPharma, Mining, etc.)
 * A stock qualifies if it meets EITHER Kuifje criteria OR Zonnebloem criteria:
 *   - Kuifje: ATH decline + growth events (recovery from troughs)
 *   - Zonnebloem: Stable base + explosive upward spikes
 *
 * Uses a TIME BUDGET to stay within Vercel's 300s limit.
 */

import { createServiceClient } from '../supabase';
import { fetchCandidatesFromAllMarkets, type ZBCandidate } from '../zonnebloem/tradingview';
import * as yahoo from '../scanner/yahoo';
import { analyzeGrowthEvents, calculateATH, calculateFiveYearLow, calculateThreeYearLow } from '../scanner/scorer';
import { analyzeSpikeEvents } from '../zonnebloem/scorer';
import { validatePriceHistory, detectStockSplit } from '../scanner/validator';
import { sleep } from '../utils';
import type { SectorScannerConfig, SectorScanDetail, SectorScannerType } from '../types';
import { BIOPHARMA_CONFIG, MINING_CONFIG, HYDROGEN_CONFIG, SHIPPING_CONFIG } from '../types';

const TIME_BUDGET_MS = 240_000;

interface SectorScanResult {
  status: 'completed' | 'failed' | 'partial';
  scannerType: SectorScannerType;
  marketsScanned: string[];
  candidatesFound: number;
  stocksDeepScanned: number;
  stocksMatched: number;
  newStocksFound: number;
  errors: string[];
  durationSeconds: number;
  apiCallsYahoo: number;
}

function getConfigForType(type: SectorScannerType): SectorScannerConfig {
  switch (type) {
    case 'biopharma': return BIOPHARMA_CONFIG;
    case 'mining': return MINING_CONFIG;
    case 'hydrogen': return HYDROGEN_CONFIG;
    case 'shipping': return SHIPPING_CONFIG;
  }
}

/**
 * Check if a stock matches the target sector based on sector name and keywords.
 */
function matchesSector(
  sectorName: string | null,
  companyName: string | null,
  config: SectorScannerConfig,
): boolean {
  const sectorLower = (sectorName || '').toLowerCase();
  const nameLower = (companyName || '').toLowerCase();

  // Check sector filters (TradingView sector categories)
  for (const filter of config.sectorFilters) {
    if (sectorLower.includes(filter.toLowerCase())) return true;
  }

  // Check keywords in sector name and company name
  for (const keyword of config.sectorKeywords) {
    const kw = keyword.toLowerCase();
    if (sectorLower.includes(kw) || nameLower.includes(kw)) return true;
  }

  return false;
}

async function getScannedTickers(
  supabase: ReturnType<typeof createServiceClient>,
  scannerType: SectorScannerType,
): Promise<Map<string, { lastScanned: Date; scanCount: number; lastResult: string }>> {
  const { data } = await supabase
    .from('sector_scan_history')
    .select('ticker, last_scanned_at, scan_count, last_result')
    .eq('scanner_type', scannerType);

  const map = new Map<string, { lastScanned: Date; scanCount: number; lastResult: string }>();
  if (data) {
    for (const row of data) {
      map.set(row.ticker, {
        lastScanned: new Date(row.last_scanned_at),
        scanCount: row.scan_count,
        lastResult: row.last_result,
      });
    }
  }
  return map;
}

async function recordScanHistory(
  supabase: ReturnType<typeof createServiceClient>,
  scannerType: SectorScannerType,
  ticker: string,
  market: string,
  result: string,
) {
  const { data: existing } = await supabase
    .from('sector_scan_history')
    .select('scan_count')
    .eq('scanner_type', scannerType)
    .eq('ticker', ticker)
    .single();

  await supabase.from('sector_scan_history').upsert(
    {
      scanner_type: scannerType,
      ticker,
      market,
      last_scanned_at: new Date().toISOString(),
      scan_count: (existing?.scan_count || 0) + 1,
      last_result: result,
    },
    { onConflict: 'scanner_type,ticker' },
  );
}

function prioritizeCandidates(
  candidates: ZBCandidate[],
  scannedHistory: Map<string, { lastScanned: Date; scanCount: number; lastResult: string }>,
): ZBCandidate[] {
  const neverScanned: ZBCandidate[] = [];
  const previouslyScanned: ZBCandidate[] = [];

  for (const c of candidates) {
    if (scannedHistory.has(c.ticker)) {
      previouslyScanned.push(c);
    } else {
      neverScanned.push(c);
    }
  }

  // Shuffle never-scanned for variety
  for (let i = neverScanned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [neverScanned[i], neverScanned[j]] = [neverScanned[j], neverScanned[i]];
  }

  previouslyScanned.sort((a, b) => {
    const aH = scannedHistory.get(a.ticker);
    const bH = scannedHistory.get(b.ticker);
    if (!aH || !bH) return 0;
    return aH.lastScanned.getTime() - bH.lastScanned.getTime();
  });

  return [...neverScanned, ...previouslyScanned];
}

async function updateProgress(
  supabase: ReturnType<typeof createServiceClient>,
  scanId: string | undefined,
  fields: Record<string, unknown>,
) {
  if (!scanId) return;
  await supabase.from('sector_scan_logs').update(fields).eq('id', scanId);
}

/**
 * Run a sector scan.
 */
export async function runSectorScan(scannerType: SectorScannerType): Promise<SectorScanResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();
  const config = getConfigForType(scannerType);
  const errors: string[] = [];
  const scanDetails: SectorScanDetail[] = [];
  let stocksDeepScanned = 0;
  let stocksMatched = 0;
  let newStocksFound = 0;
  let apiCallsYahoo = 0;
  let timeBudgetExceeded = false;

  // Create scan log
  const { data: scanLog } = await supabase
    .from('sector_scan_logs')
    .insert({
      scanner_type: scannerType,
      status: 'running',
      stocks_deep_scanned: 0,
      stocks_matched: 0,
      new_stocks_found: 0,
    })
    .select()
    .single();

  const scanId = scanLog?.id;

  try {
    // =========================================================
    // PHASE 1: Fetch candidates from configured markets
    // =========================================================
    console.log(`[${config.label}] Phase 1: Fetching candidates from ${config.markets.join(', ')}...`);
    await updateProgress(supabase, scanId, {
      status: 'running',
      markets_scanned: config.markets,
    });

    const allCandidates = await fetchCandidatesFromAllMarkets(
      config.markets,
      1.5,
      10000,
      0.10,
      5000,
    );

    const candidatesFound = allCandidates.length;
    console.log(`[${config.label}] Phase 1: Found ${candidatesFound} raw candidates`);

    // =========================================================
    // PHASE 2: Filter to target sector
    // =========================================================
    console.log(`[${config.label}] Phase 2: Filtering to ${config.label} sector...`);

    const sectorFiltered = allCandidates.filter((c) => {
      return matchesSector(c.sector, c.name, config);
    });

    console.log(`[${config.label}] Phase 2: ${sectorFiltered.length} sector matches out of ${candidatesFound}`);

    if (sectorFiltered.length === 0) {
      errors.push(`No ${config.label} sector candidates found`);
    }

    const scannedHistory = await getScannedTickers(supabase, scannerType);
    const prioritized = prioritizeCandidates(sectorFiltered, scannedHistory);

    await updateProgress(supabase, scanId, {
      candidates_found: sectorFiltered.length,
      stocks_deep_scanned: 0,
      stocks_matched: 0,
    });

    // =========================================================
    // PHASE 3: Deep scan with COMBINED analysis (TIME-BUDGETED)
    // =========================================================
    const deepScanStartTime = Date.now();
    console.log(`[${config.label}] Phase 3: Deep scanning up to ${prioritized.length} candidates...`);

    const batchSize = 10;

    for (let batchStart = 0; batchStart < prioritized.length; batchStart += batchSize) {
      const elapsed = Date.now() - deepScanStartTime;
      if (elapsed >= TIME_BUDGET_MS) {
        console.log(`[${config.label}] Time budget exceeded after ${stocksDeepScanned} stocks`);
        timeBudgetExceeded = true;
        break;
      }

      const batch = prioritized.slice(batchStart, batchStart + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map((candidate) =>
          deepScanSectorCandidate(candidate, config, supabase, scanId),
        ),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const candidate = batch[j];
        stocksDeepScanned++;
        apiCallsYahoo++;

        if (result.status === 'fulfilled') {
          const { matched, isNew, detail, error: scanError } = result.value;

          if (scanError) errors.push(`${candidate.ticker}: ${scanError}`);
          if (detail) scanDetails.push(detail);

          await recordScanHistory(supabase, scannerType, candidate.ticker, candidate.market, matched ? 'match' : 'rejected');

          if (matched) {
            stocksMatched++;
            if (isNew) newStocksFound++;
          }
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push(`${candidate.ticker}: ${errMsg}`);
          await recordScanHistory(supabase, scannerType, candidate.ticker, candidate.market, 'error');
        }
      }

      await updateProgress(supabase, scanId, {
        stocks_deep_scanned: stocksDeepScanned,
        stocks_matched: stocksMatched,
        new_stocks_found: newStocksFound,
      });

      await sleep(50);
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const status = timeBudgetExceeded ? 'partial' : errors.length === 0 ? 'completed' : 'partial';

    if (scanId) {
      await supabase.from('sector_scan_logs').update({
        completed_at: new Date().toISOString(),
        status,
        markets_scanned: config.markets,
        candidates_found: sectorFiltered.length,
        stocks_deep_scanned: stocksDeepScanned,
        stocks_matched: stocksMatched,
        new_stocks_found: newStocksFound,
        errors: errors.slice(0, 50),
        duration_seconds: durationSeconds,
        api_calls_yahoo: apiCallsYahoo,
        details: scanDetails as unknown as Record<string, unknown>,
      }).eq('id', scanId);
    }

    if (errors.length > 0) {
      await supabase.from('error_logs').insert(
        errors.slice(0, 20).map((e) => ({
          source: `sector-${scannerType}`,
          message: e,
          severity: 'warning',
        })),
      );
    }

    // === STORAGE OPTIMIZATION: Prune old scan log details (keep last 5) ===
    try {
      const { data: oldLogs } = await supabase
        .from('sector_scan_logs')
        .select('id')
        .eq('scanner_type', scannerType)
        .order('started_at', { ascending: false })
        .range(5, 100);

      if (oldLogs && oldLogs.length > 0) {
        await supabase
          .from('sector_scan_logs')
          .update({ details: null })
          .in('id', oldLogs.map(l => l.id));
      }
    } catch { /* ignore cleanup errors */ }

    console.log(
      `[${config.label}] Scan ${status}: ${stocksMatched} matches (${newStocksFound} new) from ${stocksDeepScanned} deep-scanned in ${durationSeconds}s`,
    );

    return {
      status,
      scannerType,
      marketsScanned: config.markets,
      candidatesFound: sectorFiltered.length,
      stocksDeepScanned,
      stocksMatched,
      newStocksFound,
      errors,
      durationSeconds,
      apiCallsYahoo,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    if (scanId) {
      await supabase.from('sector_scan_logs').update({
        completed_at: new Date().toISOString(),
        status: 'failed',
        stocks_deep_scanned: stocksDeepScanned,
        stocks_matched: stocksMatched,
        new_stocks_found: newStocksFound,
        errors: [errMsg, ...errors],
        duration_seconds: durationSeconds,
        details: scanDetails as unknown as Record<string, unknown>,
      }).eq('id', scanId);
    }

    return {
      status: 'failed',
      scannerType,
      marketsScanned: [],
      candidatesFound: 0,
      stocksDeepScanned,
      stocksMatched,
      newStocksFound,
      errors: [errMsg, ...errors],
      durationSeconds,
      apiCallsYahoo,
    };
  }
}

/**
 * Deep scan a single candidate with COMBINED Kuifje + Zonnebloem analysis.
 * A stock matches if it meets EITHER set of criteria.
 */
async function deepScanSectorCandidate(
  candidate: ZBCandidate,
  config: SectorScannerConfig,
  supabase: ReturnType<typeof createServiceClient>,
  scanId?: string,
): Promise<{
  matched: boolean;
  isNew: boolean;
  detail: SectorScanDetail | null;
  error: string | null;
}> {
  const ticker = candidate.ticker;
  const detail: SectorScanDetail = {
    ticker,
    name: candidate.name,
    market: candidate.market,
    price: candidate.close,
    sector: candidate.sector,
    phase: 'deep_scan',
    result: 'rejected',
  };

  try {
    const yahooTicker = candidate.yahooTicker || ticker;
    const history = await yahoo.getHistoricalData(yahooTicker, 5);

    if (history.length === 0) {
      detail.result = 'error';
      detail.errorMessage = 'No historical data from Yahoo Finance';
      return { matched: false, isNew: false, detail, error: detail.errorMessage };
    }

    const historyValidation = validatePriceHistory(history);
    if (!historyValidation.isValid) {
      detail.result = 'error';
      detail.errorMessage = historyValidation.errors.join(', ');
      return { matched: false, isNew: false, detail, error: null };
    }

    if (history.length < 200) {
      detail.result = 'rejected';
      detail.rejectReason = `Only ${history.length} data points (need ~200)`;
      return { matched: false, isNew: false, detail, error: null };
    }

    const splits = detectStockSplit(history);

    // ===== KUIFJE ANALYSIS =====
    const ath = calculateATH(history);
    const fiveYearLow = calculateFiveYearLow(history);
    const threeYearLow = calculateThreeYearLow(history);

    let kuifjeMatch = false;
    let athDeclinePct: number | null = null;
    let growthEvents = 0;
    let growthScore = 0;
    let highestGrowthPct = 0;
    let highestGrowthDate: string | null = null;

    if (ath && ath.price > 0) {
      athDeclinePct = ((ath.price - candidate.close) / ath.price) * 100;

      // Kuifje criteria: ATH decline 60-100% AND at least 1 growth event
      if (athDeclinePct >= 60 && athDeclinePct <= 100) {
        const growthAnalysis = analyzeGrowthEvents(history, 30, 2, 5);
        growthEvents = growthAnalysis.events.length;
        growthScore = growthAnalysis.score;
        highestGrowthPct = growthAnalysis.highestGrowthPct;
        highestGrowthDate = growthAnalysis.highestGrowthDate;

        if (growthEvents >= 1) {
          kuifjeMatch = true;
        }
      }
    }

    // ===== ZONNEBLOEM ANALYSIS =====
    let zonnebloemMatch = false;
    const spikeAnalysis = analyzeSpikeEvents(history, 75, 3, 24);

    detail.spikeCount = spikeAnalysis.events.length;
    detail.spikeScore = spikeAnalysis.spikeScore;
    detail.highestSpikePct = spikeAnalysis.highestSpikePct;
    detail.priceChange12m = spikeAnalysis.priceChange12m ?? undefined;
    detail.growthEvents = growthEvents;
    detail.growthScore = growthScore;
    detail.highestGrowthPct = highestGrowthPct;
    detail.athDeclinePct = athDeclinePct ?? undefined;

    if (spikeAnalysis.events.length >= 1) {
      // Check price stability
      if (spikeAnalysis.priceChange12m === null || spikeAnalysis.priceChange12m >= -40) {
        if (spikeAnalysis.baseDeclinePct === null || spikeAnalysis.baseDeclinePct >= -50) {
          zonnebloemMatch = true;
        }
      }
    }

    // A stock matches if EITHER criteria is met
    const matched = kuifjeMatch || zonnebloemMatch;

    if (!matched) {
      detail.result = 'rejected';
      detail.rejectReason = `No match: ATH decline=${athDeclinePct?.toFixed(1) ?? 'N/A'}%, growth events=${growthEvents}, spikes=${spikeAnalysis.events.length}`;
      return { matched: false, isNew: false, detail, error: null };
    }

    const matchType = kuifjeMatch && zonnebloemMatch ? 'both' : kuifjeMatch ? 'kuifje' : 'zonnebloem';
    detail.matchType = matchType;

    // MATCH! Check if this is a new stock
    const { data: existing } = await supabase
      .from('sector_stocks')
      .select('id')
      .eq('scanner_type', config.type)
      .eq('ticker', ticker)
      .single();

    const isNew = !existing;

    let needsReview = false;
    let reviewReason: string | null = null;
    if (splits.length > 0) {
      needsReview = true;
      reviewReason = `${splits.length} potential stock split(s)`;
    }
    if (spikeAnalysis.highestSpikePct > 2000 || highestGrowthPct > 1000) {
      needsReview = true;
      reviewReason = `Extreme movement detected`;
    }

    const clampNum = (v: number | null | undefined, max: number = 9_999_999): number | null =>
      v == null || !isFinite(v) ? null : Math.min(Math.max(v, -max), max);
    const roundInt = (v: number | null | undefined): number | null =>
      v == null || !isFinite(v) ? null : Math.round(v);

    const purchaseLimit = fiveYearLow ? fiveYearLow.price * 1.20 : null;

    const stockData: Record<string, unknown> = {
      scanner_type: config.type,
      ticker,
      yahoo_ticker: candidate.yahooTicker || ticker,
      company_name: candidate.name || ticker,
      sector: candidate.sector || null,
      exchange: candidate.exchange || null,
      market: candidate.market,
      country: candidate.country || null,
      current_price: clampNum(candidate.close),
      // Kuifje fields
      all_time_high: clampNum(ath?.price),
      ath_decline_pct: clampNum(athDeclinePct),
      five_year_low: clampNum(fiveYearLow?.price),
      three_year_low: clampNum(threeYearLow?.price),
      purchase_limit: clampNum(purchaseLimit),
      score: clampNum(growthScore),
      growth_event_count: growthEvents,
      highest_growth_pct: clampNum(highestGrowthPct),
      highest_growth_date: highestGrowthDate,
      confidence_score: 100,
      // Zonnebloem fields
      base_price_median: clampNum(spikeAnalysis.basePriceMedian),
      price_12m_ago: spikeAnalysis.priceChange12m !== null
        ? clampNum(candidate.close / (1 + spikeAnalysis.priceChange12m / 100))
        : null,
      price_change_12m_pct: clampNum(spikeAnalysis.priceChange12m),
      spike_count: spikeAnalysis.events.length,
      highest_spike_pct: clampNum(spikeAnalysis.highestSpikePct),
      highest_spike_date: spikeAnalysis.highestSpikeDate,
      spike_score: clampNum(spikeAnalysis.spikeScore),
      // Shared
      avg_volume_30d: roundInt(candidate.avgVolume30d),
      market_cap: roundInt(candidate.marketCap),
      last_updated: new Date().toISOString(),
      scan_session_id: scanId || null,
      needs_review: needsReview,
      review_reason: reviewReason,
      match_type: matchType,
      is_deleted: false,
      is_archived: false,
    };

    const { error: upsertError } = await supabase.from('sector_stocks').upsert(
      stockData,
      { onConflict: 'scanner_type,ticker' },
    );

    if (upsertError) {
      detail.result = 'error';
      detail.errorMessage = `DB upsert error: ${upsertError.message}`;
      return { matched: false, isNew: false, detail, error: upsertError.message };
    }

    // Store spike events
    await supabase.from('sector_spike_events')
      .delete()
      .eq('scanner_type', config.type)
      .eq('ticker', ticker);

    if (spikeAnalysis.events.length > 0) {
      await supabase.from('sector_spike_events').insert(
        spikeAnalysis.events.map((event) => ({
          scanner_type: config.type,
          ticker,
          start_date: event.start_date,
          peak_date: event.peak_date,
          end_date: event.end_date,
          base_price: event.base_price,
          peak_price: event.peak_price,
          spike_pct: event.spike_pct,
          duration_days: event.duration_days,
          is_valid: event.is_valid,
        })),
      );
    }

    // Store growth events
    await supabase.from('sector_growth_events')
      .delete()
      .eq('scanner_type', config.type)
      .eq('ticker', ticker);

    if (growthEvents > 0) {
      const growthAnalysis = analyzeGrowthEvents(history, 30, 2, 5);
      if (growthAnalysis.events.length > 0) {
        await supabase.from('sector_growth_events').insert(
          growthAnalysis.events.map((event) => ({
            scanner_type: config.type,
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
    }

    detail.result = 'match';
    console.log(
      `  >>> ${config.label} MATCH [${matchType}]: ${ticker} | Growth=${growthEvents} | Spikes=${spikeAnalysis.events.length} | Max spike=${spikeAnalysis.highestSpikePct.toFixed(0)}%`,
    );

    return { matched: true, isNew, detail, error: null };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    detail.result = 'error';
    detail.errorMessage = errMsg;
    return { matched: false, isNew: false, detail, error: errMsg };
  }
}
