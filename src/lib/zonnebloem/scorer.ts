/**
 * Professor Zonnebloem - Spike Detection & Scoring
 *
 * Detects explosive upward spikes from a stable base price.
 * Unlike Kuifje which looks for growth from crash lows, Zonnebloem
 * looks for temporary explosive spikes above a stable median price.
 *
 * Algorithm:
 * 1. Calculate the rolling median base price (60-day window)
 * 2. Identify periods where price exceeds base by threshold (e.g. 75%)
 * 3. Validate each spike lasts at least N days (default 4)
 * 4. Check that the base price itself is stable (not declining)
 */

import type { OHLCData } from '../types';

export interface SpikeEvent {
  start_date: string;
  peak_date: string;
  end_date: string;
  base_price: number;
  peak_price: number;
  spike_pct: number;
  duration_days: number;
  is_valid: boolean;
}

export interface SpikeAnalysis {
  events: SpikeEvent[];
  spikeScore: number;
  highestSpikePct: number;
  highestSpikeDate: string | null;
  basePriceMedian: number;
  priceChange12m: number | null;
  baseDeclinePct: number | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate rolling median over a window, excluding spike periods.
 * This gives us the "base price" without being skewed by spikes.
 */
function calculateBasePrice(
  history: OHLCData[],
  windowDays: number = 60,
  spikeThresholdMultiple: number = 2.0,
): number[] {
  const basePrices: number[] = [];

  for (let i = 0; i < history.length; i++) {
    const start = Math.max(0, i - windowDays);
    const windowPrices = history.slice(start, i + 1).map((d) => d.close);

    // First pass: get rough median
    const roughMedian = median(windowPrices);

    // Second pass: exclude prices that are clearly spikes (> 2x median)
    const nonSpikePrices = windowPrices.filter(
      (p) => p <= roughMedian * spikeThresholdMultiple,
    );

    basePrices.push(
      nonSpikePrices.length > 0 ? median(nonSpikePrices) : roughMedian,
    );
  }

  return basePrices;
}

/**
 * Analyze price history for explosive spike events from a stable base.
 */
export function analyzeSpikeEvents(
  history: OHLCData[],
  spikeThresholdPct: number = 75,
  minDurationDays: number = 4,
  lookbackMonths: number = 24,
): SpikeAnalysis {
  const empty: SpikeAnalysis = {
    events: [],
    spikeScore: 0,
    highestSpikePct: 0,
    highestSpikeDate: null,
    basePriceMedian: 0,
    priceChange12m: null,
    baseDeclinePct: null,
  };

  if (history.length < 60) return empty;

  // Filter to lookback period
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  const recentHistory = history.filter((d) => d.date >= cutoffStr);

  if (recentHistory.length < 30) return empty;

  // Calculate base prices (rolling median excluding spikes)
  const basePrices = calculateBasePrice(recentHistory, 60);

  // Overall median base price (for reference)
  const overallBaseMedian = median(basePrices);

  // Detect spike events
  const events: SpikeEvent[] = [];
  // Use a lower entry threshold (50% of spike threshold) to catch more spikes
  const entryThresholdPct = spikeThresholdPct * 0.5;
  let i = 0;

  while (i < recentHistory.length) {
    const basePrice = basePrices[i];
    if (basePrice <= 0) {
      i++;
      continue;
    }

    const currentPrice = recentHistory[i].close;
    const spikePct = ((currentPrice - basePrice) / basePrice) * 100;

    if (spikePct >= entryThresholdPct) {
      // Found start of potential spike zone - track it
      const spikeStart = i;
      // Use the base price from just before the spike starts
      const spikeBasePrice = basePrices[Math.max(0, spikeStart - 1)];
      let peakPrice = currentPrice;
      let peakDate = recentHistory[i].date;
      let daysInSpikeZone = 1;
      let peakSpikePct = spikePct;

      // Track the spike forward
      let j = i + 1;
      while (j < recentHistory.length) {
        const price = recentHistory[j].close;
        const pct = ((price - spikeBasePrice) / spikeBasePrice) * 100;

        if (price > peakPrice) {
          peakPrice = price;
          peakDate = recentHistory[j].date;
          peakSpikePct = pct;
        }

        if (pct >= entryThresholdPct * 0.5) {
          // Still in extended spike zone (>= 25% of original threshold)
          daysInSpikeZone++;
          j++;
        } else {
          break; // Spike is over
        }
      }

      const spikeEndIdx = j - 1;
      const actualSpikePct = ((peakPrice - spikeBasePrice) / spikeBasePrice) * 100;

      // FIXED: count ALL days in the spike zone, not just days above the full threshold
      if (daysInSpikeZone >= minDurationDays && actualSpikePct >= spikeThresholdPct) {
        // Check this doesn't overlap with a previous event
        const overlaps = events.some(
          (e) =>
            recentHistory[spikeStart].date <= e.end_date &&
            recentHistory[spikeEndIdx].date >= e.start_date,
        );

        if (!overlaps) {
          events.push({
            start_date: recentHistory[spikeStart].date,
            peak_date: peakDate,
            end_date: recentHistory[spikeEndIdx].date,
            base_price: spikeBasePrice,
            peak_price: peakPrice,
            spike_pct: actualSpikePct,
            duration_days: daysInSpikeZone,
            is_valid: true,
          });
        }
      }

      i = spikeEndIdx + 1;
    } else {
      i++;
    }
  }

  // Calculate spike score
  let spikeScore = 0;
  for (const event of events) {
    const pctFactor = event.spike_pct / 100;
    const durationFactor = event.duration_days / minDurationDays;
    spikeScore += pctFactor * durationFactor;
  }

  // Find highest spike
  let highestSpikePct = 0;
  let highestSpikeDate: string | null = null;
  for (const event of events) {
    if (event.spike_pct > highestSpikePct) {
      highestSpikePct = event.spike_pct;
      highestSpikeDate = event.peak_date;
    }
  }

  // Calculate 12-month price change (spike-aware)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const twelveMonthStr = twelveMonthsAgo.toISOString().split('T')[0];

  let price12mAgo: number | null = null;
  for (const day of recentHistory) {
    if (day.date >= twelveMonthStr) {
      price12mAgo = day.close;
      break;
    }
  }

  let priceChange12m: number | null = null;
  if (price12mAgo !== null && price12mAgo > 0) {
    const currentPrice = recentHistory[recentHistory.length - 1].close;

    // Check if 12m ago was during a spike - use base price instead
    const was12mInSpike = events.some(
      (e) => twelveMonthStr >= e.start_date && twelveMonthStr <= e.end_date,
    );

    if (was12mInSpike) {
      const preSpikeCutoff = new Date(twelveMonthsAgo);
      preSpikeCutoff.setMonth(preSpikeCutoff.getMonth() - 1);
      const preSpikeStr = preSpikeCutoff.toISOString().split('T')[0];

      const preSpikeData = recentHistory.filter(
        (d) => d.date >= preSpikeStr && d.date < twelveMonthStr,
      );
      if (preSpikeData.length > 0) {
        const preSpikeMedian = median(preSpikeData.map((d) => d.close));
        priceChange12m = ((currentPrice - preSpikeMedian) / preSpikeMedian) * 100;
      }
    } else {
      priceChange12m = ((currentPrice - price12mAgo) / price12mAgo) * 100;
    }
  }

  // Calculate base price decline over lookback period
  const quarterLength = Math.floor(basePrices.length / 4);
  let baseDeclinePct: number | null = null;
  if (quarterLength > 5) {
    const firstQuarterBase = median(basePrices.slice(0, quarterLength));
    const lastQuarterBase = median(basePrices.slice(-quarterLength));
    if (firstQuarterBase > 0) {
      baseDeclinePct = ((lastQuarterBase - firstQuarterBase) / firstQuarterBase) * 100;
    }
  }

  // Stability bonus
  if (baseDeclinePct !== null && baseDeclinePct > 0) {
    spikeScore *= 1.2;
  }

  return {
    events,
    spikeScore: Math.round(spikeScore * 100) / 100,
    highestSpikePct,
    highestSpikeDate,
    basePriceMedian: overallBaseMedian,
    priceChange12m,
    baseDeclinePct,
  };
}

/**
 * Score color for Zonnebloem stocks
 */
export function getZBScoreColor(score: number): 'green' | 'orange' | 'red' {
  if (score >= 5) return 'green';
  if (score >= 2) return 'orange';
  return 'red';
}
