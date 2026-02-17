'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/defog/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UnderwaterStock {
  ticker: string;
  name: string;
  currentPrice: number;
  buyLimit: number;
  distancePercent: number;
  dayChangePercent: number;
  currency: string;
  lastUpdated: string;
  tabName: string;
  tabColor: string;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

function getDepthColor(distancePercent: number): string {
  // The more negative (deeper underwater), the more intense
  const depth = Math.abs(distancePercent);
  if (depth > 20) return '#00ff88'; // Very deep = strongest buy signal
  if (depth > 15) return '#00ee77';
  if (depth > 10) return '#00dd66';
  if (depth > 5) return '#00cc55';
  if (depth > 2) return '#00bb44';
  return '#00aa33'; // Just at limit
}

function getContrastText(hexColor: string): '#ffffff' | '#000000' {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

// ─── Store extraction ────────────────────────────────────────────────────────

function getUnderwaterFromStore(): UnderwaterStock[] {
  const state = useStore.getState();
  if (!state.tabs) return [];

  const stocks: UnderwaterStock[] = [];

  for (const tab of state.tabs) {
    for (const stock of tab.stocks) {
      if (
        stock.rangeFetched &&
        stock.buyLimit != null &&
        stock.buyLimit > 0 &&
        stock.currentPrice > 0 &&
        stock.currentPrice <= stock.buyLimit
      ) {
        stocks.push({
          ticker: stock.ticker,
          name: stock.displayName || stock.name || stock.ticker,
          currentPrice: stock.currentPrice,
          buyLimit: stock.buyLimit,
          distancePercent: ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100,
          dayChangePercent: stock.dayChangePercent || 0,
          currency: stock.currency || 'EUR',
          lastUpdated: stock.lastUpdated || '',
          tabName: tab.name,
          tabColor: tab.accentColor,
        });
      }
    }
  }

  // Sort by deepest underwater first
  stocks.sort((a, b) => a.distancePercent - b.distancePercent);
  return stocks;
}

async function getUnderwaterFromAPI(): Promise<UnderwaterStock[]> {
  const res = await fetch('/api/stocks/widget-data?limit=48');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.stocks || []).filter((s: UnderwaterStock) => s.distancePercent <= 0);
}

// ─── Underwater Widget ───────────────────────────────────────────────────────

