/**
 * Smart Auto-Refresh Engine for Defog
 *
 * Self-improving stock price refresh system that:
 * 1. Prioritizes never-refreshed and stale stocks
 * 2. Tries providers in order: Yahoo (free) → TwelveData → AlphaVantage
 * 3. Remembers which provider works per stock (preferred provider)
 * 4. Blacklists failed provider+stock combos, retries with alternatives
 * 5. Tracks success/failure stats and adapts strategy over time
 * 6. Persists learning to localStorage so knowledge survives page reloads
 */

import type { Stock as DefogStock, Tab, ApiProvider } from '../types';
import { getStockAPI, type FetchStockResult } from './stockApi';

// ── Types ──────────────────────────────────────────────────────────────

interface ProviderRecord {
  successes: number;
  failures: number;
  lastTried: number;       // timestamp
  lastSuccess: number;     // timestamp
  blocked: boolean;        // permanently blocked for this stock
}

interface StockRefreshMeta {
  ticker: string;
  providers: Partial<Record<ApiProvider, ProviderRecord>>;
  preferredProvider: ApiProvider | null;
  lastRefreshed: number;   // timestamp
  consecutiveFailures: number;
  cooldownUntil: number;   // timestamp — skip until this time
}

interface RefreshStats {
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  currentIndex: number;
  queueLength: number;
  isRunning: boolean;
  isPaused: boolean;
  lastRefreshedTicker: string | null;
  lastRefreshedProvider: ApiProvider | null;
  lastError: string | null;
  providerStats: Record<string, { successes: number; failures: number }>;
}

type OnStockUpdated = (tabId: string, stockId: string, data: Partial<DefogStock>) => void;
type OnStatsChanged = (stats: RefreshStats) => void;

// ── Constants ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'defog-refresh-meta';
const PROVIDER_ORDER: ApiProvider[] = ['yahoo', 'twelvedata', 'alphavantage'];
const DELAY_BETWEEN_STOCKS_MS = 1500;       // 1.5s between stocks
const DELAY_AFTER_FAILURE_MS = 3000;         // 3s after a failure
const RETRY_COOLDOWN_BASE_MS = 5 * 60_000;  // 5 min base cooldown
const MAX_COOLDOWN_MS = 60 * 60_000;         // 1 hour max cooldown
const MAX_CONSECUTIVE_FAILURES = 3;          // after 3 fails, longer cooldown

// ── Persistence ────────────────────────────────────────────────────────

function loadMeta(): Record<string, StockRefreshMeta> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveMeta(meta: Record<string, StockRefreshMeta>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch { /* ignore */ }
}

// ── Priority Calculation ───────────────────────────────────────────────

function calculatePriority(stock: DefogStock, meta: StockRefreshMeta | undefined): number {
  const now = Date.now();

  // Never refreshed → highest priority (score 0)
  if (!stock.lastUpdated || stock.currentPrice === 0) return 0;

  // In cooldown → very low priority
  if (meta && meta.cooldownUntil > now) return 999_999;

  // Base: minutes since last refresh
  const lastRefresh = meta?.lastRefreshed || new Date(stock.lastUpdated).getTime();
  const minutesSinceRefresh = (now - lastRefresh) / 60_000;

  // Penalty for consecutive failures (push to back, not to front)
  const failurePenalty = meta ? meta.consecutiveFailures * 30 : 0;

  // Lower score = higher priority
  return Math.max(0, -minutesSinceRefresh + failurePenalty);
}

// ── Pick Best Provider ─────────────────────────────────────────────────

function pickProvider(meta: StockRefreshMeta | undefined): ApiProvider[] {
  if (!meta) return [...PROVIDER_ORDER];

  // If we have a known working provider, put it first
  const order: ApiProvider[] = [];

  if (meta.preferredProvider && !meta.providers[meta.preferredProvider]?.blocked) {
    order.push(meta.preferredProvider);
  }

  // Then add remaining providers sorted by success rate
  for (const p of PROVIDER_ORDER) {
    if (order.includes(p)) continue;
    const record = meta.providers[p];
    if (record?.blocked) continue;
    order.push(p);
  }

  return order;
}

