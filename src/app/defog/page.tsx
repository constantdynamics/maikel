'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/defog/store';
import { Dashboard } from '@/components/defog/Dashboard';
import { syncScannerToDefog } from '@/lib/defog/scannerSync';
import { SmartRefreshEngine } from '@/lib/defog/services/smartRefresh';
import { saveToLocalStorage, loadFromLocalStorage, getSessionPassword } from '@/lib/defog/utils/storage';
import { loadDefogStateFromCloud, scheduleCloudSave } from '@/lib/defog/services/maikelCloudSync';

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

  // ── 1. Initialize: set auth + load persisted data from IndexedDB ──
  useEffect(() => {
    async function init() {
      if (typeof window !== 'undefined') {
        if (!sessionStorage.getItem('session-password')) {
          sessionStorage.setItem('session-password', SESSION_PASSWORD);
        }
      }

      // Load persisted state from IndexedDB
      const password = getSessionPassword() || SESSION_PASSWORD;
      let saved = await loadFromLocalStorage(password);
      let source = 'IndexedDB';

      // Fallback: try localStorage backup (saved on beforeunload)
      if (!saved) {
        try {
          const backup = localStorage.getItem('defog-state-backup');
          if (backup) {
            saved = JSON.parse(backup);
            source = 'localStorage backup';
            console.log('[Defog] Loaded from localStorage backup');
          }
        } catch { /* ignore parse errors */ }
      }

      // Fallback: try Maikel Supabase cloud backup
      if (!saved) {
        try {
          console.log('[Defog] No local data found, trying cloud...');
          const { data: cloudData } = await loadDefogStateFromCloud();
          if (cloudData) {
            saved = cloudData;
            source = 'Maikel cloud';
            console.log('[Defog] Restored from Maikel cloud backup!');
          }
        } catch (e) {
          console.error('[Defog] Cloud restore failed:', e);
        }
      }

      if (saved) {
        useStore.getState().loadState(saved);
        console.log(`[Defog] Loaded persisted state from ${source}:`, saved.tabs?.length, 'tabs');

        // Deduplicate all tabs on load (clean up historical duplicates)
        deduplicateAllTabs();
      } else {
        console.log('[Defog] No persisted state found (local or cloud)');
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
        // Save to IndexedDB (local)
        await saveToLocalStorage(dataToSave, password);
        // Also schedule cloud save to Maikel Supabase (debounced 3s)
        scheduleCloudSave(dataToSave);
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
      // Use synchronous localStorage as fallback (IndexedDB is async and may not complete)
      try {
        localStorage.setItem('defog-state-backup', JSON.stringify(dataToSave));
      } catch { /* quota exceeded - ignore */ }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [ready]);

  // ── 3. Scanner sync ──
  const runSync = useCallback(async () => {
    try {
      const result = await syncScannerToDefog(
        () => useStore.getState().tabs,
        (updater) => useStore.setState((state) => ({ tabs: updater(state.tabs) })),
      );
      const parts: string[] = [];
      if (result.kuifjeAdded > 0) parts.push(`${result.kuifjeAdded} Kuifje`);
      if (result.zbAdded > 0) parts.push(`${result.zbAdded} Zonnebloem`);
      if (parts.length > 0) {
        setSyncMessage(`Synced: +${parts.join(', ')}`);
        setTimeout(() => setSyncMessage(null), 4000);
      }
    } catch (e) {
      console.error('Scanner sync failed:', e);
    }
  }, []);

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
        className="defog-container relative"
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
