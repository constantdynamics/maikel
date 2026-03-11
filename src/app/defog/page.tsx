'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/defog/store';
import type { AppState } from '@/lib/defog/types';
import { Dashboard } from '@/components/defog/Dashboard';
import { syncScannerToDefog, shouldRunWeeklyRefresh, refreshDefogTop250 } from '@/lib/defog/scannerSync';
import { SmartRefreshEngine } from '@/lib/defog/services/smartRefresh';
import { fetchRangesForNewStocks, recalculateAllBuyLimits } from '@/lib/defog/services/postSyncRangeFetch';
import { saveToLocalStorage, loadFromLocalStorage, getSessionPassword } from '@/lib/defog/utils/storage';
import { loadDefogStateFromCloud, scheduleCloudSave, saveDefogStateBeacon } from '@/lib/defog/services/maikelCloudSync';

const SESSION_PASSWORD = 'maikel-integrated';

/**
 * Deduplicate stocks within ALL tabs after loading from storage.
 * Groups by base ticker (strip exchange suffix) and normalized name.
 * Keeps the stock with the exchange suffix (more specific ticker).
 */
function deduplicateAllTabs() {
  const state = useStore.getState();
  let changed = false;

  const deduped = state.tabs.map((tab) => {
    const seen = new Map<string, typeof tab.stocks[0]>();
    const keyMap = new Map<string, string>();

    for (const stock of tab.stocks) {
      const ticker = stock.ticker.trim();
      const dotIdx = ticker.indexOf('.');
      const baseTicker = (dotIdx > 0 ? ticker.substring(0, dotIdx) : ticker).toUpperCase();
      const normName = stock.name
        .toLowerCase().replace(/[.,]/g, '')
        .replace(/\b(inc|corp|corporation|ltd|limited|plc|ag|sa|nv|se|co|company|group|holdings|international)\b/gi, '')
        .replace(/\s+/g, ' ').trim();

      const existingKey = keyMap.get(`B:${baseTicker}`) || (normName ? keyMap.get(`N:${normName}`) : null);

      if (!existingKey) {
        const key = `${tab.id}:${stock.id}`;
        seen.set(key, stock);
        keyMap.set(`B:${baseTicker}`, key);
        if (normName) keyMap.set(`N:${normName}`, key);
        continue;
      }

      // Duplicate found: keep the one with exchange suffix (more specific)
      changed = true;
      const existing = seen.get(existingKey)!;
      const newHasDot = ticker.includes('.');
      const existingHasDot = existing.ticker.includes('.');
      if (newHasDot && !existingHasDot) {
        seen.set(existingKey, {
          ...stock,
          buyLimit: existing.buyLimit != null && stock.buyLimit != null
            ? Math.min(existing.buyLimit, stock.buyLimit)
            : stock.buyLimit ?? existing.buyLimit,
        });
      }
      keyMap.set(`B:${baseTicker}`, existingKey);
      if (normName) keyMap.set(`N:${normName}`, existingKey);
    }

    return { ...tab, stocks: Array.from(seen.values()) };
  });

  if (changed) {
    useStore.setState({ tabs: deduped });
    console.log('[Defog] Cleaned up duplicate stocks in tabs');
  }
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
  lastRefreshedProvider: string | null;
  lastError: string | null;
  providerStats: Record<string, { successes: number; failures: number }>;
}

