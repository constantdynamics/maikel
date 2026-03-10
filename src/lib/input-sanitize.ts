/**
 * Input sanitization utilities for user-provided data.
 */

/**
 * Sanitize a ticker symbol: only allow alphanumeric, dots, hyphens, and colons.
 * Prevents injection attacks through ticker input.
 */
export function sanitizeTicker(ticker: string): string {
  return ticker.replace(/[^a-zA-Z0-9.\-:]/g, '').substring(0, 20);
}

/**
 * Validate a ticker symbol format.
 */
export function isValidTicker(ticker: string): boolean {
  return /^[A-Z0-9][A-Z0-9.\-:]{0,19}$/i.test(ticker);
}

/**
 * Sanitize an array of market IDs.
 */
export function sanitizeMarketIds(markets: unknown): string[] {
  if (!Array.isArray(markets)) return [];
  return markets
    .filter((m): m is string => typeof m === 'string')
    .map(m => m.replace(/[^a-z]/g, '').substring(0, 10));
}

/**
 * Safe number: returns null for NaN, Infinity, -Infinity.
 * Useful as a guard on all percentage calculations (#90).
 */
export function safeNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Safe percentage: clamps to reasonable range and guards against NaN/Infinity.
 */
export function safePercent(value: number | null | undefined, min: number = -999999, max: number = 999999): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
}
