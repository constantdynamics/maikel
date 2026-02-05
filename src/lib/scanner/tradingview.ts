/**
 * TradingView Scanner API integration.
 *
 * Fetches the biggest losers from TradingView's market movers page
 * (https://www.tradingview.com/markets/stocks-usa/market-movers-losers/)
 * via their unofficial scanner API.
 *
 * This replaces the hardcoded ticker list - the scan universe is now
 * dynamically sourced from what TradingView identifies as top losers.
 */

import { retryWithBackoff } from '../utils';

const SCANNER_URL = 'https://scanner.tradingview.com/america/scan';

interface TradingViewResult {
  s: string; // e.g. "NASDAQ:AAPL"
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
}

/**
 * Fetch top losers from TradingView scanner API.
 *
 * Mirrors the data from:
 * https://www.tradingview.com/markets/stocks-usa/market-movers-losers/
 *
 * @param limit Number of stocks to fetch (max ~1000)
 */
export async function fetchTopLosers(limit: number = 200): Promise<TradingViewStock[]> {
  const payload = {
    columns: [
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
    ],
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, limit],
    sort: { sortBy: 'change', sortOrder: 'asc' },
    symbols: {},
    markets: ['america'],
    filter2: {
      operator: 'and',
      operands: [
        // Only common stocks (no ETFs, funds, etc.)
        { operation: { operator: 'equal', operand: ['type', 'stock'] } },
        // Only NYSE and NASDAQ
        {
          operation: {
            operator: 'in_range',
            operand: ['exchange', ['AMEX', 'NYSE', 'NASDAQ']],
          },
        },
        // Must be actively traded (volume > 0)
        { operation: { operator: 'greater', operand: ['volume', 0] } },
        // Price > 0 (no weird entries)
        { operation: { operator: 'greater', operand: ['close', 0] } },
      ],
    },
  };

  try {
    const data = await retryWithBackoff(async () => {
      const res = await fetch(SCANNER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`TradingView scanner HTTP ${res.status}: ${res.statusText}`);
      }

      return res.json() as Promise<TradingViewResponse>;
    });

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
        };
      })
      .filter((s) => s.ticker && s.close > 0);
  } catch (error) {
    console.error('TradingView: Error fetching top losers:', error);
    return [];
  }
}

/**
 * Fetch stocks that have declined the most from their all-time high.
 * This is a more targeted query for our specific use case.
 */
export async function fetchHighDeclineStocks(
  minDeclinePct: number = 90,
  limit: number = 300,
): Promise<TradingViewStock[]> {
  const payload = {
    columns: [
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
    ],
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, limit],
    sort: { sortBy: 'change', sortOrder: 'asc' },
    symbols: {},
    markets: ['america'],
    filter2: {
      operator: 'and',
      operands: [
        { operation: { operator: 'equal', operand: ['type', 'stock'] } },
        {
          operation: {
            operator: 'in_range',
            operand: ['exchange', ['AMEX', 'NYSE', 'NASDAQ']],
          },
        },
        { operation: { operator: 'greater', operand: ['volume', 0] } },
        { operation: { operator: 'greater', operand: ['close', 0] } },
        // Must have an all-time high recorded
        { operation: { operator: 'greater', operand: ['High.All', 0] } },
      ],
    },
  };

  try {
    const data = await retryWithBackoff(async () => {
      const res = await fetch(SCANNER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`TradingView scanner HTTP ${res.status}: ${res.statusText}`);
      }

      return res.json() as Promise<TradingViewResponse>;
    });

    if (!data?.data) return [];

    return data.data
      .map((item): { declinePct: number; stock: TradingViewStock } => {
        const [exchangePrefix, ticker] = item.s.split(':');
        const d = item.d;
        const ath = (d[8] as number) || 0;
        const close = (d[2] as number) || 0;

        return {
          declinePct: ath > 0 ? ((ath - close) / ath) * 100 : 0,
          stock: {
            ticker: ticker || (d[0] as string),
            exchange: (d[11] as string) || exchangePrefix || '',
            name: (d[1] as string) || '',
            close,
            change: (d[3] as number) || 0,
            changePct: (d[4] as number) || 0,
            volume: (d[5] as number) || 0,
            marketCap: (d[6] as number) || null,
            sector: (d[7] as string) || null,
            high52w: (d[9] as number) || null,
            low52w: (d[10] as number) || null,
          },
        };
      })
      .filter((s) => s.stock.ticker && s.stock.close > 0 && s.declinePct >= minDeclinePct)
      .map((s) => s.stock);
  } catch (error) {
    console.error('TradingView: Error fetching high-decline stocks:', error);
    return [];
  }
}
