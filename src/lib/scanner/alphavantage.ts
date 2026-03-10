import type { StockQuote, OHLCData } from '../types';
import { retryWithBackoff } from '../utils';
import { safeNumber } from '../input-sanitize';

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';
const DAILY_LIMIT = 25;

// Track daily call count (25/day free tier)
// Persistent counter: stored in module scope but resilient to date changes (#4)
let dailyCallCount = 0;
let lastResetDate = new Date().toDateString();
let persistentCountLoaded = false;

/**
 * Try to load persistent counter from Supabase (#4).
 * Falls back to in-memory counter if DB is unavailable.
 */
async function loadPersistentCount(): Promise<void> {
  if (persistentCountLoaded) return;
  persistentCountLoaded = true;

  try {
    // Dynamic import to avoid circular dependency
    const { createServiceClient } = await import('../supabase');
    const supabase = createServiceClient();
    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', `av_daily_count_${today}`)
      .single();

    if (data?.value) {
      const storedCount = parseInt(String(data.value), 10);
      if (!isNaN(storedCount) && storedCount > dailyCallCount) {
        dailyCallCount = storedCount;
        console.log(`[AlphaVantage] Loaded persistent counter: ${dailyCallCount}/${DAILY_LIMIT} calls today`);
      }
    }
  } catch {
    // DB not available - use in-memory counter
  }
}

async function savePersistentCount(): Promise<void> {
  try {
    const { createServiceClient } = await import('../supabase');
    const supabase = createServiceClient();
    const today = new Date().toISOString().split('T')[0];

    await supabase.from('settings').upsert(
      { key: `av_daily_count_${today}`, value: String(dailyCallCount) },
      { onConflict: 'key' },
    );
  } catch {
    // Silent - persistence is best-effort
  }
}

function checkAndResetDailyCount(): void {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyCallCount = 0;
    lastResetDate = today;
    persistentCountLoaded = false; // Reload for new day
  }
}

function canMakeCall(): boolean {
  checkAndResetDailyCount();
  return dailyCallCount < DAILY_LIMIT;
}

async function fetchAlphaVantage(params: Record<string, string>): Promise<unknown> {
  if (!API_KEY) {
    console.warn('Alpha Vantage: ALPHA_VANTAGE_API_KEY not configured');
    return null;
  }

  // Load persistent counter on first call (#4)
  await loadPersistentCount();

  if (!canMakeCall()) {
    console.warn(`Alpha Vantage: Daily limit reached (${DAILY_LIMIT} calls)`);
    return null;
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('apikey', API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await retryWithBackoff(async () => {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Alpha Vantage HTTP error: ${res.status}`);
    return res.json();
  });

  dailyCallCount++;
  // Persist counter asynchronously (#4)
  savePersistentCount().catch(() => {});
  return response;
}

export async function getStockQuote(ticker: string): Promise<StockQuote | null> {
  try {
    const data = await fetchAlphaVantage({
      function: 'GLOBAL_QUOTE',
      symbol: ticker,
    }) as Record<string, Record<string, string>> | null;

    if (!data || !data['Global Quote']) return null;

    const quote = data['Global Quote'];
    const rawPrice = parseFloat(quote['05. price']);
    const price = safeNumber(rawPrice);

    if (!price || price <= 0) return null;

    return {
      ticker: quote['01. symbol'] || ticker,
      name: ticker,
      price,
      exchange: '',
    };
  } catch (error) {
    console.error(`AlphaVantage: Error fetching quote for ${ticker}:`, error);
    return null;
  }
}

export async function getHistoricalData(
  ticker: string,
): Promise<OHLCData[]> {
  try {
    const data = await fetchAlphaVantage({
      function: 'TIME_SERIES_DAILY',
      symbol: ticker,
      outputsize: 'full',
    }) as Record<string, Record<string, Record<string, string>>> | null;

    if (!data || !data['Time Series (Daily)']) return [];

    const timeSeries = data['Time Series (Daily)'];
    const results: OHLCData[] = [];

    // Only keep last 5 years
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    for (const [dateStr, values] of Object.entries(timeSeries)) {
      const date = new Date(dateStr);
      if (date < fiveYearsAgo) continue;

      const open = parseFloat(values['1. open']);
      const high = parseFloat(values['2. high']);
      const low = parseFloat(values['3. low']);
      const close = parseFloat(values['4. close']);
      const volume = parseInt(values['5. volume'], 10);

      // Skip data points with NaN values
      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;

      results.push({
        date: dateStr,
        open,
        high,
        low,
        close,
        volume: isNaN(volume) ? 0 : volume,
      });
    }

    return results.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(`AlphaVantage: Error fetching history for ${ticker}:`, error);
    return [];
  }
}

export function getRemainingCalls(): number {
  checkAndResetDailyCount();
  return Math.max(0, DAILY_LIMIT - dailyCallCount);
}

export async function verifyPrice(
  ticker: string,
  expectedPrice: number,
  tolerance: number = 0.05,
): Promise<{ verified: boolean; price: number | null; diff: number | null }> {
  const quote = await getStockQuote(ticker);
  if (!quote) return { verified: false, price: null, diff: null };

  const diff = Math.abs(quote.price - expectedPrice) / expectedPrice;
  return {
    verified: diff <= tolerance,
    price: quote.price,
    diff,
  };
}
