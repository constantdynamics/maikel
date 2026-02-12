'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ZonnebloemStock, Stock } from '@/lib/types';
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
  zbStocks: ZonnebloemStock[];
  kuifjeStocks: Stock[];
  onExit: () => void;
  autoScanActive: boolean;
  autoScanNext: Date | null;
  scanRunning: boolean;
  onRefreshStocks: () => void;
}

// Kuifje growth dots — simplified inline renderer
function KuifjeDotsDisplay({ eventCount, highestGrowthPct }: { eventCount: number; highestGrowthPct: number | null }) {
  const count = Math.min(eventCount, 10);
  if (count === 0) return <span style={{ color: '#3a3d41' }}>-</span>;

  const avg = highestGrowthPct ? highestGrowthPct / Math.max(eventCount, 1) : 200;
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const est = i === 0 ? (highestGrowthPct || 200) : avg * (1 - i * 0.1);
    dots.push(est >= 500 ? '#22c55e' : est >= 300 ? '#facc15' : '#ffffff');
  }

  return (
    <div className="flex items-center gap-0.5">
      {dots.map((color, idx) => (
        <span
          key={idx}
          className="inline-block w-2 h-2 rounded-full border border-gray-600"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export default function UnderwaterMode({ zbStocks, kuifjeStocks, onExit, autoScanActive, autoScanNext, scanRunning, onRefreshStocks }: UnderwaterModeProps) {
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [completedScans, setCompletedScans] = useState(0);
  const [lastScanId, setLastScanId] = useState<string | null>(null);

  // Set browser tab title to K&Z in underwater mode
  useEffect(() => {
    const prev = document.title;
    document.title = 'K&Z';
    return () => { document.title = prev; };
  }, []);

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
      if (result?.scan?.completedAt && result.scan.completedAt !== lastScanId) {
        setLastScanId(result.scan.completedAt);
        setCompletedScans(prev => prev + 1);
        onRefreshStocks();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchStatus, lastScanId, onRefreshStocks]);

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
                ? 'Starting next scan...'
                : 'Auto-scan off'}
          </span>
        </div>

        {isRunning && scan && (
          <div className="flex items-center gap-3 px-3 py-1 rounded text-[10px] bg-[#2a2d31] border border-[#3a3d41]" style={{ color: '#5a5d62' }}>
            <span>Candidates: <span style={{ color: '#7a7d82' }}>{scan.candidatesFound}</span></span>
            <span>Scanned: <span style={{ color: '#7a7d82' }}>{scan.stocksDeepScanned}</span></span>
            <span>Matches: <span style={{ color: '#22c55e' }}>{scan.stocksMatched}</span></span>
            <span>New: <span style={{ color: '#c084fc' }}>{scan.newStocksFound}</span></span>
          </div>
        )}

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

      {/* Two-panel layout */}
      <div className="pt-14 px-4 pb-8 grid grid-cols-2 gap-4" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
        {/* LEFT: Zonnebloem */}
        <div>
          <div className="flex items-baseline gap-3 mb-3 px-2">
            <span
              className="font-mono font-bold tracking-tight"
              style={{ color: '#b0b3b8', fontSize: '2.5rem', lineHeight: 1 }}
            >
              {zbStocks.length}
            </span>
            <span className="text-xs font-medium" style={{ color: '#6a4d8a' }}>
              Prof. Zonnebloem
            </span>
          </div>
          <div style={{ columnCount: 4, columnGap: '0.75rem' }}>
            {zbStocks.map((stock) => (
              <div
                key={stock.id}
                className="flex items-center gap-1.5 py-1 border-b"
                style={{ borderColor: '#252729', breakInside: 'avoid' }}
              >
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' ' + (stock.company_name || '') + ' stock')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs font-medium truncate hover:text-white transition-colors"
                  style={{ color: '#7a7d82' }}
                >
                  {stock.ticker}
                </a>
                <SpikeDotDisplay
                  spikeCount={stock.spike_count}
                  highestSpikePct={stock.highest_spike_pct}
                />
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Kuifje */}
        <div>
          <div className="flex items-baseline gap-3 mb-3 px-2">
            <span
              className="font-mono font-bold tracking-tight"
              style={{ color: '#b0b3b8', fontSize: '2.5rem', lineHeight: 1 }}
            >
              {kuifjeStocks.length}
            </span>
            <span className="text-xs font-medium" style={{ color: '#3d6a4d' }}>
              Kuifje
            </span>
          </div>
          <div style={{ columnCount: 4, columnGap: '0.75rem' }}>
            {kuifjeStocks.map((stock) => (
              <div
                key={stock.id}
                className="flex items-center gap-1.5 py-1 border-b"
                style={{ borderColor: '#252729', breakInside: 'avoid' }}
              >
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' ' + (stock.company_name || '') + ' stock')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs font-medium truncate hover:text-white transition-colors"
                  style={{ color: '#7a7d82' }}
                >
                  {stock.ticker}
                </a>
                <KuifjeDotsDisplay
                  eventCount={stock.growth_event_count}
                  highestGrowthPct={stock.highest_growth_pct}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subtle divider line between panels */}
      <div
        className="fixed top-14 bottom-0 left-1/2 w-px"
        style={{ backgroundColor: '#2a2d31' }}
      />
    </div>
  );
}
