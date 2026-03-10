/**
 * Data validation utilities for stock data integrity (#76, #77, #84, #85, #88, #92, #97, #98).
 */

/** Volume sanity check: warn on volume = 0 or > 10B (#76) */
export function validateVolume(volume: number | null | undefined): { valid: boolean; warning?: string } {
  if (volume == null) return { valid: true };
  if (volume === 0) return { valid: true, warning: 'Volume is 0 (market may be closed or stock halted)' };
  if (volume > 10_000_000_000) return { valid: true, warning: `Volume suspiciously high: ${volume.toLocaleString()}` };
  if (volume < 0) return { valid: false, warning: 'Negative volume detected' };
  return { valid: true };
}

/** Decimal precision validation: prevent DB overflow (#77) */
export function validateDecimalPrecision(
  value: number | null | undefined,
  maxIntDigits: number = 7,
  maxDecDigits: number = 2,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const maxValue = Math.pow(10, maxIntDigits) - Math.pow(10, -maxDecDigits);
  if (Math.abs(value) > maxValue) return null;
  return Number(value.toFixed(maxDecDigits));
}

/** Penny stock filter: warn when price < $0.01 (#84) */
export function isPennyStock(price: number | null | undefined, threshold: number = 0.01): boolean {
  if (price == null) return false;
  return price > 0 && price < threshold;
}

/** Stale data detection: flag stocks with >30 days old last price (#85) */
export function isStaleData(lastUpdated: string | null | undefined, maxAgeDays: number = 30): boolean {
  if (!lastUpdated) return true;
  const lastDate = new Date(lastUpdated);
  if (isNaN(lastDate.getTime())) return true;
  const ageDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > maxAgeDays;
}

/** ATH validation: ATH must be >= current price (#88) */
export function validateATH(
  allTimeHigh: number | null | undefined,
  currentPrice: number | null | undefined,
): { valid: boolean; repaired?: number; warning?: string } {
  if (allTimeHigh == null || currentPrice == null) return { valid: true };
  if (allTimeHigh >= currentPrice) return { valid: true };
  // ATH is less than current price - repair by using current price as ATH
  return {
    valid: false,
    repaired: currentPrice,
    warning: `ATH ($${allTimeHigh.toFixed(2)}) < current price ($${currentPrice.toFixed(2)}). Using current price as ATH.`,
  };
}

/** Extreme daily move warning: >50% change likely a data error (#92) */
export function isExtremeDailyMove(
  currentPrice: number,
  previousClose: number,
  threshold: number = 50,
): { isExtreme: boolean; changePct: number } {
  if (!previousClose || previousClose <= 0) return { isExtreme: false, changePct: 0 };
  const changePct = ((currentPrice - previousClose) / previousClose) * 100;
  return {
    isExtreme: Math.abs(changePct) > threshold,
    changePct,
  };
}

/**
 * Sector normalization: merge variations into canonical names (#97).
 * "Pharma" and "Pharmaceutical" → "Pharmaceuticals"
 */
const SECTOR_ALIASES: Record<string, string> = {
  'pharma': 'Pharmaceuticals',
  'pharmaceutical': 'Pharmaceuticals',
  'pharmaceuticals': 'Pharmaceuticals',
  'drug manufacturers': 'Drug Manufacturers',
  'drug manufacturers - general': 'Drug Manufacturers',
  'drug manufacturers - specialty & generic': 'Drug Manufacturers',
  'biotech': 'Biotechnology',
  'biotechnology': 'Biotechnology',
  'gold': 'Gold',
  'gold mining': 'Gold',
  'silver': 'Silver',
  'silver mining': 'Silver',
  'uranium': 'Uranium',
  'oil & gas': 'Oil & Gas',
  'oil and gas': 'Oil & Gas',
  'cannabis': 'Cannabis',
  'marijuana': 'Cannabis',
  'crypto': 'Cryptocurrency',
  'cryptocurrency': 'Cryptocurrency',
  'shipping': 'Shipping',
  'marine shipping': 'Shipping',
  'hydrogen': 'Hydrogen',
  'fuel cells': 'Hydrogen',
};

export function normalizeSector(sector: string | null | undefined): string | null {
  if (!sector) return null;
  const lower = sector.toLowerCase().trim();
  return SECTOR_ALIASES[lower] || sector;
}

/**
 * Exchange name normalization: standardize exchange names (#98).
 * "NASDAQ" vs "NMS" vs "XNAS" → "NASDAQ"
 */
const EXCHANGE_ALIASES: Record<string, string> = {
  'nms': 'NASDAQ',
  'ngm': 'NASDAQ',
  'ncm': 'NASDAQ',
  'xnas': 'NASDAQ',
  'nasdaq': 'NASDAQ',
  'nyse': 'NYSE',
  'xnys': 'NYSE',
  'amex': 'AMEX',
  'xase': 'AMEX',
  'nyse mkt': 'AMEX',
  'nyse arca': 'NYSE ARCA',
  'arca': 'NYSE ARCA',
  'tsx': 'TSX',
  'xtse': 'TSX',
  'tsxv': 'TSXV',
  'lse': 'LSE',
  'xlon': 'LSE',
  'xetr': 'XETR',
  'fwb': 'FWB',
  'hkex': 'HKEX',
  'xhkg': 'HKEX',
  'krx': 'KRX',
  'xkrx': 'KRX',
  'kosdaq': 'KOSDAQ',
  'xkos': 'KOSDAQ',
  'jse': 'JSE',
  'xjse': 'JSE',
  'asx': 'ASX',
  'xasx': 'ASX',
};

export function normalizeExchange(exchange: string | null | undefined): string | null {
  if (!exchange) return null;
  const lower = exchange.toLowerCase().trim();
  return EXCHANGE_ALIASES[lower] || exchange;
}
