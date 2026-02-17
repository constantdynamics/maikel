'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScanProgress {
  running: boolean;
  scan?: {
    id: string;
    status: string;
    stocksScanned?: number;
    stocksFound?: number;
    candidatesFound?: number;
    stocksDeepScanned?: number;
    stocksMatched?: number;
    newStocksFound?: number;
    marketsScanned?: string[];
    startedAt: string;
    completedAt?: string;
    durationSeconds?: number;
    errors?: string[];
  };
}

interface ScanState {
  kuifje: ScanProgress | null;
  zonnebloem: ScanProgress | null;
}

type ScannerType = 'kuifje' | 'zonnebloem';

// ─── Scan Activator Widget ───────────────────────────────────────────────────

export default function ScanActivatorWidget() {
  const [scanState, setScanState] = useState<ScanState>({ kuifje: null, zonnebloem: null });
  const [triggering, setTriggering] = useState<ScannerType | null>(null);
  const [triggerResult, setTriggerResult] = useState<{ scanner: string; message: string; isError: boolean } | null>(null);
  const [secret, setSecret] = useState('');
  const [secretSaved, setSecretSaved] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved secret
  useEffect(() => {
    const saved = localStorage.getItem('widget-scan-secret');
    if (saved) {
      setSecret(saved);
      setSecretSaved(true);
    }
  }, []);

  const saveSecret = () => {
    localStorage.setItem('widget-scan-secret', secret);
    setSecretSaved(true);
  };

  // Poll progress
  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/widget/scan');
      if (!res.ok) return;
      const data = await res.json();
      setScanState({ kuifje: data.kuifje || null, zonnebloem: data.zonnebloem || null });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchProgress();
    pollRef.current = setInterval(fetchProgress, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchProgress]);

  // Speed up polling when a scan is running
  useEffect(() => {
    const isRunning = scanState.kuifje?.running || scanState.zonnebloem?.running;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchProgress, isRunning ? 3000 : 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [scanState.kuifje?.running, scanState.zonnebloem?.running, fetchProgress]);

  // Trigger scan
  const triggerScan = async (scanner: ScannerType) => {
    if (!secret) return;
    setTriggering(scanner);
    setTriggerResult(null);

    try {
      const res = await fetch('/api/widget/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanner, secret }),
      });
      const data = await res.json();

      if (!res.ok) {
        setTriggerResult({ scanner, message: data.error || `HTTP ${res.status}`, isError: true });
      } else {
        const found = scanner === 'kuifje'
          ? `${data.stocksFound ?? '?'} gevonden`
          : `${data.stocksMatched ?? data.newStocksFound ?? '?'} gevonden`;
        setTriggerResult({ scanner, message: `Scan klaar: ${found}`, isError: false });
        fetchProgress();
      }
    } catch (e) {
      setTriggerResult({ scanner, message: e instanceof Error ? e.message : 'Fout', isError: true });
    } finally {
      setTriggering(null);
    }
  };

  const handleOpenApp = () => { window.location.href = '/defog'; };

  return (
    <div className="scan-container">
      <div className="scan-header">
        <span className="scan-title">Scanner Control</span>
        <button onClick={handleOpenApp} className="scan-link-btn">Open App</button>
      </div>

      {/* Secret input */}
      {!secretSaved && (
        <div className="scan-secret-row">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Scan secret..."
            className="scan-secret-input"
          />
          <button onClick={saveSecret} className="scan-secret-save" disabled={!secret}>
            Opslaan
          </button>
        </div>
      )}

      {/* Scanner Cards */}
      <div className="scan-cards">
        <ScannerCard
          name="Kuifje"
          emoji="🐕"
          color="#22c55e"
          progress={scanState.kuifje}
          onTrigger={() => triggerScan('kuifje')}
          triggering={triggering === 'kuifje'}
          disabled={!secretSaved}
        />
        <ScannerCard
          name="Zonnebloem"
          emoji="🌻"
          color="#a855f7"
          progress={scanState.zonnebloem}
          onTrigger={() => triggerScan('zonnebloem')}
          triggering={triggering === 'zonnebloem'}
          disabled={!secretSaved}
        />
      </div>

      {/* Trigger result toast */}
      {triggerResult && (
        <div
          className="scan-toast"
          style={{ backgroundColor: triggerResult.isError ? '#331111' : '#113311', borderColor: triggerResult.isError ? '#ff3366' : '#00ff88' }}
        >
          <span style={{ color: triggerResult.isError ? '#ff6688' : '#88ffbb' }}>
            {triggerResult.scanner === 'kuifje' ? '🐕' : '🌻'} {triggerResult.message}
          </span>
          <button onClick={() => setTriggerResult(null)} className="scan-toast-close">&times;</button>
        </div>
      )}

      {/* Settings row */}
      {secretSaved && (
        <button
          onClick={() => { setSecretSaved(false); }}
          className="scan-change-secret"
        >
          Secret wijzigen
        </button>
      )}

      <style>{scanStyles}</style>
    </div>
  );
}

// ─── Scanner Card ────────────────────────────────────────────────────────────

