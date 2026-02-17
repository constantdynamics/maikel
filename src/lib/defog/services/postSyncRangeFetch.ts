// Post-Sync Range Fetch Service
// After scanner sync adds new stocks, this service fetches 5Y/3Y/1Y historical
// ranges from Yahoo Finance and calculates proper buy limits.
//
// Flow:
// 1. Find stocks added < 1 day ago that don't have rangeFetched = true
// 2. Fetch 5Y historical data from Yahoo Finance for each
// 3. Calculate year5Low, year3Low, week52Low from the data
// 4. Calculate buyLimit = min(available lows) * 1.05
// 5. Update the stock with ranges + limit

import type { Stock, Tab, HistoricalDataPoint } from '../types';
import { getStockAPI, configureMultiApi } from './stockApi';
import { RATE_LIMITS } from './rateLimiter';
import type { ApiKeyConfig, ApiProvider } from '../types';

const BUY_LIMIT_MULTIPLIER = 1.05;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface RangeFetchProgress {
  current: number;
  total: number;
  ticker: string;
  status: 'running' | 'completed' | 'idle';
}

/**
 * Calculate buy limit from the MINIMUM of all available historical lows.
 * Uses the lowest price point across all timeframes × 1.05.
 * Priority: 5Y low (most comprehensive) → 3Y low → 1Y low.
 * If no range data available, returns null (don't guess).
 */
export function calculateBuyLimitFromRanges(
  year5Low: number | undefined,
  year3Low: number | undefined,
  week52Low: number | undefined,
): number | null {
  const lows = [year5Low, year3Low, week52Low].filter(
    (v): v is number => v != null && v > 0
  );

  if (lows.length === 0) return null;

  const minLow = Math.min(...lows);
  return Math.round(minLow * BUY_LIMIT_MULTIPLIER * 100) / 100;
}

/**
 * Calculate high/low from historical data for different periods.
 */
function calculateRangesFromData(historicalData: HistoricalDataPoint[]): {
  year5High?: number;
  year5Low?: number;
  year3High?: number;
  year3Low?: number;
  week52High?: number;
  week52Low?: number;
} {
  if (!historicalData || historicalData.length === 0) return {};

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setFullYear(now.getFullYear() - 3);
  const fiveYearsAgo = new Date(now);
  fiveYearsAgo.setFullYear(now.getFullYear() - 5);

  let year5High: number | undefined;
  let year5Low: number | undefined;
  let year3High: number | undefined;
  let year3Low: number | undefined;
  let week52High: number | undefined;
  let week52Low: number | undefined;

  for (const point of historicalData) {
    const pointDate = new Date(point.date);
    const highPrice = point.high || point.close;
    const lowPrice = point.low || point.close;

    // 5-year range
    if (pointDate >= fiveYearsAgo) {
      if (year5High === undefined || highPrice > year5High) year5High = highPrice;
      if (year5Low === undefined || lowPrice < year5Low) year5Low = lowPrice;
    }

    // 3-year range
    if (pointDate >= threeYearsAgo) {
      if (year3High === undefined || highPrice > year3High) year3High = highPrice;
      if (year3Low === undefined || lowPrice < year3Low) year3Low = lowPrice;
    }

    // 1-year (52-week) range
    if (pointDate >= oneYearAgo) {
      if (week52High === undefined || highPrice > week52High) week52High = highPrice;
      if (week52Low === undefined || lowPrice < week52Low) week52Low = lowPrice;
    }
  }

  return { year5High, year5Low, year3High, year3Low, week52High, week52Low };
}

/**
 * Find stocks that need range data fetching.
 * Returns stocks added < 1 day ago that don't have rangeFetched = true.
 * Also includes stocks that have buyLimit = null and no range data.
 */
