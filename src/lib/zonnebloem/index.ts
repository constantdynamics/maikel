/**
 * Professor Zonnebloem Scanner - Main Orchestrator
 *
 * Scans global markets for stocks with:
 * - Stable base price (not declining significantly)
 * - Explosive upward spikes (100%+ from base, lasting 4+ days)
 * - Stock exists 3+ years
 * - Tradeable on recognized exchanges
 *
 * Key difference from Kuifje: searches for "stable base + explosive spikes"
 * instead of "crashed stocks with recovery potential".
 *
 * IMPORTANT: Uses a rotation system to ensure NEW stocks are scanned
 * each cycle, tracking which stocks have been deep-scanned before.
 */

import { createServiceClient } from '../supabase';
import { fetchCandidatesFromAllMarkets, type ZBCandidate } from './tradingview';
import * as yahoo from '../scanner/yahoo';
import { analyzeSpikeEvents } from './scorer';
import { validatePriceHistory, detectStockSplit } from '../scanner/validator';
import { sleep } from '../utils';
import type { ZonnebloemSettings, ZonnebloemScanDetail, OHLCData } from '../types';
import { ZONNEBLOEM_DEFAULTS } from '../types';

interface ZBScanResult {
  status: 'completed' | 'failed' | 'partial';
  marketsScanned: string[];
  candidatesFound: number;
  stocksDeepScanned: number;
  stocksMatched: number;
  newStocksFound: number;
  errors: string[];
  durationSeconds: number;
  apiCallsYahoo: number;
}

