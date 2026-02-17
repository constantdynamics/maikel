'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/defog/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PortfolioStock {
  id: string;
  ticker: string;
  name: string;
  currentPrice: number;
  purchasedPrice: number;
  purchasedDate: string;
  profitPercent: number;
  profitAbsolute: number;
  dayChangePercent: number;
  currency: string;
  lastUpdated: string;
  tabName: string;
  tabColor: string;
}

interface PortfolioSummary {
  totalStocks: number;
  winners: number;
  losers: number;
  avgProfit: number;
  bestPerformer: PortfolioStock | null;
  worstPerformer: PortfolioStock | null;
}

// ─── Store extraction ────────────────────────────────────────────────────────

function getPortfolioFromStore(): PortfolioStock[] {
  const state = useStore.getState();
  if (!state.purchasedStocks) return [];

  return state.purchasedStocks
    .filter((s) => s.purchasedPrice > 0 && s.currentPrice > 0)
    .map((s) => {
      const profitAbsolute = s.currentPrice - s.purchasedPrice;
      const profitPercent = (profitAbsolute / s.purchasedPrice) * 100;
      return {
        id: s.id,
        ticker: s.ticker,
        name: s.displayName || s.name || s.ticker,
        currentPrice: s.currentPrice,
        purchasedPrice: s.purchasedPrice,
        purchasedDate: s.purchasedDate,
        profitPercent,
        profitAbsolute,
        dayChangePercent: s.dayChangePercent || 0,
        currency: s.currency || 'EUR',
        lastUpdated: s.lastUpdated || '',
        tabName: s.originalTabName || '',
        tabColor: s.originalTabColor || '#666',
      };
    })
    .sort((a, b) => a.profitPercent - b.profitPercent); // worst first, best last
}

function getSummary(stocks: PortfolioStock[]): PortfolioSummary {
  if (stocks.length === 0) {
    return { totalStocks: 0, winners: 0, losers: 0, avgProfit: 0, bestPerformer: null, worstPerformer: null };
  }
  const winners = stocks.filter((s) => s.profitPercent > 0).length;
  const losers = stocks.filter((s) => s.profitPercent < 0).length;
  const avgProfit = stocks.reduce((sum, s) => sum + s.profitPercent, 0) / stocks.length;
  const sorted = [...stocks].sort((a, b) => b.profitPercent - a.profitPercent);
  return {
    totalStocks: stocks.length,
    winners,
    losers,
    avgProfit,
    bestPerformer: sorted[0] || null,
    worstPerformer: sorted[sorted.length - 1] || null,
  };
}

// ─── Portfolio Pulse Widget ──────────────────────────────────────────────────

