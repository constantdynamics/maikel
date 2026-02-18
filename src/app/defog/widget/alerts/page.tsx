'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/defog/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AlertStock {
  ticker: string;
  name: string;
  currentPrice: number;
  dayChangePercent: number;
  dayChange: number;
  currency: string;
  lastUpdated: string;
  tabName: string;
  tabColor: string;
  buyLimit: number | null;
  distancePercent: number | null;
  hoursSinceUpdate: number;
  alertLevel: 'critical' | 'warning' | 'watch';
}

// ─── Store extraction ────────────────────────────────────────────────────────

function getAlertsFromStore(threshold: number): AlertStock[] {
  const state = useStore.getState();
  if (!state.tabs) return [];

  const alerts: AlertStock[] = [];

  for (const tab of state.tabs) {
    for (const stock of tab.stocks) {
      if (stock.currentPrice > 0 && stock.dayChangePercent <= -threshold) {
        const hoursSinceUpdate = stock.lastUpdated
          ? (Date.now() - new Date(stock.lastUpdated).getTime()) / (1000 * 60 * 60)
          : 999;

        const absDrop = Math.abs(stock.dayChangePercent);
        let alertLevel: AlertStock['alertLevel'] = 'watch';
        if (absDrop >= 10) alertLevel = 'critical';
        else if (absDrop >= 5) alertLevel = 'warning';

        alerts.push({
          ticker: stock.ticker,
          name: stock.displayName || stock.name || stock.ticker,
          currentPrice: stock.currentPrice,
          dayChangePercent: stock.dayChangePercent,
          dayChange: stock.dayChange,
          currency: stock.currency || 'EUR',
          lastUpdated: stock.lastUpdated || '',
          tabName: tab.name,
          tabColor: tab.accentColor,
          buyLimit: stock.buyLimit,
          distancePercent: stock.buyLimit && stock.buyLimit > 0
            ? ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100
            : null,
          hoursSinceUpdate,
          alertLevel,
        });
      }
    }
  }

  // Sort: biggest drops first
  alerts.sort((a, b) => a.dayChangePercent - b.dayChangePercent);
  return alerts;
}

// ─── Alert colors ────────────────────────────────────────────────────────────

const ALERT_COLORS: Record<AlertStock['alertLevel'], { bg: string; border: string; text: string; badge: string }> = {
  critical: { bg: '#1a0a0e', border: '#ff1a4d', text: '#ff3366', badge: '#ff1a4d' },
  warning: { bg: '#1a1008', border: '#ff8800', text: '#ffaa33', badge: '#ff8800' },
  watch: { bg: '#18180a', border: '#ccaa00', text: '#ddbb33', badge: '#ccaa00' },
};

const ALERT_LABELS: Record<AlertStock['alertLevel'], string> = {
  critical: 'KRITIEK',
  warning: 'WAARSCHUWING',
  watch: 'DALING',
};

// ─── Watchlist Alert Widget ──────────────────────────────────────────────────

