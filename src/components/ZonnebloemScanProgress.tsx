'use client';

import { useEffect, useState, useCallback } from 'react';

interface ZBScanProgressData {
  running: boolean;
  scan: {
    id: string;
    status: string;
    marketsScanned: string[];
    candidatesFound: number;
    stocksDeepScanned: number;
    stocksMatched: number;
    newStocksFound: number;
    startedAt: string;
    completedAt: string | null;
    durationSeconds: number | null;
    errors: string[];
  } | null;
}

interface Props {
  scanTriggered: boolean;
  onScanComplete: () => void;
}

export default function ZonnebloemScanProgress({ scanTriggered, onScanComplete }: Props) {
  const [data, setData] = useState<ZBScanProgressData | null>(null);
  const [polling, setPolling] = useState(false);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/zonnebloem/scan/progress');
      if (res.ok) {
        const json = await res.json() as ZBScanProgressData;
        setData(json);
        return json;
      }
    } catch { /* silent */ }
    return null;
  }, []);

  useEffect(() => {
    if (!scanTriggered && !polling) return;

    if (scanTriggered && !polling) {
      setPolling(true);
    }

    const interval = setInterval(async () => {
      const result = await fetchProgress();
      if (result && !result.running) {
        setPolling(false);
        clearInterval(interval);
        onScanComplete();
      }
    }, 3000);

    fetchProgress();

    return () => clearInterval(interval);
  }, [scanTriggered, polling, fetchProgress, onScanComplete]);

  if (!data?.scan) return null;
  if (!data.running && !scanTriggered) return null;

  const scan = data.scan;
  const isRunning = data.running;
  const elapsed = scan.startedAt
    ? Math.round((Date.now() - new Date(scan.startedAt).getTime()) / 1000)
    : 0;

  return (
    <div className={`rounded-lg border p-4 mb-4 ${
      isRunning
        ? 'bg-purple-900/20 border-purple-500/30'
        : scan.status === 'completed'
          ? 'bg-green-900/20 border-green-500/30'
          : scan.status === 'failed'
            ? 'bg-red-900/20 border-red-500/30'
            : 'bg-yellow-900/20 border-yellow-500/30'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isRunning && <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />}
          <span className="font-medium text-sm">
            {isRunning
              ? 'Zonnebloem scan in progress...'
              : scan.status === 'completed'
                ? 'Zonnebloem scan completed'
                : scan.status === 'failed'
                  ? 'Zonnebloem scan failed'
                  : 'Zonnebloem scan finished with warnings'}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          {isRunning ? `${elapsed}s elapsed` : scan.durationSeconds ? `${scan.durationSeconds}s` : ''}
        </span>
      </div>

      {isRunning && scan.stocksDeepScanned > 0 && (
        <div className="mb-2">
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min((scan.stocksDeepScanned / Math.max(scan.candidatesFound, 50)) * 100, 95)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-6 text-xs text-slate-400 flex-wrap">
        <span>Markets: <span className="text-slate-200 font-mono">{scan.marketsScanned.length}</span></span>
        <span>Candidates: <span className="text-slate-200 font-mono">{scan.candidatesFound}</span></span>
        <span>Deep scanned: <span className="text-slate-200 font-mono">{scan.stocksDeepScanned}</span></span>
        <span>Matches: <span className="text-green-400 font-mono">{scan.stocksMatched}</span></span>
        <span>New: <span className="text-purple-400 font-mono">{scan.newStocksFound}</span></span>
        {scan.errors.length > 0 && (
          <span>Errors: <span className="text-yellow-400 font-mono">{scan.errors.length}</span></span>
        )}
      </div>
    </div>
  );
}