function findStocksNeedingRanges(tabs: Tab[]): Array<{ tabId: string; stock: Stock }> {
  const now = Date.now();
  const results: Array<{ tabId: string; stock: Stock }> = [];

  for (const tab of tabs) {
    // Only check scanner tabs (Kuifje and Prof. Zonnebloem)
    if (tab.name !== 'Kuifje' && tab.name !== 'Prof. Zonnebloem') continue;

    for (const stock of tab.stocks) {
      // Already fetched ranges — skip
      if (stock.rangeFetched) continue;

      // Stock added recently (< 1 day) OR has no buyLimit
      const addedRecently = stock.addedAt && (now - new Date(stock.addedAt).getTime()) < ONE_DAY_MS;
      const hasNoBuyLimit = stock.buyLimit == null;
      const hasNoRangeData = !stock.year5Low && !stock.year3Low;

      if (addedRecently || hasNoBuyLimit || hasNoRangeData) {
        results.push({ tabId: tab.id, stock });
      }
    }
  }

  return results;
}

/**
 * Fetch 5Y/3Y/1Y range data for recently added stocks and calculate buy limits.
 * This runs after scanner sync to ensure proper limits are set.
 */
export async function fetchRangesForNewStocks(
  getTabs: () => Tab[],
  updateStock: (tabId: string, stockId: string, updates: Partial<Stock>) => void,
  onProgress?: (progress: RangeFetchProgress) => void,
): Promise<{ processed: number; updated: number }> {
  const tabs = getTabs();
  const stocksToProcess = findStocksNeedingRanges(tabs);

  if (stocksToProcess.length === 0) {
    console.log('[PostSyncRange] No stocks need range fetching');
    return { processed: 0, updated: 0 };
  }

  console.log(`[PostSyncRange] Fetching ranges for ${stocksToProcess.length} stocks...`);

  const api = getStockAPI();
  let updated = 0;

  for (let i = 0; i < stocksToProcess.length; i++) {
    const { tabId, stock } = stocksToProcess[i];

    onProgress?.({
      current: i + 1,
      total: stocksToProcess.length,
      ticker: stock.ticker,
      status: 'running',
    });

    try {
      console.log(`[PostSyncRange] Fetching 5Y data for ${stock.ticker} (${i + 1}/${stocksToProcess.length})`);

      // Fetch with historical data (Yahoo Finance provides 5Y data)
      const result = await api.fetchStockWithFallback(stock.ticker, stock.exchange, {
        needsHistorical: true,
      });

      if (result.data?.historicalData && result.data.historicalData.length > 0) {
        const ranges = calculateRangesFromData(result.data.historicalData);

        // Determine which range period we got (5Y preferred, then 3Y, then 1Y)
        const hasYear5 = ranges.year5Low != null && ranges.year5Low > 0;
        const hasYear3 = ranges.year3Low != null && ranges.year3Low > 0;
        const hasWeek52 = ranges.week52Low != null && ranges.week52Low > 0;

        if (hasYear5 || hasYear3 || hasWeek52) {
          // Calculate buy limit from the MINIMUM of all available lows
          const buyLimit = calculateBuyLimitFromRanges(
            ranges.year5Low,
            ranges.year3Low,
            ranges.week52Low,
          );

          const updates: Partial<Stock> = {
            rangeFetched: true,
          };

          // Update range data
          if (ranges.year5High != null) updates.year5High = ranges.year5High;
          if (ranges.year5Low != null) updates.year5Low = ranges.year5Low;
          if (ranges.year3High != null) updates.year3High = ranges.year3High;
          if (ranges.year3Low != null) updates.year3Low = ranges.year3Low;
          if (ranges.week52High != null && ranges.week52High > 0) updates.week52High = ranges.week52High;
          if (ranges.week52Low != null && ranges.week52Low > 0) updates.week52Low = ranges.week52Low;

          // Update quote data if available
          if (result.data.currentPrice && result.data.currentPrice > 0) {
            updates.currentPrice = result.data.currentPrice;
          }
          if (result.data.previousClose) updates.previousClose = result.data.previousClose;
          if (result.data.dayChange != null) updates.dayChange = result.data.dayChange;
          if (result.data.dayChangePercent != null) updates.dayChangePercent = result.data.dayChangePercent;

          // Set buy limit (only if we calculated one)
          if (buyLimit != null) {
            updates.buyLimit = buyLimit;
          }

          // Store historical data for charts
          if (result.data.historicalData) {
            updates.historicalData = result.data.historicalData;
          }

          const rangeLabel = hasYear5 ? '5Y' : hasYear3 ? '3Y' : '1Y';
          const lowUsed = hasYear5 ? ranges.year5Low : hasYear3 ? ranges.year3Low : ranges.week52Low;
          console.log(
            `[PostSyncRange] ${stock.ticker}: ${rangeLabel} low=${lowUsed?.toFixed(2)}, ` +
            `buyLimit=${buyLimit?.toFixed(2)}, currentPrice=${(updates.currentPrice || stock.currentPrice).toFixed(2)}`
          );

          updateStock(tabId, stock.id, updates);
          updated++;
        } else {
          // No usable range data found — mark as fetched to avoid retrying
          console.log(`[PostSyncRange] ${stock.ticker}: No usable range data from API`);
          updateStock(tabId, stock.id, { rangeFetched: true });
        }
      } else {
        // No historical data returned — mark as fetched
        console.log(`[PostSyncRange] ${stock.ticker}: No historical data returned`);
        updateStock(tabId, stock.id, { rangeFetched: true });
      }
    } catch (error) {
      console.error(`[PostSyncRange] Failed for ${stock.ticker}:`, error);
      // Don't mark as fetched on error — will retry next sync
    }

    // Rate limit between requests (use Yahoo's rate limit since that's our primary source)
    if (i < stocksToProcess.length - 1) {
      const delay = RATE_LIMITS['yahoo']?.minDelayMs || 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  onProgress?.({
    current: stocksToProcess.length,
    total: stocksToProcess.length,
    ticker: '',
    status: 'completed',
  });

  console.log(`[PostSyncRange] Done. Processed ${stocksToProcess.length}, updated ${updated}`);
  return { processed: stocksToProcess.length, updated };
}

/**
 * Find ALL stocks across ALL tabs that need range data (not just scanner tabs).
 * Used by the manual "Update Ranges" button.
 */
function findAllStocksNeedingRanges(tabs: Tab[]): Array<{ tabId: string; stock: Stock }> {
  const results: Array<{ tabId: string; stock: Stock }> = [];

  for (const tab of tabs) {
    for (const stock of tab.stocks) {
      if (stock.rangeFetched) continue;
      results.push({ tabId: tab.id, stock });
    }
  }

  return results;
}

/**
 * Fetch ranges for ALL stocks across ALL tabs that don't have rangeFetched.
 * This is the manual version triggered by the "Update Ranges" button.
 */
export async function fetchRangesForAllStocks(
  getTabs: () => Tab[],
  updateStock: (tabId: string, stockId: string, updates: Partial<Stock>) => void,
  onProgress?: (progress: RangeFetchProgress) => void,
): Promise<{ processed: number; updated: number }> {
  const tabs = getTabs();
  const stocksToProcess = findAllStocksNeedingRanges(tabs);

  if (stocksToProcess.length === 0) {
    console.log('[ManualRangeFetch] All stocks already have ranges');
    return { processed: 0, updated: 0 };
  }

  console.log(`[ManualRangeFetch] Fetching ranges for ${stocksToProcess.length} stocks...`);

  const api = getStockAPI();
  let updated = 0;

  for (let i = 0; i < stocksToProcess.length; i++) {
    const { tabId, stock } = stocksToProcess[i];

    onProgress?.({
      current: i + 1,
      total: stocksToProcess.length,
      ticker: stock.ticker,
      status: 'running',
    });

    try {
      console.log(`[ManualRangeFetch] Fetching 5Y data for ${stock.ticker} (${i + 1}/${stocksToProcess.length})`);

      const result = await api.fetchStockWithFallback(stock.ticker, stock.exchange, {
        needsHistorical: true,
      });

      if (result.data?.historicalData && result.data.historicalData.length > 0) {
        const ranges = calculateRangesFromData(result.data.historicalData);

        const hasYear5 = ranges.year5Low != null && ranges.year5Low > 0;
        const hasYear3 = ranges.year3Low != null && ranges.year3Low > 0;
        const hasWeek52 = ranges.week52Low != null && ranges.week52Low > 0;

        if (hasYear5 || hasYear3 || hasWeek52) {
          const buyLimit = calculateBuyLimitFromRanges(
            ranges.year5Low,
            ranges.year3Low,
            ranges.week52Low,
          );

          const updates: Partial<Stock> = { rangeFetched: true };

          if (ranges.year5High != null) updates.year5High = ranges.year5High;
          if (ranges.year5Low != null) updates.year5Low = ranges.year5Low;
          if (ranges.year3High != null) updates.year3High = ranges.year3High;
          if (ranges.year3Low != null) updates.year3Low = ranges.year3Low;
          if (ranges.week52High != null && ranges.week52High > 0) updates.week52High = ranges.week52High;
          if (ranges.week52Low != null && ranges.week52Low > 0) updates.week52Low = ranges.week52Low;

          if (result.data.currentPrice && result.data.currentPrice > 0) {
            updates.currentPrice = result.data.currentPrice;
          }
          if (result.data.previousClose) updates.previousClose = result.data.previousClose;
          if (result.data.dayChange != null) updates.dayChange = result.data.dayChange;
          if (result.data.dayChangePercent != null) updates.dayChangePercent = result.data.dayChangePercent;

          if (buyLimit != null) {
            updates.buyLimit = buyLimit;
          }

          if (result.data.historicalData) {
            updates.historicalData = result.data.historicalData;
          }

          const rangeLabel = hasYear5 ? '5Y' : hasYear3 ? '3Y' : '1Y';
          const lowUsed = hasYear5 ? ranges.year5Low : hasYear3 ? ranges.year3Low : ranges.week52Low;
          console.log(
            `[ManualRangeFetch] ${stock.ticker}: ${rangeLabel} low=${lowUsed?.toFixed(2)}, ` +
            `buyLimit=${buyLimit?.toFixed(2)}, currentPrice=${(updates.currentPrice || stock.currentPrice).toFixed(2)}`
          );

          updateStock(tabId, stock.id, updates);
          updated++;
        } else {
          console.log(`[ManualRangeFetch] ${stock.ticker}: No usable range data`);
          updateStock(tabId, stock.id, { rangeFetched: true });
        }
      } else {
        console.log(`[ManualRangeFetch] ${stock.ticker}: No historical data returned`);
        updateStock(tabId, stock.id, { rangeFetched: true });
      }
    } catch (error) {
      console.error(`[ManualRangeFetch] Failed for ${stock.ticker}:`, error);
    }

    if (i < stocksToProcess.length - 1) {
      const delay = RATE_LIMITS['yahoo']?.minDelayMs || 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  onProgress?.({
    current: stocksToProcess.length,
    total: stocksToProcess.length,
    ticker: '',
    status: 'completed',
  });

  console.log(`[ManualRangeFetch] Done. Processed ${stocksToProcess.length}, updated ${updated}`);
  return { processed: stocksToProcess.length, updated };
}

/**
 * Recalculate buy limits for ALL stocks that have range data.
 * Uses minimum of (year5Low, year3Low, week52Low) × 1.05.
 * Call this to fix existing stocks with wrong limits.
 */
export function recalculateAllBuyLimits(
  getTabs: () => Tab[],
  updateStock: (tabId: string, stockId: string, updates: Partial<Stock>) => void,
): number {
  const tabs = getTabs();
  let fixed = 0;

  for (const tab of tabs) {
    if (tab.name !== 'Kuifje' && tab.name !== 'Prof. Zonnebloem') continue;

    for (const stock of tab.stocks) {
      // Only recalculate if we have range data
      if (!stock.year5Low && !stock.year3Low && !stock.week52Low) continue;

      const newLimit = calculateBuyLimitFromRanges(
        stock.year5Low,
        stock.year3Low,
        stock.week52Low > 0 ? stock.week52Low : undefined,
      );

      if (newLimit != null && newLimit !== stock.buyLimit) {
        console.log(
          `[RecalcLimits] ${stock.ticker}: ${stock.buyLimit?.toFixed(2)} → ${newLimit.toFixed(2)} ` +
          `(5Y=${stock.year5Low?.toFixed(2)}, 3Y=${stock.year3Low?.toFixed(2)}, 52W=${stock.week52Low?.toFixed(2)})`
        );
        updateStock(tab.id, stock.id, { buyLimit: newLimit });
        fixed++;
      }
    }
  }

  console.log(`[RecalcLimits] Fixed ${fixed} buy limits`);
  return fixed;
}
