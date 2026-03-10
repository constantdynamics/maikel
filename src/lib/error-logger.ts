/**
 * Structured error logging utilities (#31, #32, #35, #39, #45, #48).
 *
 * Provides JSON-formatted logging with severity, source, error categorization,
 * deduplication, and error rate tracking.
 */

export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'critical';
export type ErrorCategory = 'network' | 'timeout' | 'validation' | 'database' | 'external_api' | 'internal' | 'unknown';

export interface StructuredError {
  timestamp: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  source: string;
  message: string;
  ticker?: string;
  phase?: string;
  api?: string;
  details?: Record<string, unknown>;
}

// Error deduplication: track recent errors to avoid logging the same error 50x (#39)
const recentErrors = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
const DEDUP_WINDOW_MS = 60_000; // 1 minute dedup window
const MAX_DEDUP_ENTRIES = 500;

// Error rate tracking per source (#35)
const errorRates = new Map<string, { errors: number; total: number; windowStart: number }>();
const ERROR_RATE_WINDOW_MS = 5 * 60_000; // 5 minute window

/**
 * Categorize an error based on its message (#32).
 */
export function categorizeError(error: Error | string): ErrorCategory {
  const msg = typeof error === 'string' ? error : error.message;
  const lower = msg.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return 'timeout';
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('econnrefused') ||
      lower.includes('enotfound') || lower.includes('socket')) {
    return 'network';
  }
  if (lower.includes('supabase') || lower.includes('database') || lower.includes('upsert') ||
      lower.includes('insert') || lower.includes('column') || lower.includes('relation')) {
    return 'database';
  }
  if (lower.includes('yahoo') || lower.includes('tradingview') || lower.includes('alpha vantage') ||
      lower.includes('circuit breaker')) {
    return 'external_api';
  }
  if (lower.includes('validation') || lower.includes('invalid') || lower.includes('nan') ||
      lower.includes('infinity')) {
    return 'validation';
  }
  return 'unknown';
}

/**
 * Log a structured error with deduplication (#31, #39).
 */
export function logStructuredError(error: StructuredError): void {
  // Deduplication: group identical errors (#39)
  const dedupKey = `${error.source}:${error.category}:${error.message.substring(0, 100)}`;
  const now = Date.now();

  const existing = recentErrors.get(dedupKey);
  if (existing && (now - existing.lastSeen) < DEDUP_WINDOW_MS) {
    existing.count++;
    existing.lastSeen = now;
    // Only log every 10th occurrence or if it's been >30s since last log
    if (existing.count % 10 !== 0 && (now - existing.lastSeen) < 30_000) {
      return;
    }
    error.details = { ...error.details, occurrences: existing.count };
  } else {
    // Clean up old entries if map is getting too large
    if (recentErrors.size > MAX_DEDUP_ENTRIES) {
      const cutoff = now - DEDUP_WINDOW_MS;
      for (const [key, entry] of recentErrors) {
        if (entry.lastSeen < cutoff) recentErrors.delete(key);
      }
    }
    recentErrors.set(dedupKey, { count: 1, firstSeen: now, lastSeen: now });
  }

  // Log as structured JSON
  const logFn = error.severity === 'critical' ? console.error
    : error.severity === 'warning' ? console.warn
    : console.log;

  logFn(JSON.stringify(error));
}

/**
 * Track error rate for a source (#35).
 * Call with isError=true for errors, isError=false for successes.
 * Returns true if error rate exceeds threshold (scan should be marked 'degraded').
 */
export function trackErrorRate(source: string, isError: boolean, threshold: number = 0.2): boolean {
  const now = Date.now();
  let entry = errorRates.get(source);

  if (!entry || (now - entry.windowStart) > ERROR_RATE_WINDOW_MS) {
    entry = { errors: 0, total: 0, windowStart: now };
    errorRates.set(source, entry);
  }

  entry.total++;
  if (isError) entry.errors++;

  // Need at least 10 data points before judging
  if (entry.total < 10) return false;

  return (entry.errors / entry.total) > threshold;
}

/**
 * Get current error rate for a source.
 */
export function getErrorRate(source: string): { errors: number; total: number; rate: number } | null {
  const entry = errorRates.get(source);
  if (!entry || entry.total === 0) return null;
  return {
    errors: entry.errors,
    total: entry.total,
    rate: entry.errors / entry.total,
  };
}

/**
 * Build a structured error from an exception (#31, #45).
 */
export function buildError(
  source: string,
  error: Error | string,
  context?: { ticker?: string; phase?: string; api?: string; severity?: ErrorSeverity },
): StructuredError {
  const message = typeof error === 'string' ? error : error.message;
  return {
    timestamp: new Date().toISOString(),
    severity: context?.severity || 'warning',
    category: categorizeError(error),
    source,
    message,
    ticker: context?.ticker,
    phase: context?.phase,
    api: context?.api,
  };
}

/**
 * Create structured API error response (#36).
 */
export function apiErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): { error: { code: string; message: string; details?: Record<string, unknown> } } {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

/**
 * Register global unhandled rejection handler (#48).
 * Call once at app startup.
 */
let unhandledRejectionHandlerRegistered = false;
export function registerUnhandledRejectionHandler(): void {
  if (unhandledRejectionHandlerRegistered) return;
  unhandledRejectionHandlerRegistered = true;

  if (typeof process !== 'undefined') {
    process.on('unhandledRejection', (reason) => {
      logStructuredError({
        timestamp: new Date().toISOString(),
        severity: 'critical',
        category: 'internal',
        source: 'unhandledRejection',
        message: reason instanceof Error ? reason.message : String(reason),
        details: reason instanceof Error ? { stack: reason.stack } : undefined,
      });
    });
  }
}
