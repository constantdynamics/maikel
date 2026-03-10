/**
 * Simple in-memory TTL cache for API responses (#51, #70).
 * Prevents duplicate fetches within the cache window.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }

    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/**
 * Cache for TradingView candidates (#51).
 * Prevents duplicate TradingView fetches within 10 minutes.
 */
export const tradingViewCache = new TTLCache<unknown[]>(50);
export const TV_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Cache wrapper: fetch from cache or execute function and cache result.
 */
export async function cachedFetch<T>(
  cache: TTLCache<T>,
  key: string,
  ttlMs: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached !== null) {
    return cached;
  }

  const result = await fetchFn();
  cache.set(key, result, ttlMs);
  return result;
}

/**
 * Track recently scanned tickers to skip within a time window (#70).
 */
const recentlyScannedTickers = new TTLCache<boolean>(5000);

export function markTickerScanned(ticker: string, ttlMs: number = 24 * 60 * 60 * 1000): void {
  recentlyScannedTickers.set(ticker, true, ttlMs);
}

export function wasTickerRecentlyScanned(ticker: string): boolean {
  return recentlyScannedTickers.has(ticker);
}
