'use client';

import { useState, useEffect, useCallback } from 'react';

interface ApiStatusData {
  yahoo: 'ok' | 'limited' | 'down' | 'unknown';
  lastCheck: string | null;
  rateLimit: {
    remaining: number;
    resetTime: string | null;
  } | null;
}

export default function ApiStatus() {
  const [status, setStatus] = useState<ApiStatusData>({
    yahoo: 'unknown',
    lastCheck: null,
    rateLimit: null,
  });
  const [expanded, setExpanded] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        const data = await response.json();
        setStatus({
          yahoo: data.yahoo_finance_status || 'unknown',
          lastCheck: new Date().toISOString(),
          rateLimit: data.rate_limit || null,
        });
      }
    } catch {
      setStatus((prev) => ({ ...prev, yahoo: 'down' }));
    }
  }, []);

  useEffect(() => {
    checkStatus();
    // Check every 5 minutes
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  function getStatusColor(status: string) {
    switch (status) {
      case 'ok':
        return 'bg-green-500';
      case 'limited':
        return 'bg-yellow-500';
      case 'down':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  }

  function getStatusText(status: string) {
    switch (status) {
      case 'ok':
        return 'API Ready';
      case 'limited':
        return 'Rate Limited';
      case 'down':
        return 'API Down';
      default:
        return 'Checking...';
    }
  }

  function formatTime(isoString: string | null) {
    if (!isoString) return 'Never';
    return new Date(isoString).toLocaleTimeString();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:opacity-80 transition-opacity"
      >
        <span className={`w-2 h-2 rounded-full ${getStatusColor(status.yahoo)} animate-pulse`} />
        <span className="text-xs text-[var(--text-secondary)]">
          {getStatusText(status.yahoo)}
        </span>
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setExpanded(false)} />
          <div className="absolute right-0 top-full mt-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-xl z-20 p-4 min-w-[220px]">
            <h4 className="font-medium text-[var(--text-primary)] mb-3">API Status</h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Yahoo Finance</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  status.yahoo === 'ok' ? 'bg-green-500/20 text-green-400' :
                  status.yahoo === 'limited' ? 'bg-yellow-500/20 text-yellow-400' :
                  status.yahoo === 'down' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {status.yahoo.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Last Check</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatTime(status.lastCheck)}
                </span>
              </div>

              {status.rateLimit && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">Requests Left</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {status.rateLimit.remaining}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); checkStatus(); }}
              className="mt-3 w-full px-3 py-1.5 text-xs bg-[var(--accent-primary)] text-white rounded hover:opacity-80"
            >
              Refresh Status
            </button>
          </div>
        </>
      )}
    </div>
  );
}
