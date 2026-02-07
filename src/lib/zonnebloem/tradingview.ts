/**
 * Professor Zonnebloem - Multi-market TradingView scanner
 *
 * Scans 8+ global markets for stocks with high 52-week range ratios,
 * which indicates potential explosive spikes from a stable base.
 *
 * Key difference from Kuifje: instead of searching for crashed stocks,
 * we search for stocks where 52W High / 52W Low >= 3.0, indicating
 * the stock had a massive spike within the past year.
 */

import { retryWithBackoff } from '../utils';

interface TradingViewResult {
  s: string;
  d: (string | number | null)[];
}

interface TradingViewResponse {
  totalCount: number;
  data: TradingViewResult[];
}

export interface ZBCandidate {
  ticker: string;
  fullSymbol: string;
  exchange: string;
  name: string;
  close: number;
  change: number;
  volume: number;
  avgVolume30d: number | null;
  marketCap: number | null;
  sector: string | null;
  high52w: number | null;
  low52w: number | null;
  rangeRatio: number | null;
  market: string;
  country: string | null;
}

// TradingView market endpoints
const MARKET_URLS: Record<string, string> = {
  america: 'https://scanner.tradingview.com/america/scan',
  europe: 'https://scanner.tradingview.com/europe/scan',
  uk: 'https://scanner.tradingview.com/uk/scan',
  canada: 'https://scanner.tradingview.com/canada/scan',
  australia: 'https://scanner.tradingview.com/australia/scan',
  germany: 'https://scanner.tradingview.com/germany/scan',
  hongkong: 'https://scanner.tradingview.com/hongkong/scan',
  japan: 'https://scanner.tradingview.com/japan/scan',
  india: 'https://scanner.tradingview.com/india/scan',
  brazil: 'https://scanner.tradingview.com/brazil/scan',
  korea: 'https://scanner.tradingview.com/korea/scan',
  taiwan: 'https://scanner.tradingview.com/taiwan/scan',
  singapore: 'https://scanner.tradingview.com/singapore/scan',
  mexico: 'https://scanner.tradingview.com/mexico/scan',
  israel: 'https://scanner.tradingview.com/israel/scan',
  indonesia: 'https://scanner.tradingview.com/indonesia/scan',
};

// Sanctioned/excluded countries mapping per market
const MARKET_COUNTRIES: Record<string, string> = {
  america: 'United States',
  europe: 'Europe',
  uk: 'United Kingdom',
  canada: 'Canada',
  australia: 'Australia',
  germany: 'Germany',
  hongkong: 'Hong Kong',
  japan: 'Japan',
  india: 'India',
  brazil: 'Brazil',
  korea: 'South Korea',
  taiwan: 'Taiwan',
  singapore: 'Singapore',
  mexico: 'Mexico',
  israel: 'Israel',
  indonesia: 'Indonesia',
};

/**
 * Fetch stocks with high 52-week range ratio from a single market.
 * A high range ratio (52W High / 52W Low >= 3.0) indicates the stock
 * had a massive spike relative to its base price in the past year.
 */