export default function PortfolioPulseWidget() {
  const [stocks, setStocks] = useState<PortfolioStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const purchasedStocks = useStore((s) => s.purchasedStocks);

  const fetchData = useCallback(() => {
    const data = getPortfolioFromStore();
    setStocks(data);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [purchasedStocks, fetchData]);

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
      <div className="pf-container">
        <div className="pf-loading"><div className="pf-spinner" /><span>Laden...</span></div>
        <style>{portfolioStyles}</style>
      </div>
    );
  }

  const summary = getSummary(stocks);

  return (
    <div className="pf-container">
      {/* Header */}
      <div className="pf-header">
        <span className="pf-title">Portfolio Pulse</span>
        <button onClick={handleOpenApp} className="pf-link-btn">Open App</button>
      </div>

      {stocks.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon">📊</span>
          <span className="pf-empty-text">Geen gekochte aandelen</span>
          <span className="pf-empty-sub">Markeer aandelen als gekocht in de app</span>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="pf-summary">
            <div className="pf-summary-card">
              <span className="pf-summary-value" style={{ color: summary.avgProfit >= 0 ? '#00ff88' : '#ff3366' }}>
                {summary.avgProfit >= 0 ? '+' : ''}{summary.avgProfit.toFixed(1)}%
              </span>
              <span className="pf-summary-label">Gem. rendement</span>
            </div>
            <div className="pf-summary-card">
              <span className="pf-summary-value" style={{ color: '#00ff88' }}>{summary.winners}</span>
              <span className="pf-summary-label">Winst</span>
            </div>
            <div className="pf-summary-card">
              <span className="pf-summary-value" style={{ color: '#ff3366' }}>{summary.losers}</span>
              <span className="pf-summary-label">Verlies</span>
            </div>
            <div className="pf-summary-card">
              <span className="pf-summary-value" style={{ color: '#888' }}>{summary.totalStocks}</span>
              <span className="pf-summary-label">Totaal</span>
            </div>
          </div>

          {/* Stock list */}
          <div className="pf-list">
            {stocks.map((stock) => {
              const isProfit = stock.profitPercent >= 0;
              const accentColor = isProfit ? '#00ff88' : '#ff3366';
              const barWidth = Math.min(100, Math.abs(stock.profitPercent) * 2 + 10);
              const holdingDays = Math.floor((Date.now() - new Date(stock.purchasedDate).getTime()) / (1000 * 60 * 60 * 24));

              return (
                <div key={stock.id} className="pf-card">
                  {/* Profit/loss bar */}
                  <div
                    className="pf-card-bar"
                    style={{
                      backgroundColor: accentColor,
                      width: `${barWidth}%`,
                      [isProfit ? 'right' : 'left']: 0,
                    }}
                  />

                  <div className="pf-card-content">
                    {/* Left */}
                    <div className="pf-card-left">
                      <div className="pf-card-ticker-row">
                        <span className="pf-tab-dot" style={{ backgroundColor: stock.tabColor }} />
                        <span className="pf-card-ticker">{stock.ticker.split('.')[0]}</span>
                      </div>
                      <span className="pf-card-name">{stock.name}</span>
                      <span className="pf-card-holding">{holdingDays}d</span>
                    </div>

                    {/* Center: profit */}
                    <div className="pf-card-center">
                      <span className="pf-card-profit" style={{ color: accentColor }}>
                        {isProfit ? '+' : ''}{stock.profitPercent.toFixed(1)}%
                      </span>
                      <span className="pf-card-profit-abs" style={{ color: accentColor, opacity: 0.7 }}>
                        {isProfit ? '+' : ''}{stock.currency === 'USD' ? '$' : '€'}{stock.profitAbsolute.toFixed(2)}
                      </span>
                    </div>

                    {/* Right: prices */}
                    <div className="pf-card-right">
                      <span className="pf-card-price">
                        {stock.currency === 'USD' ? '$' : '€'}{stock.currentPrice.toFixed(2)}
                      </span>
                      <span className="pf-card-bought">
                        koop {stock.currency === 'USD' ? '$' : '€'}{stock.purchasedPrice.toFixed(2)}
                      </span>
                      <span className={`pf-card-day ${stock.dayChangePercent <= -3 ? 'pf-crash' : ''}`}>
                        {stock.dayChangePercent >= 0 ? '▲' : '▼'}
                        {stock.dayChangePercent >= 0 ? '+' : ''}{stock.dayChangePercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Nav */}
      <div className="pf-actions">
        <a href="/defog/widget" className="pf-btn">Top 24</a>
        <a href="/defog/widget/underwater" className="pf-btn">Onderwater</a>
        <a href="/defog/widget/movers" className="pf-btn">Movers</a>
      </div>

      {/* Status */}
      <div className="pf-status">
        <span className="pf-status-dot" />
        {lastRefresh && <span>{lastRefresh.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {/* Floating refresh button */}
      <button onClick={handleRefresh} disabled={refreshing} className="fab-refresh" aria-label="Verversen">
        <svg className={`fab-icon ${refreshing ? 'fab-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <style>{portfolioStyles}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const portfolioStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .pf-container {
    background: #0f0f14;
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

  .pf-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pf-title {
    font-size: 1rem;
    font-weight: 700;
  }

  .pf-link-btn {
    background: #1c1c26;
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

  .pf-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .pf-empty-icon { font-size: 2rem; }
  .pf-empty-text { font-size: 0.85rem; color: #888; }
  .pf-empty-sub { font-size: 0.7rem; color: #555; }

  /* Summary */
  .pf-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .pf-summary-card {
    background: #16161e;
    border-radius: 8px;
    padding: 8px 4px;
    text-align: center;
  }

  .pf-summary-value {
    display: block;
    font-size: 1rem;
    font-weight: 800;
  }

  .pf-summary-label {
    display: block;
    font-size: 0.5rem;
    color: #666;
    margin-top: 2px;
  }

  /* List */
  .pf-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .pf-card {
    background: #16161e;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }

  .pf-card-bar {
    position: absolute;
    top: 0;
    height: 100%;
    opacity: 0.06;
    border-radius: 8px;
  }

  .pf-card-content {
    position: relative;
    display: flex;
    align-items: center;
    padding: 8px 10px;
    gap: 8px;
  }

  .pf-card-left {
    flex: 1;
    min-width: 0;
  }

  .pf-card-ticker-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .pf-tab-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .pf-card-ticker {
    font-size: 0.85rem;
    font-weight: 700;
  }

  .pf-card-name {
    font-size: 0.55rem;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    max-width: 100px;
  }

  .pf-card-holding {
    font-size: 0.5rem;
    color: #555;
  }

  .pf-card-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 65px;
  }

  .pf-card-profit {
    font-size: 1rem;
    font-weight: 800;
  }

  .pf-card-profit-abs {
    font-size: 0.6rem;
  }

  .pf-card-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 65px;
    gap: 1px;
  }

  .pf-card-price {
    font-size: 0.8rem;
    font-weight: 700;
    color: #ddd;
  }

  .pf-card-bought {
    font-size: 0.55rem;
    color: #666;
  }

  .pf-card-day {
    font-size: 0.6rem;
    color: #888;
  }

  .pf-crash {
    color: #ff3366 !important;
    animation: pfPulse 2s ease-in-out infinite;
  }

  @keyframes pfPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Nav */
  .pf-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .pf-btn {
    flex: 1;
    text-align: center;
    padding: 8px;
    background: #1c1c26;
    color: #888;
    border: 1px solid #2d2d3d;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    text-decoration: none;
    font-family: inherit;
  }

  .pf-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.6rem;
    color: #555;
  }

  .pf-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #00ff88;
  }

  .pf-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #555;
  }

  .pf-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #2d2d3d;
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

  html, body { background: #0f0f14; }
`;
