import type { StockQuote, OHLCData } from '../types';
import { retryWithBackoff } from '../utils';

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const BASE_URL = 'https://www.alphavantage.co/query';

// Track daily call count (25/day free tier)
let dailyCallCount = 0;
let lastResetDate = new Date().toDateString();

function checkAndResetDailyCount(): void {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyCallCount = 0;
    lastResetDate = today;
  }
}

function canMakeCall(): boolean {
  checkAndResetDailyCount();
  return dailyCallCount < 25;
}

async function fetchAlphaVantage(params: Record<string, string>): Promise<unknown> {
  if (!canMakeCall()) {
    console.warn('Alpha Vantage: Daily limit reached (25 calls)');
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
    const price = parseFloat(quote['05. price']);

    if (!price || isNaN(price)) return null;

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

      results.push({
        date: dateStr,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'], 10),
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
  return Math.max(0, 25 - dailyCallCount);
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
