import type { OHLCData } from '../types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateStockData(data: {
  price: number | null;
  marketCap?: number | null;
  allTimeHigh?: number | null;
  athDeclinePct?: number | null;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Price must be positive
  if (data.price === null || data.price <= 0) {
    errors.push('Price must be positive');
  }

  // Market cap check
  if (data.marketCap !== undefined && data.marketCap !== null && data.marketCap <= 0) {
    errors.push('Market cap must be positive');
  }

  // ATH must be higher than current price
  if (
    data.allTimeHigh !== null &&
    data.allTimeHigh !== undefined &&
    data.price !== null &&
    data.allTimeHigh < data.price
  ) {
    warnings.push('ATH is lower than current price');
  }

  // ATH decline percentage should be between 0-100
  if (
    data.athDeclinePct !== undefined &&
    data.athDeclinePct !== null &&
    (data.athDeclinePct < 0 || data.athDeclinePct > 100)
  ) {
    errors.push('ATH decline percentage must be between 0-100');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validatePriceHistory(history: OHLCData[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (history.length === 0) {
    errors.push('No price history data');
    return { isValid: false, errors, warnings };
  }

  // Check for minimum data points (~250 trading days per year, want 3 years minimum)
  if (history.length < 500) {
    warnings.push(`Only ${history.length} data points (expected 750+ for 3 years)`);
  }

  // Check for extreme single-day moves
  for (let i = 1; i < history.length; i++) {
    const prevClose = history[i - 1].close;
    const currClose = history[i].close;
    if (prevClose > 0) {
      const dailyChange = ((currClose - prevClose) / prevClose) * 100;
      if (Math.abs(dailyChange) > 1000) {
        warnings.push(
          `Extreme move on ${history[i].date}: ${dailyChange.toFixed(0)}% (possible split/data error)`,
        );
      }
    }
  }

  // Check for negative prices
  const negativePrices = history.filter(
    (d) => d.close < 0 || d.open < 0 || d.high < 0 || d.low < 0,
  );
  if (negativePrices.length > 0) {
    errors.push(`${negativePrices.length} entries with negative prices`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function checkIsNYSEOrNASDAQ(exchange: string): boolean {
  const validExchanges = [
    'NYSE', 'NYQ', 'NMS', 'NASDAQ', 'NGM', 'NAS', 'NCM',
    'NYSE ARCA', 'PCX', 'NYSE American', 'ASE',
  ];
  return validExchanges.some(
    (ex) => exchange.toUpperCase().includes(ex),
  );
}

export function checkMinimumAge(ipoDate: string | null, minYears: number = 3): boolean {
  if (!ipoDate) return true; // If no IPO date, assume it's old enough
  const ipo = new Date(ipoDate);
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - minYears);
  return ipo <= minDate;
}

export function crossValidatePrice(
  yahooPrice: number | null,
  alphaPrice: number | null,
  tolerance: number = 0.05,
): {
  isConsistent: boolean;
  confidence: number;
  avgPrice: number | null;
} {
  const prices = [yahooPrice, alphaPrice].filter(
    (p): p is number => p !== null && p > 0,
  );

  if (prices.length === 0) {
    return { isConsistent: false, confidence: 0, avgPrice: null };
  }

  if (prices.length === 1) {
    return { isConsistent: true, confidence: 50, avgPrice: prices[0] };
  }

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const maxDeviation = Math.max(
    ...prices.map((p) => Math.abs(p - avg) / avg),
  );

  return {
    isConsistent: maxDeviation <= tolerance,
    confidence: maxDeviation <= tolerance ? 100 : 66,
    avgPrice: avg,
  };
}

export function detectStockSplit(
  history: OHLCData[],
): { date: string; ratio: number }[] {
  const splits: { date: string; ratio: number }[] = [];

  for (let i = 1; i < history.length; i++) {
    const prevClose = history[i - 1].close;
    const currOpen = history[i].open;

    if (prevClose > 0 && currOpen > 0) {
      const ratio = prevClose / currOpen;
      // Common split ratios: 2:1, 3:1, 4:1, 5:1, 10:1 or reverse
      if (ratio > 1.8 && ratio < 10.5) {
        const roundedRatio = Math.round(ratio);
        if (Math.abs(ratio - roundedRatio) < 0.15) {
          splits.push({ date: history[i].date, ratio: roundedRatio });
        }
      } else if (ratio < 0.55 && ratio > 0.08) {
        // Reverse split
        const reverseRatio = Math.round(1 / ratio);
        if (Math.abs(1 / ratio - reverseRatio) < 0.15) {
          splits.push({ date: history[i].date, ratio: -reverseRatio });
        }
      }
    }
  }

  return splits;
}
