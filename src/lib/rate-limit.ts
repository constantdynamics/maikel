/**
 * Simple in-memory rate limiter for API routes (#103, #104).
 * Uses sliding window counters per IP address.
 *
 * Note: This resets on server restart. For distributed rate limiting,
 * use Vercel's Edge Middleware or a Redis-based solution.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up stale entries periodically
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check rate limit for a given key (usually IP address).
 * @param key - Identifier (IP address, user ID, etc.)
 * @param maxRequests - Max requests per window
 * @param windowMs - Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 60,
  windowMs: number = 60 * 1000,
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    retryAfterMs: 0,
  };
}

/**
 * Get client IP from request headers.
 */
export function getClientIP(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
