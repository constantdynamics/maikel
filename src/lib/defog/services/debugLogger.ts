// Debug logger service for API activity tracking
// Stores logs in memory and localStorage for persistence

const LOG_KEY = 'defog-debug-logs';
const MAX_LOGS = 100;

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'api_call' | 'api_response' | 'api_error' | 'cache_hit' | 'cache_miss' | 'rate_limit' | 'info' | 'warning';
  provider?: string;
  symbol?: string;
  message: string;
  details?: unknown;
}

// In-memory log storage
let logs: LogEntry[] = [];
let listeners: ((logs: LogEntry[]) => void)[] = [];

// Load logs from localStorage on init
function loadLogs(): void {
  try {
    const stored = localStorage.getItem(LOG_KEY);
    if (stored) {
      logs = JSON.parse(stored);
    }
  } catch {
    logs = [];
  }
}

// Save logs to localStorage
function saveLogs(): void {
  try {
    // Keep only last MAX_LOGS entries
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(-MAX_LOGS);
    }
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch {
    // localStorage full, clear old logs
    logs = logs.slice(-50);
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch {
      // Give up
    }
  }
}

// Notify listeners of log changes
function notifyListeners(): void {
  for (const listener of listeners) {
    listener([...logs]);
  }
}

// Initialize
loadLogs();

// Add a log entry
export function log(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  const newEntry: LogEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  logs.push(newEntry);

  // Also log to console with formatting
  const time = new Date(newEntry.timestamp).toLocaleTimeString();
  const prefix = `[${time}] [${newEntry.type.toUpperCase()}]`;

  switch (newEntry.type) {
    case 'api_call':
      console.log(`%c${prefix} ${newEntry.message}`, 'color: #3b82f6', newEntry.details || '');
      break;
    case 'api_response':
      console.log(`%c${prefix} ${newEntry.message}`, 'color: #22c55e', newEntry.details || '');
      break;
    case 'api_error':
      console.error(`%c${prefix} ${newEntry.message}`, 'color: #ef4444', newEntry.details || '');
      break;
    case 'cache_hit':
      console.log(`%c${prefix} ${newEntry.message}`, 'color: #a855f7', newEntry.details || '');
      break;
    case 'cache_miss':
      console.log(`%c${prefix} ${newEntry.message}`, 'color: #f97316', newEntry.details || '');
      break;
    case 'rate_limit':
      console.warn(`%c${prefix} ${newEntry.message}`, 'color: #eab308', newEntry.details || '');
      break;
    case 'warning':
      console.warn(`%c${prefix} ${newEntry.message}`, 'color: #f59e0b', newEntry.details || '');
      break;
    default:
      console.log(`%c${prefix} ${newEntry.message}`, 'color: #6b7280', newEntry.details || '');
  }

  saveLogs();
  notifyListeners();
}

// Convenience methods
export function logApiCall(provider: string, symbol: string, endpoint: string): void {
  log({
    type: 'api_call',
    provider,
    symbol,
    message: `[${provider}] Fetching ${endpoint} for ${symbol}`,
  });
}

export function logApiResponse(provider: string, symbol: string, success: boolean, data?: unknown): void {
  log({
    type: success ? 'api_response' : 'api_error',
    provider,
    symbol,
    message: success
      ? `[${provider}] Got data for ${symbol}`
      : `[${provider}] Failed to get data for ${symbol}`,
    details: data,
  });
}

export function logCacheHit(provider: string, symbol: string, type: string): void {
  log({
    type: 'cache_hit',
    provider,
    symbol,
    message: `[${provider}] Cache HIT for ${symbol} (${type})`,
  });
}

export function logCacheMiss(provider: string, symbol: string, type: string): void {
  log({
    type: 'cache_miss',
    provider,
    symbol,
    message: `[${provider}] Cache MISS for ${symbol} (${type})`,
  });
}

export function logRateLimit(provider: string, reason: string): void {
  log({
    type: 'rate_limit',
    provider,
    message: `[${provider}] Rate limited: ${reason}`,
  });
}

export function logInfo(message: string, details?: unknown): void {
  log({
    type: 'info',
    message,
    details,
  });
}

export function logWarning(message: string, details?: unknown): void {
  log({
    type: 'warning',
    message,
    details,
  });
}

// Get all logs
export function getLogs(): LogEntry[] {
  return [...logs];
}

// Clear logs
export function clearLogs(): void {
  logs = [];
  saveLogs();
  notifyListeners();
}

// Subscribe to log changes
export function subscribeLogs(callback: (logs: LogEntry[]) => void): () => void {
  listeners.push(callback);
  // Immediately call with current logs
  callback([...logs]);

  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
}

// Get recent logs (last N entries)
export function getRecentLogs(count: number = 20): LogEntry[] {
  return logs.slice(-count);
}
