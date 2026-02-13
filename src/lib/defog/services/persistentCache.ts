// Persistent cache service using localStorage
// This cache survives page refreshes!

const CACHE_PREFIX = 'defog-cache-';
const CACHE_INDEX_KEY = 'defog-cache-index';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  type: 'quote' | 'historical' | 'search';
}

interface CacheIndex {
  keys: string[];
  lastCleanup: number;
}

// Cache durations in milliseconds
export const CACHE_DURATIONS = {
  quote: 30 * 60 * 1000,        // 30 minutes for quotes during market hours
  historical: 24 * 60 * 60 * 1000, // 24 hours for historical data (changes only once per day!)
  search: 7 * 24 * 60 * 60 * 1000, // 7 days for search results
};

// Extended cache for closed markets
export const CLOSED_MARKET_CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours

// Maximum cache entries to prevent localStorage from getting too big
const MAX_CACHE_ENTRIES = 500;

// Get cache index
function getCacheIndex(): CacheIndex {
  try {
    const index = localStorage.getItem(CACHE_INDEX_KEY);
    if (index) {
      return JSON.parse(index);
    }
  } catch {
    // Ignore errors
  }
  return { keys: [], lastCleanup: Date.now() };
}

// Save cache index
function saveCacheIndex(index: CacheIndex): void {
  try {
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {
    // localStorage full - clear old entries
    cleanupOldEntries(true);
  }
}

// Clean up old cache entries
function cleanupOldEntries(force: boolean = false): void {
  const index = getCacheIndex();
  const now = Date.now();

  // Only cleanup every 10 minutes unless forced
  if (!force && now - index.lastCleanup < 10 * 60 * 1000) {
    return;
  }

  const keysToRemove: string[] = [];
  const keysToKeep: string[] = [];

  for (const key of index.keys) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) {
        keysToRemove.push(key);
        continue;
      }

      const entry = JSON.parse(raw) as CacheEntry<unknown>;
      const duration = CACHE_DURATIONS[entry.type] || CACHE_DURATIONS.quote;
      const maxDuration = duration * 2; // Keep for 2x duration before removing

      if (now - entry.timestamp > maxDuration) {
        keysToRemove.push(key);
        localStorage.removeItem(CACHE_PREFIX + key);
      } else {
        keysToKeep.push(key);
      }
    } catch {
      keysToRemove.push(key);
    }
  }

  // If still too many entries, remove oldest
  if (keysToKeep.length > MAX_CACHE_ENTRIES) {
    const sorted = keysToKeep
      .map(key => {
        try {
          const raw = localStorage.getItem(CACHE_PREFIX + key);
          if (!raw) return { key, timestamp: 0 };
          const entry = JSON.parse(raw) as CacheEntry<unknown>;
          return { key, timestamp: entry.timestamp };
        } catch {
          return { key, timestamp: 0 };
        }
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Newest first

    // Keep only the newest MAX_CACHE_ENTRIES
    const toKeep = new Set(sorted.slice(0, MAX_CACHE_ENTRIES).map(s => s.key));

    for (const { key } of sorted) {
      if (!toKeep.has(key)) {
        localStorage.removeItem(CACHE_PREFIX + key);
      }
    }

    keysToKeep.length = 0;
    keysToKeep.push(...Array.from(toKeep));
  }

  saveCacheIndex({ keys: keysToKeep, lastCleanup: now });
}

// Get from cache
export function getFromCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

// Get from cache if still valid
export function getCachedIfValid<T>(
  key: string,
  type: 'quote' | 'historical' | 'search',
  marketOpen: boolean = true
): T | null {
  const entry = getFromCache<T>(key);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  const baseDuration = CACHE_DURATIONS[type];

  // Use extended duration if market is closed
  const duration = marketOpen ? baseDuration : Math.max(baseDuration, CLOSED_MARKET_CACHE_DURATION);

  if (age < duration) {
    return entry.data;
  }

  return null;
}

// Save to cache
export function saveToCache<T>(key: string, data: T, type: 'quote' | 'historical' | 'search'): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    type,
  };

  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));

    // Update index
    const index = getCacheIndex();
    if (!index.keys.includes(key)) {
      index.keys.push(key);
      saveCacheIndex(index);
    }

    // Periodic cleanup
    cleanupOldEntries();
  } catch {
    // localStorage full - force cleanup and try again
    cleanupOldEntries(true);
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Still failing, give up
      console.warn('Cache storage full, unable to cache', key);
    }
  }
}

// Check cache status
export function getCacheStatus(key: string, type: 'quote' | 'historical' | 'search', marketOpen: boolean = true): {
  cached: boolean;
  stale: boolean;
  timestamp: number | null;
  ageMinutes: number | null;
} {
  const entry = getFromCache<unknown>(key);

  if (!entry) {
    return { cached: false, stale: true, timestamp: null, ageMinutes: null };
  }

  const age = Date.now() - entry.timestamp;
  const baseDuration = CACHE_DURATIONS[type];
  const duration = marketOpen ? baseDuration : Math.max(baseDuration, CLOSED_MARKET_CACHE_DURATION);

  return {
    cached: true,
    stale: age >= duration,
    timestamp: entry.timestamp,
    ageMinutes: Math.floor(age / 60000),
  };
}

// Remove from cache
export function removeFromCache(key: string): void {
  localStorage.removeItem(CACHE_PREFIX + key);

  const index = getCacheIndex();
  index.keys = index.keys.filter(k => k !== key);
  saveCacheIndex(index);
}

// Clear all cache
export function clearAllCache(): void {
  const index = getCacheIndex();
  for (const key of index.keys) {
    localStorage.removeItem(CACHE_PREFIX + key);
  }
  localStorage.removeItem(CACHE_INDEX_KEY);
}

// Clear all cache entries for a specific symbol (any provider, any suffix)
export function clearCacheForSymbol(symbol: string): void {
  const index = getCacheIndex();
  const keysToRemove: string[] = [];
  const symbolUpper = symbol.toUpperCase();

  for (const key of index.keys) {
    // Match any key containing the symbol (e.g., td-quote-WHA, yf-quote-WHA.AS, etc.)
    const keyUpper = key.toUpperCase();
    if (keyUpper.includes(symbolUpper) ||
        keyUpper.includes(symbolUpper.replace('.', '')) ||  // Also match without dot
        key.includes(`-${symbol}`) ||
        key.includes(`-${symbol}.`)) {
      keysToRemove.push(key);
      localStorage.removeItem(CACHE_PREFIX + key);
    }
  }

  if (keysToRemove.length > 0) {
    const newKeys = index.keys.filter(k => !keysToRemove.includes(k));
    saveCacheIndex({ ...index, keys: newKeys });
    console.log(`[Cache] Cleared ${keysToRemove.length} cache entries for symbol ${symbol}`);
  }
}

// Get cache stats
export function getCacheStats(): { count: number; oldestAge: number | null; newestAge: number | null } {
  const index = getCacheIndex();
  const now = Date.now();
  let oldest = now;
  let newest = 0;

  for (const key of index.keys) {
    const entry = getFromCache<unknown>(key);
    if (entry) {
      if (entry.timestamp < oldest) oldest = entry.timestamp;
      if (entry.timestamp > newest) newest = entry.timestamp;
    }
  }

  return {
    count: index.keys.length,
    oldestAge: index.keys.length > 0 ? Math.floor((now - oldest) / 60000) : null,
    newestAge: index.keys.length > 0 ? Math.floor((now - newest) / 60000) : null,
  };
}
