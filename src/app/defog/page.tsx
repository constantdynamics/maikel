'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { useStore } from '@/lib/defog/store';
import { Dashboard } from '@/components/defog/Dashboard';

export default function DefogPage() {
  const { setAuthenticated, setLoading, isLoading } = useStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Since we're already authenticated via Maikel's AuthGuard,
    // mark Defog store as authenticated and skip its own Auth screen
    setAuthenticated(true);
    setLoading(false);

    // Set a dummy session password so Defog doesn't ask for one
    if (typeof window !== 'undefined') {
      if (!sessionStorage.getItem('session-password')) {
        sessionStorage.setItem('session-password', 'maikel-integrated');
      }
    }
    setReady(true);
  }, [setAuthenticated, setLoading]);

  return (
    <AuthGuard>
      <div
        className="defog-container min-h-screen"
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
