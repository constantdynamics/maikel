'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface ScanProgressData {
  running: boolean;
  scan: {
    id: string;
    status: string;
    stocksScanned: number;
    stocksFound: number;
    startedAt: string;
    completedAt: string | null;
    durationSeconds: number | null;
    errors: string[];
  } | null;
}

interface ScanProgressProps {
  /** Whether a scan was triggered from the UI */
  scanTriggered: boolean;
  /** Called when scan finishes so the parent can refresh data */
  onScanComplete: () => void;
}

export default function ScanProgress({ scanTriggered, onScanComplete }: ScanProgressProps) {
  const [data, setData] = useState<ScanProgressData | null>(null);
  const [polling, setPolling] = useState(false);
  // Track the scan ID that was active BEFORE a new scan was triggered
  // so we don't mistake the previous completed scan for the current one
  const preTriggerScanId = useRef<string | null>(null);
  const scanTriggeredRef = useRef(false);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/scan/progress');
      if (res.ok) {
        const json = await res.json() as ScanProgressData;
        setData(json);
        return json;
      }
    } catch {
      // Silently fail polling
    }
    return null;
  }, []);

  // Capture the current scan ID when a new scan is triggered
  useEffect(() => {
    if (scanTriggered && !scanTriggeredRef.current) {
      // New scan was just triggered - remember the current scan ID
      // so we can distinguish it from the new scan
      preTriggerScanId.current = data?.scan?.id || null;
    }
    scanTriggeredRef.current = scanTriggered;
  }, [scanTriggered, data?.scan?.id]);

  // Start polling when scan is triggered
  useEffect(() => {
    if (!scanTriggered && !polling) return;

    if (scanTriggered && !polling) {
      setPolling(true);
    }

    const interval = setInterval(async () => {
      const result = await fetchProgress();
      if (result && !result.running) {
        // Guard against detecting the PREVIOUS completed scan:
        // Only fire onScanComplete if we see a DIFFERENT scan ID than
        // the one that was active before the trigger, OR if we saw
        // the current scan running at some point (different ID means new scan completed)
        const currentId = result.scan?.id;
        const isStaleResult = currentId === preTriggerScanId.current;

        if (!isStaleResult) {
          setPolling(false);
          clearInterval(interval);
          onScanComplete();
        }
        // If it's a stale result, keep polling - the new scan hasn't started yet
      }
    }, 3000);

    // Initial fetch
    fetchProgress();

    return () => clearInterval(interval);
  }, [scanTriggered, polling, fetchProgress, onScanComplete]);

  // Don't show anything if no scan data or not active
  if (!data?.scan) return null;
  if (!data.running && !scanTriggered) return null;

  const scan = data.scan;
  const isRunning = data.running;
  const elapsed = scan.startedAt
    ? Math.round((Date.now() - new Date(scan.startedAt).getTime()) / 1000)
    : 0;

  return (
    <div
      className={`rounded-lg border p-4 mb-4 ${
        isRunning
          ? 'bg-blue-900/20 border-blue-500/30'
          : scan.status === 'completed'
            ? 'bg-green-900/20 border-green-500/30'
            : scan.status === 'failed'
              ? 'bg-red-900/20 border-red-500/30'
              : 'bg-yellow-900/20 border-yellow-500/30'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          )}
          <span className="font-medium text-sm">
            {isRunning
              ? 'Scan in progress...'
              : scan.status === 'completed'
                ? 'Scan completed'
                : scan.status === 'failed'
                  ? 'Scan failed'
                  : 'Scan finished with warnings'}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          {isRunning
            ? `${elapsed}s elapsed`
            : scan.durationSeconds
              ? `${scan.durationSeconds}s`
              : ''}
        </span>
      </div>

      {/* Progress bar */}
      {isRunning && scan.stocksScanned > 0 && (
        <div className="mb-2">
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min((scan.stocksScanned / Math.max(scan.stocksScanned + 10, 50)) * 100, 95)}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-6 text-xs text-slate-400">
        <span>
          Scanned: <span className="text-slate-200 font-mono">{scan.stocksScanned}</span>
        </span>
        <span>
          Matches: <span className="text-green-400 font-mono">{scan.stocksFound}</span>
        </span>
        {scan.errors.length > 0 && (
          <span>
            Errors: <span className="text-yellow-400 font-mono">{scan.errors.length}</span>
          </span>
        )}
      </div>
    </div>
  );
}
