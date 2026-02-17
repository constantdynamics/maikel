'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/defog/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MoverStock {
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
}

// ─── Store extraction ────────────────────────────────────────────────────────

function getMoversFromStore(): { gainers: MoverStock[]; losers: MoverStock[] } {
  const state = useStore.getState();
  if (!state.tabs) return { gainers: [], losers: [] };

  const all: MoverStock[] = [];

  for (const tab of state.tabs) {
    for (const stock of tab.stocks) {
      if (stock.currentPrice > 0 && stock.dayChangePercent !== 0) {
        all.push({
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
        });
      }
    }
  }

  // Top gainers (highest day change first)
  const gainers = [...all]
    .filter((s) => s.dayChangePercent > 0)
    .sort((a, b) => b.dayChangePercent - a.dayChangePercent)
    .slice(0, 12);

  // Top losers (most negative first)
  const losers = [...all]
    .filter((s) => s.dayChangePercent < 0)
    .sort((a, b) => a.dayChangePercent - b.dayChangePercent)
    .slice(0, 12);

  return { gainers, losers };
}

// ─── Big Movers Widget ───────────────────────────────────────────────────────

export default function BigMoversWidget() {
  const [gainers, setGainers] = useState<MoverStock[]>([]);
  const [losers, setLosers] = useState<MoverStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'losers' | 'gainers'>('losers');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabs = useStore((s) => s.tabs);

  const fetchData = useCallback(() => {
    const { gainers: g, losers: l } = getMoversFromStore();
    setGainers(g);
    setLosers(l);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

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

  if (loading) {
    return (
      <div className="mv-container">
        <div className="mv-loading"><div className="mv-spinner" /><span>Laden...</span></div>
        <style>{moversStyles}</style>
      </div>
    );
  }

  const activeStocks = activeTab === 'gainers' ? gainers : losers;

  return (
    <div className="mv-container">
      {/* Header */}
      <div className="mv-header">
        <span className="mv-title">Big Movers</span>
        <button onClick={handleOpenApp} className="mv-link-btn">Open App</button>
      </div>

      {/* Tab switcher */}
      <div className="mv-tabs">
        <button
          onClick={() => setActiveTab('losers')}
          className={`mv-tab ${activeTab === 'losers' ? 'mv-tab-active' : ''}`}
          style={activeTab === 'losers' ? { borderColor: '#ff3366', color: '#ff3366' } : {}}
        >
          <span className="mv-tab-arrow">▼</span>
          Dalers ({losers.length})
        </button>
        <button
          onClick={() => setActiveTab('gainers')}
          className={`mv-tab ${activeTab === 'gainers' ? 'mv-tab-active' : ''}`}
          style={activeTab === 'gainers' ? { borderColor: '#00ff88', color: '#00ff88' } : {}}
        >
          <span className="mv-tab-arrow">▲</span>
          Stijgers ({gainers.length})
        </button>
      </div>

      {/* Stock list */}
      {activeStocks.length === 0 ? (
        <div className="mv-empty">
          <span className="mv-empty-text">
            {activeTab === 'gainers' ? 'Geen stijgers vandaag' : 'Geen dalers vandaag'}
          </span>
        </div>
      ) : (
        <div className="mv-list">
          {activeStocks.map((stock, idx) => {
            const isGainer = stock.dayChangePercent > 0;
            const accentColor = isGainer ? '#00ff88' : '#ff3366';
            const barWidth = Math.min(100, Math.abs(stock.dayChangePercent) * 8 + 5);
            const isBig = Math.abs(stock.dayChangePercent) >= 5;

            return (
              <div key={`${stock.ticker}-${idx}`} className={`mv-card ${isBig ? 'mv-card-glow' : ''}`}>
                {/* Change bar */}
                <div
                  className="mv-card-bar"
                  style={{ backgroundColor: accentColor, width: `${barWidth}%` }}
                />

                <div className="mv-card-content">
                  {/* Rank */}
                  <span className="mv-rank" style={{ color: accentColor }}>
                    {idx + 1}
                  </span>

                  {/* Stock info */}
                  <div className="mv-card-left">
                    <div className="mv-card-ticker-row">
                      <span className="mv-tab-dot" style={{ backgroundColor: stock.tabColor }} />
                      <span className="mv-card-ticker">{stock.ticker.split('.')[0]}</span>
                    </div>
                    <span className="mv-card-name">{stock.name}</span>
                  </div>

                  {/* Day change */}
                  <div className="mv-card-center">
                    <span className="mv-card-change" style={{ color: accentColor }}>
                      {isGainer ? '+' : ''}{stock.dayChangePercent.toFixed(2)}%
                    </span>
                    {stock.distancePercent != null && (
                      <span className="mv-card-distance">
                        lim {stock.distancePercent >= 0 ? '+' : ''}{stock.distancePercent.toFixed(0)}%
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mv-card-right">
                    <span className="mv-card-price">
                      {stock.currency === 'USD' ? '$' : '€'}{stock.currentPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nav */}
      <div className="mv-actions">
        <a href="/defog/widget" className="mv-btn">Top 24</a>
        <a href="/defog/widget/underwater" className="mv-btn">Onderwater</a>
        <a href="/defog/widget/portfolio" className="mv-btn">Portfolio</a>
      </div>

      {/* Status */}
      <div className="mv-status">
        <span className="mv-status-dot" />
        {lastRefresh && <span>{lastRefresh.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {/* Floating refresh button */}
      <button onClick={handleRefresh} disabled={refreshing} className="fab-refresh" aria-label="Verversen">
        <svg className={`fab-icon ${refreshing ? 'fab-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <style>{moversStyles}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const moversStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .mv-container {
    background: #111118;
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

  .mv-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .mv-title {
    font-size: 1rem;
    font-weight: 700;
  }

  .mv-link-btn {
    background: #1c1c28;
    color: #88bbff;
    border: 1px solid #2d2d40;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    text-decoration: none;
  }

  /* Tabs */
  .mv-tabs {
    display: flex;
    gap: 4px;
  }

  .mv-tab {
    flex: 1;
    padding: 8px;
    background: #1c1c28;
    border: 1px solid #2d2d40;
    border-radius: 8px;
    color: #666;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .mv-tab-active {
    background: #1c1c28;
    border-width: 2px;
  }

  .mv-tab-arrow {
    font-size: 0.7rem;
  }

  /* Empty */
  .mv-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mv-empty-text { color: #555; font-size: 0.8rem; }

  /* List */
  .mv-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    -webkit-overflow-scrolling: touch;
  }

  .mv-card {
    background: #181822;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }

  .mv-card-glow {
    box-shadow: 0 0 8px rgba(255,51,102,0.15);
  }

  .mv-card-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    opacity: 0.06;
    border-radius: 8px;
  }

  .mv-card-content {
    position: relative;
    display: flex;
    align-items: center;
    padding: 7px 10px;
    gap: 8px;
  }

  .mv-rank {
    font-size: 0.7rem;
    font-weight: 800;
    min-width: 16px;
    text-align: center;
    opacity: 0.7;
  }

  .mv-card-left {
    flex: 1;
    min-width: 0;
  }

  .mv-card-ticker-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .mv-tab-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .mv-card-ticker {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .mv-card-name {
    font-size: 0.55rem;
    color: #555;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    max-width: 100px;
  }

  .mv-card-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 60px;
  }

  .mv-card-change {
    font-size: 0.95rem;
    font-weight: 800;
  }

  .mv-card-distance {
    font-size: 0.5rem;
    color: #555;
  }

  .mv-card-right {
    min-width: 55px;
    text-align: right;
  }

  .mv-card-price {
    font-size: 0.75rem;
    font-weight: 600;
    color: #bbb;
  }

  /* Nav */
  .mv-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .mv-btn {
    flex: 1;
    text-align: center;
    padding: 8px;
    background: #1c1c28;
    color: #888;
    border: 1px solid #2d2d40;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    text-decoration: none;
    font-family: inherit;
  }

  .mv-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.6rem;
    color: #555;
  }

  .mv-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #00ff88;
  }

  .mv-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #555;
  }

  .mv-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #2d2d40;
    border-top-color: #00ff88;
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

  html, body { background: #111118; }
`;