export default function WatchlistAlertWidget() {
  const [alerts, setAlerts] = useState<AlertStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(3);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabs = useStore((s) => s.tabs);

  const fetchData = useCallback(() => {
    const data = getAlertsFromStore(threshold);
    setAlerts(data);
    setLastRefresh(new Date());
    setLoading(false);
  }, [threshold]);

  useEffect(() => { fetchData(); }, [tabs, fetchData]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(fetchData, 5 * 60 * 1000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [fetchData]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
    setTimeout(() => setRefreshing(false), 600);
  };
  const handleOpenApp = () => { window.location.href = '/defog'; };

  // Stats
  const criticalCount = alerts.filter((a) => a.alertLevel === 'critical').length;
  const warningCount = alerts.filter((a) => a.alertLevel === 'warning').length;
  const watchCount = alerts.filter((a) => a.alertLevel === 'watch').length;

  if (loading) {
    return (
      <div className="al-container">
        <div className="al-loading"><div className="al-spinner" /><span>Laden...</span></div>
        <style>{alertStyles}</style>
      </div>
    );
  }

  return (
    <div className="al-container">
      {/* Header */}
      <div className="al-header">
        <div className="al-header-left">
          <span className="al-title">Alerts</span>
          {alerts.length > 0 && (
            <span className="al-count" style={{ backgroundColor: criticalCount > 0 ? '#ff1a4d' : '#ff8800' }}>
              {alerts.length}
            </span>
          )}
        </div>
        <button onClick={handleOpenApp} className="al-link-btn">Open App</button>
      </div>

      {/* Threshold selector */}
      <div className="al-threshold-row">
        <span className="al-threshold-label">Drempel:</span>
        {[3, 5, 7, 10].map((t) => (
          <button
            key={t}
            onClick={() => setThreshold(t)}
            className={`al-threshold-btn ${threshold === t ? 'al-threshold-active' : ''}`}
          >
            -{t}%
          </button>
        ))}
      </div>

      {/* Summary badges */}
      {alerts.length > 0 && (
        <div className="al-badges">
          {criticalCount > 0 && (
            <span className="al-badge" style={{ backgroundColor: '#1a0a0e', color: '#ff3366', borderColor: '#ff1a4d33' }}>
              {criticalCount} kritiek
            </span>
          )}
          {warningCount > 0 && (
            <span className="al-badge" style={{ backgroundColor: '#1a1008', color: '#ffaa33', borderColor: '#ff880033' }}>
              {warningCount} waarschuwing
            </span>
          )}
          {watchCount > 0 && (
            <span className="al-badge" style={{ backgroundColor: '#18180a', color: '#ddbb33', borderColor: '#ccaa0033' }}>
              {watchCount} daling
            </span>
          )}
        </div>
      )}

      {/* Alert list */}
      {alerts.length === 0 ? (
        <div className="al-empty">
          <span className="al-empty-icon">✅</span>
          <span className="al-empty-text">Geen aandelen met &gt;{threshold}% daling</span>
          <span className="al-empty-sub">Alles stabiel!</span>
        </div>
      ) : (
        <div className="al-list">
          {alerts.map((stock, idx) => {
            const colors = ALERT_COLORS[stock.alertLevel];
            const label = ALERT_LABELS[stock.alertLevel];

            return (
              <div
                key={`${stock.ticker}-${idx}`}
                className={`al-card ${stock.alertLevel === 'critical' ? 'al-card-pulse' : ''}`}
                style={{ borderLeftColor: colors.border }}
              >
                <div className="al-card-content">
                  {/* Left: stock info */}
                  <div className="al-card-left">
                    <div className="al-card-ticker-row">
                      <span className="al-tab-dot" style={{ backgroundColor: stock.tabColor }} />
                      <span className="al-card-ticker">{stock.ticker.split('.')[0]}</span>
                      <span className="al-card-badge" style={{ backgroundColor: colors.badge }}>
                        {label}
                      </span>
                    </div>
                    <span className="al-card-name">{stock.name}</span>
                  </div>

                  {/* Right: change info */}
                  <div className="al-card-right">
                    <span className="al-card-change" style={{ color: colors.text }}>
                      {stock.dayChangePercent.toFixed(2)}%
                    </span>
                    <span className="al-card-price">
                      {stock.currency === 'USD' ? '$' : '€'}{stock.currentPrice.toFixed(2)}
                    </span>
                    {stock.distancePercent != null && (
                      <span className="al-card-dist" style={{
                        color: stock.distancePercent <= 0 ? '#00ff88' : '#666',
                      }}>
                        {stock.distancePercent <= 0 ? 'KOOPSIGNAAL' : `lim ${stock.distancePercent >= 0 ? '+' : ''}${stock.distancePercent.toFixed(0)}%`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nav */}
      <div className="al-actions">
        <a href="/defog/widget" className="al-btn">Top 24</a>
        <a href="/defog/widget/movers" className="al-btn">Movers</a>
        <a href="/defog/widget/portfolio" className="al-btn">Portfolio</a>
      </div>

      {/* Status */}
      <div className="al-status">
        <span className="al-status-dot" style={{ backgroundColor: criticalCount > 0 ? '#ff1a4d' : '#00ff88' }} />
        {lastRefresh && <span>{lastRefresh.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {/* Floating refresh button */}
      <button onClick={handleRefresh} disabled={refreshing} className="fab-refresh" aria-label="Verversen">
        <svg className={`fab-icon ${refreshing ? 'fab-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <style>{alertStyles}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const alertStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .al-container {
    background: #0d0d12;
    color: #fff;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    gap: 8px;
  }

  .al-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .al-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .al-title {
    font-size: 1rem;
    font-weight: 700;
    color: #ff6666;
  }

  .al-count {
    font-size: 0.65rem;
    font-weight: 800;
    color: #fff;
    padding: 2px 7px;
    border-radius: 10px;
  }

  .al-link-btn {
    background: #1a1a24;
    color: #88bbff;
    border: 1px solid #2d2d3d;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    text-decoration: none;
  }

  /* Threshold */
  .al-threshold-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .al-threshold-label {
    font-size: 0.7rem;
    color: #666;
    margin-right: 2px;
  }

  .al-threshold-btn {
    padding: 4px 10px;
    background: #1a1a24;
    color: #888;
    border: 1px solid #2d2d3d;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .al-threshold-active {
    background: #331122;
    color: #ff6666;
    border-color: #ff336644;
  }

  /* Badges */
  .al-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .al-badge {
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 0.6rem;
    font-weight: 700;
    border: 1px solid;
  }

  /* Empty */
  .al-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .al-empty-icon { font-size: 2rem; }
  .al-empty-text { font-size: 0.85rem; color: #888; }
  .al-empty-sub { font-size: 0.7rem; color: #555; }

  /* List */
  .al-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .al-card {
    background: #14141c;
    border-radius: 8px;
    border-left: 3px solid #333;
    overflow: hidden;
  }

  .al-card-pulse {
    animation: alPulse 2s ease-in-out infinite;
  }

  @keyframes alPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.75; }
  }

  .al-card-content {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    gap: 8px;
  }

  .al-card-left {
    flex: 1;
    min-width: 0;
  }

  .al-card-ticker-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .al-tab-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .al-card-ticker {
    font-size: 0.85rem;
    font-weight: 700;
  }

  .al-card-badge {
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.45rem;
    font-weight: 800;
    color: #fff;
    letter-spacing: 0.5px;
  }

  .al-card-name {
    font-size: 0.55rem;
    color: #555;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    max-width: 150px;
  }

  .al-card-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    min-width: 70px;
  }

  .al-card-change {
    font-size: 0.95rem;
    font-weight: 800;
  }

  .al-card-price {
    font-size: 0.7rem;
    color: #888;
  }

  .al-card-dist {
    font-size: 0.5rem;
    font-weight: 700;
  }

  /* Nav */
  .al-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .al-btn {
    flex: 1;
    text-align: center;
    padding: 8px;
    background: #1a1a24;
    color: #888;
    border: 1px solid #2d2d3d;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    text-decoration: none;
    font-family: inherit;
  }

  .al-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.6rem;
    color: #555;
  }

  .al-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .al-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #555;
  }

  .al-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #2d2d3d;
    border-top-color: #ff3366;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Floating refresh button */
  .fab-refresh {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #1a1a24;
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

  html, body { background: #0d0d12; }
`;
