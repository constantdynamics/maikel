/**
 * Circuit Breaker pattern for external API calls.
 *
 * States: CLOSED (normal) → OPEN (failing, reject calls) → HALF_OPEN (testing recovery)
 * When an API fails `threshold` times consecutively, the circuit opens for `resetTimeMs`.
 * After the reset time, one test call is allowed (HALF_OPEN). If it succeeds, circuit closes.
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening */
  threshold: number;
  /** Time in ms to keep circuit open before allowing a test call */
  resetTimeMs: number;
  /** Name for logging */
  name: string;
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  lastError: string | null;
  successCount: number;
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  threshold: 3,
  resetTimeMs: 60 * 60 * 1000, // 1 hour
};

class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      lastError: null,
      successCount: 0,
    };
  }

  /**
   * Check if a call is allowed through the circuit breaker.
   * Returns true if the call should proceed, false if it should be rejected.
   */
  canExecute(): boolean {
    if (this.state.state === 'CLOSED') return true;

    if (this.state.state === 'OPEN') {
      const elapsed = Date.now() - this.state.lastFailureTime;
      if (elapsed >= this.config.resetTimeMs) {
        this.state.state = 'HALF_OPEN';
        console.log(`[CircuitBreaker:${this.config.name}] Transitioning to HALF_OPEN after ${Math.round(elapsed / 1000)}s`);
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one test call
    return true;
  }

  /** Record a successful call */
  recordSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      console.log(`[CircuitBreaker:${this.config.name}] HALF_OPEN → CLOSED (recovery successful)`);
    }
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: this.state.lastFailureTime,
      lastError: null,
      successCount: this.state.successCount + 1,
    };
  }

  /** Record a failed call */
  recordFailure(error: string): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    this.state.lastError = error;

    if (this.state.state === 'HALF_OPEN') {
      this.state.state = 'OPEN';
      console.warn(`[CircuitBreaker:${this.config.name}] HALF_OPEN → OPEN (test call failed: ${error})`);
      return;
    }

    if (this.state.failureCount >= this.config.threshold) {
      this.state.state = 'OPEN';
      const resetMinutes = Math.round(this.config.resetTimeMs / 60000);
      console.warn(`[CircuitBreaker:${this.config.name}] CLOSED → OPEN after ${this.state.failureCount} failures. Pausing for ${resetMinutes} minutes. Last error: ${error}`);
    }
  }

  /** Get current state for health checks */
  getStatus(): { state: CircuitState; failureCount: number; lastError: string | null } {
    return {
      state: this.state.state,
      failureCount: this.state.failureCount,
      lastError: this.state.lastError,
    };
  }

  /** Force reset (for admin use) */
  reset(): void {
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      lastError: null,
      successCount: this.state.successCount,
    };
    console.log(`[CircuitBreaker:${this.config.name}] Manually reset to CLOSED`);
  }
}

// Singleton circuit breakers for external APIs
export const tradingViewCircuitBreaker = new CircuitBreaker({
  ...DEFAULT_CONFIG,
  name: 'TradingView',
  threshold: 3,
  resetTimeMs: 60 * 60 * 1000, // 1 hour
});

export const yahooCircuitBreaker = new CircuitBreaker({
  ...DEFAULT_CONFIG,
  name: 'Yahoo',
  threshold: 5,
  resetTimeMs: 30 * 60 * 1000, // 30 minutes (Yahoo crumb issues are often transient)
});

/**
 * Execute a function with circuit breaker protection.
 * Throws CircuitBreakerOpenError if the circuit is open.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker ${name} is OPEN - API calls temporarily paused`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export async function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>,
): Promise<T> {
  if (!breaker.canExecute()) {
    throw new CircuitBreakerOpenError(breaker.getStatus().state);
  }

  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    breaker.recordFailure(message);
    throw error;
  }
}

/** Get status of all circuit breakers (for health check endpoint) */
export function getAllCircuitBreakerStatus() {
  return {
    tradingView: tradingViewCircuitBreaker.getStatus(),
    yahoo: yahooCircuitBreaker.getStatus(),
  };
}
