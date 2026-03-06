/**
 * Moria Scanner — finds ultra-cheap mining stocks.
 *
 * Criteria:
 * - Mining sector (Non-Energy Minerals + keyword matching)
 * - >= 99% below all-time high
 * - >= 99% below 3-year high
 * - >= 90% below 1-year high
 * - >= 75% below 6-month high
 * - Listed on US (NYSE/NASDAQ/AMEX), Canada (TSX/TSXV), or Australia (ASX)
 * - No OTC / pink sheets
 */

import { createServiceClient } from '@/lib/supabase';
import { retryWithBackoff } from '@/lib/utils';

// Mining keywords for sector matching
const MINING_KEYWORDS = [
  'mining', 'miner', 'mineral', 'gold', 'silver', 'copper', 'platinum',
  'palladium', 'zinc', 'nickel', 'lithium', 'cobalt', 'iron ore', 'uranium',
  'rare earth', 'metals', 'exploration', 'ore', 'quarry',
];

const MINING_SECTOR_FILTERS = ['Non-Energy Minerals'];

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
  high3y: number;
  declineFrom3yPct: number;
  high1y: number;
  declineFrom1yPct: number;
  high6m: number;
  declineFrom6mPct: number;
  avgVolume30d: number | null;
  marketCap: number | null;
}

function matchesMining(sector: string | null, name: string): boolean {
  if (sector && MINING_SECTOR_FILTERS.some(f => sector === f)) return true;
  const lower = (sector || '').toLowerCase() + ' ' + name.toLowerCase();
  return MINING_KEYWORDS.some(kw => lower.includes(kw));
}

function calcDecline(price: number, high: number): number {
  if (high <= 0) return 0;
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
    ],
  };

  const response = await retryWithBackoff(async () => {
    const res = await fetch(market.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`TradingView HTTP ${res.status}`);
    return res.json() as Promise<TradingViewResponse>;
  });

  if (!response?.data) return [];

  const candidates: MoriaCandidate[] = [];

  for (const item of response.data) {
    const [exchangePrefix, ticker] = item.s.split(':');
    const d = item.d;

    const name = (d[1] as string) || '';
    const close = (d[2] as number) || 0;
    const avgVolume = (d[4] as number) || null;
    const marketCap = (d[5] as number) || null;
    const sector = (d[6] as string) || null;
    const ath = (d[7] as number) || 0;
    const high3y = (d[8] as number) || 0;
    const high1y = (d[9] as number) || 0;
    const high6m = (d[10] as number) || 0;
    const exchange = (d[11] as string) || exchangePrefix || '';
    const country = (d[12] as string) || null;

    if (!ticker || close <= 0) continue;
    if (exchange === 'OTC' || exchange === 'OTCM') continue;
    if (ticker.match(/\.H$/i)) continue;

    // Must be mining-related
    if (!matchesMining(sector, name)) continue;

    // Check all decline criteria
    const athDecline = calcDecline(close, ath);
    if (athDecline < 99) continue;

    const decline3y = calcDecline(close, high3y);
    if (high3y > 0 && decline3y < 99) continue;
    if (high3y <= 0) continue; // must have 3Y data

    const decline1y = calcDecline(close, high1y);
    if (high1y > 0 && decline1y < 90) continue;
    if (high1y <= 0) continue; // must have 1Y data

    const decline6m = calcDecline(close, high6m);
    if (high6m > 0 && decline6m < 75) continue;
    if (high6m <= 0) continue; // must have 6M data

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
      athDeclinePct: Math.round(athDecline * 100) / 100,
      high3y,
      declineFrom3yPct: Math.round(decline3y * 100) / 100,
      high1y,
      declineFrom1yPct: Math.round(decline1y * 100) / 100,
      high6m,
      declineFrom6mPct: Math.round(decline6m * 100) / 100,
      avgVolume30d: avgVolume,
      marketCap: marketCap,
    });
  }

  return candidates;
}

export async function runMoriaScan(): Promise<{
  status: string;
  marketsScanned: number;
  candidatesFound: number;
  stocksSaved: number;
  newStocksFound: number;
}> {
  const supabase = createServiceClient();
  const startedAt = new Date().toISOString();

  // Create scan log
  const { data: scanLog } = await supabase
    .from('moria_scan_logs')
    .insert({
      started_at: startedAt,
      status: 'running',
      markets_scanned: MORIA_MARKETS.map(m => m.marketId),
      candidates_found: 0,
      stocks_saved: 0,
      new_stocks_found: 0,
    })
    .select('id')
    .single();

  const scanSessionId = scanLog?.id || null;

  try {
    // Fetch from all three markets in parallel
    const results = await Promise.all(
      MORIA_MARKETS.map(market =>
        fetchMoriaCandidates(market).catch(err => {
          console.error(`[Moria] Error scanning ${market.marketId}:`, err);
          return [] as MoriaCandidate[];
        })
      )
    );

    const allCandidates = results.flat();
    let newStocksFound = 0;

    // Upsert each candidate
    for (const c of allCandidates) {
      const { data: existing } = await supabase
        .from('moria_stocks')
        .select('id')
        .eq('ticker', c.ticker)
        .eq('market', c.market)
        .eq('is_deleted', false)
        .maybeSingle();

      if (existing) {
        // Update existing
        await supabase
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
      } else {
        // Insert new
        await supabase
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
        newStocksFound++;
      }
    }

    // Update scan log
    if (scanSessionId) {
      await supabase
        .from('moria_scan_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'completed',
          candidates_found: allCandidates.length,
          stocks_saved: allCandidates.length,
          new_stocks_found: newStocksFound,
        })
        .eq('id', scanSessionId);
    }

    return {
      status: 'completed',
      marketsScanned: MORIA_MARKETS.length,
      candidatesFound: allCandidates.length,
      stocksSaved: allCandidates.length,
      newStocksFound,
    };
  } catch (error) {
    if (scanSessionId) {
      await supabase
        .from('moria_scan_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        })
        .eq('id', scanSessionId);
    }
    throw error;
  }
}
