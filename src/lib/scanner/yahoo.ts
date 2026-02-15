import type { OHLCData, StockQuote } from '../types';
import { retryWithBackoff, sleep } from '../utils';

const RATE_LIMIT_DELAY = 200;
const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const YAHOO_BASE2 = 'https://query2.finance.yahoo.com';

// Rotate between user agents to reduce blocking
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
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

// Yahoo session state: cookie + crumb for authenticated API access
let yahooCookies = '';
let yahooCrumb = '';
let crumbInitialized = false;
let crumbInitPromise: Promise<void> | null = null;

/**
 * Initialize Yahoo session: get cookies from fc.yahoo.com, then fetch crumb.
 * Yahoo Finance API requires a valid crumb token since 2023.
 * Without it, most API endpoints return 401/403.
 */
async function initYahooCrumb(): Promise<void> {
  // Prevent concurrent initialization
  if (crumbInitPromise) return crumbInitPromise;

  crumbInitPromise = (async () => {
    try {
      const ua = USER_AGENTS[0];

      // Step 1: Visit fc.yahoo.com to get session cookies
      // This is a lightweight endpoint that sets the required A1/A3 cookies
      const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'manual', // Don't follow redirects, we just need cookies
      });

      // Extract cookies from response - handle Set-Cookie properly
      const cookies = extractCookies(cookieRes);
      if (cookies) {
        yahooCookies = cookies;
      }

      // Step 2: Fetch the crumb using our session cookies
      const crumbRes = await fetch(`${YAHOO_BASE2}/v1/test/getcrumb`, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/plain',
          'Cookie': yahooCookies,
        },
      });

      if (crumbRes.ok) {
        yahooCrumb = await crumbRes.text();
        crumbInitialized = true;
        console.log(`[Yahoo] Crumb initialized successfully (crumb length: ${yahooCrumb.length})`);
      } else {
        console.warn(`[Yahoo] Crumb fetch failed: HTTP ${crumbRes.status}. Trying alternate method...`);

        // Alternate method: fetch consent page to get cookies
        const consentRes = await fetch('https://consent.yahoo.com/v2/collectConsent?sessionId=1', {
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html',
          },
          redirect: 'manual',
        });
        const consentCookies = extractCookies(consentRes);
        if (consentCookies) {
          yahooCookies = consentCookies;
        }

        // Retry crumb with new cookies
        const crumbRetry = await fetch(`${YAHOO_BASE2}/v1/test/getcrumb`, {
          headers: {
            'User-Agent': ua,
            'Accept': 'text/plain',
            'Cookie': yahooCookies,
          },
        });
        if (crumbRetry.ok) {
          yahooCrumb = await crumbRetry.text();
          crumbInitialized = true;
          console.log(`[Yahoo] Crumb initialized via consent method (crumb length: ${yahooCrumb.length})`);
        } else {
          console.error(`[Yahoo] Crumb fetch FAILED even with consent cookies: HTTP ${crumbRetry.status}`);
        }
      }
    } catch (error) {
      console.error('[Yahoo] Crumb initialization error:', error);
    } finally {
      crumbInitPromise = null;
    }
  })();

  return crumbInitPromise;
}

/**
 * Properly extract cookies from a response's Set-Cookie headers.
 * Handles the fact that Set-Cookie values can contain commas in dates
 * (e.g., "Expires=Thu, 01 Jan 2026 00:00:00 GMT").
 */
function extractCookies(res: Response): string {
  // Use getSetCookie() if available (modern Node.js)
  const rawHeaders = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();

  if (rawHeaders && rawHeaders.length > 0) {
    return rawHeaders
      .map((c: string) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }

  // Fallback: parse set-cookie header manually
  // This is tricky because multiple Set-Cookie headers get joined with commas
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';

  // Split carefully: a new cookie starts after a comma followed by a cookie name (word=)
  // Not after commas inside date strings like "Thu, 01 Jan 2026"
  const cookieParts: string[] = [];
  const parts = setCookie.split(/,(?=\s*[A-Za-z_][A-Za-z0-9_]*=)/);
  for (const part of parts) {
    const nameValue = part.split(';')[0].trim();
    if (nameValue && nameValue.includes('=')) {
      cookieParts.push(nameValue);
    }
  }

  return cookieParts.join('; ');
}

/**
 * Add crumb parameter to a Yahoo Finance API URL.
 */
function addCrumb(url: string): string {
  if (!yahooCrumb) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}crumb=${encodeURIComponent(yahooCrumb)}`;
}

async function yahooFetch(url: string): Promise<unknown> {
  // Ensure crumb is initialized before any API call
  if (!crumbInitialized) {
    await initYahooCrumb();
  }

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

  // Add crumb to the URL for authenticated access
  const urlWithCrumb = addCrumb(url);
  const res = await fetch(urlWithCrumb, { headers });

  // Update cookies from response
  const newCookies = extractCookies(res);
  if (newCookies) {
    yahooCookies = newCookies;
  }

  if (!res.ok) {
    // If we got 401/403, our crumb might be stale - reinitialize and retry once
    if ((res.status === 401 || res.status === 403) && crumbInitialized) {
      console.warn(`[Yahoo] Got ${res.status}, reinitializing crumb...`);
      crumbInitialized = false;
      yahooCrumb = '';
      await initYahooCrumb();

      if (yahooCrumb) {
        const retryUrl = addCrumb(url);
        const retryHeaders = { ...headers, Cookie: yahooCookies };
        const retryRes = await fetch(retryUrl, { headers: retryHeaders });
        if (retryRes.ok) {
          return retryRes.json();
        }
        console.error(`[Yahoo] Retry after crumb refresh also failed: HTTP ${retryRes.status}`);
      }
    }

    // Try alternate Yahoo endpoint on failure
    if (url.includes('query1.finance.yahoo.com')) {
      const altUrl = addCrumb(url.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com'));
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
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
      // Log why Yahoo returned empty data for debugging
      const chartError = (data as { chart?: { error?: { code?: string; description?: string } } })?.chart?.error;
      if (chartError) {
        console.warn(`[Yahoo] ${ticker} - API error: ${chartError.code} - ${chartError.description}`);
      } else {
        // Log the actual response shape for debugging
        const dataKeys = data ? Object.keys(data as object) : ['null'];
        const chartKeys = (data as { chart?: object })?.chart ? Object.keys((data as { chart: object }).chart) : ['missing'];
        console.warn(`[Yahoo] ${ticker} - Empty result. Response keys: ${dataKeys.join(',')}, chart keys: ${chartKeys.join(',')}, crumb: ${crumbInitialized ? 'yes' : 'NO'}`);
      }
      return [];
    }

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
