'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/defog/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WidgetStock {
  ticker: string;
  name: string;
  currentPrice: number;
  buyLimit: number;
  distancePercent: number;
  dayChangePercent: number;
  currency: string;
  lastUpdated: string;
  tabName?: string;
  tabColor?: string;
}

interface WidgetData {
  stocks: WidgetStock[];
  total: number;
  updatedAt: string;
  source: 'store' | 'api';
}

// ─── Color logic (matching MiniTilesView / classic rainbow) ──────────────────

const CLASSIC_COLORS = ['#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#88cc00', '#44bb00', '#00ff44'];
const CLASSIC_THRESHOLDS = [100, 50, 25, 15, 10, 5, 0];
const BELOW_LIMIT_COLOR = '#00ff88';

function getDistanceColor(distancePercent: number): string {
  if (distancePercent <= 0) return BELOW_LIMIT_COLOR;
  for (let i = 0; i < CLASSIC_THRESHOLDS.length; i++) {
    if (distancePercent > CLASSIC_THRESHOLDS[i]) return CLASSIC_COLORS[i];
  }
  return CLASSIC_COLORS[CLASSIC_COLORS.length - 1];
}

function getContrastText(hexColor: string): '#ffffff' | '#000000' {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  const contrastWhite = (1.0 + 0.05) / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / (0.0 + 0.05);
  return contrastWhite > contrastBlack ? '#ffffff' : '#000000';
}

// ─── Data extraction from store ──────────────────────────────────────────────

function getWidgetDataFromStore(limit: number): WidgetData | null {
  const state = useStore.getState();
  if (!state.tabs || state.tabs.length === 0) return null;

  const allStocks: WidgetStock[] = [];

  for (const tab of state.tabs) {
    for (const stock of tab.stocks) {
      if (
        stock.rangeFetched &&
        stock.buyLimit != null &&
        stock.buyLimit > 0 &&
        stock.currentPrice > 0
      ) {
        const distancePercent = ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100;
        allStocks.push({
          ticker: stock.ticker,
          name: stock.displayName || stock.name || stock.ticker,
          currentPrice: stock.currentPrice,
          buyLimit: stock.buyLimit,
          distancePercent,
          dayChangePercent: stock.dayChangePercent || 0,
          currency: stock.currency || 'EUR',
          lastUpdated: stock.lastUpdated || '',
          tabName: tab.name,
          tabColor: tab.accentColor,
        });
      }
    }
  }

  allStocks.sort((a, b) => a.distancePercent - b.distancePercent);

  return {
    stocks: allStocks.slice(0, limit),
    total: allStocks.length,
    updatedAt: new Date().toISOString(),
    source: 'store',
  };
}

// ─── Widget Page ─────────────────────────────────────────────────────────────

const TILE_COUNT = 24;

