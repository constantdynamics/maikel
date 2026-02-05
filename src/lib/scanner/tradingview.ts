/**
 * TradingView Scanner API integration.
 *
 * Fetches the biggest losers from TradingView's market movers pages
 * (USA + Canada) via their unofficial scanner API.
 */

import { retryWithBackoff } from '../utils';

const SCANNER_URL_US = 'https://scanner.tradingview.com/america/scan';
const SCANNER_URL_CA = 'https://scanner.tradingview.com/canada/scan';

const COLUMNS = [
  'name',
  'description',
  'close',
  'change',
  'change_from_open',
  'volume',
  'market_cap_basic',
  'sector',
  'High.All',
  'price_52_week_high',
  'price_52_week_low',
  'exchange',
];

interface TradingViewResult {
  s: string; // e.g. "NASDAQ:AAPL" or "TSX:XYZ"
  d: (string | number | null)[]; // data columns in request order
}

interface TradingViewResponse {
  totalCount: number;
  data: TradingViewResult[];
}

export interface TradingViewStock {
  ticker: string;
  exchange: string;
  name: string;
  close: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap: number | null;
  sector: string | null;
  high52w: number | null;
  low52w: number | null;
  allTimeHigh: number | null;
}

function parseResults(data: TradingViewResponse | null): TradingViewStock[] {
  if (!data?.data) return [];
  return data.data
    .map((item) => {
      const [exchangePrefix, ticker] = item.s.split(':');
      const d = item.d;
      return {
        ticker: ticker || (d[0] as string),
        exchange: (d[11] as string) || exchangePrefix || '',
        name: (d[1] as string) || '',
        close: (d[2] as number) || 0,
        change: (d[3] as number) || 0,
        changePct: (d[4] as number) || 0,
        volume: (d[5] as number) || 0,
        marketCap: (d[6] as number) || null,
        sector: (d[7] as string) || null,
        high52w: (d[9] as number) || null,
        low52w: (d[10] as number) || null,
        allTimeHigh: (d[8] as number) || null,
      };
    })
    .filter((s) => s.ticker && s.close > 0);
}

async function fetchFromScanner(url: string, payload: object): Promise<TradingViewResponse> {
  return retryWithBackoff(async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`TradingView scanner HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<TradingViewResponse>;
  });
}

/**
 * Fetch top losers from US exchanges (NYSE, NASDAQ, AMEX).
 */
export async function fetchTopLosers(limit: number = 200): Promise<TradingViewStock[]> {
  const payload = {
    columns: COLUMNS,
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, limit],
    sort: { sortBy: 'change', sortOrder: 'asc' },
    symbols: {},
    markets: ['america'],
    filter: [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
      { left: 'exchange', operation: 'in_range', right: ['AMEX', 'NYSE', 'NASDAQ'] },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'volume', operation: 'greater', right: 0 },
      { left: 'close', operation: 'greater', right: 0 },
    ],
  };

  try {
    return parseResults(await fetchFromScanner(SCANNER_URL_US, payload));
  } catch (error) {
    console.error('TradingView: Error fetching US top losers:', error);
    return [];
  }
}

/**
 * Fetch top losers from Canadian exchanges (TSX, TSXV).
 */
export async function fetchCanadianLosers(limit: number = 200): Promise<TradingViewStock[]> {
  const payload = {
    columns: COLUMNS,
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, limit],
    sort: { sortBy: 'change', sortOrder: 'asc' },
    symbols: {},
    markets: ['canada'],
    filter: [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
      { left: 'exchange', operation: 'in_range', right: ['TSX', 'TSXV'] },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'volume', operation: 'greater', right: 0 },
      { left: 'close', operation: 'greater', right: 0 },
    ],
  };

  try {
    const results = parseResults(await fetchFromScanner(SCANNER_URL_CA, payload));
    // Suffix Canadian tickers with .TO/.V for Yahoo Finance compatibility
    return results.map((s) => ({
      ...s,
      ticker: s.exchange === 'TSXV' ? `${s.ticker}.V` : `${s.ticker}.TO`,
    }));
  } catch (error) {
    console.error('TradingView: Error fetching Canadian losers:', error);
    return [];
  }
}

/**
 * Fetch stocks that have declined the most from their all-time high (US).
 */
export async function fetchHighDeclineStocks(
  minDeclinePct: number = 90,
  limit: number = 300,
): Promise<TradingViewStock[]> {
  const payload = {
    columns: COLUMNS,
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, limit],
    sort: { sortBy: 'change', sortOrder: 'asc' },
    symbols: {},
    markets: ['america'],
    filter: [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
      { left: 'exchange', operation: 'in_range', right: ['AMEX', 'NYSE', 'NASDAQ'] },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'volume', operation: 'greater', right: 0 },
      { left: 'close', operation: 'greater', right: 0 },
      { left: 'High.All', operation: 'greater', right: 0 },
    ],
  };

  try {
    const results = parseResults(await fetchFromScanner(SCANNER_URL_US, payload));
    return results.filter((s) => {
      if (!s.allTimeHigh || s.allTimeHigh <= 0) return false;
      const decline = ((s.allTimeHigh - s.close) / s.allTimeHigh) * 100;
      return decline >= minDeclinePct;
    });
  } catch (error) {
    console.error('TradingView: Error fetching high-decline stocks:', error);
    return [];
  }
}

/**
 * Fetch Canadian stocks that have declined from ATH.
 */
export async function fetchCanadianHighDecline(
  minDeclinePct: number = 90,
  limit: number = 300,
): Promise<TradingViewStock[]> {
  const payload = {
    columns: COLUMNS,
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, limit],
    sort: { sortBy: 'change', sortOrder: 'asc' },
    symbols: {},
    markets: ['canada'],
    filter: [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
      { left: 'exchange', operation: 'in_range', right: ['TSX', 'TSXV'] },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'volume', operation: 'greater', right: 0 },
      { left: 'close', operation: 'greater', right: 0 },
      { left: 'High.All', operation: 'greater', right: 0 },
    ],
  };

  try {
    const results = parseResults(await fetchFromScanner(SCANNER_URL_CA, payload));
    return results
      .map((s) => ({
        ...s,
        ticker: s.exchange === 'TSXV' ? `${s.ticker}.V` : `${s.ticker}.TO`,
      }))
      .filter((s) => {
        if (!s.allTimeHigh || s.allTimeHigh <= 0) return false;
        const decline = ((s.allTimeHigh - s.close) / s.allTimeHigh) * 100;
        return decline >= minDeclinePct;
      });
  } catch (error) {
    console.error('TradingView: Error fetching Canadian high-decline stocks:', error);
    return [];
  }
}
