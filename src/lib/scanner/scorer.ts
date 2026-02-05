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
 * A growth event: price increases 200%+ from a local trough to a subsequent peak.
 * For example: stock drops to $1, then reaches $3 at some point = 200% growth event.
 *
 * The user wants: "het moet 2x 200% groeien vanaf een onbepaald punt" -
 * meaning 2+ times where the stock grew 200% from ANY low point.
 *
 * Scoring: triangular numbers (1 event = 1pt, 2 = 3pts, 3 = 6pts, n = n*(n+1)/2)
 */
export function analyzeGrowthEvents(
  history: OHLCData[],
  growthThreshold: number = 200,
  minConsecutiveDays: number = 5,
  lookbackYears: number = 3,
): GrowthEventAnalysis {
  if (history.length < 10) {
    return { events: [], score: 0, highestGrowthPct: 0, highestGrowthDate: null };
  }

  // Use ALL available history - don't restrict to lookback period
  // Yahoo gives us 5 years, use all of it for growth detection
  const events: GrowthEvent[] = [];
  let highestGrowthPct = 0;
  let highestGrowthDate: string | null = null;

  // Strategy: find trough-to-peak pairs where growth >= threshold
  // A trough is a local minimum, a peak is the highest point reached after that trough
  // before the price drops back significantly
  const troughs = findTroughs(history);

  for (const troughIdx of troughs) {
    const troughPrice = history[troughIdx].low;
    if (troughPrice <= 0) continue;

    const targetPrice = troughPrice * (1 + growthThreshold / 100);

    // Scan forward from trough to find peak
    let peakPrice = troughPrice;
    let peakDate = history[troughIdx].date;
    let peakIdx = troughIdx;
    let reachedTarget = false;
    let daysAboveTarget = 0;
    let maxDaysAboveTarget = 0;

    for (let j = troughIdx + 1; j < history.length; j++) {
      const price = history[j].high; // Use high for peak detection

      if (price > peakPrice) {
        peakPrice = price;
        peakDate = history[j].date;
        peakIdx = j;
      }

      // Check if close price is above target
      if (history[j].close >= targetPrice) {
        reachedTarget = true;
        daysAboveTarget++;
        maxDaysAboveTarget = Math.max(maxDaysAboveTarget, daysAboveTarget);
      } else {
        daysAboveTarget = 0;
      }

      // If price drops below 80% of trough, this growth cycle is over
      // (new trough territory - will be caught by a different trough)
      if (history[j].close < troughPrice * 0.8) {
        break;
      }
    }

    if (!reachedTarget) continue;

    const totalGrowthPct = ((peakPrice - troughPrice) / troughPrice) * 100;
    if (totalGrowthPct < growthThreshold) continue;

    // Accept if reached target - even 1 day above is valid for penny stocks
    // (The original 5-day requirement was too strict)
    const meetsConsecutive = maxDaysAboveTarget >= Math.min(minConsecutiveDays, 2);
    if (!meetsConsecutive && maxDaysAboveTarget < 1) continue;

    // Check for overlap with existing events (don't double-count)
    const eventStart = history[troughIdx].date;
    const eventEnd = history[Math.min(peakIdx + 5, history.length - 1)].date;
    const overlaps = events.some(
      (e) =>
        (eventStart >= e.start_date && eventStart <= e.end_date) ||
        (eventEnd >= e.start_date && eventEnd <= e.end_date) ||
        (eventStart <= e.start_date && eventEnd >= e.end_date),
    );

    if (!overlaps) {
      events.push({
        id: '',
        ticker: '',
        start_date: history[troughIdx].date,
        end_date: peakDate,
        start_price: troughPrice,
        peak_price: peakPrice,
        growth_pct: totalGrowthPct,
        consecutive_days_above: maxDaysAboveTarget,
        is_valid: maxDaysAboveTarget >= Math.min(minConsecutiveDays, 2),
        created_at: new Date().toISOString(),
      });

      if (totalGrowthPct > highestGrowthPct) {
        highestGrowthPct = totalGrowthPct;
        highestGrowthDate = peakDate;
      }
    }
  }

  const eventCount = events.length;
  const score = (eventCount * (eventCount + 1)) / 2;

  return { events, score, highestGrowthPct, highestGrowthDate };
}

/**
 * Find troughs (local minimums) in price data.
 * Uses the LOW price (not close) for better trough detection.
 * Includes: absolute minimum, start of data, and points lower than surrounding N days.
 */
function findTroughs(data: OHLCData[], window: number = 7): number[] {
  const troughs: Set<number> = new Set();

  // Always include index 0
  troughs.add(0);

  // Find the absolute minimum
  let absMinIdx = 0;
  let absMinPrice = Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i].low > 0 && data[i].low < absMinPrice) {
      absMinPrice = data[i].low;
      absMinIdx = i;
    }
  }
  troughs.add(absMinIdx);

  // Find local minimums with a sliding window
  for (let i = window; i < data.length - window; i++) {
    const currentPrice = data[i].low;
    if (currentPrice <= 0) continue;

    let isMinimum = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && data[j].low > 0 && data[j].low < currentPrice) {
        isMinimum = false;
        break;
      }
    }

    if (isMinimum) {
      troughs.add(i);
    }
  }

  // Also find significant drops (price drops 50%+ from a recent peak)
  let recentHigh = data[0].high;
  for (let i = 1; i < data.length; i++) {
    if (data[i].high > recentHigh) {
      recentHigh = data[i].high;
    }
    if (data[i].low > 0 && data[i].low < recentHigh * 0.5) {
      troughs.add(i);
      recentHigh = data[i].high; // Reset after significant drop
    }
  }

  return Array.from(troughs).sort((a, b) => a - b);
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
