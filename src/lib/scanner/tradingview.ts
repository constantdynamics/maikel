/**
 * TradingView Scanner API integration.
 *
 * Fetches the biggest losers from TradingView's market movers pages
 * via their unofficial scanner API. Supports multiple markets.
 */

import { retryWithBackoff } from '../utils';

// Market configurations
export interface MarketConfig {
  id: string;
  name: string;
  flag: string;
  scannerUrl: string;
  marketCode: string;
  exchanges: string[];
  yahooSuffix: (exchange: string) => string;
}

export const MARKETS: Record<string, MarketConfig> = {
  us: {
    id: 'us',
    name: 'United States',
    flag: '🇺🇸',
    scannerUrl: 'https://scanner.tradingview.com/america/scan',
    marketCode: 'america',
    exchanges: ['AMEX', 'NYSE', 'NASDAQ'],
    yahooSuffix: () => '',
  },
  ca: {
    id: 'ca',
    name: 'Canada',
    flag: '🇨🇦',
    scannerUrl: 'https://scanner.tradingview.com/canada/scan',
    marketCode: 'canada',
    exchanges: ['TSX', 'TSXV'],
    yahooSuffix: (exchange) => exchange === 'TSXV' ? '.V' : '.TO',
  },
  uk: {
    id: 'uk',
    name: 'United Kingdom',
    flag: '🇬🇧',
    scannerUrl: 'https://scanner.tradingview.com/uk/scan',
    marketCode: 'uk',
    exchanges: ['LSE'],
    yahooSuffix: () => '.L',
  },
  de: {
    id: 'de',
    name: 'Germany',
    flag: '🇩🇪',
    scannerUrl: 'https://scanner.tradingview.com/germany/scan',
    marketCode: 'germany',
    exchanges: ['XETR', 'FWB'],
    yahooSuffix: (exchange) => exchange === 'XETR' ? '.DE' : '.F',
  },
  fr: {
    id: 'fr',
    name: 'France',
    flag: '🇫🇷',
    scannerUrl: 'https://scanner.tradingview.com/france/scan',
    marketCode: 'france',
    exchanges: ['EURONEXT'],
    yahooSuffix: () => '.PA',
  },
  hk: {
    id: 'hk',
    name: 'Hong Kong',
    flag: '🇭🇰',
    scannerUrl: 'https://scanner.tradingview.com/hongkong/scan',
    marketCode: 'hongkong',
    exchanges: ['HKEX'],
    yahooSuffix: () => '.HK',
  },
  kr: {
    id: 'kr',
    name: 'South Korea',
    flag: '🇰🇷',
    scannerUrl: 'https://scanner.tradingview.com/korea/scan',
    marketCode: 'korea',
    exchanges: ['KRX', 'KOSDAQ'],
    yahooSuffix: (exchange) => exchange === 'KOSDAQ' ? '.KQ' : '.KS',
  },
  za: {
    id: 'za',
    name: 'South Africa',
    flag: '🇿🇦',
    scannerUrl: 'https://scanner.tradingview.com/rsa/scan',
    marketCode: 'rsa',
    exchanges: ['JSE'],
    yahooSuffix: () => '.JO',
  },
};

export const DEFAULT_MARKETS = ['us', 'ca'];

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
  s: string;
  d: (string | number | null)[];
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
  market: string; // market id
}

function parseResults(data: TradingViewResponse | null, marketId: string): TradingViewStock[] {
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
        market: marketId,
      };
    })
    .filter((s) => s.ticker && s.close > 0)
    .filter((s) => s.exchange !== 'OTC' && s.exchange !== 'OTCM')
    // Skip halted (.H) Canadian stocks — not tradeable
    .filter((s) => !s.ticker.match(/\.H$/i));
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
 * Apply Yahoo Finance ticker suffix based on market.
 * Strips Canadian stock status indicators (.H = halted, .P = preferred)
 * that TradingView includes but Yahoo Finance doesn't recognize.
 */