export default function WidgetPage() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabs = useStore((s) => s.tabs);

  // Try store first, fall back to API
  const fetchData = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    try {
      // Try client-side store first (instant, real-time data)
      const storeData = getWidgetDataFromStore(TILE_COUNT);
      if (storeData && storeData.stocks.length > 0) {
        setData(storeData);
        setError(null);
        setLastRefresh(new Date());
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Fallback: fetch from API (reads cloud backup)
      const res = await fetch('/api/stocks/widget-data?limit=' + TILE_COUNT);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData({ ...json, source: 'api' });
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fout bij laden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-derive from store when tabs change
  useEffect(() => {
    const storeData = getWidgetDataFromStore(TILE_COUNT);
    if (storeData && storeData.stocks.length > 0) {
      setData(storeData);
      setLastRefresh(new Date());
    }
  }, [tabs]);

  // Initial load + register service worker
  useEffect(() => {
    fetchData(false);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'WIDGET_DATA_UPDATED') {
          setData({ ...event.data.data, source: 'api' });
          setLastRefresh(new Date());
        }
      });
    }
  }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => fetchData(false), 5 * 60 * 1000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData(true);
  };

  const handleOpenApp = () => {
    window.location.href = '/defog';
  };

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="widget-container">
        <div className="widget-loading">
          <div className="widget-spinner" />
          <span>Laden...</span>
        </div>
        <style>{widgetStyles}</style>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <div className="widget-container">
        <div className="widget-error">
          <span>Fout: {error}</span>
          <button onClick={handleRefresh} className="widget-btn widget-btn-refresh">Opnieuw</button>
        </div>
        <style>{widgetStyles}</style>
      </div>
    );
  }

  const stocks = data?.stocks || [];

  return (
    <div className="widget-container">
      {/* ─── 4×6 Tile Grid ──────────────────────────────────────────────── */}
      <div className="widget-grid">
        {stocks.map((stock, idx) => {
          const bg = getDistanceColor(stock.distancePercent);
          const textColor = getContrastText(bg);
          const isBelow = stock.distancePercent <= 0;
          const isBigDrop = stock.dayChangePercent <= -3;

          return (
            <div
              key={`${stock.ticker}-${idx}`}
              className={`widget-tile ${isBigDrop ? 'widget-tile-pulse' : ''}`}
              style={{ backgroundColor: bg }}
              title={`${stock.ticker} - ${stock.name}\n${stock.currency} ${stock.currentPrice.toFixed(2)} → limiet ${stock.currency} ${stock.buyLimit.toFixed(2)}\nAfstand: ${stock.distancePercent >= 0 ? '+' : ''}${stock.distancePercent.toFixed(1)}%\nDag: ${stock.dayChangePercent >= 0 ? '+' : ''}${stock.dayChangePercent.toFixed(1)}%${stock.tabName ? '\nTab: ' + stock.tabName : ''}`}
            >
              {/* Tab color indicator */}
              {stock.tabColor && (
                <div
                  className="widget-tile-tab-dot"
                  style={{ backgroundColor: stock.tabColor }}
                />
              )}

              {/* Ticker */}
              <span className="widget-tile-ticker" style={{ color: textColor }}>
                {stock.ticker.split('.')[0]}
              </span>

              {/* Distance % */}
              <span className="widget-tile-distance" style={{ color: textColor }}>
                {isBelow ? '' : '+'}{stock.distancePercent.toFixed(1)}%
              </span>

              {/* Day change */}
              <span
                className="widget-tile-day"
                style={{
                  color: isBigDrop ? '#ff3366' : textColor,
                  opacity: isBigDrop ? 1 : 0.7,
                }}
              >
                {stock.dayChangePercent >= 0 ? '▲' : '▼'}
                {stock.dayChangePercent >= 0 ? '+' : ''}{stock.dayChangePercent.toFixed(1)}%
              </span>
            </div>
          );
        })}

        {/* Fill empty spots if less than 24 */}
        {Array.from({ length: Math.max(0, TILE_COUNT - stocks.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="widget-tile widget-tile-empty" />
        ))}
      </div>

      {/* ─── Action buttons ─────────────────────────────────────────────── */}
      <div className="widget-actions">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="widget-btn widget-btn-refresh"
        >
          <svg className="widget-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Laden...' : 'Verversen'}
        </button>

        <button
          onClick={handleOpenApp}
          className="widget-btn widget-btn-app"
        >
          <svg className="widget-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open App
        </button>
      </div>

      {/* ─── Status bar ─────────────────────────────────────────────────── */}
      <div className="widget-status">
        <span
          className="widget-status-dot"
          style={{ backgroundColor: data?.source === 'store' ? '#00ff88' : '#ffaa00' }}
        />
        <span>
          {stocks.length}/{data?.total ?? 0} dichtst bij limiet
          {data?.source === 'api' && ' (cloud)'}
          {lastRefresh && (
            <> &middot; {lastRefresh.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</>
          )}
        </span>
      </div>

      {/* Floating refresh button */}
      <button onClick={handleRefresh} disabled={refreshing} className="fab-refresh" aria-label="Verversen">
        <svg className={`fab-icon ${refreshing ? 'fab-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <style>{widgetStyles}</style>
    </div>
  );
}

// ─── Inline styles (self-contained, works in PWA / Android WebView) ──────────

const widgetStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .widget-container {
    background: #1a1a1a;
    color: #ffffff;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    -webkit-user-select: none;
    overflow: hidden;
  }

  /* 4 columns × 6 rows grid */
  .widget-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(6, 1fr);
    gap: 3px;
    flex: 1;
    min-height: 0;
  }

  .widget-tile {
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 2px;
    min-height: 0;
    position: relative;
    transition: transform 0.15s ease;
  }

  .widget-tile:active {
    transform: scale(0.95);
  }

  .widget-tile-empty {
    background: #2d2d2d !important;
    opacity: 0.3;
  }

  .widget-tile-pulse {
    animation: tilePulse 2s ease-in-out infinite;
  }

  @keyframes tilePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* Tab color dot in top-right corner */
  .widget-tile-tab-dot {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    opacity: 0.8;
  }

  .widget-tile-ticker {
    font-size: clamp(0.55rem, 2.5vw, 0.75rem);
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    opacity: 0.85;
  }

  .widget-tile-distance {
    font-size: clamp(0.7rem, 3.5vw, 1.1rem);
    font-weight: 800;
    line-height: 1.2;
  }

  .widget-tile-day {
    font-size: clamp(0.4rem, 1.8vw, 0.55rem);
    line-height: 1.1;
  }

  /* Action buttons */
  .widget-actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    flex-shrink: 0;
  }

  .widget-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 8px;
    border: none;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .widget-btn:active {
    transform: scale(0.97);
  }

  .widget-btn-refresh {
    background: #2d2d2d;
    color: #00ff88;
    border: 1px solid #3d3d3d;
  }

  .widget-btn-refresh:disabled {
    opacity: 0.5;
  }

  .widget-btn-app {
    background: #2d2d2d;
    color: #88bbff;
    border: 1px solid #3d3d3d;
  }

  .widget-btn-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* Status bar */
  .widget-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 4px;
    padding: 2px 0;
    font-size: 0.6rem;
    color: #666;
    flex-shrink: 0;
  }

  .widget-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Loading / Error */
  .widget-loading, .widget-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #888;
    font-size: 0.85rem;
  }

  .widget-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #3d3d3d;
    border-top-color: #00ff88;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Floating refresh button */
  .fab-refresh {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #2d2d2d;
    border: 2px solid #00ff88;
    color: #00ff88;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    transition: transform 0.15s, opacity 0.15s;
    z-index: 50;
  }
  .fab-refresh:active { transform: scale(0.9); }
  .fab-refresh:disabled { opacity: 0.5; }
  .fab-icon { width: 22px; height: 22px; }
  .fab-spin { animation: spin 0.8s linear infinite; }

  /* Ensure no scrollbar / overflow on widget */
  html, body {
    overflow: hidden;
    background: #1a1a1a;
  }
`;
