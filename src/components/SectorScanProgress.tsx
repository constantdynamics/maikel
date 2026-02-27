'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { SectorScannerType } from '@/lib/types';

interface SectorScanProgressData {
  running: boolean;
  scan: {
    id: string;
    status: string;
    scannerType: SectorScannerType;
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
  scannerType: SectorScannerType;
  label: string;
  color: string; // tailwind color class prefix, e.g., 'emerald' or 'amber'
  scanTriggered: boolean;
  onScanComplete: () => void;
}

export default function SectorScanProgress({ scannerType, label, color, scanTriggered, onScanComplete }: Props) {
  const [data, setData] = useState<SectorScanProgressData | null>(null);
  const [polling, setPolling] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const lastScanId = useRef<string | null>(null);
  const preTriggerScanId = useRef<string | null>(null);
  const scanTriggeredRef = useRef(false);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/sector/scan/progress?type=${scannerType}`);
      if (res.ok) {
        const json = await res.json() as SectorScanProgressData;
        setData(json);
        return json;
      }
    } catch { /* silent */ }
    return null;
  }, [scannerType]);

  // Check for running scan on mount
  useEffect(() => {
    let cancelled = false;
    async function checkOnMount() {
      const result = await fetchProgress();
      if (cancelled) return;
      if (result?.running) {
        setPolling(true);
        setShowResult(true);
      } else if (result?.scan?.completedAt) {
        const completedTime = new Date(result.scan.completedAt).getTime();
        if (completedTime > Date.now() - 5 * 60 * 1000) {
          setShowResult(true);
        }
      }
    }
    checkOnMount();
    return () => { cancelled = true; };
  }, [fetchProgress]);

  useEffect(() => {
    if (scanTriggered && !scanTriggeredRef.current) {
      preTriggerScanId.current = data?.scan?.id || null;
    }
    scanTriggeredRef.current = scanTriggered;
  }, [scanTriggered, data?.scan?.id]);

  useEffect(() => {
    if (!scanTriggered && !polling) return;
    if (scanTriggered && !polling) {
      setPolling(true);
      setShowResult(true);
    }

    const interval = setInterval(async () => {
      const result = await fetchProgress();
      if (result && !result.running) {
        const currentId = result.scan?.id;
        const isStaleResult = currentId === preTriggerScanId.current;
        if (!isStaleResult) {
          setPolling(false);
          clearInterval(interval);
          onScanComplete();
          setShowResult(true);
        }
      }
    }, 3000);

    fetchProgress();
    return () => clearInterval(interval);
  }, [scanTriggered, polling, fetchProgress, onScanComplete]);

  useEffect(() => {
    if (data?.scan?.id && data.scan.id !== lastScanId.current) {
      lastScanId.current = data.scan.id;
      setShowResult(true);
    }
  }, [data?.scan?.id]);

  if (!data?.scan) return null;
  if (!showResult && !data.running && !scanTriggered) return null;

  const scan = data.scan;
  const isRunning = data.running;
  const elapsed = scan.startedAt
    ? Math.round((Date.now() - new Date(scan.startedAt).getTime()) / 1000)
    : 0;

  const colorClasses = {
    emerald: { bg: 'bg-emerald-900/20', border: 'border-emerald-500/30', dot: 'bg-emerald-400', bar: 'bg-emerald-500', new: 'text-emerald-400' },
    amber: { bg: 'bg-amber-900/20', border: 'border-amber-500/30', dot: 'bg-amber-400', bar: 'bg-amber-500', new: 'text-amber-400' },
  }[color] || { bg: 'bg-blue-900/20', border: 'border-blue-500/30', dot: 'bg-blue-400', bar: 'bg-blue-500', new: 'text-blue-400' };

  return (
    <div className={`rounded-lg border p-4 mb-4 ${
      isRunning
        ? `${colorClasses.bg} ${colorClasses.border}`
        : scan.status === 'completed'
          ? 'bg-green-900/20 border-green-500/30'
          : scan.status === 'failed'
            ? 'bg-red-900/20 border-red-500/30'
            : 'bg-yellow-900/20 border-yellow-500/30'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isRunning && <div className={`w-2 h-2 rounded-full ${colorClasses.dot} animate-pulse`} />}
          <span className="font-medium text-sm">
            {isRunning
              ? `${label} scan in progress...`
              : scan.status === 'completed'
                ? `${label} scan completed`
                : scan.status === 'failed'
                  ? `${label} scan failed`
                  : scan.status === 'partial'
                    ? `${label} scan completed (partial - will continue next run)`
                    : `${label} scan finished with warnings`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {isRunning ? `${elapsed}s elapsed` : scan.durationSeconds ? `${scan.durationSeconds}s` : ''}
          </span>
          {!isRunning && (
            <button
              onClick={() => setShowResult(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              dismiss
            </button>
          )}
        </div>
      </div>

      {isRunning && scan.stocksDeepScanned > 0 && (
        <div className="mb-2">
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className={`${colorClasses.bar} h-1.5 rounded-full transition-all duration-500`}
              style={{ width: `${Math.min((scan.stocksDeepScanned / Math.max(scan.candidatesFound, 50)) * 100, 95)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-6 text-xs text-slate-400 flex-wrap">
        <span>Candidates: <span className="text-slate-200 font-mono">{scan.candidatesFound}</span></span>
        <span>Deep scanned: <span className="text-slate-200 font-mono">{scan.stocksDeepScanned}</span></span>
        <span>Matches: <span className="text-green-400 font-mono">{scan.stocksMatched}</span></span>
        <span>New: <span className={`font-mono ${colorClasses.new}`}>{scan.newStocksFound}</span></span>
        {scan.errors.length > 0 && (
          <span>Errors: <span className="text-yellow-400 font-mono">{scan.errors.length}</span></span>
        )}
      </div>
    </div>
  );
}