// ── Main Engine ────────────────────────────────────────────────────────

export class SmartRefreshEngine {
  private meta: Record<string, StockRefreshMeta>;
  private running = false;
  private paused = false;
  private abortController: AbortController | null = null;
  private stats: RefreshStats;
  private onStockUpdated: OnStockUpdated;
  private onStatsChanged: OnStatsChanged;
  private getTabs: () => Tab[];

  constructor(
    getTabs: () => Tab[],
    onStockUpdated: OnStockUpdated,
    onStatsChanged: OnStatsChanged,
  ) {
    this.getTabs = getTabs;
    this.onStockUpdated = onStockUpdated;
    this.onStatsChanged = onStatsChanged;
    this.meta = loadMeta();
    this.stats = this.makeEmptyStats();
  }

  private makeEmptyStats(): RefreshStats {
    return {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      currentIndex: 0,
      queueLength: 0,
      isRunning: false,
      isPaused: false,
      lastRefreshedTicker: null,
      lastRefreshedProvider: null,
      lastError: null,
      providerStats: {},
    };
  }

  private emit(): void {
    this.stats.isRunning = this.running;
    this.stats.isPaused = this.paused;
    this.onStatsChanged({ ...this.stats });
  }

  // Build a priority-sorted queue of all stocks across all tabs
  private buildQueue(): Array<{ tabId: string; stock: DefogStock; priority: number }> {
    const tabs = this.getTabs();
    const items: Array<{ tabId: string; stock: DefogStock; priority: number }> = [];

    for (const tab of tabs) {
      for (const stock of tab.stocks) {
        const meta = this.meta[stock.ticker];
        const priority = calculatePriority(stock, meta);
        items.push({ tabId: tab.id, stock, priority });
      }
    }

    // Sort: lowest priority score first (= highest priority)
    items.sort((a, b) => a.priority - b.priority);
    return items;
  }

  // Try to refresh a single stock
  private async refreshStock(
    tabId: string,
    stock: DefogStock,
  ): Promise<boolean> {
    const ticker = stock.ticker;
    const now = Date.now();

    // Ensure meta exists
    if (!this.meta[ticker]) {
      this.meta[ticker] = {
        ticker,
        providers: {},
        preferredProvider: (stock.preferredProvider && stock.preferredProvider !== 'auto')
          ? stock.preferredProvider
          : null,
        lastRefreshed: 0,
        consecutiveFailures: 0,
        cooldownUntil: 0,
      };
    }

    const meta = this.meta[ticker];

    // Skip if in cooldown
    if (meta.cooldownUntil > now) {
      return false;
    }

    const providerOrder = pickProvider(meta);
    const api = getStockAPI();

    for (const provider of providerOrder) {
      // Init provider record
      if (!meta.providers[provider]) {
        meta.providers[provider] = {
          successes: 0, failures: 0,
          lastTried: 0, lastSuccess: 0,
          blocked: false,
        };
      }

      const record = meta.providers[provider]!;
      if (record.blocked) continue;

      this.stats.totalAttempts++;
      record.lastTried = now;

      try {
        const skipProviders = providerOrder
          .filter(p => p !== provider && meta.providers[p]?.blocked)
          .map(p => p);

        const result: FetchStockResult = await api.fetchStockWithFallback(
          ticker,
          stock.exchange || undefined,
          {
            needsHistorical: !stock.historicalData || stock.historicalData.length === 0,
            forceProvider: provider,
          },
        );

        if (result.data && result.data.currentPrice && result.data.currentPrice > 0) {
          // Success!
          record.successes++;
          record.lastSuccess = now;
          meta.preferredProvider = provider;
          meta.lastRefreshed = now;
          meta.consecutiveFailures = 0;
          meta.cooldownUntil = 0;

          // Update provider stats
          if (!this.stats.providerStats[provider]) {
            this.stats.providerStats[provider] = { successes: 0, failures: 0 };
          }
          this.stats.providerStats[provider].successes++;
          this.stats.totalSuccesses++;
          this.stats.lastRefreshedTicker = ticker;
          this.stats.lastRefreshedProvider = provider;
          this.stats.lastError = null;

          // Push update to the store
          this.onStockUpdated(tabId, stock.id, {
            ...result.data,
            lastUpdated: new Date().toISOString(),
            preferredProvider: provider,
          });

          saveMeta(this.meta);
          this.emit();
          return true;
        }

        // Provider returned no data
        record.failures++;

      } catch (err) {
        record.failures++;
        console.warn(`[SmartRefresh] ${provider} failed for ${ticker}:`, err);
      }

      // Track failure at provider level
      if (!this.stats.providerStats[provider]) {
        this.stats.providerStats[provider] = { successes: 0, failures: 0 };
      }
      this.stats.providerStats[provider].failures++;

      // If this provider has too many failures for this stock, block it
      if (record.failures >= 3 && record.successes === 0) {
        record.blocked = true;
        console.log(`[SmartRefresh] Blocked ${provider} for ${ticker} (3 failures, 0 successes)`);
      }
    }

    // All providers failed for this stock
    meta.consecutiveFailures++;
    this.stats.totalFailures++;
    this.stats.lastError = `All providers failed for ${ticker}`;

    // Exponential cooldown: 5min → 10min → 20min → ... → max 1h
    const cooldown = Math.min(
      RETRY_COOLDOWN_BASE_MS * Math.pow(2, meta.consecutiveFailures - 1),
      MAX_COOLDOWN_MS,
    );
    meta.cooldownUntil = now + cooldown;

    // Self-improvement: if all providers are blocked, unblock the one with fewest failures
    const allBlocked = PROVIDER_ORDER.every(p => meta.providers[p]?.blocked);
    if (allBlocked) {
      let bestProvider: ApiProvider = 'yahoo';
      let minFailures = Infinity;
      for (const p of PROVIDER_ORDER) {
        const rec = meta.providers[p];
        if (rec && rec.failures < minFailures) {
          minFailures = rec.failures;
          bestProvider = p;
        }
      }
      meta.providers[bestProvider]!.blocked = false;
      meta.providers[bestProvider]!.failures = 0;
      console.log(`[SmartRefresh] Unblocked ${bestProvider} for ${ticker} (self-improvement: retry cycle)`);
    }

    saveMeta(this.meta);
    this.emit();
    return false;
  }

