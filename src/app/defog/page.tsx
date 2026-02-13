'use client';

import { useEffect, useState, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { useStore } from '@/lib/defog/store';
import { Dashboard } from '@/components/defog/Dashboard';
import { syncScannerToDefog } from '@/lib/defog/scannerSync';

export default function DefogPage() {
  const { setAuthenticated, setLoading, isLoading, tabs } = useStore();
  const [ready, setReady] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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
    if (ready) {
      runSync();
    }
  }, [ready, runSync]);

  // Re-sync every 60 seconds to pick up new scan results
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(runSync, 60_000);
    return () => clearInterval(interval);
  }, [ready, runSync]);

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
