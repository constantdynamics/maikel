'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { useStore } from '@/lib/defog/store';
import { Dashboard } from '@/components/defog/Dashboard';
import { syncScannerToDefog } from '@/lib/defog/scannerSync';
import { SmartRefreshEngine } from '@/lib/defog/services/smartRefresh';

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
  const { setAuthenticated, setLoading, isLoading } = useStore();
  const [ready, setReady] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshStats, setRefreshStats] = useState<RefreshStats | null>(null);
  const [showRefreshPanel, setShowRefreshPanel] = useState(false);
  const engineRef = useRef<SmartRefreshEngine | null>(null);

  useEffect(() => {
    setAuthenticated(true);
    setLoading(false);

    if (typeof window !== 'undefined') {
      if (!sessionStorage.getItem('session-password')) {
        sessionStorage.setItem('session-password', 'maikel-integrated');
      }
    }
    setReady(true);
  }, [setAuthenticated, setLoading]);

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

  // Auto-sync scanner results on page load
  useEffect(() => {
    if (ready) runSync();
  }, [ready, runSync]);

  // Re-sync every 60 seconds
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(runSync, 60_000);
    return () => clearInterval(interval);
  }, [ready, runSync]);

  // Smart Refresh Engine — auto-start on page load
  useEffect(() => {
    if (!ready) return;

    const engine = new SmartRefreshEngine(
      () => useStore.getState().tabs,
      // onStockUpdated
      (tabId, stockId, data) => {
        useStore.setState((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  stocks: tab.stocks.map((s) =>
                    s.id === stockId ? { ...s, ...data } : s
                  ),
                }
              : tab
          ),
        }));
      },
      // onStatsChanged
      (stats) => setRefreshStats(stats),
    );

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [ready]);

  const toggleEngine = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPaused()) {
      engine.resume();
    } else if (engine.isRunning()) {
      engine.pause();
    } else {
      engine.start();
    }
  };

  return (
    <AuthGuard>
      <div
        className="defog-container min-h-screen relative"
        style={{
          '--color-bg-primary': '#1a1a1a',
          '--color-bg-secondary': '#2d2d2d',
          '--color-bg-tertiary': '#3d3d3d',
          '--color-positive': '#00ff88',
          '--color-negative': '#ff3366',
          '--color-warning': '#ffaa00',
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
        } as React.CSSProperties}
      >
        {/* Sync notification toast */}
        {syncMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-green-600/90 text-white text-sm font-medium shadow-lg backdrop-blur-sm">
            {syncMessage}
          </div>
        )}

        {/* Smart Refresh indicator — bottom-right floating */}
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={() => setShowRefreshPanel(!showRefreshPanel)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all shadow-lg"
            style={{
              backgroundColor: '#2a2a2a',
              borderColor: '#3d3d3d',
              borderWidth: 1,
              color: refreshStats?.isRunning
                ? refreshStats.isPaused ? '#ffaa00' : '#00ff88'
                : '#666',
            }}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                refreshStats?.isRunning && !refreshStats.isPaused
                  ? 'animate-pulse'
                  : ''
              }`}
              style={{
                backgroundColor: refreshStats?.isRunning
                  ? refreshStats.isPaused ? '#ffaa00' : '#00ff88'
                  : '#444',
              }}
            />
            {refreshStats?.isRunning
              ? refreshStats.isPaused
                ? 'Refresh paused'
                : `Refreshing ${refreshStats.currentIndex}/${refreshStats.queueLength}`
              : 'Refresh off'}
            {refreshStats && refreshStats.totalSuccesses > 0 && (
              <span style={{ color: '#555' }}>
                ({refreshStats.totalSuccesses} done)
              </span>
            )}
          </button>

          {/* Expanded panel */}
          {showRefreshPanel && refreshStats && (
            <div
              className="absolute bottom-12 right-0 w-80 rounded-lg p-4 shadow-xl"
              style={{ backgroundColor: '#222', border: '1px solid #3d3d3d' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white">Smart Refresh</span>
                <button
                  onClick={toggleEngine}
                  className="px-2.5 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: refreshStats.isRunning && !refreshStats.isPaused
                      ? '#332200' : '#003322',
                    color: refreshStats.isRunning && !refreshStats.isPaused
                      ? '#ffaa00' : '#00ff88',
                  }}
                >
                  {refreshStats.isRunning
                    ? refreshStats.isPaused ? 'Resume' : 'Pause'
                    : 'Start'}
                </button>
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] mb-1" style={{ color: '#888' }}>
                  <span>Progress</span>
                  <span>{refreshStats.currentIndex} / {refreshStats.queueLength}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#333' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: refreshStats.queueLength > 0
                        ? `${(refreshStats.currentIndex / refreshStats.queueLength) * 100}%`
                        : '0%',
                      backgroundColor: '#00ff88',
                    }}
                  />
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 rounded" style={{ backgroundColor: '#1a1a1a' }}>
                  <div className="text-lg font-bold" style={{ color: '#00ff88' }}>
                    {refreshStats.totalSuccesses}
                  </div>
                  <div className="text-[9px]" style={{ color: '#666' }}>Success</div>
                </div>
                <div className="text-center p-2 rounded" style={{ backgroundColor: '#1a1a1a' }}>
                  <div className="text-lg font-bold" style={{ color: '#ff3366' }}>
                    {refreshStats.totalFailures}
                  </div>
                  <div className="text-[9px]" style={{ color: '#666' }}>Failed</div>
                </div>
                <div className="text-center p-2 rounded" style={{ backgroundColor: '#1a1a1a' }}>
                  <div className="text-lg font-bold" style={{ color: '#888' }}>
                    {refreshStats.totalAttempts}
                  </div>
                  <div className="text-[9px]" style={{ color: '#666' }}>Attempts</div>
                </div>
              </div>

              {/* Provider breakdown */}
              {Object.keys(refreshStats.providerStats).length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] mb-1.5" style={{ color: '#666' }}>Provider stats</div>
                  {Object.entries(refreshStats.providerStats).map(([provider, ps]) => (
                    <div
                      key={provider}
                      className="flex items-center justify-between py-1 text-xs"
                      style={{ borderBottom: '1px solid #2a2a2a' }}
                    >
                      <span className="font-mono" style={{ color: '#aaa' }}>{provider}</span>
                      <span>
                        <span style={{ color: '#00ff88' }}>{ps.successes}</span>
                        <span style={{ color: '#444' }}> / </span>
                        <span style={{ color: '#ff3366' }}>{ps.failures}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Last action */}
              {refreshStats.lastRefreshedTicker && (
                <div className="text-[10px]" style={{ color: '#555' }}>
                  Last: <span style={{ color: '#888' }}>{refreshStats.lastRefreshedTicker}</span>
                  {refreshStats.lastRefreshedProvider && (
                    <span> via <span style={{ color: '#666' }}>{refreshStats.lastRefreshedProvider}</span></span>
                  )}
                </div>
              )}
              {refreshStats.lastError && (
                <div className="text-[10px] mt-1" style={{ color: '#ff3366' }}>
                  {refreshStats.lastError}
                </div>
              )}

              {/* Reset button */}
              <button
                onClick={() => {
                  engineRef.current?.resetAll();
                }}
                className="mt-3 w-full py-1.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: '#2a1a1a', color: '#ff6666' }}
              >
                Reset all learning data
              </button>
            </div>
          )}
        </div>

        {isLoading || !ready ? (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-gray-400">Loading Defog...</div>
          </div>
        ) : (
          <Dashboard />
        )}
      </div>
    </AuthGuard>
  );
}
