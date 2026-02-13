// Rate limiter service with request queue
// Prevents API abuse and respects actual rate limits

import type { ApiProvider } from '../types';

const USAGE_KEY = 'defog-api-usage';

// ACTUAL rate limits from providers (be conservative!)
// Twelve Data free tier: 8 requests per minute, 800 per day
// Alpha Vantage free tier: 5 per minute, 500 per day (but they say 25/day for some endpoints)
export const RATE_LIMITS: Record<ApiProvider, {
  perMinute: number;
  perDay: number;
  minDelayMs: number; // Minimum delay between requests
}> = {
  twelvedata: {
    perMinute: 8,      // STRICT - 8 per minute max
    perDay: 800,
    minDelayMs: 8000,  // 8 seconds between requests to be safe (60/8 = 7.5s)
  },
  alphavantage: {
    perMinute: 5,
    perDay: 25,        // Free tier is very limited
    minDelayMs: 15000, // 15 seconds between requests
  },
  fmp: {
    perMinute: 5,
    perDay: 250,
    minDelayMs: 12000,
  },
  yahoo: {
    perMinute: 60,      // Yahoo doesn't have strict limits, but be reasonable
    perDay: 2000,       // No official limit, but be conservative
    minDelayMs: 1000,   // 1 second between requests
  },
};

interface UsageEntry {
  provider: ApiProvider;
  minuteCount: number;
  minuteResetTime: number;
  dayCount: number;
  dayResetTime: number;
  lastRequestTime: number;
  dayStartDate: string; // Track which calendar day the counter is for (YYYY-MM-DD)
}

interface UsageStore {
  entries: Record<ApiProvider, UsageEntry>;
  lastSaved: number;
}

// Get current date as YYYY-MM-DD string
function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Load usage from localStorage
function loadUsage(): UsageStore {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const store = JSON.parse(raw) as UsageStore;

      // Reset stale counters
      const now = Date.now();
      const today = getTodayDateString();

      for (const [_provider, entry] of Object.entries(store.entries)) {
        if (now > entry.minuteResetTime) {
          entry.minuteCount = 0;
          entry.minuteResetTime = now + 60 * 1000;
        }
        // Reset day counter if it's a new calendar day OR if dayResetTime has passed
        if (entry.dayStartDate !== today || now > entry.dayResetTime) {
          console.log(`[RateLimiter] New day detected for ${_provider}, resetting counter (was: ${entry.dayCount}, date was: ${entry.dayStartDate}, now: ${today})`);
          entry.dayCount = 0;
          entry.dayStartDate = today;
          // Set reset time to end of today (midnight + 1 day)
          const tomorrow = new Date();
          tomorrow.setHours(24, 0, 0, 0);
          entry.dayResetTime = tomorrow.getTime();
        }
      }

      return store;
    }
  } catch {
    // Ignore errors
  }

  return { entries: {} as Record<ApiProvider, UsageEntry>, lastSaved: Date.now() };
}

// Save usage to localStorage
function saveUsage(store: UsageStore): void {
  try {
    store.lastSaved = Date.now();
    localStorage.setItem(USAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore errors
  }
}

// Get or create usage entry for a provider
function getUsageEntry(store: UsageStore, provider: ApiProvider): UsageEntry {
  const now = Date.now();
  const today = getTodayDateString();

  if (!store.entries[provider]) {
    // Set reset time to end of today (midnight)
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);

    store.entries[provider] = {
      provider,
      minuteCount: 0,
      minuteResetTime: now + 60 * 1000,
      dayCount: 0,
      dayResetTime: tomorrow.getTime(),
      lastRequestTime: 0,
      dayStartDate: today,
    };
  }

  // Reset counters if needed
  const entry = store.entries[provider];
  if (now > entry.minuteResetTime) {
    entry.minuteCount = 0;
    entry.minuteResetTime = now + 60 * 1000;
  }
  // Reset day counter if it's a new calendar day OR if dayResetTime has passed
  if (entry.dayStartDate !== today || now > entry.dayResetTime) {
    console.log(`[RateLimiter] Resetting day counter for ${provider} (new day: ${entry.dayStartDate} -> ${today})`);
    entry.dayCount = 0;
    entry.dayStartDate = today;
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    entry.dayResetTime = tomorrow.getTime();
  }

  return entry;
}