export default function DefogPage() {
  const store = useStore();
  const { setAuthenticated, setLoading, isLoading } = store;
  const [ready, setReady] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshStats, setRefreshStats] = useState<RefreshStats | null>(null);
  const [showRefreshPanel, setShowRefreshPanel] = useState(false);
  const engineRef = useRef<SmartRefreshEngine | null>(null);

  // ── 1. Initialize: load persisted data ──
  // Strategy: ALWAYS load from both local AND cloud, then pick whichever has
  // more data (by total stock count + tab count). This ensures data survives
  // Vercel redeployments where the URL changes and local storage is wiped.
  // Cloud (Supabase via /api/defog/state) is the source of truth.
  useEffect(() => {
    async function init() {
      if (typeof window !== 'undefined') {
        if (!sessionStorage.getItem('session-password')) {
          sessionStorage.setItem('session-password', SESSION_PASSWORD);
        }
      }

      const password = getSessionPassword() || SESSION_PASSWORD;
      const forceCloud = typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('restore-from-cloud') === '1';

      // Count stocks helper
      const countStocks = (state: { tabs?: { stocks?: unknown[] }[] } | null) =>
        state?.tabs?.reduce((n, t) => n + (t.stocks?.length || 0), 0) ?? 0;
      // Count tabs (including user-created custom tabs)
      const countTabs = (state: { tabs?: unknown[] } | null) => state?.tabs?.length ?? 0;

      // --- Load from ALL sources in parallel ---
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let localData: any = null;
      let localSource = 'none';

      if (!forceCloud) {
        localData = await loadFromLocalStorage(password);
        if (localData) {
          localSource = 'IndexedDB';
        } else {
          try {
            const b = localStorage.getItem('defog-state-backup');
            if (b) { localData = JSON.parse(b); localSource = 'localStorage backup'; }
          } catch { /* ignore */ }
        }
        if (!localData) {
          try {
            const pb = localStorage.getItem('defog-state-backup-prev');
            if (pb) { localData = JSON.parse(pb); localSource = 'localStorage prev backup'; }
          } catch { /* ignore */ }
        }
      }

      const localCount = countStocks(localData);
      const localTabCount = countTabs(localData);

      // --- ALWAYS try cloud (even when local has data) ---
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cloudData: any = null;
      let cloudCount = 0;
      let cloudTabCount = 0;
      try {
        const result = await loadDefogStateFromCloud();
        cloudData = result.data;
        cloudCount = countStocks(cloudData);
        cloudTabCount = countTabs(cloudData);
        if (cloudData) {
          console.log(`[Defog] Cloud has: ${cloudTabCount} tabs, ${cloudCount} stocks`);
        }
      } catch (e) {
        console.error('[Defog] Cloud load failed:', e);
      }

      if (forceCloud) {
        console.log('[Defog] Force-restoring from cloud (?restore-from-cloud=1)...');
      }

      // --- Pick the best source ---
      // Cloud wins if: forced, OR local is empty, OR cloud has more tabs
      // (more tabs = user-created tabs like "nby" that only exist in cloud).
      // If tab counts are equal, the source with more stocks wins.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let winner: any = null;
      let winnerSource = 'none';

      if (forceCloud && cloudData && cloudCount > 0) {
        winner = cloudData;
        winnerSource = 'cloud (forced)';
      } else if (!localData || localCount === 0) {
        // Local is empty — use cloud
        if (cloudData && cloudCount > 0) {
          winner = cloudData;
          winnerSource = 'cloud (local empty)';
        }
      } else if (!cloudData || cloudCount === 0) {
        // Cloud is empty — use local
        winner = localData;
        winnerSource = localSource;
      } else {
        // Both have data — compare. Cloud wins if it has MORE tabs (custom tabs
        // like "nby" only survive in cloud after URL change). If same tab count,
        // pick whichever has more stocks. Tie goes to cloud (it's the truth).
        if (cloudTabCount > localTabCount) {
          winner = cloudData;
          winnerSource = `cloud (${cloudTabCount} tabs > ${localTabCount} local tabs)`;
        } else if (localTabCount > cloudTabCount) {
          winner = localData;
          winnerSource = `${localSource} (${localTabCount} tabs > ${cloudTabCount} cloud tabs)`;
        } else if (cloudCount >= localCount) {
          winner = cloudData;
          winnerSource = `cloud (${cloudCount} stocks >= ${localCount} local)`;
        } else {
          winner = localData;
          winnerSource = `${localSource} (${localCount} stocks > ${cloudCount} cloud)`;
        }
      }

      if (winner) {
        useStore.getState().loadState(winner);
        console.log(`[Defog] Loaded from ${winnerSource}: ${countTabs(winner)} tabs, ${countStocks(winner)} stocks`);
        deduplicateAllTabs();

        // Restore weekly refresh timestamp from cloud state if available
        if (winner.weeklyRefreshTimestamp) {
          try { localStorage.setItem('defog-top250-last-refresh', winner.weeklyRefreshTimestamp); } catch { /* */ }
        }

        // If we loaded from cloud, save to local IndexedDB for next visit
        if (winnerSource.startsWith('cloud')) {
          try {
            const state = useStore.getState();
            await saveToLocalStorage({
              tabs: state.tabs, archive: state.archive, purchasedStocks: state.purchasedStocks,
              notifications: state.notifications, limitHistory: state.limitHistory,
              settings: state.settings, lastSyncTime: new Date().toISOString(),
              encryptionKeyHash: state.encryptionKeyHash,
            }, password);
            console.log('[Defog] Saved cloud data to local IndexedDB');
          } catch { /* ignore */ }
        }

        // If we loaded from local, sync to cloud
        if (!winnerSource.startsWith('cloud')) {
          const state = useStore.getState();
          scheduleCloudSave({
            tabs: state.tabs, archive: state.archive, purchasedStocks: state.purchasedStocks,
            notifications: state.notifications, limitHistory: state.limitHistory,
            settings: state.settings, lastSyncTime: new Date().toISOString(),
            encryptionKeyHash: state.encryptionKeyHash,
          });
        }

        if (forceCloud) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else {
        console.log('[Defog] No data found anywhere — starting fresh');
      }

      setAuthenticated(true);
      setLoading(false);
      setReady(true);
    }

    init();
  }, [setAuthenticated, setLoading]);

  // ── 2. Auto-save to IndexedDB on every state change (debounced 500ms) ──
  // Also save immediately on beforeunload to prevent data loss on refresh
  useEffect(() => {
    if (!ready) return;

    const password = getSessionPassword() || SESSION_PASSWORD;

    const doSave = async () => {
      try {
        const state = useStore.getState();
        const dataToSave = {
          tabs: state.tabs,
          archive: state.archive,
          purchasedStocks: state.purchasedStocks,
          notifications: state.notifications,
          limitHistory: state.limitHistory,
          settings: state.settings,
          lastSyncTime: new Date().toISOString(),
          encryptionKeyHash: state.encryptionKeyHash,
        };
        // SAFETY: Don't save if stock count dropped significantly
        // This prevents saving an intermediate/corrupted state
        const totalStocks = dataToSave.tabs?.reduce((n: number, t: { stocks?: unknown[] }) => n + (t.stocks?.length || 0), 0) || 0;
        const lastKnownCount = parseInt(localStorage.getItem('defog-last-stock-count') || '0', 10);

        if (lastKnownCount > 5 && totalStocks < lastKnownCount * 0.7) {
          console.warn(`[Defog] SAFETY: Refusing to save — stock count dropped from ${lastKnownCount} to ${totalStocks}`);
          return;
        }

        // Update last known count
        if (totalStocks > 0) {
          localStorage.setItem('defog-last-stock-count', String(totalStocks));
        }

        // Save to IndexedDB (local)
        await saveToLocalStorage(dataToSave, password);
        // Also schedule cloud save — include weeklyRefreshTimestamp so it
        // survives across Vercel URL changes (localStorage is per-origin)
        let weeklyTs: string | undefined;
        try { weeklyTs = localStorage.getItem('defog-top250-last-refresh') || undefined; } catch { /* */ }
        scheduleCloudSave({ ...dataToSave, weeklyRefreshTimestamp: weeklyTs } as Partial<AppState>);
      } catch (e) {
        console.error('[Defog] Auto-save failed:', e);
      }
    };

    const timer = setTimeout(doSave, 500);

    return () => clearTimeout(timer);
  }, [
    ready,
    store.tabs,
    store.archive,
    store.purchasedStocks,
    store.notifications,
    store.limitHistory,
    store.settings,
    store.encryptionKeyHash,
  ]);

  // Save on page unload (refresh/close) - synchronous fallback
  useEffect(() => {
    if (!ready) return;

    const handleBeforeUnload = () => {
      const password = getSessionPassword() || SESSION_PASSWORD;
      const state = useStore.getState();
      const dataToSave = {
        tabs: state.tabs,
        archive: state.archive,
        purchasedStocks: state.purchasedStocks,
        notifications: state.notifications,
        limitHistory: state.limitHistory,
        settings: state.settings,
        lastSyncTime: new Date().toISOString(),
        encryptionKeyHash: state.encryptionKeyHash,
      };

      // 1. Synchronous localStorage backup (per-origin, instant)
      try {
        const prevBackup = localStorage.getItem('defog-state-backup');
        if (prevBackup) {
          localStorage.setItem('defog-state-backup-prev', prevBackup);
        }
        localStorage.setItem('defog-state-backup', JSON.stringify(dataToSave));
      } catch { /* quota exceeded - ignore */ }

      // 2. Cloud save via sendBeacon (survives tab/window close, cross-origin)
      // Include weeklyRefreshTimestamp so it persists across Vercel URL changes
      let weeklyTs: string | undefined;
      try { weeklyTs = localStorage.getItem('defog-top250-last-refresh') || undefined; } catch { /* */ }
      saveDefogStateBeacon({ ...dataToSave, weeklyRefreshTimestamp: weeklyTs } as Partial<AppState>);

      // Suppress unused var warning
      void password;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [ready]);

  // ── Helper: update a single stock in a tab ──
  const updateStockInTab = useCallback((tabId: string, stockId: string, updates: Record<string, unknown>) => {
    useStore.setState((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, stocks: tab.stocks.map((s) => s.id === stockId ? { ...s, ...updates } : s) }
          : tab
      ),
    }));
  }, []);

  // ── 3. Scanner sync + post-sync range fetch ──
  const runSync = useCallback(async () => {
    try {
      // Check if a weekly full refresh is due (replaces tab contents with current top 250)
      if (shouldRunWeeklyRefresh()) {
        console.log('[Defog] Weekly top-250 refresh is due — running full refresh');
        const refreshResult = await refreshDefogTop250(
          () => useStore.getState().tabs,
          (updater) => useStore.setState((state) => ({ tabs: updater(state.tabs) })),
        );
        const refreshParts: string[] = [];
        if (refreshResult.kuifje > 0) refreshParts.push(`${refreshResult.kuifje} Kuifje`);
        if (refreshResult.zonnebloem > 0) refreshParts.push(`${refreshResult.zonnebloem} Zonnebloem`);
        if (refreshResult.biopharma > 0) refreshParts.push(`${refreshResult.biopharma} BioPharma`);
        if (refreshResult.mining > 0) refreshParts.push(`${refreshResult.mining} Mining`);
        if (refreshResult.hydrogen > 0) refreshParts.push(`${refreshResult.hydrogen} Hydrogen`);
        if (refreshResult.shipping > 0) refreshParts.push(`${refreshResult.shipping} Shipping`);
        if (refreshParts.length > 0) {
          setSyncMessage(`Weekly refresh: ${refreshParts.join(', ')}`);
          setTimeout(() => setSyncMessage(null), 5000);
        }
        // After weekly refresh, still do range fetch below
      }

      const result = await syncScannerToDefog(
        () => useStore.getState().tabs,
        (updater) => useStore.setState((state) => ({ tabs: updater(state.tabs) })),
      );
      const parts: string[] = [];
      if (result.kuifjeAdded > 0) parts.push(`${result.kuifjeAdded} Kuifje`);
      if (result.zbAdded > 0) parts.push(`${result.zbAdded} Zonnebloem`);
      if (result.biopharmaAdded > 0) parts.push(`${result.biopharmaAdded} BioPharma`);
      if (result.miningAdded > 0) parts.push(`${result.miningAdded} Mining`);
      if (result.hydrogenAdded > 0) parts.push(`${result.hydrogenAdded} Hydrogen`);
      if (result.shippingAdded > 0) parts.push(`${result.shippingAdded} Shipping`);
      if (parts.length > 0) {
        setSyncMessage(`Synced: +${parts.join(', ')}`);
        setTimeout(() => setSyncMessage(null), 4000);
      }

      // Recalculate buy limits for existing stocks that have range data
      // (fixes limits that were set with old cascade logic)
      recalculateAllBuyLimits(
        () => useStore.getState().tabs,
        updateStockInTab,
      );

      // Fetch 5Y/3Y/1Y ranges for newly added stocks (< 1 day old)
      // This runs in the background — doesn't block the UI
      fetchRangesForNewStocks(
        () => useStore.getState().tabs,
        updateStockInTab,
      ).then((rangeResult) => {
        if (rangeResult.updated > 0) {
          setSyncMessage(`Ranges fetched: ${rangeResult.updated} stocks updated`);
          setTimeout(() => setSyncMessage(null), 4000);
        }
      }).catch((e) => {
        console.error('Post-sync range fetch failed:', e);
      });
    } catch (e) {
      console.error('Scanner sync failed:', e);
    }
  }, [updateStockInTab]);

  useEffect(() => {
    if (ready) runSync();
  }, [ready, runSync]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(runSync, 60_000);
    return () => clearInterval(interval);
  }, [ready, runSync]);

  // ── 4. Smart Refresh Engine ──
  useEffect(() => {
    if (!ready) return;

    const engine = new SmartRefreshEngine(
      () => useStore.getState().tabs,
      (tabId, stockId, data) => {
        useStore.setState((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId
              ? { ...tab, stocks: tab.stocks.map((s) => s.id === stockId ? { ...s, ...data } : s) }
              : tab
          ),
        }));
      },
      (stats) => setRefreshStats(stats),
    );

    engineRef.current = engine;
    engine.start();
    return () => { engine.stop(); engineRef.current = null; };
  }, [ready]);

  const toggleEngine = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPaused()) engine.resume();
    else if (engine.isRunning()) engine.pause();
    else engine.start();
  };

  return (
    <>
      <div
        className="defog-container"
        style={{
          '--color-bg-primary': '#1a1a1a',
          '--color-bg-secondary': '#2d2d2d',
          '--color-bg-tertiary': '#3d3d3d',
          '--color-positive': '#00ff88',
          '--color-negative': '#ff3366',
          '--color-warning': '#ffaa00',
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
          minHeight: 'calc(100vh - 60px)',
        } as React.CSSProperties}
      >
        {/* Sync toast — uses z-30 to stay below navbar z-50 */}
        {syncMessage && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-green-600/90 text-white text-sm font-medium shadow-lg backdrop-blur-sm">
            {syncMessage}
          </div>
        )}

        {isLoading || !ready ? (
          <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 60px)' }}>
            <div className="text-gray-400">Loading Defog...</div>
          </div>
        ) : (
          <Dashboard />
        )}

        {/* Smart Refresh indicator — z-30 to stay below navbar */}
        <div className="fixed bottom-4 right-4 z-30">
          <button
            onClick={() => setShowRefreshPanel(!showRefreshPanel)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all shadow-lg"
            style={{
              backgroundColor: '#2a2a2a',
              border: '1px solid #3d3d3d',
              color: refreshStats?.isRunning
                ? refreshStats.isPaused ? '#ffaa00' : '#00ff88'
                : '#666',
            }}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                refreshStats?.isRunning && !refreshStats.isPaused ? 'animate-pulse' : ''
              }`}
              style={{
                backgroundColor: refreshStats?.isRunning
                  ? refreshStats.isPaused ? '#ffaa00' : '#00ff88'
                  : '#444',
              }}
            />
            {refreshStats?.isRunning
              ? refreshStats.isPaused
                ? 'Paused'
                : `${refreshStats.currentIndex}/${refreshStats.queueLength}`
              : 'Off'}
            {refreshStats && refreshStats.totalSuccesses > 0 && (
              <span style={{ color: '#555' }}>({refreshStats.totalSuccesses})</span>
            )}
          </button>

          {showRefreshPanel && refreshStats && (
            <div className="absolute bottom-12 right-0 w-72 rounded-lg p-3 shadow-xl"
              style={{ backgroundColor: '#222', border: '1px solid #3d3d3d' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white">Smart Refresh</span>
                <button onClick={toggleEngine} className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: refreshStats.isRunning && !refreshStats.isPaused ? '#332200' : '#003322',
                    color: refreshStats.isRunning && !refreshStats.isPaused ? '#ffaa00' : '#00ff88',
                  }}
                >
                  {refreshStats.isRunning ? (refreshStats.isPaused ? 'Resume' : 'Pause') : 'Start'}
                </button>
              </div>
              <div className="h-1 rounded-full overflow-hidden mb-2" style={{ backgroundColor: '#333' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: refreshStats.queueLength > 0 ? `${(refreshStats.currentIndex / refreshStats.queueLength) * 100}%` : '0%',
                  backgroundColor: '#00ff88',
                }} />
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2 text-center">
                {[
                  { v: refreshStats.totalSuccesses, c: '#00ff88', l: 'OK' },
                  { v: refreshStats.totalFailures, c: '#ff3366', l: 'Fail' },
                  { v: refreshStats.totalAttempts, c: '#888', l: 'Total' },
                ].map((s) => (
                  <div key={s.l} className="p-1 rounded" style={{ backgroundColor: '#1a1a1a' }}>
                    <div className="text-sm font-bold" style={{ color: s.c }}>{s.v}</div>
                    <div className="text-[8px]" style={{ color: '#666' }}>{s.l}</div>
                  </div>
                ))}
              </div>
              {Object.entries(refreshStats.providerStats).map(([p, s]) => (
                <div key={p} className="flex justify-between py-0.5 text-[10px]" style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <span style={{ color: '#aaa' }}>{p}</span>
                  <span><span style={{ color: '#00ff88' }}>{s.successes}</span> / <span style={{ color: '#ff3366' }}>{s.failures}</span></span>
                </div>
              ))}
              <button onClick={() => engineRef.current?.resetAll()}
                className="mt-2 w-full py-1 rounded text-[9px]"
                style={{ backgroundColor: '#2a1a1a', color: '#ff6666' }}
              >Reset learning data</button>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