export async function fetchHighRangeStocks(
  market: string,
  minRangeRatio: number = 3.0,
  minVolume: number = 50000,
  minPrice: number = 0.10,
  limit: number = 500,
  offset: number = 0,
): Promise<ZBCandidate[]> {
  const url = MARKET_URLS[market];
  if (!url) {
    console.warn(`ZB: Unknown market "${market}", skipping`);
    return [];
  }

  const payload = {
    columns: [
      'name',
      'description',
      'close',
      'change',
      'volume',
      'average_volume_30d_calc',
      'market_cap_basic',
      'sector',
      'price_52_week_high',
      'price_52_week_low',
      'exchange',
      'country',
    ],
    ignore_unknown_fields: true,
    options: { lang: 'en' },
    range: [offset, offset + limit],
    sort: { sortBy: 'average_volume_30d_calc', sortOrder: 'desc' },
    symbols: {},
    markets: [market],
    filter2: {
      operator: 'and',
      operands: [
        { operation: { operator: 'equal', operand: ['type', 'stock'] } },
        { operation: { operator: 'greater', operand: ['close', minPrice] } },
        { operation: { operator: 'greater', operand: ['average_volume_30d_calc', minVolume] } },
        { operation: { operator: 'greater', operand: ['price_52_week_high', 0] } },
        { operation: { operator: 'greater', operand: ['price_52_week_low', 0] } },
      ],
    },
  };

  try {
    const data = await retryWithBackoff(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`TradingView ${market} HTTP ${res.status}: ${res.statusText}`);
      }
      return res.json() as Promise<TradingViewResponse>;
    });

    if (!data?.data) return [];

    return data.data
      .map((item): ZBCandidate | null => {
        const [exchangePrefix, ticker] = item.s.split(':');
        const d = item.d;

        const high52w = (d[8] as number) || null;
        const low52w = (d[9] as number) || null;
        const rangeRatio = high52w && low52w && low52w > 0
          ? high52w / low52w
          : null;

        // Filter: only keep stocks with high range ratio
        if (!rangeRatio || rangeRatio < minRangeRatio) return null;

        const close = (d[2] as number) || 0;
        if (close <= 0) return null;

        return {
          ticker: ticker || (d[0] as string) || '',
          fullSymbol: item.s,
          exchange: (d[10] as string) || exchangePrefix || '',
          name: (d[1] as string) || '',
          close,
          change: (d[3] as number) || 0,
          volume: (d[4] as number) || 0,
          avgVolume30d: (d[5] as number) || null,
          marketCap: (d[6] as number) || null,
          sector: (d[7] as string) || null,
          high52w,
          low52w,
          rangeRatio,
          market,
          country: (d[11] as string) || MARKET_COUNTRIES[market] || null,
        };
      })
      .filter((s): s is ZBCandidate => s !== null && s.ticker.length > 0);
  } catch (error) {
    console.error(`ZB TradingView: Error fetching ${market}:`, error);
    return [];
  }
}

/**
 * Scan multiple markets in parallel for high-range-ratio stocks.
 * Returns deduplicated candidates sorted by range ratio (highest first).
 */
export async function fetchCandidatesFromAllMarkets(
  markets: string[],
  minRangeRatio: number = 3.0,
  minVolume: number = 50000,
  minPrice: number = 0.10,
  limitPerMarket: number = 500,
): Promise<ZBCandidate[]> {
  console.log(`ZB: Scanning ${markets.length} markets: ${markets.join(', ')}`);

  // Scan all markets in parallel (batches of 4 to avoid rate limiting)
  const allCandidates: ZBCandidate[] = [];
  const batchSize = 4;

  for (let i = 0; i < markets.length; i += batchSize) {
    const batch = markets.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((market) =>
        fetchHighRangeStocks(market, minRangeRatio, minVolume, minPrice, limitPerMarket),
      ),
    );

    for (const candidates of results) {
      console.log(`ZB: Got ${candidates.length} candidates from ${batch[results.indexOf(candidates)] || 'unknown'}`);
      allCandidates.push(...candidates);
    }
  }

  // Deduplicate by ticker (keep the one with highest range ratio)
  const tickerMap = new Map<string, ZBCandidate>();
  for (const candidate of allCandidates) {
    const existing = tickerMap.get(candidate.ticker);
    if (!existing || (candidate.rangeRatio || 0) > (existing.rangeRatio || 0)) {
      tickerMap.set(candidate.ticker, candidate);
    }
  }

  const deduplicated = Array.from(tickerMap.values());

  // Sort by range ratio descending (most explosive first)
  deduplicated.sort((a, b) => (b.rangeRatio || 0) - (a.rangeRatio || 0));

  console.log(`ZB: Total ${allCandidates.length} raw -> ${deduplicated.length} unique candidates`);
  return deduplicated;
}
