'use client';

import type { Stock } from '@/lib/types';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';
import { getExchangeCountry, getCountryFlag } from '@/lib/exchanges';

interface StockDetailModalProps {
  stock: Stock | null;
  onClose: () => void;
}

export default function StockDetailModal({ stock, onClose }: StockDetailModalProps) {
  if (!stock) return null;

  const country = getExchangeCountry(stock.exchange);
  const flag = getCountryFlag(country);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{flag}</span>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">{stock.ticker}</h2>
              {stock.is_favorite && <span className="text-yellow-400">★</span>}
            </div>
            <p className="text-[var(--text-secondary)] text-sm">{stock.company_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <InfoItem label="Current Price" value={formatCurrency(stock.current_price)} />
          <InfoItem label="All-Time High" value={formatCurrency(stock.all_time_high)} />
          <InfoItem label="ATH Decline" value={formatPercent(stock.ath_decline_pct)} highlight />
          <InfoItem label="5-Year Low" value={formatCurrency(stock.five_year_low)} />
          <InfoItem label="Score" value={String(stock.score)} />
          <InfoItem label="Growth Events" value={String(stock.growth_event_count)} />
          <InfoItem label="Highest Growth" value={formatPercent(stock.highest_growth_pct)} />
          <InfoItem label="Purchase Limit" value={formatCurrency(stock.purchase_limit)} />
        </div>

        <div className="border-t border-[var(--border-color)] pt-4 mb-4">
          <div className="grid grid-cols-2 gap-4">
            <InfoItem label="Exchange" value={stock.exchange || 'Unknown'} />
            <InfoItem label="Sector" value={stock.sector || 'Unknown'} />
            <InfoItem label="Market Cap" value={stock.market_cap ? `$${(stock.market_cap / 1e9).toFixed(2)}B` : 'N/A'} />
            <InfoItem label="IPO Date" value={stock.ipo_date || 'N/A'} />
          </div>
        </div>

        <div className="border-t border-[var(--border-color)] pt-4 text-xs text-[var(--text-muted)]">
          <div className="flex justify-between">
            <span>Detected: {formatDate(stock.detection_date)}</span>
            <span>Updated: {formatDate(stock.last_updated)}</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' stock')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 text-center rounded-lg bg-[var(--accent-primary)] text-white font-medium hover:opacity-90 transition-opacity"
          >
            Google Search
          </a>
          <a
            href={`https://finance.yahoo.com/quote/${encodeURIComponent(stock.ticker)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 text-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium hover:opacity-90 transition-opacity"
          >
            Yahoo Finance
          </a>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className={`font-medium ${highlight ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'}`}>
        {value}
      </div>
    </div>
  );
}
