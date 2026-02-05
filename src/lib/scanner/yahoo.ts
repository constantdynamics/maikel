import type { OHLCData, StockQuote } from '../types';
import { retryWithBackoff, sleep } from '../utils';

const RATE_LIMIT_DELAY = 200;
const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const YAHOO_BASE2 = 'https://query2.finance.yahoo.com';

// Rotate between user agents to reduce blocking
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];
let uaIndex = 0;

interface YahooQuoteResult {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  exchange?: string;
  marketCap?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
}

// Store cookies from Yahoo for session continuity
let yahooCookies = '';

async function yahooFetch(url: string): Promise<unknown> {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;

  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (yahooCookies) {
    headers['Cookie'] = yahooCookies;
  }

  const res = await fetch(url, { headers });

  // Store cookies for subsequent requests
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    yahooCookies = setCookie.split(',').map((c) => c.split(';')[0].trim()).join('; ');
  }

  if (!res.ok) {
    // Try alternate Yahoo endpoint on failure
    if (url.includes('query1.finance.yahoo.com')) {
      const altUrl = url.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com');
      const altRes = await fetch(altUrl, { headers });
      if (altRes.ok) {
        return altRes.json();
      }
    }
    throw new Error(`Yahoo Finance HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function getStockQuote(ticker: string): Promise<StockQuote | null> {
  try {
    const url = `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
    const data = await retryWithBackoff(() => yahooFetch(url)) as {
      quoteResponse?: { result?: YahooQuoteResult[] };
    };

    const result = data?.quoteResponse?.result?.[0];
    if (!result || !result.regularMarketPrice) return null;

    return {
      ticker: result.symbol,
      name: result.shortName || result.longName || ticker,
      price: result.regularMarketPrice,
      exchange: result.exchange || '',
      marketCap: result.marketCap,
      allTimeHigh: result.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: result.fiftyTwoWeekLow,
    };
  } catch (error) {
    console.error(`Yahoo: Error fetching quote for ${ticker}:`, error);
    return null;
  }
}

export async function getStockProfile(ticker: string): Promise<{
  sector?: string;
  ipoDate?: string;
  exchange?: string;
} | null> {
  try {
    const url = `${YAHOO_BASE}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile`;
    const data = await retryWithBackoff(() => yahooFetch(url)) as {
      quoteSummary?: {
        result?: Array<{
          assetProfile?: { sector?: string };
        }>;
      };
    };

    const profile = data?.quoteSummary?.result?.[0]?.assetProfile;
    return {
      sector: profile?.sector,
    };
  } catch (error) {
    console.error(`Yahoo: Error fetching profile for ${ticker}:`, error);
    return null;
  }
}

export async function getHistoricalData(
  ticker: string,
  years: number = 5,
): Promise<OHLCData[]> {
  try {
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - years * 365 * 24 * 60 * 60;

    const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startDate}&period2=${endDate}&interval=1d`;
    const data = await retryWithBackoff(() => yahooFetch(url)) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }>;
          };
        }>;
      };
    };

    const result = data?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) return [];

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const ohlcData: OHLCData[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i];

      if (open == null || high == null || low == null || close == null) continue;

      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      ohlcData.push({ date, open, high, low, close, volume: volume || 0 });
    }

    return ohlcData;
  } catch (error) {
    console.error(`Yahoo: Error fetching history for ${ticker}:`, error);
    return [];
  }
}

export async function batchGetQuotes(
  tickers: string[],
  batchSize: number = 10,
): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const symbols = batch.join(',');

    try {
      const url = `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
      const data = await retryWithBackoff(() => yahooFetch(url)) as {
        quoteResponse?: { result?: YahooQuoteResult[] };
      };

      const quotes = data?.quoteResponse?.result || [];
      for (const q of quotes) {
        if (q.regularMarketPrice) {
          results.set(q.symbol, {
            ticker: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price: q.regularMarketPrice,
            exchange: q.exchange || '',
            marketCap: q.marketCap,
            allTimeHigh: q.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow,
          });
        }
      }
    } catch (error) {
      console.error(`Yahoo: Error fetching batch quotes:`, error);
    }

    await sleep(RATE_LIMIT_DELAY);
  }

  return results;
}