  // Main loop
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.abortController = new AbortController();

    console.log('[SmartRefresh] Engine started');
    this.emit();

    while (this.running) {
      if (this.paused) {
        await this.sleep(1000);
        continue;
      }

      const queue = this.buildQueue();
      this.stats.queueLength = queue.length;

      if (queue.length === 0) {
        await this.sleep(5000);
        continue;
      }

      for (let i = 0; i < queue.length && this.running && !this.paused; i++) {
        const { tabId, stock, priority } = queue[i];
        this.stats.currentIndex = i + 1;
        this.emit();

        // Skip stocks still in cooldown
        if (priority >= 999_999) continue;

        const success = await this.refreshStock(tabId, stock);

        // Delay between stocks
        const delay = success ? DELAY_BETWEEN_STOCKS_MS : DELAY_AFTER_FAILURE_MS;
        await this.sleep(delay);
      }

      // After full cycle, wait 30s before starting again
      if (this.running) {
        console.log('[SmartRefresh] Cycle complete, waiting 30s...');
        await this.sleep(30_000);
      }
    }
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    this.abortController?.abort();
    this.abortController = null;
    console.log('[SmartRefresh] Engine stopped');
    this.emit();
  }

  pause(): void {
    this.paused = true;
    this.emit();
  }

  resume(): void {
    this.paused = false;
    this.emit();
  }

  isRunning(): boolean { return this.running; }
  isPaused(): boolean { return this.paused; }

  getStats(): RefreshStats {
    return { ...this.stats };
  }

  // Get per-stock meta (for UI display)
  getStockMeta(ticker: string): StockRefreshMeta | undefined {
    return this.meta[ticker];
  }

  // Reset a specific stock's learning (user override)
  resetStock(ticker: string): void {
    delete this.meta[ticker];
    saveMeta(this.meta);
  }

  // Reset all learning data
  resetAll(): void {
    this.meta = {};
    saveMeta(this.meta);
    this.stats = this.makeEmptyStats();
    this.emit();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
