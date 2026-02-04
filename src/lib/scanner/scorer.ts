import type { OHLCData, GrowthEvent } from '../types';

export interface GrowthEventAnalysis {
  events: GrowthEvent[];
  score: number;
  highestGrowthPct: number;
  highestGrowthDate: string | null;
}

/**
 * Analyze price history for 200%+ growth events.
 *
 * A growth event is defined as:
 * - Price increases 200%+ from a local low
 * - The growth must sustain above 200% for at least 5 consecutive trading days
 *
 * Scoring: exponential (triangular numbers)
 * - 1 event = 1 pt
 * - 2 events = 3 pts
 * - 3 events = 6 pts
 * - n events = n*(n+1)/2 pts
 */
export function analyzeGrowthEvents(
  history: OHLCData[],
  growthThreshold: number = 200,
  minConsecutiveDays: number = 5,
  lookbackYears: number = 3,
): GrowthEventAnalysis {
  if (history.length === 0) {
    return { events: [], score: 0, highestGrowthPct: 0, highestGrowthDate: null };
  }

  // Filter to lookback period
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - lookbackYears);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const recentHistory = history.filter((d) => d.date >= cutoffStr);
  if (recentHistory.length === 0) {
    return { events: [], score: 0, highestGrowthPct: 0, highestGrowthDate: null };
  }

  const events: GrowthEvent[] = [];
  let highestGrowthPct = 0;
  let highestGrowthDate: string | null = null;

  // Find all local minimums as potential growth start points
  const localMins = findLocalMinimums(recentHistory);

  for (const minIdx of localMins) {
    const startPrice = recentHistory[minIdx].close;
    if (startPrice <= 0) continue;

    // Look forward from this minimum for growth above threshold
    let peakPrice = startPrice;
    let peakDate = recentHistory[minIdx].date;
    let consecutiveAbove = 0;
    let maxConsecutive = 0;
    let eventEndDate = recentHistory[minIdx].date;
    let eventEndIdx = minIdx;

    for (let j = minIdx + 1; j < recentHistory.length; j++) {
      const currentPrice = recentHistory[j].close;
      const growthPct = ((currentPrice - startPrice) / startPrice) * 100;

      if (currentPrice > peakPrice) {
        peakPrice = currentPrice;
        peakDate = recentHistory[j].date;
      }

      if (growthPct >= growthThreshold) {
        consecutiveAbove++;
        if (consecutiveAbove > maxConsecutive) {
          maxConsecutive = consecutiveAbove;
          eventEndDate = recentHistory[j].date;
          eventEndIdx = j;
        }
      } else {
        // If we had a valid streak, record it
        if (maxConsecutive >= minConsecutiveDays) {
          break;
        }
        // If price drops significantly, this growth attempt is over
        if (growthPct < 50) {
          break;
        }
        consecutiveAbove = 0;
      }
    }

    const totalGrowthPct = ((peakPrice - startPrice) / startPrice) * 100;

    if (maxConsecutive >= minConsecutiveDays && totalGrowthPct >= growthThreshold) {
      // Check for overlapping events (don't double-count)
      const overlaps = events.some(
        (e) =>
          (recentHistory[minIdx].date >= e.start_date &&
            recentHistory[minIdx].date <= e.end_date) ||
          (eventEndDate >= e.start_date && eventEndDate <= e.end_date),
      );

      if (!overlaps) {
        const event: GrowthEvent = {
          id: '',
          ticker: '',
          start_date: recentHistory[minIdx].date,
          end_date: eventEndDate,
          start_price: startPrice,
          peak_price: peakPrice,
          growth_pct: totalGrowthPct,
          consecutive_days_above: maxConsecutive,
          is_valid: true,
          created_at: new Date().toISOString(),
        };
        events.push(event);

        if (totalGrowthPct > highestGrowthPct) {
          highestGrowthPct = totalGrowthPct;
          highestGrowthDate = peakDate;
        }
      }
    }
  }

  const eventCount = events.length;
  const score = (eventCount * (eventCount + 1)) / 2;

  return {
    events,
    score,
    highestGrowthPct,
    highestGrowthDate,
  };
}

/**
 * Find local minimum indices in price data.
 * A local minimum is a point where the close price is lower than
 * the surrounding n days.
 */
function findLocalMinimums(data: OHLCData[], window: number = 10): number[] {
  const minimums: number[] = [];

  for (let i = window; i < data.length - window; i++) {
    const currentPrice = data[i].close;
    let isMinimum = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && data[j].close < currentPrice) {
        isMinimum = false;
        break;
      }
    }

    if (isMinimum) {
      minimums.push(i);
    }
  }

  // Also always check the very first point
  if (data.length > 0) {
    minimums.unshift(0);
  }

  return minimums;
}

/**
 * Calculate the all-time high from price history
 */
export function calculateATH(history: OHLCData[]): { price: number; date: string } | null {
  if (history.length === 0) return null;

  let maxPrice = 0;
  let maxDate = '';

  for (const day of history) {
    if (day.high > maxPrice) {
      maxPrice = day.high;
      maxDate = day.date;
    }
  }

  return maxPrice > 0 ? { price: maxPrice, date: maxDate } : null;
}

/**
 * Calculate the 5-year low from price history
 */
export function calculateFiveYearLow(history: OHLCData[]): {
  price: number;
  date: string;
} | null {
  if (history.length === 0) return null;

  let minPrice = Infinity;
  let minDate = '';

  for (const day of history) {
    if (day.low > 0 && day.low < minPrice) {
      minPrice = day.low;
      minDate = day.date;
    }
  }

  return minPrice < Infinity ? { price: minPrice, date: minDate } : null;
}
