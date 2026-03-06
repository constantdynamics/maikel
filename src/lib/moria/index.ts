/**
 * Moria Scanner — finds ultra-cheap mining stocks deep in the mines.
 *
 * Criteria:
 * - Mining sector (Non-Energy Minerals, Process Industries, or keyword matching)
 * - >= 90% below all-time high
 * - >= 80% below 3-year high (if data available)
 * - >= 50% below 1-year high (if data available)
 * - Listed on US (NYSE/NASDAQ/AMEX), Canada (TSX/TSXV), or Australia (ASX)
 * - No OTC / pink sheets
 * - Price > 0 (still alive)
 */

import { createServiceClient } from '@/lib/supabase';
import { retryWithBackoff, sleep } from '@/lib/utils';
import * as yahoo from '@/lib/scanner/yahoo';
import { analyzeGrowthEvents } from '@/lib/scanner/scorer';
import { analyzeSpikeEvents } from '@/lib/zonnebloem/scorer';
import { validatePriceHistory } from '@/lib/scanner/validator';

// Mining keywords for sector matching
const MINING_KEYWORDS = [
  'mining', 'miner', 'mineral', 'gold', 'silver', 'copper', 'platinum',
  'palladium', 'zinc', 'nickel', 'lithium', 'cobalt', 'iron ore', 'uranium',
  'rare earth', 'metals', 'exploration', 'ore', 'quarry', 'resource',
  'precious', 'base metal',
];

// TradingView sector names that map to mining
const MINING_SECTOR_FILTERS = ['Non-Energy Minerals', 'Process Industries'];

interface MarketScanConfig {
  url: string;
  marketCode: string;
  marketId: string;
  exchanges: string[];
  yahooSuffix: (exchange: string) => string;
}

const MORIA_MARKETS: MarketScanConfig[] = [
  {
    url: 'https://scanner.tradingview.com/america/scan',
    marketCode: 'america',
    marketId: 'america',
    exchanges: ['AMEX', 'NYSE', 'NASDAQ'],
    yahooSuffix: () => '',
  },
  {
    url: 'https://scanner.tradingview.com/canada/scan',
    marketCode: 'canada',
    marketId: 'canada',
    exchanges: ['TSX', 'TSXV'],
    yahooSuffix: (exchange: string) => exchange === 'TSXV' ? '.V' : '.TO',
  },
  {
    url: 'https://scanner.tradingview.com/australia/scan',
    marketCode: 'australia',
    marketId: 'australia',
    exchanges: ['ASX'],
    yahooSuffix: () => '.AX',
  },
];

const COLUMNS = [
  'name',          // 0
  'description',   // 1
  'close',         // 2
  'volume',        // 3
  'average_volume_30d_calc', // 4
  'market_cap_basic', // 5
  'sector',        // 6
  'High.All',      // 7: all-time high
  'High.3Y',       // 8: 3-year high
  'price_52_week_high', // 9: 1-year high
  'High.6M',       // 10: 6-month high
  'exchange',      // 11
  'country',       // 12
];

interface TradingViewResult {
  s: string;
  d: (string | number | null)[];
}

interface TradingViewResponse {
  totalCount: number;
  data: TradingViewResult[];
}

interface MoriaCandidate {
  ticker: string;
  yahooTicker: string;
  companyName: string;
  sector: string | null;
  exchange: string;
  market: string;
  country: string | null;
  currentPrice: number;
  allTimeHigh: number;
  athDeclinePct: number;
  high3y: number | null;
  declineFrom3yPct: number | null;
  high1y: number | null;
  declineFrom1yPct: number | null;
  high6m: number | null;
  declineFrom6mPct: number | null;
  avgVolume30d: number | null;
  marketCap: number | null;
}

function matchesMining(sector: string | null, name: string): boolean {
  if (sector && MINING_SECTOR_FILTERS.some(f => sector === f)) return true;
  const lower = (sector || '').toLowerCase() + ' ' + name.toLowerCase();
  return MINING_KEYWORDS.some(kw => lower.includes(kw));
}

function calcDecline(price: number, high: number | null): number | null {
  if (high === null || high === undefined || high <= 0) return null;
  return ((high - price) / high) * 100;
}