export function applyYahooSuffix(stock: TradingViewStock): TradingViewStock {
  const market = MARKETS[stock.market];
  if (!market) return stock;
  // Strip Canadian status suffixes before adding exchange suffix
  const cleanTicker = stock.ticker.replace(/\.(H|P|U|WT)$/i, '');
  const suffix = market.yahooSuffix(stock.exchange);
  return {
    ...stock,
    ticker: suffix ? `${cleanTicker}${suffix}` : cleanTicker,
  };
}

/**
 * Fetch top losers from a specific market.
 */
export async function fetchMarketLosers(
  marketId: string,
  limit: number = 200,
): Promise<TradingViewStock[]> {
  const market = MARKETS[marketId];
  if (!market) {
    console.error(`Unknown market: ${marketId}`);
    return [];
  }

  const payload = {
    columns: COLUMNS,
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, limit],
    sort: { sortBy: 'change', sortOrder: 'asc' },
    symbols: {},
    markets: [market.marketCode],
    filter: [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
      { left: 'exchange', operation: 'in_range', right: market.exchanges },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'volume', operation: 'greater', right: 0 },
      { left: 'close', operation: 'greater', right: 0 },
    ],
  };

  try {
    const results = parseResults(await fetchFromScanner(market.scannerUrl, payload), marketId);
    return results.map(applyYahooSuffix);
  } catch (error) {
    console.error(`TradingView: Error fetching ${market.name} losers:`, error);
    return [];
  }
}

/**
 * Fetch stocks with high ATH decline from a specific market.
 */
export async function fetchMarketHighDecline(
  marketId: string,
  minDeclinePct: number = 90,
  limit: number = 300,
): Promise<TradingViewStock[]> {
  const market = MARKETS[marketId];
  if (!market) {
    console.error(`Unknown market: ${marketId}`);
    return [];
  }

  const payload = {
    columns: COLUMNS,
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, limit],
    sort: { sortBy: 'change', sortOrder: 'asc' },
    symbols: {},
    markets: [market.marketCode],
    filter: [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
      { left: 'exchange', operation: 'in_range', right: market.exchanges },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'volume', operation: 'greater', right: 0 },
      { left: 'close', operation: 'greater', right: 0 },
      { left: 'High.All', operation: 'greater', right: 0 },
    ],
  };

  try {
    const results = parseResults(await fetchFromScanner(market.scannerUrl, payload), marketId);
    return results
      .map(applyYahooSuffix)
      .filter((s) => {
        if (!s.allTimeHigh || s.allTimeHigh <= 0) return false;
        const decline = ((s.allTimeHigh - s.close) / s.allTimeHigh) * 100;
        return decline >= minDeclinePct;
      });
  } catch (error) {
    console.error(`TradingView: Error fetching ${market.name} high-decline:`, error);
    return [];
  }
}

/**
 * Fetch losers from multiple markets in parallel.
 */
export async function fetchMultiMarketLosers(
  marketIds: string[],
  limitPerMarket: number = 200,
): Promise<TradingViewStock[]> {
  const results = await Promise.all(
    marketIds.map((id) => fetchMarketLosers(id, limitPerMarket)),
  );
  return results.flat();
}

/**
 * Fetch high-decline stocks from multiple markets in parallel.
 */
export async function fetchMultiMarketHighDecline(
  marketIds: string[],
  minDeclinePct: number = 90,
  limitPerMarket: number = 300,
): Promise<TradingViewStock[]> {
  const results = await Promise.all(
    marketIds.map((id) => fetchMarketHighDecline(id, minDeclinePct, limitPerMarket)),
  );
  return results.flat();
}

// Legacy exports for backward compatibility
export async function fetchTopLosers(limit: number = 200): Promise<TradingViewStock[]> {
  return fetchMarketLosers('us', limit);
}

export async function fetchCanadianLosers(limit: number = 200): Promise<TradingViewStock[]> {
  return fetchMarketLosers('ca', limit);
}

export async function fetchHighDeclineStocks(
  minDeclinePct: number = 90,
  limit: number = 300,
): Promise<TradingViewStock[]> {
  return fetchMarketHighDecline('us', minDeclinePct, limit);
}

export async function fetchCanadianHighDecline(
  minDeclinePct: number = 90,
  limit: number = 300,
): Promise<TradingViewStock[]> {
  return fetchMarketHighDecline('ca', minDeclinePct, limit);
}
