import { NextRequest, NextResponse } from 'next/server';

// Server-side Yahoo Finance proxy
// Avoids CORS issues and handles authentication (crumb/cookie)
// Used by the client-side stockApi.ts for all Yahoo Finance requests

// Cache crumb/cookie pair for reuse (server-side module scope)
let cachedCrumb: string | null = null;
let cachedCookie: string | null = null;
let crumbFetchedAt = 0;
const CRUMB_TTL_MS = 30 * 60 * 1000; // 30 minutes

const YAHOO_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch a fresh crumb/cookie pair from Yahoo Finance.
 * Yahoo requires a crumb token for authenticated API access.
 */
async function fetchCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    // Step 1: Get session cookie from Yahoo
    const consentRes = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': YAHOO_USER_AGENT },
      redirect: 'manual',
    });

    const setCookieHeaders = consentRes.headers.getSetCookie?.() || [];
    const cookies = setCookieHeaders
      .map(c => c.split(';')[0])
      .filter(c => c.includes('='))
      .join('; ');

    if (!cookies) {
      console.log('[YahooProxy] No cookies received from fc.yahoo.com');
      return null;
    }

    // Step 2: Get crumb using the session cookie
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': YAHOO_USER_AGENT,
        'Cookie': cookies,
      },
    });

    if (!crumbRes.ok) {
      console.log(`[YahooProxy] Crumb fetch failed: ${crumbRes.status}`);
      return null;
    }

    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes('<')) {
      console.log('[YahooProxy] Invalid crumb response');
      return null;
    }

    console.log('[YahooProxy] Got fresh crumb');
    return { crumb, cookie: cookies };
  } catch (e) {
    console.error('[YahooProxy] Crumb fetch error:', e);
    return null;
  }
}

/**
 * Get a valid crumb/cookie pair (cached or fresh).
 */
async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  const now = Date.now();
  if (cachedCrumb && cachedCookie && (now - crumbFetchedAt) < CRUMB_TTL_MS) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  const result = await fetchCrumb();
  if (result) {
    cachedCrumb = result.crumb;
    cachedCookie = result.cookie;
    crumbFetchedAt = now;
  }
  return result;
}

/**
 * Known non-Yahoo suffixes mapped to their Yahoo equivalents.
 * Used to fix tickers from scanners that use different exchange codes.
 */
const NON_YAHOO_SUFFIX_MAP: Record<string, string> = {
  'LON': '.L',      // London Stock Exchange
  'FRK': '.F',      // Frankfurt (Börse Frankfurt)
  'TRV': '',         // Tradeville (Romania) — try without suffix
  'STU': '.DE',      // Stuttgart → use XETRA
  'BER': '.BE',      // Berlin
  'MUN': '.MU',      // Munich
  'HAM': '.HM',      // Hamburg
  'DUS': '.DU',      // Düsseldorf
  'VIE': '.VI',      // Vienna
  'WAR': '.WA',      // Warsaw
  'PRA': '.PR',      // Prague
  'BUD': '.BD',      // Budapest
  'TAL': '.TL',      // Tallinn
  'RIG': '.RG',      // Riga
  'VIL': '.VS',      // Vilnius
  'IST': '.IS',      // Istanbul
  'ATH': '.AT',      // Athens
  'OTC': '',          // OTC Markets (US) — no suffix needed
  'PNK': '',          // Pink Sheets (US) — no suffix needed
  'OTCBB': '',        // OTC Bulletin Board (US)
};

/** Yahoo-compatible suffixes that should be passed through as-is */
const KNOWN_YAHOO_SUFFIXES = new Set([
  'AS', 'PA', 'DE', 'F', 'L', 'SW', 'BR', 'MI', 'MC', 'LS',
  'HK', 'T', 'SS', 'SZ', 'SI', 'KS', 'KQ', 'TW', 'AX', 'NZ',
  'TO', 'V', 'SA', 'MX', 'JO', 'KL', 'BK', 'VI', 'WA', 'PR',
  'BE', 'MU', 'HM', 'DU', 'BD', 'TL', 'RG', 'VS', 'IS', 'AT',
  'CO', 'OL', 'ST', 'HE', 'TA', 'SR',
]);

/**
 * Normalize a symbol to be Yahoo Finance compatible.
 * Converts non-Yahoo suffixes (e.g., .LON → .L, .FRK → .F)
 */
function normalizeYahooSymbol(symbol: string): string {
  if (!symbol.includes('.')) return symbol;

  const dotIndex = symbol.indexOf('.');
  const base = symbol.substring(0, dotIndex);
  const suffix = symbol.substring(dotIndex + 1).toUpperCase();

  // Already a valid Yahoo suffix
  if (KNOWN_YAHOO_SUFFIXES.has(suffix)) return symbol;

  // Convert known non-Yahoo suffix
  const yahoSuffix = NON_YAHOO_SUFFIX_MAP[suffix];
  if (yahoSuffix !== undefined) {
    return base + yahoSuffix;
  }

  // Unknown suffix — return as-is and hope for the best
  console.log(`[YahooProxy] Unknown suffix "${suffix}" for symbol "${symbol}"`);
  return symbol;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get('symbol');
  const range = searchParams.get('range') || '5d';
  const interval = searchParams.get('interval') || '1d';

  if (!rawSymbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  // Normalize non-Yahoo suffixes
  const symbol = normalizeYahooSymbol(rawSymbol);

  // Try without crumb first (some regions still work without it)
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

  try {
    let res = await fetch(chartUrl, {
      headers: {
        'User-Agent': YAHOO_USER_AGENT,
        'Accept': 'application/json',
      },
    });

    // If 401/403, try with crumb authentication
    if (res.status === 401 || res.status === 403) {
      console.log(`[YahooProxy] ${symbol}: Got ${res.status}, trying with crumb...`);
      const auth = await getCrumb();
      if (auth) {
        const authUrl = `${chartUrl}&crumb=${encodeURIComponent(auth.crumb)}`;
        res = await fetch(authUrl, {
          headers: {
            'User-Agent': YAHOO_USER_AGENT,
            'Accept': 'application/json',
            'Cookie': auth.cookie,
          },
        });

        // If still failing, invalidate crumb and try once more with fresh one
        if (res.status === 401 || res.status === 403) {
          console.log(`[YahooProxy] ${symbol}: Crumb expired, fetching new one...`);
          cachedCrumb = null;
          const freshAuth = await getCrumb();
          if (freshAuth) {
            const freshUrl = `${chartUrl}&crumb=${encodeURIComponent(freshAuth.crumb)}`;
            res = await fetch(freshUrl, {
              headers: {
                'User-Agent': YAHOO_USER_AGENT,
                'Accept': 'application/json',
                'Cookie': freshAuth.cookie,
              },
            });
          }
        }
      }
    }

    if (!res.ok) {
      console.log(`[YahooProxy] ${symbol}: HTTP ${res.status}`);
      return NextResponse.json(
        { error: `Yahoo API returned ${res.status}`, symbol, normalizedFrom: rawSymbol !== symbol ? rawSymbol : undefined },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Add metadata about normalization
    if (rawSymbol !== symbol) {
      data._proxy = { originalSymbol: rawSymbol, normalizedSymbol: symbol };
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': range === '5d' ? 'public, max-age=300' : 'public, max-age=3600',
      },
    });
  } catch (e) {
    console.error(`[YahooProxy] ${symbol}: Error`, e);
    return NextResponse.json(
      { error: 'Failed to fetch from Yahoo Finance', symbol },
      { status: 502 }
    );
  }
}