async function fetchMoriaCandidates(market: MarketScanConfig): Promise<MoriaCandidate[]> {
  const payload = {
    columns: COLUMNS,
    ignore_unknown_fields: true,
    options: { lang: 'en' },
    range: [0, 5000],
    sort: { sortBy: 'close', sortOrder: 'asc' },
    symbols: {},
    markets: [market.marketCode],
    filter: [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
      { left: 'exchange', operation: 'in_range', right: market.exchanges },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'close', operation: 'greater', right: 0 },
      { left: 'High.All', operation: 'greater', right: 0 },
      // Pre-filter: cheap stocks only (< $100)
      { left: 'close', operation: 'less', right: 100 },
    ],
  };

  console.log(`[Moria] Fetching from ${market.marketId}...`);

  const response = await retryWithBackoff(async () => {
    const res = await fetch(market.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TradingView HTTP ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json() as Promise<TradingViewResponse>;
  });

  if (!response?.data) {
    console.log(`[Moria] No data returned from ${market.marketId}`);
    return [];
  }

  console.log(`[Moria] ${market.marketId}: got ${response.data.length} raw results (total: ${response.totalCount})`);

  const candidates: MoriaCandidate[] = [];
  let miningCount = 0;
  let declinePassCount = 0;

  for (const item of response.data) {
    const [exchangePrefix, ticker] = item.s.split(':');
    const d = item.d;

    const name = (d[1] as string) || '';
    const close = (d[2] as number) || 0;
    const avgVolume = (d[4] as number) || null;
    const marketCap = (d[5] as number) || null;
    const sector = (d[6] as string) || null;
    const ath = (d[7] as number) || 0;
    const high3y = typeof d[8] === 'number' ? d[8] : null;
    const high1y = typeof d[9] === 'number' ? d[9] : null;
    const high6m = typeof d[10] === 'number' ? d[10] : null;
    const exchange = (d[11] as string) || exchangePrefix || '';
    const country = (d[12] as string) || null;

    if (!ticker || close <= 0) continue;
    if (exchange === 'OTC' || exchange === 'OTCM') continue;
    if (ticker.match(/\.H$/i)) continue;

    // Must be mining-related
    if (!matchesMining(sector, name)) continue;
    miningCount++;

    // Primary criterion: >= 90% below all-time high
    const athDecline = calcDecline(close, ath);
    if (athDecline === null || athDecline < 90) continue;
    declinePassCount++;

    // Secondary criteria (applied if data available, not required)
    const decline3y = calcDecline(close, high3y);
    const decline1y = calcDecline(close, high1y);
    const decline6m = calcDecline(close, high6m);

    // If 3Y data exists, require >= 80% decline
    if (decline3y !== null && decline3y < 80) continue;

    // If 1Y data exists, require >= 50% decline
    if (decline1y !== null && decline1y < 50) continue;

    // Build Yahoo ticker
    const cleanTicker = ticker.replace(/\.(H|P|U|WT)$/i, '');
    const suffix = market.yahooSuffix(exchange);
    const yahooTicker = suffix ? `${cleanTicker}${suffix}` : cleanTicker;

    candidates.push({
      ticker: cleanTicker,
      yahooTicker,
      companyName: name,
      sector,
      exchange,
      market: market.marketId,
      country,
      currentPrice: close,
      allTimeHigh: ath,
      athDeclinePct: Math.round((athDecline ?? 0) * 100) / 100,
      high3y,
      declineFrom3yPct: decline3y !== null ? Math.round(decline3y * 100) / 100 : null,
      high1y,
      declineFrom1yPct: decline1y !== null ? Math.round(decline1y * 100) / 100 : null,
      high6m,
      declineFrom6mPct: decline6m !== null ? Math.round(decline6m * 100) / 100 : null,
      avgVolume30d: avgVolume,
      marketCap: marketCap,
    });
  }

  console.log(`[Moria] ${market.marketId}: ${miningCount} mining stocks, ${declinePassCount} pass ATH >=90%, ${candidates.length} final candidates`);
  return candidates;
}

