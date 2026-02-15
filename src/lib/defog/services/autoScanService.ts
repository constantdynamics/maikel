// Auto-scan service with smart priority scoring
// This service handles automatic scanning during market hours with intelligent prioritization

import type { Stock, Tab, ScanPriorityWeights } from '../types';
import { isMarketOpen } from './stockApi';

export const DEFAULT_SCAN_WEIGHTS: ScanPriorityWeights = {
  lastScanTime: 60,
  distanceToLimit: 50,
  volatility: 30,
  rainbowBlocks: 40,
  skipErrorStocks: true,
};

export interface ScanPriority {
  stock: Stock;
  tabId: string;
  score: number;
  reasons: string[];
}

// Check if current time is within scan hours for a given market type
// EU market hours: 9:00 - 18:30 CET
// US market hours: 15:30 - 22:00 CET
export function isWithinScanHours(exchange: string): boolean {
  // Get current time in CET (Central European Time)
  const now = new Date();
  const cetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });

  const parts = cetFormatter.formatToParts(now);
  const hourPart = parts.find(p => p.type === 'hour');
  const minutePart = parts.find(p => p.type === 'minute');
  const dayPart = parts.find(p => p.type === 'weekday');

  const hour = parseInt(hourPart?.value || '0');
  const minute = parseInt(minutePart?.value || '0');
  const dayOfWeek = dayPart?.value || '';

  // Weekend check
  if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') {
    return false;
  }

  const currentTimeMinutes = hour * 60 + minute;

  // Determine if this is a US or EU stock
  const exchangeUpper = exchange.toUpperCase();
  const isUSStock = ['NYSE', 'NASDAQ', 'AMEX', 'US', 'NYSEARCA', 'BATS', 'NMS', 'NGM'].some(
    ex => exchangeUpper.includes(ex)
  ) || !exchange; // Default to US if no exchange specified

  if (isUSStock) {
    // US hours: 15:30 - 22:00 CET
    const usOpen = 15 * 60 + 30;  // 15:30
    const usClose = 22 * 60;      // 22:00
    return currentTimeMinutes >= usOpen && currentTimeMinutes <= usClose;
  } else {
    // EU hours: 9:00 - 18:30 CET
    const euOpen = 9 * 60;        // 9:00
    const euClose = 18 * 60 + 30; // 18:30
    return currentTimeMinutes >= euOpen && currentTimeMinutes <= euClose;
  }
}

// Calculate priority score for a stock
// Lower score = higher priority (will be scanned first)
export function calculateScanPriority(stock: Stock, weights?: ScanPriorityWeights): { score: number; reasons: string[] } {
  const w = weights || DEFAULT_SCAN_WEIGHTS;
  let score = 100; // Base score
  const reasons: string[] = [];

  // Weight multiplier: convert 0-100 slider to 0-1 factor
  const lastScanFactor = w.lastScanTime / 100;
  const distanceFactor = w.distanceToLimit / 100;
  const volatilityFactor = w.volatility / 100;
  const rainbowFactor = w.rainbowBlocks / 100;

  // 1. Last scan time - priority for stocks not scanned recently
  if (stock.lastUpdated) {
    const lastScan = new Date(stock.lastUpdated).getTime();
    const now = Date.now();
    const minutesSinceLastScan = (now - lastScan) / (1000 * 60);

    if (minutesSinceLastScan > 60) {
      score -= Math.round(40 * lastScanFactor);
      reasons.push(`Last scan: ${Math.floor(minutesSinceLastScan / 60)}h ago`);
    } else if (minutesSinceLastScan > 30) {
      score -= Math.round(25 * lastScanFactor);
      reasons.push(`Last scan: ${Math.floor(minutesSinceLastScan)}m ago`);
    } else if (minutesSinceLastScan > 15) {
      score -= Math.round(10 * lastScanFactor);
      reasons.push(`Last scan: ${Math.floor(minutesSinceLastScan)}m ago`);
    } else {
      score += Math.round(20 * lastScanFactor); // Lower priority if recently scanned
    }
  } else {
    score -= Math.round(50 * lastScanFactor); // Never scanned - highest priority
    reasons.push('Never scanned');
  }

  // Skip stocks that gave errors in previous scan (lower their priority)
  if (w.skipErrorStocks && stock.lastScanError) {
    score += 30; // Push errored stocks to the back
    reasons.push('Previous scan error');
  }

  // 2. Distance to buy limit - closer to limit = higher priority
  // Only for stocks that have a limit set (limit > 0)
  if (stock.buyLimit && stock.buyLimit > 0 && stock.currentPrice > 0) {
    const distancePercent = ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100;

    if (distancePercent <= 0) {
      score -= Math.round(35 * distanceFactor);
      reasons.push('Buy signal!');
    } else if (distancePercent <= 5) {
      score -= Math.round(30 * distanceFactor);
      reasons.push(`Very close: ${distancePercent.toFixed(1)}% to limit`);
    } else if (distancePercent <= 10) {
      score -= Math.round(25 * distanceFactor);
      reasons.push(`Close: ${distancePercent.toFixed(1)}% to limit`);
    } else if (distancePercent <= 15) {
      score -= Math.round(20 * distanceFactor);
      reasons.push(`Near: ${distancePercent.toFixed(1)}% to limit`);
    } else if (distancePercent <= 25) {
      score -= Math.round(10 * distanceFactor);
    }
  } else if (!stock.buyLimit || stock.buyLimit === 0) {
    // Stock without a limit: do NOT fill rainbow blocks, deprioritize
    score += Math.round(20 * rainbowFactor);
  }

  // 3. Rainbow blocks factor: stocks with more filled rainbow blocks = higher priority
  // This correlates with how close they are to the buy limit
  if (stock.buyLimit && stock.buyLimit > 0 && stock.currentPrice > 0) {
    const distancePercent = ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100;
    // Rainbow has 12 blocks; more filled = closer to limit
    const filledBlocks = distancePercent <= 1 ? 12 : distancePercent <= 2 ? 11 : distancePercent <= 4 ? 10 :
      distancePercent <= 8 ? 9 : distancePercent <= 16 ? 8 : distancePercent <= 32 ? 7 :
      distancePercent <= 64 ? 6 : distancePercent <= 128 ? 5 : distancePercent <= 256 ? 4 :
      distancePercent <= 512 ? 3 : distancePercent <= 1024 ? 2 : distancePercent <= 2048 ? 1 : 0;

    if (filledBlocks >= 9) {
      score -= Math.round(25 * rainbowFactor);
    } else if (filledBlocks >= 6) {
      score -= Math.round(15 * rainbowFactor);
    } else if (filledBlocks >= 3) {
      score -= Math.round(5 * rainbowFactor);
    }
  }

  // 4. Volatility - higher volatility = higher priority
  if (Math.abs(stock.dayChangePercent) > 5) {
    score -= Math.round(20 * volatilityFactor);
    reasons.push(`High volatility: ${stock.dayChangePercent.toFixed(1)}%`);
  } else if (Math.abs(stock.dayChangePercent) > 3) {
    score -= Math.round(10 * volatilityFactor);
    reasons.push(`Volatile: ${stock.dayChangePercent.toFixed(1)}%`);
  } else if (Math.abs(stock.dayChangePercent) > 1.5) {
    score -= Math.round(5 * volatilityFactor);
  }

  // 5. Stock has no price data - critical priority (always high)
  if (!stock.currentPrice || stock.currentPrice === 0) {
    score -= 60;
    reasons.push('No price data');
  }

  // 6. No historical data - needs refresh
  if (!stock.historicalData || stock.historicalData.length === 0) {
    score -= 15;
    reasons.push('No chart data');
  }

  return { score, reasons };
}