function ScannerCard({
  name, emoji, color, progress, onTrigger, triggering, disabled,
}: {
  name: string;
  emoji: string;
  color: string;
  progress: ScanProgress | null;
  onTrigger: () => void;
  triggering: boolean;
  disabled: boolean;
}) {
  const scan = progress?.scan;
  const isRunning = progress?.running || triggering;
  const hasErrors = scan?.errors && scan.errors.length > 0;

  // Format time ago
  const timeAgo = scan?.completedAt
    ? formatTimeAgo(scan.completedAt)
    : scan?.startedAt
      ? formatTimeAgo(scan.startedAt)
      : null;

  return (
    <div className="scan-card" style={{ borderColor: `${color}33` }}>
      <div className="scan-card-header">
        <span className="scan-card-name">
          <span className="scan-card-emoji">{emoji}</span>
          {name}
        </span>
        <span
          className={`scan-card-status ${isRunning ? 'scan-pulse' : ''}`}
          style={{ backgroundColor: isRunning ? color : scan?.status === 'completed' ? '#333' : '#331111' }}
        >
          {isRunning ? 'Bezig...' : scan?.status === 'completed' ? 'Klaar' : scan?.status || 'Onbekend'}
        </span>
      </div>

      {/* Stats */}
      <div className="scan-card-stats">
        {name === 'Kuifje' && scan ? (
          <>
            <StatBlock label="Gescand" value={scan.stocksScanned ?? 0} color={color} />
            <StatBlock label="Gevonden" value={scan.stocksFound ?? 0} color="#00ff88" />
          </>
        ) : name === 'Zonnebloem' && scan ? (
          <>
            <StatBlock label="Kandidaten" value={scan.candidatesFound ?? 0} color={color} />
            <StatBlock label="Match" value={scan.stocksMatched ?? 0} color="#00ff88" />
            <StatBlock label="Nieuw" value={scan.newStocksFound ?? 0} color="#ffcc00" />
          </>
        ) : (
          <span className="scan-card-empty">Geen data</span>
        )}
      </div>

      {/* Duration + errors */}
      <div className="scan-card-meta">
        {timeAgo && <span className="scan-card-time">{timeAgo}</span>}
        {scan?.durationSeconds != null && (
          <span className="scan-card-duration">{Math.round(scan.durationSeconds)}s</span>
        )}
        {hasErrors && (
          <span className="scan-card-errors">{scan!.errors!.length} fouten</span>
        )}
      </div>

      {/* Trigger button */}
      <button
        onClick={onTrigger}
        disabled={disabled || isRunning}
        className="scan-card-trigger"
        style={{
          backgroundColor: isRunning ? '#333' : `${color}22`,
          color: isRunning ? '#666' : color,
          borderColor: isRunning ? '#444' : `${color}44`,
        }}
      >
        {isRunning ? (
          <>
            <span className="scan-spinner" style={{ borderTopColor: color }} />
            Bezig...
          </>
        ) : (
          <>
            <svg className="scan-play-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Start Scan
          </>
        )}
      </button>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="scan-stat">
      <span className="scan-stat-value" style={{ color }}>{value}</span>
      <span className="scan-stat-label">{label}</span>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Zojuist';
  if (mins < 60) return `${mins}m geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}u geleden`;
  const days = Math.floor(hours / 24);
  return `${days}d geleden`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const scanStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .scan-container {
    background: #1a1a1a;
    color: #ffffff;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    gap: 10px;
  }

  .scan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .scan-title {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
  }

  .scan-link-btn {
    background: #2d2d2d;
    color: #88bbff;
    border: 1px solid #3d3d3d;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .scan-secret-row {
    display: flex;
    gap: 6px;
  }

  .scan-secret-input {
    flex: 1;
    background: #2d2d2d;
    color: #fff;
    border: 1px solid #3d3d3d;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-family: inherit;
    outline: none;
  }

  .scan-secret-input:focus {
    border-color: #00ff88;
  }

  .scan-secret-save {
    background: #00ff88;
    color: #000;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .scan-secret-save:disabled {
    opacity: 0.3;
  }

  .scan-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
  }

  .scan-card {
    background: #222;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .scan-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .scan-card-name {
    font-size: 0.95rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .scan-card-emoji {
    font-size: 1.2rem;
  }

  .scan-card-status {
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #fff;
  }

  .scan-pulse {
    animation: scanPulse 1.5s ease-in-out infinite;
  }

  @keyframes scanPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .scan-card-stats {
    display: flex;
    gap: 6px;
  }

  .scan-stat {
    flex: 1;
    background: #1a1a1a;
    border-radius: 6px;
    padding: 6px;
    text-align: center;
  }

  .scan-stat-value {
    display: block;
    font-size: 1.1rem;
    font-weight: 800;
  }

  .scan-stat-label {
    display: block;
    font-size: 0.55rem;
    color: #666;
    margin-top: 1px;
  }

  .scan-card-empty {
    color: #555;
    font-size: 0.75rem;
    text-align: center;
    padding: 8px;
  }

  .scan-card-meta {
    display: flex;
    gap: 8px;
    font-size: 0.6rem;
    color: #666;
  }

  .scan-card-time { color: #888; }
  .scan-card-duration { color: #666; }
  .scan-card-errors { color: #ff6666; }

  .scan-card-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
    background: none;
  }

  .scan-card-trigger:disabled {
    cursor: not-allowed;
  }

  .scan-card-trigger:active:not(:disabled) {
    transform: scale(0.97);
  }

  .scan-play-icon {
    width: 16px;
    height: 16px;
  }

  .scan-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #333;
    border-top-color: inherit;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .scan-toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid;
    font-size: 0.8rem;
  }

  .scan-toast-close {
    background: none;
    border: none;
    color: #666;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 4px;
    font-family: inherit;
  }

  .scan-change-secret {
    background: none;
    border: none;
    color: #555;
    font-size: 0.6rem;
    cursor: pointer;
    text-align: center;
    padding: 4px;
    font-family: inherit;
  }

  html, body {
    background: #1a1a1a;
  }
`;
