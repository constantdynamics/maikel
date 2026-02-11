'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ZonnebloemStock } from '@/lib/types';
import { SpikeDotDisplay } from './ZonnebloemTable';

interface ScanStatus {
  running: boolean;
  scan: {
    status: string;
    candidatesFound: number;
    stocksDeepScanned: number;
    stocksMatched: number;
    newStocksFound: number;
    durationSeconds: number | null;
    startedAt: string;
    completedAt: string | null;
  } | null;
}

interface UnderwaterModeProps {
  stocks: ZonnebloemStock[];
  onExit: () => void;
  autoScanActive: boolean;
  autoScanNext: Date | null;
  scanRunning: boolean;
  onRefreshStocks: () => void;
}

export default function UnderwaterMode({ stocks, onExit, autoScanActive, autoScanNext, scanRunning, onRefreshStocks }: UnderwaterModeProps) {
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [completedScans, setCompletedScans] = useState(0);
  const [lastScanId, setLastScanId] = useState<string | null>(null);

  // Poll scan progress
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/zonnebloem/scan/progress');
      if (res.ok) {
        const json = await res.json();
        setScanStatus(json);
        return json as ScanStatus;
      }
    } catch { /* silent */ }
    return null;
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(async () => {
      const result = await fetchStatus();
      // When a scan just completed, refresh the stock list
      if (result?.scan?.completedAt && result.scan.completedAt !== lastScanId) {
        setLastScanId(result.scan.completedAt);
        setCompletedScans(prev => prev + 1);
        onRefreshStocks();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchStatus, lastScanId, onRefreshStocks]);

  // Split stocks into 8 columns
  const colCount = 8;
  const columns: ZonnebloemStock[][] = Array.from({ length: colCount }, () => []);
  stocks.forEach((stock, i) => {
    columns[i % colCount].push(stock);
  });

  const isRunning = scanStatus?.running || scanRunning;
  const scan = scanStatus?.scan;
  const elapsed = scan?.startedAt && isRunning
    ? Math.round((Date.now() - new Date(scan.startedAt).getTime()) / 1000)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto"
      style={{ backgroundColor: '#1a1c1e' }}
    >
      {/* Toggle button top-left */}
      <button
        onClick={onExit}
        className="fixed top-4 left-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors bg-[#2a2d31] text-[#8a8d91] hover:text-white hover:bg-[#3a3d41] border border-[#3a3d41]"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
        Ground Mode
      </button>

      {/* Scan status indicator top-right */}
      <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-1">
        {/* Current scan state */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-[#2a2d31] border border-[#3a3d41]">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isRunning ? 'bg-purple-400 animate-pulse' : autoScanActive ? 'bg-green-500' : 'bg-[#4a4d52]'
            }`}
          />
          <span style={{ color: isRunning ? '#c084fc' : '#6a6d72' }}>
            {isRunning
              ? `Scanning${elapsed ? ` (${elapsed}s)` : ''}...`
              : autoScanActive
                ? 'Idle'
                : 'Auto-scan off'}
          </span>
        </div>

        {/* Live stats during scan */}
        {isRunning && scan && (
          <div className="flex items-center gap-3 px-3 py-1 rounded text-[10px] bg-[#2a2d31] border border-[#3a3d41]" style={{ color: '#5a5d62' }}>
            <span>Candidates: <span style={{ color: '#7a7d82' }}>{scan.candidatesFound}</span></span>
            <span>Scanned: <span style={{ color: '#7a7d82' }}>{scan.stocksDeepScanned}</span></span>
            <span>Matches: <span style={{ color: '#22c55e' }}>{scan.stocksMatched}</span></span>
            <span>New: <span style={{ color: '#c084fc' }}>{scan.newStocksFound}</span></span>
          </div>
        )}

        {/* Completed scans counter + next scan time */}
        <div className="flex items-center gap-3 px-3 py-1 rounded text-[10px] bg-[#2a2d31] border border-[#3a3d41]" style={{ color: '#4a4d52' }}>
          {completedScans > 0 && (
            <span>Completed: <span style={{ color: '#6a6d72' }}>{completedScans}</span></span>
          )}
          {autoScanActive && autoScanNext && !isRunning && (
            <span>Next: <span style={{ color: '#6a6d72' }}>{autoScanNext.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
          )}
          {!autoScanActive && (
            <span>Auto-scan is off</span>
          )}
        </div>
      </div>

      {/* Stock count */}
      <div className="pt-16 pb-4 px-6">
        <span
          className="font-mono font-bold tracking-tight"
          style={{ color: '#4a4d52', fontSize: '4rem', lineHeight: 1 }}
        >
          {stocks.length}
        </span>
        <span className="ml-3 text-sm" style={{ color: '#3a3d41' }}>
          stocks
        </span>
      </div>

      {/* 8-column grid */}
      <div className="px-6 pb-8 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-x-4 gap-y-0">
        {columns.map((col, colIdx) => (
          <div key={colIdx}>
            {col.map((stock) => (
              <div
                key={stock.id}
                className="flex items-center gap-1.5 py-1 border-b"
                style={{ borderColor: '#252729' }}
              >
                <span
                  className="font-mono text-xs font-medium truncate"
                  style={{ color: '#7a7d82' }}
                >
                  {stock.ticker}
                </span>
                <SpikeDotDisplay
                  spikeCount={stock.spike_count}
                  highestSpikePct={stock.highest_spike_pct}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