// Check if we can make a request right now
export function canMakeRequest(provider: ApiProvider): {
  allowed: boolean;
  waitMs: number;
  reason?: string;
} {
  const limits = RATE_LIMITS[provider];
  if (!limits) {
    return { allowed: false, waitMs: 0, reason: 'Unknown provider' };
  }

  const store = loadUsage();
  const entry = getUsageEntry(store, provider);
  const now = Date.now();

  // Check daily limit
  if (entry.dayCount >= limits.perDay) {
    const waitMs = entry.dayResetTime - now;
    return {
      allowed: false,
      waitMs,
      reason: `Daily limit reached (${entry.dayCount}/${limits.perDay}). Resets in ${Math.ceil(waitMs / 60000)} minutes.`,
    };
  }

  // Check per-minute limit
  if (entry.minuteCount >= limits.perMinute) {
    const waitMs = entry.minuteResetTime - now;
    return {
      allowed: false,
      waitMs,
      reason: `Minute limit reached (${entry.minuteCount}/${limits.perMinute}). Resets in ${Math.ceil(waitMs / 1000)} seconds.`,
    };
  }

  // Check minimum delay between requests
  const timeSinceLastRequest = now - entry.lastRequestTime;
  if (timeSinceLastRequest < limits.minDelayMs) {
    const waitMs = limits.minDelayMs - timeSinceLastRequest;
    return {
      allowed: false,
      waitMs,
      reason: `Rate limiting: wait ${Math.ceil(waitMs / 1000)}s before next request`,
    };
  }

  return { allowed: true, waitMs: 0 };
}

// Record that a request was made
export function recordRequest(provider: ApiProvider): void {
  const store = loadUsage();
  const entry = getUsageEntry(store, provider);

  entry.minuteCount++;
  entry.dayCount++;
  entry.lastRequestTime = Date.now();

  saveUsage(store);
}

// Get current usage stats
export function getUsageStats(provider: ApiProvider): {
  minuteUsed: number;
  minuteLimit: number;
  minuteResetIn: number;
  dayUsed: number;
  dayLimit: number;
  dayResetIn: number;
} {
  const limits = RATE_LIMITS[provider];
  if (!limits) {
    return {
      minuteUsed: 0,
      minuteLimit: 0,
      minuteResetIn: 0,
      dayUsed: 0,
      dayLimit: 0,
      dayResetIn: 0,
    };
  }

  const store = loadUsage();
  const entry = getUsageEntry(store, provider);
  const now = Date.now();

  return {
    minuteUsed: entry.minuteCount,
    minuteLimit: limits.perMinute,
    minuteResetIn: Math.max(0, entry.minuteResetTime - now),
    dayUsed: entry.dayCount,
    dayLimit: limits.perDay,
    dayResetIn: Math.max(0, entry.dayResetTime - now),
  };
}

// Reset usage for a provider (use carefully!)
export function resetUsage(provider: ApiProvider): void {
  const store = loadUsage();
  const now = Date.now();
  const today = getTodayDateString();
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);

  store.entries[provider] = {
    provider,
    minuteCount: 0,
    minuteResetTime: now + 60 * 1000,
    dayCount: 0,
    dayResetTime: tomorrow.getTime(),
    lastRequestTime: 0,
    dayStartDate: today,
  };

  saveUsage(store);
  console.log(`[RateLimiter] Usage reset for ${provider}`);
}

// Reset all providers (for manual reset button)
export function resetAllUsage(): void {
  const providers: ApiProvider[] = ['twelvedata', 'alphavantage', 'fmp'];
  for (const provider of providers) {
    resetUsage(provider);
  }
  console.log('[RateLimiter] All usage counters reset');
}

// Mark provider as exhausted (when server returns rate limit error)
// This is called when the API returns a "rate limit exceeded" error
export function markProviderExhausted(provider: ApiProvider, serverCount?: number): void {
  const limits = RATE_LIMITS[provider];
  if (!limits) return;

  const store = loadUsage();
  const entry = getUsageEntry(store, provider);

  // Set the count to the server-reported count or to the max limit
  if (serverCount !== undefined && serverCount > 0) {
    entry.dayCount = serverCount;
  } else {
    entry.dayCount = limits.perDay;
  }

  // Also max out the minute count to prevent immediate retries
  entry.minuteCount = limits.perMinute;

  saveUsage(store);
  console.warn(`[RateLimiter] Provider ${provider} marked as EXHAUSTED. Day count: ${entry.dayCount}/${limits.perDay}`);
}

