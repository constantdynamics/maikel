'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ZonnebloemStock, Stock } from '@/lib/types';
import { SpikeDotDisplay } from './ZonnebloemTable';
import packageJson from '../../package.json';

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

interface KuifjeScanStatus {
  running: boolean;
  scan: {
    status: string;
    stocksScanned: number;
    stocksFound: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
}

interface UnderwaterModeProps {
  zbStocks: ZonnebloemStock[];
  kuifjeStocks: Stock[];
  onExit: () => void;
  // Zonnebloem scan
  autoScanActive: boolean;
  autoScanNext: Date | null;
  scanRunning: boolean;
  onRefreshStocks: () => void;
  // Kuifje scan
  kuifjeAutoScanActive: boolean;
  kuifjeAutoScanNext: Date | null;
  kuifjeScanRunning: boolean;
  onRefreshKuifjeStocks: () => void;
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

export default function UnderwaterMode({ zbStocks, kuifjeStocks, onExit, autoScanActive, autoScanNext, scanRunning, onRefreshStocks, kuifjeAutoScanActive, kuifjeAutoScanNext, kuifjeScanRunning, onRefreshKuifjeStocks }: UnderwaterModeProps) {
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [kuifjeScanStatus, setKuifjeScanStatus] = useState<KuifjeScanStatus | null>(null);
  const [completedScans, setCompletedScans] = useState(0);
  const [completedKuifjeScans, setCompletedKuifjeScans] = useState(0);
  const [lastScanId, setLastScanId] = useState<string | null>(null);
  const [lastKuifjeScanId, setLastKuifjeScanId] = useState<string | null>(null);

  // Font size for the big total number — persists in localStorage
  const FONT_SIZES = ['1.5rem', '2.5rem', '4rem', '6rem'];
  const [fontSizeIdx, setFontSizeIdx] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('underwater-font-size');
      if (saved) return Math.min(Number(saved), FONT_SIZES.length - 1);
    }
    return 1; // default 2.5rem
  });
  const cycleFontSize = () => {
    const next = (fontSizeIdx + 1) % FONT_SIZES.length;
    setFontSizeIdx(next);
    localStorage.setItem('underwater-font-size', String(next));
  };

  // Set browser tab title to K&Z in underwater mode
  useEffect(() => {
    const prev = document.title;
    document.title = 'K&Z';
    return () => { document.title = prev; };
  }, []);

  // Poll Zonnebloem scan progress
  const fetchZbStatus = useCallback(async () => {
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

  // Poll Kuifje scan progress
  const fetchKuifjeStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scan/progress');
      if (res.ok) {
        const json = await res.json();
        setKuifjeScanStatus(json);
        return json as KuifjeScanStatus;
      }
    } catch { /* silent */ }
    return null;
  }, []);

  useEffect(() => {
    fetchZbStatus();
    fetchKuifjeStatus();
    const timer = setInterval(async () => {
      const zbResult = await fetchZbStatus();
      if (zbResult?.scan?.completedAt && zbResult.scan.completedAt !== lastScanId) {
        setLastScanId(zbResult.scan.completedAt);
        setCompletedScans(prev => prev + 1);
        onRefreshStocks();
      }

      const kResult = await fetchKuifjeStatus();
      if (kResult?.scan?.completedAt && kResult.scan.completedAt !== lastKuifjeScanId) {
        setLastKuifjeScanId(kResult.scan.completedAt);
        setCompletedKuifjeScans(prev => prev + 1);
        onRefreshKuifjeStocks();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchZbStatus, fetchKuifjeStatus, lastScanId, lastKuifjeScanId, onRefreshStocks, onRefreshKuifjeStocks]);

  const zbIsRunning = scanStatus?.running || scanRunning;
  const zbScan = scanStatus?.scan;
  const zbElapsed = zbScan?.startedAt && zbIsRunning
    ? Math.round((Date.now() - new Date(zbScan.startedAt).getTime()) / 1000)
    : null;

  const kIsRunning = kuifjeScanStatus?.running || kuifjeScanRunning;
  const kScan = kuifjeScanStatus?.scan;
  const kElapsed = kScan?.startedAt && kIsRunning
    ? Math.round((Date.now() - new Date(kScan.startedAt).getTime()) / 1000)
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

      {/* Font size slider */}
      <div className="fixed top-4 left-36 z-50 flex items-center gap-2 px-3 py-1.5 rounded bg-[#2a2d31] border border-[#3a3d41]">
        <input
          type="range"
          min={0}
          max={FONT_SIZES.length - 1}
          value={fontSizeIdx}
          onChange={(e) => {
            const val = Number(e.target.value);
            setFontSizeIdx(val);
            localStorage.setItem('underwater-font-size', String(val));
          }}
          className="w-16 h-1 accent-purple-500 cursor-pointer"
          style={{ WebkitAppearance: 'none', appearance: 'none', background: '#3a3d41', borderRadius: 2 }}
        />
      </div>

      {/* Scan status indicators top-right — both scanners */}
      <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-1.5">
        {/* Zonnebloem status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-[#2a2d31] border border-[#3a3d41]">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              zbIsRunning ? 'bg-purple-400 animate-pulse' : autoScanActive ? 'bg-green-500' : 'bg-[#4a4d52]'
            }`}
          />
          <span style={{ color: zbIsRunning ? '#c084fc' : '#6a6d72' }}>
            {zbIsRunning
              ? `Zonnebloem${zbElapsed ? ` (${zbElapsed}s)` : ''}...`
              : autoScanActive
                ? 'Zonnebloem waiting...'
                : 'Zonnebloem off'}
          </span>
          {zbIsRunning && zbScan && (
            <span className="text-[10px]" style={{ color: '#5a5d62' }}>
              <span style={{ color: '#7a7d82' }}>{zbScan.stocksDeepScanned}</span>
              {' / '}
              <span style={{ color: '#22c55e' }}>{zbScan.stocksMatched}</span>
            </span>
          )}
          {!zbIsRunning && completedScans > 0 && (
            <span className="text-[10px]" style={{ color: '#4a4d52' }}>#{completedScans}</span>
          )}
        </div>

        {/* Kuifje status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-[#2a2d31] border border-[#3a3d41]">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              kIsRunning ? 'bg-green-400 animate-pulse' : kuifjeAutoScanActive ? 'bg-green-500' : 'bg-[#4a4d52]'
            }`}
          />
          <span style={{ color: kIsRunning ? '#4ade80' : '#6a6d72' }}>
            {kIsRunning
              ? `Kuifje${kElapsed ? ` (${kElapsed}s)` : ''}...`
              : kuifjeAutoScanActive
                ? 'Kuifje waiting...'
                : 'Kuifje off'}
          </span>
          {kIsRunning && kScan && (
            <span className="text-[10px]" style={{ color: '#5a5d62' }}>
              <span style={{ color: '#7a7d82' }}>{kScan.stocksScanned}</span>
              {' / '}
              <span style={{ color: '#22c55e' }}>{kScan.stocksFound}</span>
            </span>
          )}
          {!kIsRunning && completedKuifjeScans > 0 && (
            <span className="text-[10px]" style={{ color: '#4a4d52' }}>#{completedKuifjeScans}</span>
          )}
        </div>

        {/* Next scan times */}
        <div className="flex items-center gap-3 px-3 py-1 rounded text-[10px] bg-[#2a2d31] border border-[#3a3d41]" style={{ color: '#4a4d52' }}>
          {autoScanActive && autoScanNext && !zbIsRunning && (
            <span>Z next: <span style={{ color: '#6a6d72' }}>{autoScanNext.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
          )}
          {kuifjeAutoScanActive && kuifjeAutoScanNext && !kIsRunning && (
            <span>K next: <span style={{ color: '#6a6d72' }}>{kuifjeAutoScanNext.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
          )}
          {!autoScanActive && !kuifjeAutoScanActive && (
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
              style={{ color: '#b0b3b8', fontSize: FONT_SIZES[fontSizeIdx], lineHeight: 1 }}
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
              style={{ color: '#b0b3b8', fontSize: FONT_SIZES[fontSizeIdx], lineHeight: 1 }}
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

      {/* Version — bottom-left */}
      <div className="fixed bottom-2 left-4 z-50 text-[10px] font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>
        v{packageJson.version}
      </div>
    </div>
  );
}
