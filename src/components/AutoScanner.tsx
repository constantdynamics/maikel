'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface AutoScannerProps {
  onRunScan: (markets: string[]) => void;
  scanRunning: boolean;
  selectedMarkets: string[];
}

const AUTO_SCAN_KEY = 'autoScanEnabled';
const AUTO_SCAN_INTERVAL_KEY = 'autoScanIntervalMinutes';
const AUTO_SCAN_NEXT_TIME_KEY = 'autoScanNextTime';
const DEFAULT_INTERVAL_MINUTES = 5;

export default function AutoScanner({ onRunScan, scanRunning, selectedMarkets }: AutoScannerProps) {
  const [enabled, setEnabled] = useState(false);
  const [nextScan, setNextScan] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL_MINUTES);
  const visibilityRef = useRef<boolean>(true);

  // Load interval setting from database
  useEffect(() => {
    async function loadInterval() {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'auto_scan_interval_minutes')
        .single();

      if (data?.value) {
        const mins = Number(data.value);
        if (mins > 0) {
          setIntervalMinutes(mins);
          localStorage.setItem(AUTO_SCAN_INTERVAL_KEY, String(mins));
        }
      } else {
        // Fallback to localStorage
        const cached = localStorage.getItem(AUTO_SCAN_INTERVAL_KEY);
        if (cached) setIntervalMinutes(Number(cached));
      }
    }
    loadInterval();
  }, []);

  // Load saved state (including persisted next scan time)
  useEffect(() => {
    const savedEnabled = localStorage.getItem(AUTO_SCAN_KEY);
    const savedNextTime = localStorage.getItem(AUTO_SCAN_NEXT_TIME_KEY);

    if (savedEnabled === 'true') {
      setEnabled(true);

      // Restore persisted next scan time if it's still in the future
      if (savedNextTime) {
        const savedDate = new Date(savedNextTime);
        if (savedDate.getTime() > Date.now()) {
          setNextScan(savedDate);
        } else {
          // Time has passed, schedule a new scan
          const newNext = new Date(Date.now() + intervalMinutes * 60 * 1000);
          setNextScan(newNext);
          localStorage.setItem(AUTO_SCAN_NEXT_TIME_KEY, newNext.toISOString());
        }
      } else {
        const newNext = new Date(Date.now() + intervalMinutes * 60 * 1000);
        setNextScan(newNext);
        localStorage.setItem(AUTO_SCAN_NEXT_TIME_KEY, newNext.toISOString());
      }
    }
  }, [intervalMinutes]);

  // Save enabled state
  useEffect(() => {
    localStorage.setItem(AUTO_SCAN_KEY, enabled.toString());
    if (!enabled) {
      localStorage.removeItem(AUTO_SCAN_NEXT_TIME_KEY);
    }
  }, [enabled]);

  // Persist nextScan time to localStorage
  useEffect(() => {
    if (nextScan && enabled) {
      localStorage.setItem(AUTO_SCAN_NEXT_TIME_KEY, nextScan.toISOString());
    }
  }, [nextScan, enabled]);

  // Handle visibility changes (tab switches)
  useEffect(() => {
    function handleVisibilityChange() {
      const isVisible = document.visibilityState === 'visible';
      visibilityRef.current = isVisible;

      if (isVisible && enabled) {
        // When tab becomes visible again, restore the persisted time
        const savedNextTime = localStorage.getItem(AUTO_SCAN_NEXT_TIME_KEY);
        if (savedNextTime) {
          const savedDate = new Date(savedNextTime);
          if (savedDate.getTime() > Date.now()) {
            setNextScan(savedDate);
          } else if (!scanRunning) {
            // Time has passed while tab was hidden, run scan now
            setNextScan(new Date(Date.now() + 2000)); // Run in 2 seconds
          }
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, scanRunning]);

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

  // Auto-scan logic - just run the scan directly
  const checkAndScan = useCallback(async () => {
    if (scanRunning) {
      // Scan already running, reschedule
      const newNext = new Date(Date.now() + intervalMinutes * 60 * 1000);
      setNextScan(newNext);
      localStorage.setItem(AUTO_SCAN_NEXT_TIME_KEY, newNext.toISOString());
      return;
    }

    // Run the scan - the scan itself handles API errors gracefully
    onRunScan(selectedMarkets.length > 0 ? selectedMarkets : ['us', 'ca']);
    // Schedule next scan
    const newNext = new Date(Date.now() + intervalMinutes * 60 * 1000);
    setNextScan(newNext);
    localStorage.setItem(AUTO_SCAN_NEXT_TIME_KEY, newNext.toISOString());
  }, [scanRunning, onRunScan, selectedMarkets, intervalMinutes]);

  // Schedule scans - check more frequently
  useEffect(() => {
    if (!enabled) return;

    const checkInterval = setInterval(() => {
      if (nextScan && Date.now() >= nextScan.getTime() && !scanRunning) {
        checkAndScan();
      }
    }, 2000); // Check every 2 seconds for more responsive scanning

    return () => clearInterval(checkInterval);
  }, [enabled, nextScan, checkAndScan, scanRunning]);

  function toggleAutoScan() {
    const newEnabled = !enabled;
    setEnabled(newEnabled);

    if (newEnabled) {
      // Set next scan time
      const newNext = new Date(Date.now() + intervalMinutes * 60 * 1000);
      setNextScan(newNext);
      localStorage.setItem(AUTO_SCAN_NEXT_TIME_KEY, newNext.toISOString());
    } else {
      setNextScan(null);
      localStorage.removeItem(AUTO_SCAN_NEXT_TIME_KEY);
    }
  }

  function scanNow() {
    if (!scanRunning) {
      onRunScan(selectedMarkets.length > 0 ? selectedMarkets : ['us', 'ca']);
      const newNext = new Date(Date.now() + intervalMinutes * 60 * 1000);
      setNextScan(newNext);
      localStorage.setItem(AUTO_SCAN_NEXT_TIME_KEY, newNext.toISOString());
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
