// Weekend Background Task Service
// Fetches 5-year historical data for all stocks on weekends when markets are closed
// This reduces API usage during trading hours

import type { Stock, HistoricalDataPoint } from '../types';
import { getStockAPI, configureMultiApi } from './stockApi';
import { RATE_LIMITS } from './rateLimiter';
import type { ApiKeyConfig, ApiProvider } from '../types';

const WEEKEND_FETCH_KEY = 'defog-weekend-fetch-timestamp';
const FETCH_COOLDOWN_HOURS = 12; // Don't re-fetch within 12 hours

export interface WeekendTaskProgress {
  current: number;
  total: number;
  ticker: string;
  status: 'running' | 'completed' | 'idle';
}

export interface StockRangeUpdate {
  stockId: string;
  tabId: string;
  year3High?: number;
  year3Low?: number;
  year5High?: number;
  year5Low?: number;
}

// Check if current day is a weekend (Saturday or Sunday)
export function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

// Check if it's late evening (after market hours) on a weekday
export function isAfterMarketHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Weekend
  if (day === 0 || day === 6) return true;

  // Weekday after 9pm or before 6am
  return hour >= 21 || hour < 6;
}

// Check if we should run the weekend task
export function shouldRunWeekendTask(): boolean {
  // Only run on weekends (Saturday or Sunday)
  if (!isWeekend()) {
    console.log('[WeekendTask] Not a weekend, skipping');
    return false;
  }

  // Check if we've already fetched recently
  try {
    const lastFetch = localStorage.getItem(WEEKEND_FETCH_KEY);
    if (lastFetch) {
      const lastFetchTime = parseInt(lastFetch, 10);
      const hoursSinceLastFetch = (Date.now() - lastFetchTime) / (1000 * 60 * 60);

      if (hoursSinceLastFetch < FETCH_COOLDOWN_HOURS) {
        console.log(`[WeekendTask] Already fetched ${hoursSinceLastFetch.toFixed(1)} hours ago, skipping`);
        return false;
      }
    }
  } catch {
    // Ignore errors
  }

  return true;
}

// Mark that we've completed a weekend fetch
function markWeekendFetchComplete(): void {
  try {
    localStorage.setItem(WEEKEND_FETCH_KEY, Date.now().toString());
  } catch {
    // Ignore errors
  }
}

// Calculate high/low from historical data for different periods
function calculateRanges(historicalData: HistoricalDataPoint[]): {
  year3High?: number;
  year3Low?: number;
  year5High?: number;
  year5Low?: number;
} {
  if (!historicalData || historicalData.length === 0) {
    return {};
  }

  const now = new Date();
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setFullYear(now.getFullYear() - 3);

  const fiveYearsAgo = new Date(now);
  fiveYearsAgo.setFullYear(now.getFullYear() - 5);

  let year3High: number | undefined;
  let year3Low: number | undefined;
  let year5High: number | undefined;
  let year5Low: number | undefined;

  for (const point of historicalData) {
    const pointDate = new Date(point.date);
    const price = point.high || point.close;
    const lowPrice = point.low || point.close;

    // 5-year range (all data)
    if (pointDate >= fiveYearsAgo) {
      if (year5High === undefined || price > year5High) {
        year5High = price;
      }
      if (year5Low === undefined || lowPrice < year5Low) {
        year5Low = lowPrice;
      }
    }

    // 3-year range
    if (pointDate >= threeYearsAgo) {
      if (year3High === undefined || price > year3High) {
        year3High = price;
      }
      if (year3Low === undefined || lowPrice < year3Low) {
        year3Low = lowPrice;
      }
    }
  }

  return { year3High, year3Low, year5High, year5Low };
}

// Run the weekend background task
export async function runWeekendTask(
  stocks: Array<{ tabId: string; stock: Stock }>,
  apiKey: string,
  apiProvider: ApiProvider,
  apiKeys: ApiKeyConfig[],
  onProgress?: (progress: WeekendTaskProgress) => void,
  onStockUpdate?: (update: StockRangeUpdate) => void
): Promise<void> {
  if (stocks.length === 0) {
    console.log('[WeekendTask] No stocks to process');
    return;
  }

  console.log(`[WeekendTask] Starting 5-year data fetch for ${stocks.length} stocks...`);

  const api = getStockAPI(apiKey, apiProvider);
  configureMultiApi(apiKeys);

  // Use Yahoo Finance for this since it doesn't have strict limits
  // and provides 5-year data
  const limits = RATE_LIMITS['yahoo'];

  for (let i = 0; i < stocks.length; i++) {
    const { tabId, stock } = stocks[i];

    onProgress?.({
      current: i + 1,
      total: stocks.length,
      ticker: stock.ticker,
      status: 'running',
    });

    try {
      console.log(`[WeekendTask] Fetching 5-year data for ${stock.ticker} (${i + 1}/${stocks.length})`);

      // Use fetchStockWithFallback which will try Yahoo as fallback
      const result = await api.fetchStockWithFallback(stock.ticker, stock.exchange, {
        needsHistorical: true,
      });

      if (result.data?.historicalData && result.data.historicalData.length > 0) {
        const ranges = calculateRanges(result.data.historicalData);

        if (ranges.year3High || ranges.year5High) {
          console.log(`[WeekendTask] ${stock.ticker}: 3Y=${ranges.year3Low?.toFixed(2)}-${ranges.year3High?.toFixed(2)}, 5Y=${ranges.year5Low?.toFixed(2)}-${ranges.year5High?.toFixed(2)}`);

          onStockUpdate?.({
            stockId: stock.id,
            tabId,
            ...ranges,
          });
        }
      }
    } catch (error) {
      console.error(`[WeekendTask] Failed for ${stock.ticker}:`, error);
    }

    // Rate limit between requests
    if (i < stocks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, limits.minDelayMs));
    }
  }

  markWeekendFetchComplete();

  onProgress?.({
    current: stocks.length,
    total: stocks.length,
    ticker: '',
    status: 'completed',
  });

  console.log('[WeekendTask] Completed 5-year data fetch');
}

// Get the last weekend fetch time
export function getLastWeekendFetchTime(): Date | null {
  try {
    const lastFetch = localStorage.getItem(WEEKEND_FETCH_KEY);
    if (lastFetch) {
      return new Date(parseInt(lastFetch, 10));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Force reset the weekend fetch timestamp (for testing)
export function resetWeekendFetchTimestamp(): void {
  try {
    localStorage.removeItem(WEEKEND_FETCH_KEY);
    console.log('[WeekendTask] Reset fetch timestamp');
  } catch {
    // Ignore errors
  }
}

// Check if we can run weekend task manually (not running already)
export function canRunWeekendTaskManually(): boolean {
  // Check cooldown
  try {
    const lastFetch = localStorage.getItem(WEEKEND_FETCH_KEY);
    if (lastFetch) {
      const lastFetchTime = parseInt(lastFetch, 10);
      const hoursSinceLastFetch = (Date.now() - lastFetchTime) / (1000 * 60 * 60);

      if (hoursSinceLastFetch < FETCH_COOLDOWN_HOURS) {
        return false;
      }
    }
  } catch {
    // Ignore errors
  }

  return true;
}
