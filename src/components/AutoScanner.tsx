'use client';

import { useState, useEffect, useCallback } from 'react';

interface AutoScannerProps {
  onRunScan: (markets: string[]) => void;
  scanRunning: boolean;
  selectedMarkets: string[];
}

const AUTO_SCAN_KEY = 'autoScanEnabled';
const SCAN_INTERVAL_MINUTES = 60; // Scan every hour when enabled

export default function AutoScanner({ onRunScan, scanRunning, selectedMarkets }: AutoScannerProps) {
  const [enabled, setEnabled] = useState(false);
  const [nextScan, setNextScan] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');

  // Load saved state
  useEffect(() => {
    const saved = localStorage.getItem(AUTO_SCAN_KEY);
    if (saved === 'true') {
      setEnabled(true);
      setNextScan(new Date(Date.now() + SCAN_INTERVAL_MINUTES * 60 * 1000));
    }
  }, []);

  // Save state changes
  useEffect(() => {
    localStorage.setItem(AUTO_SCAN_KEY, enabled.toString());
  }, [enabled]);

  // Countdown timer
  useEffect(() => {
    if (!enabled || !nextScan) {
      setCountdown('');
      return;
    }

    function updateCountdown() {
      if (!nextScan) return;

      const now = Date.now();
      const diff = nextScan.getTime() - now;

      if (diff <= 0) {
        setCountdown('Starting...');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [enabled, nextScan]);

  // Auto-scan logic - checks API health before scanning
  const checkAndScan = useCallback(async () => {
    if (scanRunning) return;

    // Check API health first
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        const data = await response.json();
        if (data.yahoo_finance_status === 'ok' || data.yahoo_finance_status === 'unknown') {
          // API is healthy or unknown, run scan
          onRunScan(selectedMarkets.length > 0 ? selectedMarkets : ['us', 'ca']);
          // Schedule next scan
          setNextScan(new Date(Date.now() + SCAN_INTERVAL_MINUTES * 60 * 1000));
        }
      }
    } catch {
      // API check failed, but still try to scan
      onRunScan(selectedMarkets.length > 0 ? selectedMarkets : ['us', 'ca']);
      setNextScan(new Date(Date.now() + SCAN_INTERVAL_MINUTES * 60 * 1000));
    }
  }, [scanRunning, onRunScan, selectedMarkets]);

  // Schedule scans
  useEffect(() => {
    if (!enabled) return;

    const checkInterval = setInterval(() => {
      if (nextScan && Date.now() >= nextScan.getTime()) {
        checkAndScan();
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(checkInterval);
  }, [enabled, nextScan, checkAndScan]);

  function toggleAutoScan() {
    const newEnabled = !enabled;
    setEnabled(newEnabled);

    if (newEnabled) {
      // Set next scan time
      setNextScan(new Date(Date.now() + SCAN_INTERVAL_MINUTES * 60 * 1000));
    } else {
      setNextScan(null);
    }
  }

  function scanNow() {
    if (!scanRunning) {
      onRunScan(selectedMarkets.length > 0 ? selectedMarkets : ['us', 'ca']);
      setNextScan(new Date(Date.now() + SCAN_INTERVAL_MINUTES * 60 * 1000));
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleAutoScan}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
          enabled
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-transparent'
        }`}
        title={enabled ? 'Auto-scan is active' : 'Enable auto-scan'}
      >
        <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
        Auto
        {enabled && countdown && (
          <span className="text-xs opacity-70">({countdown})</span>
        )}
      </button>

      {enabled && (
        <button
          onClick={scanNow}
          disabled={scanRunning}
          className="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
          title="Run scan now"
        >
          Scan Now
        </button>
      )}
    </div>
  );
}