export default function UnderwaterWidget() {
  const [stocks, setStocks] = useState<UnderwaterStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabs = useStore((s) => s.tabs);

  const fetchData = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    try {
      // Try store first
      const storeStocks = getUnderwaterFromStore();
      if (storeStocks.length > 0 || (tabs && tabs.length > 0)) {
        setStocks(storeStocks);
        setLastRefresh(new Date());
        setLoading(false);
        setRefreshing(false);
        return;
      }
      // Fallback: API
      const apiStocks = await getUnderwaterFromAPI();
      setStocks(apiStocks);
      setLastRefresh(new Date());
    } catch { /* ignore */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tabs]);

  // Re-derive when tabs change
  useEffect(() => {
    const storeStocks = getUnderwaterFromStore();
    setStocks(storeStocks);
    setLastRefresh(new Date());
  }, [tabs]);

  useEffect(() => {
    fetchData(false);
    autoRefreshRef.current = setInterval(() => fetchData(false), 5 * 60 * 1000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [fetchData]);

  const handleRefresh = () => fetchData(true);
  const handleOpenApp = () => { window.location.href = '/defog'; };

  if (loading) {
    return (
      <div className="uw-container">
        <div className="uw-loading"><div className="uw-spinner" /><span>Laden...</span></div>
        <style>{underwaterStyles}</style>
      </div>
    );
  }

  return (
    <div className="uw-container">
      {/* Header */}
      <div className="uw-header">
        <div className="uw-header-left">
          <span className="uw-title">Onderwater</span>
          <span className="uw-count">{stocks.length}</span>
        </div>
        <button onClick={handleOpenApp} className="uw-link-btn">Open App</button>
      </div>

      {/* Content */}
      {stocks.length === 0 ? (
        <div className="uw-empty">
          <span className="uw-empty-icon">🏝️</span>
          <span className="uw-empty-text">Geen aandelen onder de aankooplimiet</span>
          <span className="uw-empty-sub">Alles boven water!</span>
        </div>
      ) : (
        <div className="uw-list">
          {stocks.map((stock, idx) => {
            const bg = getDepthColor(stock.distancePercent);
            const textColor = getContrastText(bg);
            const depthBars = Math.min(5, Math.ceil(Math.abs(stock.distancePercent) / 4));

            return (
              <div key={`${stock.ticker}-${idx}`} className="uw-card">
                {/* Depth indicator bar */}
                <div className="uw-depth-bar" style={{ backgroundColor: bg, width: `${Math.min(100, Math.abs(stock.distancePercent) * 3 + 20)}%` }} />

                <div className="uw-card-content">
                  {/* Left: ticker + tab indicator */}
                  <div className="uw-card-left">
                    <div className="uw-card-ticker-row">
                      <span className="uw-tab-dot" style={{ backgroundColor: stock.tabColor }} />
                      <span className="uw-card-ticker">{stock.ticker.split('.')[0]}</span>
                    </div>
                    <span className="uw-card-name">{stock.name}</span>
                  </div>

                  {/* Center: depth visualization */}
                  <div className="uw-card-center">
                    <div className="uw-depth-dots">
                      {[1, 2, 3, 4, 5].map((d) => (
                        <div
                          key={d}
                          className="uw-depth-dot"
                          style={{ backgroundColor: d <= depthBars ? bg : '#333' }}
                        />
                      ))}
                    </div>
                    <span className="uw-card-distance" style={{ color: bg }}>
                      {stock.distancePercent.toFixed(1)}%
                    </span>
                  </div>

                  {/* Right: price info */}
                  <div className="uw-card-right">
                    <span className="uw-card-price">
                      {stock.currency === 'USD' ? '$' : '€'}{stock.currentPrice.toFixed(2)}
                    </span>
                    <span className="uw-card-limit">
                      lim {stock.currency === 'USD' ? '$' : '€'}{stock.buyLimit.toFixed(2)}
                    </span>
                    <span className={`uw-card-day ${stock.dayChangePercent <= -3 ? 'uw-card-day-crash' : ''}`}>
                      {stock.dayChangePercent >= 0 ? '▲' : '▼'}
                      {stock.dayChangePercent >= 0 ? '+' : ''}{stock.dayChangePercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action bar */}
      <div className="uw-actions">
        <button onClick={handleRefresh} disabled={refreshing} className="uw-btn uw-btn-refresh">
          <svg className="uw-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Laden...' : 'Verversen'}
        </button>
        <a href="/defog/widget" className="uw-btn uw-btn-tiles">
          <svg className="uw-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Top 24 Tiles
        </a>
      </div>

      {/* Status */}
      <div className="uw-status">
        <span className="uw-status-dot" />
        {lastRefresh && (
          <span>{lastRefresh.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
        )}
      </div>

      {/* Floating refresh button */}
      <button onClick={handleRefresh} disabled={refreshing} className="fab-refresh" aria-label="Verversen">
        <svg className={`fab-icon ${refreshing ? 'fab-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <style>{underwaterStyles}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const underwaterStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .uw-container {
    background: #0d1117;
    color: #ffffff;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    gap: 8px;
  }

  .uw-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .uw-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .uw-title {
    font-size: 1rem;
    font-weight: 700;
    color: #00ff88;
  }

  .uw-count {
    background: #00ff88;
    color: #000;
    font-size: 0.7rem;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 10px;
  }

  .uw-link-btn {
    background: #1c2333;
    color: #88bbff;
    border: 1px solid #2d3748;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    text-decoration: none;
  }

  /* Empty state */
  .uw-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .uw-empty-icon { font-size: 2rem; }
  .uw-empty-text { font-size: 0.85rem; color: #888; }
  .uw-empty-sub { font-size: 0.7rem; color: #555; }

  /* Stock list */
  .uw-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .uw-card {
    background: #161b22;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }

  /* Depth bar background */
  .uw-depth-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    opacity: 0.08;
    border-radius: 8px;
  }

  .uw-card-content {
    position: relative;
    display: flex;
    align-items: center;
    padding: 8px 10px;
    gap: 8px;
  }

  .uw-card-left {
    flex: 1;
    min-width: 0;
  }

  .uw-card-ticker-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .uw-tab-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .uw-card-ticker {
    font-size: 0.85rem;
    font-weight: 700;
    color: #fff;
  }

  .uw-card-name {
    font-size: 0.6rem;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    max-width: 120px;
  }

  .uw-card-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 60px;
  }

  .uw-depth-dots {
    display: flex;
    gap: 2px;
  }

  .uw-depth-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .uw-card-distance {
    font-size: 0.9rem;
    font-weight: 800;
  }

  .uw-card-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    min-width: 65px;
  }

  .uw-card-price {
    font-size: 0.8rem;
    font-weight: 700;
    color: #ddd;
  }

  .uw-card-limit {
    font-size: 0.55rem;
    color: #666;
  }

  .uw-card-day {
    font-size: 0.6rem;
    color: #888;
  }

  .uw-card-day-crash {
    color: #ff3366 !important;
    animation: uwPulse 2s ease-in-out infinite;
  }

  @keyframes uwPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Actions */
  .uw-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .uw-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 8px;
    border: 1px solid #2d3748;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
    text-decoration: none;
  }

  .uw-btn:active { transform: scale(0.97); }

  .uw-btn-refresh {
    background: #1c2333;
    color: #00ff88;
  }

  .uw-btn-refresh:disabled { opacity: 0.5; }

  .uw-btn-tiles {
    background: #1c2333;
    color: #ffcc00;
  }

  .uw-btn-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* Status */
  .uw-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.6rem;
    color: #555;
    flex-shrink: 0;
  }

  .uw-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #00ff88;
  }

  /* Loading */
  .uw-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #555;
    font-size: 0.85rem;
  }

  .uw-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #2d3748;
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
    background: #1c2333;
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

  html, body {
    background: #0d1117;
  }
`;
