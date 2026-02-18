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
  tabColor: string;
}

interface MoverStock {
  ticker: string;
  dayChangePercent: number;
  tabColor: string;
}

interface AlertStock {
  ticker: string;
  name: string;
  dayChangePercent: number;
  currentPrice: number;
  currency: string;
  tabColor: string;
  distancePercent: number | null;
  alertLevel: 'critical' | 'warning' | 'watch';
}

interface UnderwaterStock {
  ticker: string;
  distancePercent: number;
  currentPrice: number;
  buyLimit: number;
  currency: string;
  tabColor: string;
}

interface PortfolioStock {
  ticker: string;
  profitPercent: number;
  currentPrice: number;
  purchasedPrice: number;
  currency: string;
  tabColor: string;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

const CLASSIC_COLORS = ['#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#88cc00', '#44bb00', '#00ff44'];
const CLASSIC_THRESHOLDS = [100, 50, 25, 15, 10, 5, 0];

function getDistanceColor(dist: number): string {
  if (dist <= 0) return '#00ff88';
  for (let i = 0; i < CLASSIC_THRESHOLDS.length; i++) {
    if (dist > CLASSIC_THRESHOLDS[i]) return CLASSIC_COLORS[i];
  }
  return CLASSIC_COLORS[CLASSIC_COLORS.length - 1];
}

function getContrastText(hex: string): '#ffffff' | '#000000' {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const toL = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lum = 0.2126 * toL(r) + 0.7152 * toL(g) + 0.0722 * toL(b);
  return (1.05) / (lum + 0.05) > (lum + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

// ─── Data extraction ─────────────────────────────────────────────────────────

function getAllData() {
  const state = useStore.getState();
  const tabs = state.tabs || [];

  // Top tiles (closest to limit)
  const tiles: WidgetStock[] = [];
  const losers: MoverStock[] = [];
  const alerts: AlertStock[] = [];
  const underwater: UnderwaterStock[] = [];

  for (const tab of tabs) {
    for (const stock of tab.stocks) {
      if (stock.currentPrice <= 0) continue;

      const dist = stock.buyLimit && stock.buyLimit > 0
        ? ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100
        : null;

      // Tiles
      if (stock.rangeFetched && stock.buyLimit && stock.buyLimit > 0 && dist !== null) {
        tiles.push({
          ticker: stock.ticker,
          name: stock.displayName || stock.name || stock.ticker,
          currentPrice: stock.currentPrice,
          buyLimit: stock.buyLimit,
          distancePercent: dist,
          dayChangePercent: stock.dayChangePercent || 0,
          currency: stock.currency || 'EUR',
          tabColor: tab.accentColor,
        });
      }

      // Losers
      if (stock.dayChangePercent < -2) {
        losers.push({
          ticker: stock.ticker,
          dayChangePercent: stock.dayChangePercent,
          tabColor: tab.accentColor,
        });
      }

      // Alerts (>5% drop)
      if (stock.dayChangePercent <= -5) {
        const absDrop = Math.abs(stock.dayChangePercent);
        alerts.push({
          ticker: stock.ticker,
          name: stock.displayName || stock.name || stock.ticker,
          dayChangePercent: stock.dayChangePercent,
          currentPrice: stock.currentPrice,
          currency: stock.currency || 'EUR',
          tabColor: tab.accentColor,
          distancePercent: dist,
          alertLevel: absDrop >= 10 ? 'critical' : absDrop >= 5 ? 'warning' : 'watch',
        });
      }

      // Underwater
      if (dist !== null && dist <= 0) {
        underwater.push({
          ticker: stock.ticker,
          distancePercent: dist,
          currentPrice: stock.currentPrice,
          buyLimit: stock.buyLimit!,
          currency: stock.currency || 'EUR',
          tabColor: tab.accentColor,
        });
      }
    }
  }

  tiles.sort((a, b) => a.distancePercent - b.distancePercent);
  losers.sort((a, b) => a.dayChangePercent - b.dayChangePercent);
  alerts.sort((a, b) => a.dayChangePercent - b.dayChangePercent);
  underwater.sort((a, b) => a.distancePercent - b.distancePercent);

  // Portfolio
  const portfolio: PortfolioStock[] = (state.purchasedStocks || [])
    .filter((s) => s.purchasedPrice > 0 && s.currentPrice > 0)
    .map((s) => ({
      ticker: s.ticker,
      profitPercent: ((s.currentPrice - s.purchasedPrice) / s.purchasedPrice) * 100,
      currentPrice: s.currentPrice,
      purchasedPrice: s.purchasedPrice,
      currency: s.currency || 'EUR',
      tabColor: s.originalTabColor || '#666',
    }))
    .sort((a, b) => a.profitPercent - b.profitPercent);

  return {
    tiles: tiles.slice(0, 12),
    losers: losers.slice(0, 8),
    alerts: alerts.slice(0, 5),
    underwater,
    portfolio,
  };
}

// ─── Tablet Widget ───────────────────────────────────────────────────────────

export default function TabletWidget() {
  const [data, setData] = useState<ReturnType<typeof getAllData> | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabs = useStore((s) => s.tabs);
  const purchasedStocks = useStore((s) => s.purchasedStocks);

  const refresh = useCallback(() => {
    setData(getAllData());
    setLastRefresh(new Date());
  }, []);

  useEffect(() => { refresh(); }, [tabs, purchasedStocks, refresh]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(refresh, 5 * 60 * 1000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [refresh]);

  const handleRefresh = () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 600);
  };

  if (!data) {
    return (
      <div className="tb-container">
        <div className="tb-loading"><div className="tb-spinner" />Laden...</div>
        <style>{tabletStyles}</style>
      </div>
    );
  }

  const { tiles, losers, alerts, underwater, portfolio } = data;

  return (
    <div className="tb-container">
      {/* Grid layout: 2 columns on tablet, stacks on narrow */}
      <div className="tb-grid">

        {/* ─── Panel 1: Top Tiles (3×4 mini grid) ──────────────────────── */}
        <div className="tb-panel">
          <div className="tb-panel-header">
            <span className="tb-panel-title">Dichtst bij limiet</span>
            <span className="tb-panel-count">{tiles.length}</span>
          </div>
          <div className="tb-tiles-grid">
            {tiles.map((s, i) => {
              const bg = getDistanceColor(s.distancePercent);
              const txt = getContrastText(bg);
              return (
                <div key={`t-${i}`} className="tb-tile" style={{ backgroundColor: bg }}>
                  <span className="tb-tile-ticker" style={{ color: txt }}>{s.ticker.split('.')[0]}</span>
                  <span className="tb-tile-dist" style={{ color: txt }}>
                    {s.distancePercent <= 0 ? '' : '+'}{s.distancePercent.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
          <a href="/defog/widget" className="tb-panel-link">Meer →</a>
        </div>

        {/* ─── Panel 2: Big Losers ─────────────────────────────────────── */}
        <div className="tb-panel">
          <div className="tb-panel-header">
            <span className="tb-panel-title" style={{ color: '#ff3366' }}>▼ Dalers</span>
            <span className="tb-panel-count">{losers.length}</span>
          </div>
          <div className="tb-mini-list">
            {losers.length === 0 ? (
              <span className="tb-empty">Geen dalers &gt;2%</span>
            ) : losers.map((s, i) => (
              <div key={`l-${i}`} className="tb-mini-row">
                <span className="tb-mini-dot" style={{ backgroundColor: s.tabColor }} />
                <span className="tb-mini-ticker">{s.ticker.split('.')[0]}</span>
                <span className="tb-mini-value" style={{ color: '#ff3366' }}>
                  {s.dayChangePercent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <a href="/defog/widget/movers" className="tb-panel-link">Meer →</a>
        </div>

        {/* ─── Panel 3: Alerts ─────────────────────────────────────────── */}
        <div className="tb-panel">
          <div className="tb-panel-header">
            <span className="tb-panel-title" style={{ color: '#ff6666' }}>Alerts</span>
            <span className="tb-panel-count" style={{
              backgroundColor: alerts.some(a => a.alertLevel === 'critical') ? '#ff1a4d' : alerts.length > 0 ? '#ff8800' : '#333',
            }}>{alerts.length}</span>
          </div>
          <div className="tb-mini-list">
            {alerts.length === 0 ? (
              <span className="tb-empty">Geen alerts ✅</span>
            ) : alerts.map((s, i) => (
              <div key={`a-${i}`} className="tb-mini-row" style={{
                borderLeft: `2px solid ${s.alertLevel === 'critical' ? '#ff1a4d' : '#ff8800'}`,
                paddingLeft: '6px',
              }}>
                <span className="tb-mini-ticker">{s.ticker.split('.')[0]}</span>
                <span className="tb-mini-value" style={{ color: s.alertLevel === 'critical' ? '#ff3366' : '#ffaa33' }}>
                  {s.dayChangePercent.toFixed(1)}%
                </span>
                {s.distancePercent !== null && s.distancePercent <= 0 && (
                  <span className="tb-buy-signal">KOOP</span>
                )}
              </div>
            ))}
          </div>
          <a href="/defog/widget/alerts" className="tb-panel-link">Meer →</a>
        </div>

        {/* ─── Panel 4: Underwater ─────────────────────────────────────── */}
        <div className="tb-panel">
          <div className="tb-panel-header">
            <span className="tb-panel-title" style={{ color: '#00ff88' }}>Onderwater</span>
            <span className="tb-panel-count" style={{ backgroundColor: underwater.length > 0 ? '#00cc66' : '#333' }}>{underwater.length}</span>
          </div>
          <div className="tb-mini-list">
            {underwater.length === 0 ? (
              <span className="tb-empty">Alles boven water 🏝️</span>
            ) : underwater.map((s, i) => (
              <div key={`u-${i}`} className="tb-mini-row">
                <span className="tb-mini-dot" style={{ backgroundColor: s.tabColor }} />
                <span className="tb-mini-ticker">{s.ticker.split('.')[0]}</span>
                <span className="tb-mini-value" style={{ color: '#00ff88' }}>
                  {s.distancePercent.toFixed(1)}%
                </span>
                <span className="tb-mini-price">
                  {s.currency === 'USD' ? '$' : '€'}{s.currentPrice.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <a href="/defog/widget/underwater" className="tb-panel-link">Meer →</a>
        </div>

        {/* ─── Panel 5: Portfolio ───────────────────────────────────────── */}
        {portfolio.length > 0 && (
          <div className="tb-panel">
            <div className="tb-panel-header">
              <span className="tb-panel-title">Portfolio</span>
              <span className="tb-panel-count">{portfolio.length}</span>
            </div>
            <div className="tb-mini-list">
              {portfolio.map((s, i) => {
                const isProfit = s.profitPercent >= 0;
                return (
                  <div key={`p-${i}`} className="tb-mini-row">
                    <span className="tb-mini-dot" style={{ backgroundColor: s.tabColor }} />
                    <span className="tb-mini-ticker">{s.ticker.split('.')[0]}</span>
                    <span className="tb-mini-value" style={{ color: isProfit ? '#00ff88' : '#ff3366' }}>
                      {isProfit ? '+' : ''}{s.profitPercent.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
            <a href="/defog/widget/portfolio" className="tb-panel-link">Meer →</a>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="tb-status">
        <span className="tb-status-dot" />
        <span>
          Tablet Dashboard
          {lastRefresh && <> &middot; {lastRefresh.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</>}
        </span>
        <a href="/defog" className="tb-open-app">Open App</a>
      </div>

      {/* Floating refresh button */}
      <button onClick={handleRefresh} disabled={refreshing} className="fab-refresh" aria-label="Verversen">
        <svg className={`fab-icon ${refreshing ? 'fab-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <style>{tabletStyles}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const tabletStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .tb-container {
    background: #111116;
    color: #fff;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    gap: 8px;
  }

  /* Responsive 2-column grid */
  .tb-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  @media (max-width: 500px) {
    .tb-grid { grid-template-columns: 1fr; }
  }

  @media (min-width: 900px) {
    .tb-grid { grid-template-columns: repeat(3, 1fr); }
  }

  /* Panel */
  .tb-panel {
    background: #1a1a22;
    border-radius: 10px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    overflow: hidden;
  }

  .tb-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
  }

  .tb-panel-title {
    font-size: 0.75rem;
    font-weight: 700;
  }

  .tb-panel-count {
    background: #333;
    color: #fff;
    font-size: 0.6rem;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 8px;
  }

  .tb-panel-link {
    color: #555;
    font-size: 0.55rem;
    text-decoration: none;
    text-align: right;
    margin-top: auto;
    padding-top: 2px;
  }

  /* Mini tiles grid (3×4 inside panel) */
  .tb-tiles-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 2px;
    flex: 1;
    min-height: 0;
  }

  .tb-tile {
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2px;
    min-height: 28px;
  }

  .tb-tile-ticker {
    font-size: 0.5rem;
    font-weight: 700;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    text-align: center;
  }

  .tb-tile-dist {
    font-size: 0.6rem;
    font-weight: 800;
  }

  /* Mini list rows */
  .tb-mini-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
    min-height: 0;
  }

  .tb-mini-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 2px;
    font-size: 0.7rem;
  }

  .tb-mini-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tb-mini-ticker {
    font-weight: 700;
    color: #ccc;
    min-width: 40px;
  }

  .tb-mini-value {
    font-weight: 800;
    margin-left: auto;
  }

  .tb-mini-price {
    color: #666;
    font-size: 0.6rem;
    margin-left: 4px;
  }

  .tb-buy-signal {
    background: #00ff88;
    color: #000;
    font-size: 0.45rem;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 4px;
  }

  .tb-empty {
    color: #444;
    font-size: 0.7rem;
    text-align: center;
    padding: 8px;
  }

  /* Status */
  .tb-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.6rem;
    color: #555;
    flex-shrink: 0;
    padding: 2px 0;
  }

  .tb-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #00ff88;
  }

  .tb-open-app {
    color: #88bbff;
    text-decoration: none;
    font-weight: 600;
    margin-left: 8px;
  }

  /* Loading */
  .tb-loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #555;
    font-size: 0.85rem;
  }

  .tb-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #333;
    border-top-color: #00ff88;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Floating refresh button */
  .fab-refresh {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #222233;
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

  @keyframes spin { to { transform: rotate(360deg); } }

  html, body { background: #111116; overflow: hidden; }
`;
