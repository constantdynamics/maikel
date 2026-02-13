'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { useStore } from '@/lib/defog/store';
import { Dashboard } from '@/components/defog/Dashboard';
import { syncScannerToDefog } from '@/lib/defog/scannerSync';
import { SmartRefreshEngine } from '@/lib/defog/services/smartRefresh';
import { saveToLocalStorage, loadFromLocalStorage, getSessionPassword } from '@/lib/defog/utils/storage';

const SESSION_PASSWORD = 'maikel-integrated';

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
      const saved = await loadFromLocalStorage(password);
      if (saved) {
        useStore.getState().loadState(saved);
        console.log('[Defog] Loaded persisted state:', saved.tabs?.length, 'tabs');
      }

      setAuthenticated(true);
      setLoading(false);
      setReady(true);
    }

    init();
  }, [setAuthenticated, setLoading]);

  // ── 2. Auto-save to IndexedDB on every state change (debounced 1s) ──
  useEffect(() => {
    if (!ready) return;

    const password = getSessionPassword() || SESSION_PASSWORD;

    const timer = setTimeout(async () => {
      try {
        await saveToLocalStorage(
          {
            tabs: store.tabs,
            archive: store.archive,
            notifications: store.notifications,
            limitHistory: store.limitHistory,
            settings: store.settings,
            lastSyncTime: new Date().toISOString(),
            encryptionKeyHash: store.encryptionKeyHash,
          },
          password,
        );
      } catch (e) {
        console.error('[Defog] Auto-save failed:', e);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    ready,
    store.tabs,
    store.archive,
    store.notifications,
    store.limitHistory,
    store.settings,
    store.encryptionKeyHash,
  ]);

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
    <AuthGuard>
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
    </AuthGuard>
  );
}