// Get all API usage (for Settings display)
export function getAllApiUsage(): Map<ApiProvider, { count: number; limit: number; resetTime: number }> {
  const result = new Map<ApiProvider, { count: number; limit: number; resetTime: number }>();
  const providers: ApiProvider[] = ['twelvedata', 'alphavantage', 'fmp'];

  for (const provider of providers) {
    const stats = getUsageStats(provider);
    result.set(provider, {
      count: stats.dayUsed,
      limit: stats.dayLimit,
      resetTime: Date.now() + stats.dayResetIn,
    });
  }

  return result;
}

// Request queue system
interface QueuedRequest {
  id: string;
  provider: ApiProvider;
  symbol: string;
  type: 'quote' | 'historical';
  priority: number; // Lower = higher priority
  addedAt: number;
  attempts: number;
}

let requestQueue: QueuedRequest[] = [];
let isProcessingQueue = false;
let queueCallbacks: Map<string, {
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
}> = new Map();

// Add request to queue
export function queueRequest(
  provider: ApiProvider,
  symbol: string,
  type: 'quote' | 'historical',
  priority: number = 5
): Promise<boolean> {
  const id = `${provider}-${symbol}-${type}-${Date.now()}`;

  // Check if similar request already in queue
  const existing = requestQueue.find(
    r => r.provider === provider && r.symbol === symbol && r.type === type
  );

  if (existing) {
    // Update priority if new request is more urgent
    if (priority < existing.priority) {
      existing.priority = priority;
    }
    return Promise.resolve(true);
  }

  return new Promise((resolve, reject) => {
    requestQueue.push({
      id,
      provider,
      symbol,
      type,
      priority,
      addedAt: Date.now(),
      attempts: 0,
    });

    queueCallbacks.set(id, { resolve, reject });

    // Sort by priority
    requestQueue.sort((a, b) => a.priority - b.priority);

    // Start processing if not already
    if (!isProcessingQueue) {
      processQueue();
    }
  });
}

// Process the request queue
async function processQueue(): Promise<void> {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const request = requestQueue[0];
    const canProceed = canMakeRequest(request.provider);

    if (!canProceed.allowed) {
      // Wait before trying again
      const waitTime = Math.min(canProceed.waitMs, 30000); // Max 30 seconds wait
      console.log(`Rate limited: ${canProceed.reason}. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    // Remove from queue
    requestQueue.shift();

    // Record the request
    recordRequest(request.provider);

    // Resolve the promise
    const callback = queueCallbacks.get(request.id);
    if (callback) {
      callback.resolve(true);
      queueCallbacks.delete(request.id);
    }

    // Add a small delay between requests even if allowed
    const limits = RATE_LIMITS[request.provider];
    if (limits && requestQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, limits.minDelayMs));
    }
  }

  isProcessingQueue = false;
}

// Get queue length
export function getQueueLength(): number {
  return requestQueue.length;
}

// Clear queue
export function clearQueue(): void {
  for (const callback of queueCallbacks.values()) {
    callback.reject(new Error('Queue cleared'));
  }
  queueCallbacks.clear();
  requestQueue = [];
  isProcessingQueue = false;
}

// Calculate how many requests can be made right now
export function getAvailableRequests(provider: ApiProvider): number {
  const limits = RATE_LIMITS[provider];
  if (!limits) return 0;

  const store = loadUsage();
  const entry = getUsageEntry(store, provider);

  const minuteRemaining = limits.perMinute - entry.minuteCount;
  const dayRemaining = limits.perDay - entry.dayCount;

  return Math.max(0, Math.min(minuteRemaining, dayRemaining));
}

// Estimate time to process N requests
export function estimateTimeForRequests(provider: ApiProvider, count: number): number {
  const limits = RATE_LIMITS[provider];
  if (!limits) return 0;

  // Time based on minimum delay between requests
  return count * limits.minDelayMs;
}