// Build prioritized queue of stocks to scan
export function buildPrioritizedScanQueue(
  tabs: Tab[],
  options?: {
    onlyOpenMarkets?: boolean;
    maxStocks?: number;
    weights?: ScanPriorityWeights;
  }
): ScanPriority[] {
  const queue: ScanPriority[] = [];

  for (const tab of tabs) {
    for (const stock of tab.stocks) {
      // Skip if we only want open markets and this market is closed
      if (options?.onlyOpenMarkets) {
        const marketStatus = isMarketOpen(stock.exchange || '');
        if (!marketStatus.isOpen) {
          continue;
        }
      }

      // Check if within scan hours for this stock's exchange
      if (!isWithinScanHours(stock.exchange || '')) {
        continue;
      }

      const priority = calculateScanPriority(stock, options?.weights);
      queue.push({
        stock,
        tabId: tab.id,
        score: priority.score,
        reasons: priority.reasons,
      });
    }
  }

  // Sort by score (lower = higher priority)
  queue.sort((a, b) => a.score - b.score);

  // Limit to max stocks if specified
  if (options?.maxStocks && queue.length > options.maxStocks) {
    return queue.slice(0, options.maxStocks);
  }

  return queue;
}

// Get statistics about scan queue
export function getScanQueueStats(queue: ScanPriority[]): {
  totalStocks: number;
  buySignals: number;
  closeToLimit: number;
  highVolatility: number;
  neverScanned: number;
  oldestScanMinutes: number | null;
} {
  let buySignals = 0;
  let closeToLimit = 0;
  let highVolatility = 0;
  let neverScanned = 0;
  let oldestScanMinutes: number | null = null;

  for (const item of queue) {
    const { stock } = item;

    // Buy signals
    if (stock.buyLimit && stock.currentPrice <= stock.buyLimit) {
      buySignals++;
    }

    // Close to limit (<15%)
    if (stock.buyLimit && stock.currentPrice > 0) {
      const distance = ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100;
      if (distance > 0 && distance < 15) {
        closeToLimit++;
      }
    }

    // High volatility
    if (Math.abs(stock.dayChangePercent) > 3) {
      highVolatility++;
    }

    // Never scanned
    if (!stock.lastUpdated) {
      neverScanned++;
    } else {
      const minutesSinceLastScan = (Date.now() - new Date(stock.lastUpdated).getTime()) / (1000 * 60);
      if (oldestScanMinutes === null || minutesSinceLastScan > oldestScanMinutes) {
        oldestScanMinutes = minutesSinceLastScan;
      }
    }
  }

  return {
    totalStocks: queue.length,
    buySignals,
    closeToLimit,
    highVolatility,
    neverScanned,
    oldestScanMinutes,
  };
}

// Format scan reason for display
export function formatScanReason(reasons: string[]): string {
  if (reasons.length === 0) return 'Regular scan';
  return reasons.join(', ');
}