/**
 * Deep scan a single Moria stock via Yahoo Finance to detect growth events and spike events.
 */
async function deepScanMoriaStock(
  yahooTicker: string,
): Promise<{
  growthEventCount: number;
  highestGrowthPct: number | null;
  highestGrowthDate: string | null;
  spikeCount: number;
  highestSpikePct: number | null;
  highestSpikeDate: string | null;
  spikeScore: number;
} | null> {
  try {
    const history = await yahoo.getHistoricalData(yahooTicker, 5);
    if (history.length < 100) return null;

    const validation = validatePriceHistory(history);
    if (!validation.isValid) return null;

    // Kuifje-style growth event analysis
    const growthAnalysis = analyzeGrowthEvents(history, 30, 2, 5);

    // Zonnebloem-style spike event analysis
    const spikeAnalysis = analyzeSpikeEvents(history, 75, 3, 24);

    return {
      growthEventCount: growthAnalysis.events.length,
      highestGrowthPct: growthAnalysis.highestGrowthPct || null,
      highestGrowthDate: growthAnalysis.highestGrowthDate,
      spikeCount: spikeAnalysis.events.length,
      highestSpikePct: spikeAnalysis.highestSpikePct || null,
      highestSpikeDate: spikeAnalysis.highestSpikeDate,
      spikeScore: spikeAnalysis.spikeScore,
    };
  } catch (err) {
    console.error(`[Moria] Deep scan failed for ${yahooTicker}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function runMoriaScan(): Promise<{
  status: string;
  marketsScanned: number;
  candidatesFound: number;
  stocksSaved: number;
  newStocksFound: number;
  stocksDeepScanned: number;
  errors: string[];
}> {
  const supabase = createServiceClient();
  const errors: string[] = [];

  // Try to create scan log (may fail if table doesn't exist yet)
  let scanSessionId: string | null = null;
  try {
    const { data: scanLog, error: logError } = await supabase
      .from('moria_scan_logs')
      .insert({
        started_at: new Date().toISOString(),
        status: 'running',
        markets_scanned: MORIA_MARKETS.map(m => m.marketId),
        candidates_found: 0,
        stocks_saved: 0,
        new_stocks_found: 0,
      })
      .select('id')
      .single();

    if (logError) {
      console.error('[Moria] Could not create scan log:', logError.message);
      errors.push(`Scan log: ${logError.message}`);
    } else {
      scanSessionId = scanLog?.id || null;
    }
  } catch (e) {
    console.error('[Moria] Scan log creation failed:', e);
  }

  // Fetch from all three markets in parallel
  console.log('[Moria] Starting scan across', MORIA_MARKETS.length, 'markets...');
  const results = await Promise.all(
    MORIA_MARKETS.map(market =>
      fetchMoriaCandidates(market).catch(err => {
        const msg = `Error scanning ${market.marketId}: ${err instanceof Error ? err.message : err}`;
        console.error(`[Moria] ${msg}`);
        errors.push(msg);
        return [] as MoriaCandidate[];
      })
    )
  );

  const allCandidates = results.flat();
  console.log(`[Moria] Total candidates across all markets: ${allCandidates.length}`);

  let newStocksFound = 0;
  let stocksSaved = 0;
  let stocksDeepScanned = 0;

  // Upsert each candidate (basic TradingView data first)
  for (const c of allCandidates) {
    try {
      const { data: existing } = await supabase
        .from('moria_stocks')
        .select('id')
        .eq('ticker', c.ticker)
        .eq('market', c.market)
        .eq('is_deleted', false)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from('moria_stocks')
          .update({
            current_price: c.currentPrice,
            all_time_high: c.allTimeHigh,
            ath_decline_pct: c.athDeclinePct,
            high_3y: c.high3y,
            decline_from_3y_pct: c.declineFrom3yPct,
            high_1y: c.high1y,
            decline_from_1y_pct: c.declineFrom1yPct,
            high_6m: c.high6m,
            decline_from_6m_pct: c.declineFrom6mPct,
            avg_volume_30d: c.avgVolume30d,
            market_cap: c.marketCap,
            last_updated: new Date().toISOString(),
            scan_session_id: scanSessionId,
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error(`[Moria] Error updating ${c.ticker}:`, updateError.message);
        } else {
          stocksSaved++;
        }
      } else {
        const { error: insertError } = await supabase
          .from('moria_stocks')
          .insert({
            ticker: c.ticker,
            yahoo_ticker: c.yahooTicker,
            company_name: c.companyName,
            sector: c.sector,
            exchange: c.exchange,
            market: c.market,
            country: c.country,
            current_price: c.currentPrice,
            all_time_high: c.allTimeHigh,
            ath_decline_pct: c.athDeclinePct,
            high_3y: c.high3y,
            decline_from_3y_pct: c.declineFrom3yPct,
            high_1y: c.high1y,
            decline_from_1y_pct: c.declineFrom1yPct,
            high_6m: c.high6m,
            decline_from_6m_pct: c.declineFrom6mPct,
            avg_volume_30d: c.avgVolume30d,
            market_cap: c.marketCap,
            detection_date: new Date().toISOString(),
            scan_session_id: scanSessionId,
          });

        if (insertError) {
          console.error(`[Moria] Error inserting ${c.ticker}:`, insertError.message);
          if (errors.length < 5) errors.push(`Insert ${c.ticker}: ${insertError.message}`);
        } else {
          newStocksFound++;
          stocksSaved++;
        }
      }
    } catch (e) {
      console.error(`[Moria] Error processing ${c.ticker}:`, e);
    }
  }

  console.log(`[Moria] Phase 1 complete: ${allCandidates.length} candidates, ${stocksSaved} saved, ${newStocksFound} new`);
  console.log(`[Moria] Phase 2: Deep scanning ${allCandidates.length} stocks via Yahoo Finance...`);

  // Deep scan in batches of 5 to get growth events and spike events
  const BATCH_SIZE = 5;
  for (let i = 0; i < allCandidates.length; i += BATCH_SIZE) {
    const batch = allCandidates.slice(i, i + BATCH_SIZE);

    const deepResults = await Promise.allSettled(
      batch.map(c => deepScanMoriaStock(c.yahooTicker))
    );

    for (let j = 0; j < deepResults.length; j++) {
      const c = batch[j];
      const result = deepResults[j];
      stocksDeepScanned++;

      if (result.status !== 'fulfilled' || !result.value) continue;

      const deep = result.value;
      const clampNum = (v: number | null, max: number = 9_999_999): number | null =>
        v == null || !isFinite(v) ? null : Math.min(Math.max(v, -max), max);

      try {
        await supabase
          .from('moria_stocks')
          .update({
            growth_event_count: deep.growthEventCount,
            highest_growth_pct: clampNum(deep.highestGrowthPct),
            highest_growth_date: deep.highestGrowthDate,
            spike_count: deep.spikeCount,
            highest_spike_pct: clampNum(deep.highestSpikePct),
            highest_spike_date: deep.highestSpikeDate,
            spike_score: clampNum(deep.spikeScore),
          })
          .eq('ticker', c.ticker)
          .eq('market', c.market)
          .eq('is_deleted', false);
      } catch (e) {
        console.error(`[Moria] Error updating deep scan for ${c.ticker}:`, e);
      }
    }

    if (i + BATCH_SIZE < allCandidates.length) await sleep(50);
  }

  console.log(`[Moria] Scan complete: ${allCandidates.length} candidates, ${stocksSaved} saved, ${newStocksFound} new, ${stocksDeepScanned} deep-scanned`);

  // Update scan log
  if (scanSessionId) {
    try {
      await supabase
        .from('moria_scan_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: errors.length > 0 ? 'partial' : 'completed',
          candidates_found: allCandidates.length,
          stocks_saved: stocksSaved,
          new_stocks_found: newStocksFound,
          errors,
        })
        .eq('id', scanSessionId);
    } catch (e) {
      console.error('[Moria] Could not update scan log:', e);
    }
  }

  return {
    status: errors.length > 0 ? 'partial' : 'completed',
    marketsScanned: MORIA_MARKETS.length,
    candidatesFound: allCandidates.length,
    stocksSaved,
    newStocksFound,
    stocksDeepScanned,
    errors,
  };
}