async function getZBSettings(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<ZonnebloemSettings> {
  const { data } = await supabase.from('settings').select('key, value');

  const settings = { ...ZONNEBLOEM_DEFAULTS };

  if (!data) return settings;

  for (const row of data) {
    const key = row.key as keyof ZonnebloemSettings;
    if (key in settings) {
      try {
        const defaultVal = settings[key];
        (settings as unknown as Record<string, unknown>)[key] =
          typeof defaultVal === 'number'
            ? Number(row.value)
            : JSON.parse(String(row.value));
      } catch {
        // Keep default
      }
    }
  }

  return settings;
}

async function updateProgress(
  supabase: ReturnType<typeof createServiceClient>,
  scanId: string | undefined,
  fields: Record<string, unknown>,
) {
  if (!scanId) return;
  await supabase.from('zonnebloem_scan_logs').update(fields).eq('id', scanId);
}

/**
 * Get tickers that have already been deep-scanned, ordered by
 * oldest scan first. This allows us to prioritize never-scanned tickers.
 */
async function getScannedTickers(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Map<string, { lastScanned: Date; scanCount: number; lastResult: string }>> {
  const { data } = await supabase
    .from('zonnebloem_scan_history')
    .select('ticker, last_scanned_at, scan_count, last_result');

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

/**
 * Record that a ticker has been deep-scanned.
 */
async function recordScanHistory(
  supabase: ReturnType<typeof createServiceClient>,
  ticker: string,
  market: string,
  result: string,
) {
  await supabase.from('zonnebloem_scan_history').upsert(
    {
      ticker,
      market,
      last_scanned_at: new Date().toISOString(),
      scan_count: 1,
      last_result: result,
    },
    { onConflict: 'ticker' },
  );

  // If the ticker already existed, increment the count
  const { data } = await supabase
    .from('zonnebloem_scan_history')
    .select('scan_count')
    .eq('ticker', ticker)
    .single();

  if (data && data.scan_count > 0) {
    await supabase
      .from('zonnebloem_scan_history')
      .update({
        scan_count: data.scan_count + 1,
        last_scanned_at: new Date().toISOString(),
        last_result: result,
        market,
      })
      .eq('ticker', ticker);
  }
}

/**
 * Prioritize candidates: never-scanned first, then oldest-scanned first.
 * Also randomize within groups to add variety each scan.
 */
function prioritizeCandidates(
  candidates: ZBCandidate[],
  scannedHistory: Map<string, { lastScanned: Date; scanCount: number; lastResult: string }>,
  maxDeepScans: number,
): ZBCandidate[] {
  // Split into never-scanned and previously-scanned
  const neverScanned: ZBCandidate[] = [];
  const previouslyScanned: ZBCandidate[] = [];

  for (const c of candidates) {
    if (scannedHistory.has(c.ticker)) {
      previouslyScanned.push(c);
    } else {
      neverScanned.push(c);
    }
  }

  // Shuffle both groups for variety
  shuffleArray(neverScanned);

  // Sort previously-scanned by oldest first (re-check stale data)
  previouslyScanned.sort((a, b) => {
    const aHistory = scannedHistory.get(a.ticker);
    const bHistory = scannedHistory.get(b.ticker);
    if (!aHistory || !bHistory) return 0;
    return aHistory.lastScanned.getTime() - bHistory.lastScanned.getTime();
  });

  // Combine: never-scanned first, then oldest previously-scanned
  const combined = [...neverScanned, ...previouslyScanned];

  console.log(
    `ZB: Prioritized ${neverScanned.length} new + ${previouslyScanned.length} re-scan candidates (limit: ${maxDeepScans})`,
  );

  return combined.slice(0, maxDeepScans);
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Run the Professor Zonnebloem scan.
 *
 * Phase 1: Fetch candidates from multiple global markets via TradingView
 * Phase 2: Pre-filter and prioritize (never-scanned first)
 * Phase 3: Deep scan with Yahoo Finance historical data
 */
export async function runZonnebloemScan(): Promise<ZBScanResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();
  const errors: string[] = [];
  const scanDetails: ZonnebloemScanDetail[] = [];
  let stocksDeepScanned = 0;
  let stocksMatched = 0;
  let newStocksFound = 0;
  let apiCallsYahoo = 0;

  // Create scan log
  const { data: scanLog } = await supabase
    .from('zonnebloem_scan_logs')
    .insert({
      status: 'running',
      stocks_deep_scanned: 0,
      stocks_matched: 0,
      new_stocks_found: 0,
    })
    .select()
    .single();

  const scanId = scanLog?.id;

  try {
    const settings = await getZBSettings(supabase);

    // =========================================================
    // PHASE 1: Fetch candidates from all configured markets
    // =========================================================
    console.log('ZB Phase 1: Fetching candidates from global markets...');
    await updateProgress(supabase, scanId, {
      status: 'running',
      markets_scanned: settings.zb_markets,
    });

    const allCandidates = await fetchCandidatesFromAllMarkets(
      settings.zb_markets,
      3.0, // Min range ratio (52W High / 52W Low >= 3)
      settings.zb_min_avg_volume,
      settings.zb_min_price,
      500,
    );

    const candidatesFound = allCandidates.length;
    console.log(`ZB Phase 1: Found ${candidatesFound} candidates across all markets`);

    if (candidatesFound === 0) {
      errors.push('No candidates found from any market - TradingView APIs may be blocked');
    }

    // =========================================================
    // PHASE 2: Pre-filter and prioritize
    // =========================================================
    console.log('ZB Phase 2: Pre-filtering and prioritizing...');

    // Filter excluded countries
    const excludedCountries = new Set(
      settings.zb_excluded_countries.map((c) => c.toLowerCase()),
    );

    const preFiltered = allCandidates.filter((c) => {
      // Skip excluded countries
      if (c.country && excludedCountries.has(c.country.toLowerCase())) {
        return false;
      }

      // Skip excluded sectors
      if (c.sector && settings.zb_excluded_sectors.includes(c.sector)) {
        return false;
      }

      return true;
    });

    console.log(`ZB Phase 2: ${preFiltered.length} after pre-filter (excluded ${candidatesFound - preFiltered.length})`);

    // Get scan history for rotation
    const scannedHistory = await getScannedTickers(supabase);

    // Determine max deep scans based on time budget
    // ~300ms per Yahoo call + processing, 5 minute limit = ~800 max
    // But be conservative to leave room for DB operations
    const maxDeepScans = 400;

    const prioritized = prioritizeCandidates(preFiltered, scannedHistory, maxDeepScans);

    await updateProgress(supabase, scanId, {
      candidates_found: candidatesFound,
      stocks_deep_scanned: 0,
      stocks_matched: 0,
    });

    // =========================================================
    // PHASE 3: Deep scan each candidate
    // =========================================================
    console.log(`ZB Phase 3: Deep scanning ${prioritized.length} candidates...`);

    // Process in parallel batches of 5
    const batchSize = 5;

    for (let batchStart = 0; batchStart < prioritized.length; batchStart += batchSize) {
      const batch = prioritized.slice(batchStart, batchStart + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (candidate) => {
          return deepScanCandidate(candidate, settings, supabase);
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const candidate = batch[j];
        stocksDeepScanned++;
        apiCallsYahoo++;

        if (result.status === 'fulfilled') {
          const { matched, isNew, detail, error: scanError } = result.value;

          if (scanError) {
            errors.push(`${candidate.ticker}: ${scanError}`);
          }
          if (detail) {
            scanDetails.push(detail);
          }

          // Record in scan history
          await recordScanHistory(
            supabase,
            candidate.ticker,
            candidate.market,
            matched ? 'match' : 'rejected',
          );

          if (matched) {
            stocksMatched++;
            if (isNew) newStocksFound++;
          }
        } else {
          const errMsg = result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
          errors.push(`${candidate.ticker}: ${errMsg}`);

          await recordScanHistory(
            supabase,
            candidate.ticker,
            candidate.market,
            'error',
          );
        }
      }

      // Update progress every batch
      if (stocksDeepScanned % 10 === 0 || batchStart + batchSize >= prioritized.length) {
        await updateProgress(supabase, scanId, {
          stocks_deep_scanned: stocksDeepScanned,
          stocks_matched: stocksMatched,
          new_stocks_found: newStocksFound,
        });
      }

      // Small delay between batches to be polite to Yahoo
      await sleep(200);
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const status = errors.length === 0 ? 'completed' : 'partial';

    // Final update
    if (scanId) {
      await supabase.from('zonnebloem_scan_logs').update({
        completed_at: new Date().toISOString(),
        status,
        markets_scanned: settings.zb_markets,
        candidates_found: candidatesFound,
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
          source: 'zonnebloem',
          message: e,
          severity: 'warning',
        })),
      );
    }

    console.log(
      `ZB Scan complete: ${stocksMatched} matches (${newStocksFound} new) from ${stocksDeepScanned} deep-scanned in ${durationSeconds}s`,
    );

    return {
      status,
      marketsScanned: settings.zb_markets,
      candidatesFound,
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
      await supabase.from('zonnebloem_scan_logs').update({
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

    await supabase.from('error_logs').insert({
      source: 'zonnebloem',
      message: `ZB Scan failed: ${errMsg}`,
      severity: 'critical',
    });

    return {
      status: 'failed',
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
 * Deep scan a single candidate stock.
 */
async function deepScanCandidate(
  candidate: ZBCandidate,
  settings: ZonnebloemSettings,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{
  matched: boolean;
  isNew: boolean;
  detail: ZonnebloemScanDetail | null;
  error: string | null;
}> {
  const ticker = candidate.ticker;
  const detail: ZonnebloemScanDetail = {
    ticker,
    name: candidate.name,
    market: candidate.market,
    price: candidate.close,
    high52w: candidate.high52w,
    low52w: candidate.low52w,
    rangeRatio: candidate.rangeRatio,
    sector: candidate.sector,
    phase: 'deep_scan',
    result: 'rejected',
  };

  try {
    // Fetch 5-year historical data from Yahoo Finance
    const history = await yahoo.getHistoricalData(ticker, 5);

    if (history.length === 0) {
      detail.result = 'error';
      detail.errorMessage = 'No historical data from Yahoo Finance';
      return { matched: false, isNew: false, detail, error: detail.errorMessage };
    }

    // Validate price history
    const historyValidation = validatePriceHistory(history);
    if (!historyValidation.isValid) {
      detail.result = 'error';
      detail.errorMessage = historyValidation.errors.join(', ');
      return { matched: false, isNew: false, detail, error: null };
    }

    // Check minimum age (3 years of data)
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const oldestDate = new Date(history[0].date);
    if (oldestDate > threeYearsAgo) {
      detail.result = 'rejected';
      detail.rejectReason = `Less than 3 years of history (oldest: ${history[0].date})`;
      return { matched: false, isNew: false, detail, error: null };
    }

    // Check for stock splits (may invalidate spike data)
    const splits = detectStockSplit(history);

    // Analyze spike events
    const spikeAnalysis = analyzeSpikeEvents(
      history,
      settings.zb_min_spike_pct,
      settings.zb_min_spike_duration_days,
      settings.zb_lookback_months,
    );

    detail.spikeCount = spikeAnalysis.events.length;
    detail.spikeScore = spikeAnalysis.spikeScore;
    detail.highestSpikePct = spikeAnalysis.highestSpikePct;
    detail.priceChange12m = spikeAnalysis.priceChange12m ?? undefined;

    // Check minimum spike count
    if (spikeAnalysis.events.length < settings.zb_min_spike_count) {
      detail.result = 'rejected';
      detail.rejectReason = `Only ${spikeAnalysis.events.length} spikes (need ${settings.zb_min_spike_count}+)`;
      return { matched: false, isNew: false, detail, error: null };
    }

    // Check 12-month price stability
    if (spikeAnalysis.priceChange12m !== null) {
      if (spikeAnalysis.priceChange12m < -settings.zb_max_price_decline_12m_pct) {
        detail.result = 'rejected';
        detail.rejectReason = `Price declined ${spikeAnalysis.priceChange12m.toFixed(1)}% over 12m (max -${settings.zb_max_price_decline_12m_pct}%)`;
        return { matched: false, isNew: false, detail, error: null };
      }
    }

    // Check base price stability
    if (spikeAnalysis.baseDeclinePct !== null) {
      if (spikeAnalysis.baseDeclinePct < -settings.zb_max_base_decline_pct) {
        detail.result = 'rejected';
        detail.rejectReason = `Base price declined ${spikeAnalysis.baseDeclinePct.toFixed(1)}% (max -${settings.zb_max_base_decline_pct}%)`;
        return { matched: false, isNew: false, detail, error: null };
      }
    }

    // MATCH! Check if this is a new stock
    const { data: existing } = await supabase
      .from('zonnebloem_stocks')
      .select('id')
      .eq('ticker', ticker)
      .single();

    const isNew = !existing;

    // Determine if needs review
    let needsReview = false;
    let reviewReason: string | null = null;

    if (splits.length > 0) {
      needsReview = true;
      reviewReason = `${splits.length} potential stock split(s) detected`;
    }
    if (spikeAnalysis.highestSpikePct > 2000) {
      needsReview = true;
      reviewReason = `Extreme spike: ${spikeAnalysis.highestSpikePct.toFixed(0)}%`;
    }

    // Upsert stock
    const { error: upsertError } = await supabase.from('zonnebloem_stocks').upsert(
      {
        ticker,
        company_name: candidate.name || ticker,
        sector: candidate.sector || null,
        exchange: candidate.exchange || null,
        market: candidate.market,
        country: candidate.country || null,
        current_price: candidate.close,
        base_price_median: spikeAnalysis.basePriceMedian,
        price_12m_ago: spikeAnalysis.priceChange12m !== null
          ? candidate.close / (1 + spikeAnalysis.priceChange12m / 100)
          : null,
        price_change_12m_pct: spikeAnalysis.priceChange12m,
        spike_count: spikeAnalysis.events.length,
        highest_spike_pct: spikeAnalysis.highestSpikePct,
        highest_spike_date: spikeAnalysis.highestSpikeDate,
        spike_score: spikeAnalysis.spikeScore,
        avg_volume_30d: candidate.avgVolume30d,
        market_cap: candidate.marketCap,
        last_updated: new Date().toISOString(),
        needs_review: needsReview,
        review_reason: reviewReason,
      },
      { onConflict: 'ticker' },
    );

    if (upsertError) {
      detail.result = 'error';
      detail.errorMessage = `DB upsert error: ${upsertError.message}`;
      return { matched: false, isNew: false, detail, error: upsertError.message };
    }

    // Store spike events
    await supabase.from('zonnebloem_spike_events').delete().eq('ticker', ticker);
    if (spikeAnalysis.events.length > 0) {
      await supabase.from('zonnebloem_spike_events').insert(
        spikeAnalysis.events.map((event) => ({
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

    detail.result = 'match';
    console.log(
      `  >>> ZB MATCH: ${ticker} | Score=${spikeAnalysis.spikeScore} | Spikes=${spikeAnalysis.events.length} | Max=${spikeAnalysis.highestSpikePct.toFixed(0)}% | 12m=${spikeAnalysis.priceChange12m?.toFixed(1)}%`,
    );

    return { matched: true, isNew, detail, error: null };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    detail.result = 'error';
    detail.errorMessage = errMsg;
    return { matched: false, isNew: false, detail, error: errMsg };
  }
}
