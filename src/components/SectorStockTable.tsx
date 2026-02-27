'use client';

import { useState } from 'react';
import type { SectorStock, SortConfig } from '@/lib/types';
import type { ScanSessionInfo } from '@/hooks/useSectorStocks';
import { getExchangeFlag } from '@/lib/exchanges';
import RainbowScore from './RainbowScore';

interface Props {
  stocks: SectorStock[];
  sort: SortConfig;
  onSort: (column: keyof SectorStock) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  scanSessions: Map<string, ScanSessionInfo>;
  accentColor: string; // 'emerald' | 'amber'
}

function SortIcon({ column, sort }: { column: string; sort: SortConfig }) {
  if (sort.column !== (column as never)) return <span className="text-[var(--text-muted)] ml-1 opacity-50">↕</span>;
  return <span className="ml-1 text-[var(--accent-primary)]">{sort.direction === 'asc' ? '▲' : '▼'}</span>;
}

function formatPrice(p: number | null): string {
  if (p === null) return '-';
  return `$${p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(2) : p.toFixed(0)}`;
}

function formatPct(val: number | null): string {
  if (val === null || val === undefined) return '-';
  return `${val.toFixed(1)}%`;
}

function formatShortDate(val: string | null): string {
  if (!val) return '-';
  const d = new Date(val);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/**
 * Get dot colors for growth events (Kuifje-style).
 */
function getGrowthDotColors(eventCount: number, highestGrowthPct: number | null): string[] {
  const count = Math.min(eventCount, 10);
  if (count === 0) return [];
  const avg = highestGrowthPct ? highestGrowthPct / Math.max(eventCount, 1) : 200;
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const est = i === 0 ? (highestGrowthPct || 200) : avg * (1 - i * 0.1);
    dots.push(est >= 500 ? '#22c55e' : est >= 300 ? '#facc15' : '#ffffff');
  }
  return dots;
}

/**
 * Get dot colors for spike events (Zonnebloem-style).
 */
function getSpikeDotColors(spikeCount: number, highestSpikePct: number | null): string[] {
  const count = Math.min(spikeCount, 10);
  if (count === 0) return [];
  const avg = highestSpikePct ? highestSpikePct / Math.max(spikeCount, 1) : 100;
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const est = i === 0 ? (highestSpikePct || 100) : avg * (1 - i * 0.1);
    dots.push(est >= 200 ? '#22c55e' : est >= 100 ? '#facc15' : '#ffffff');
  }
  return dots;
}

function MatchBadge({ matchType }: { matchType: string }) {
  if (matchType === 'both') {
    return <span className="text-[9px] px-1 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/50">K+Z</span>;
  }
  if (matchType === 'kuifje') {
    return <span className="text-[9px] px-1 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700/50">K</span>;
  }
  return <span className="text-[9px] px-1 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/50">Z</span>;
}

function DotDisplay({ dots }: { dots: string[] }) {
  if (dots.length === 0) return <span className="text-[var(--text-muted)]">-</span>;

  const topRow = dots.slice(0, 5);
  const bottomRow = dots.slice(5, 10);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {topRow.map((color, idx) => (
          <span
            key={idx}
            className="inline-block w-2 h-2 rounded-full border border-gray-600"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      {bottomRow.length > 0 && (
        <div className="flex items-center gap-0.5">
          {bottomRow.map((color, idx) => (
            <span
              key={idx + 5}
              className="inline-block w-2 h-2 rounded-full border border-gray-600"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SectorStockTable({
  stocks, sort, onSort, selectedIds, onToggleSelect, onToggleSelectAll,
  onToggleFavorite, onDelete, scanSessions, accentColor,
}: Props) {
  const [favAnimating, setFavAnimating] = useState<string | null>(null);
  const allSelected = stocks.length > 0 && selectedIds.size === stocks.length;

  const headerClass = 'px-3 py-3 text-[var(--text-secondary)] font-medium text-xs uppercase tracking-wider cursor-pointer hover:bg-[var(--bg-secondary)] color-transition';

  function handleFavoriteClick(id: string) {
    setFavAnimating(id);
    onToggleFavorite(id);
    setTimeout(() => setFavAnimating(null), 300);
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg overflow-hidden animate-card">
      <div className="overflow-x-auto">
        <table className="stock-table w-full text-sm">
          <thead className="bg-[var(--bg-tertiary)]">
            <tr>
              <th className="px-2 py-3 text-center w-8 text-[var(--text-muted)] text-xs font-medium">#</th>
              <th className="px-3 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-2 py-3 text-center w-10"></th>
              <th className={`${headerClass} text-left`} onClick={() => onSort('ticker')}>
                Ticker<SortIcon column="ticker" sort={sort} />
              </th>
              <th className={`${headerClass} text-left hidden md:table-cell`} onClick={() => onSort('company_name')}>
                Company<SortIcon column="company_name" sort={sort} />
              </th>
              <th className={`${headerClass} text-center`}>Match</th>
              <th className={`${headerClass} text-right`} onClick={() => onSort('current_price')}>
                Price<SortIcon column="current_price" sort={sort} />
              </th>
              <th className={`${headerClass} text-right`} onClick={() => onSort('ath_decline_pct')}>
                ATH%<SortIcon column="ath_decline_pct" sort={sort} />
              </th>
              <th className={`${headerClass} text-right`} onClick={() => onSort('score')}>
                Score<SortIcon column="score" sort={sort} />
              </th>
              <th className={`${headerClass} text-left`} onClick={() => onSort('spike_count')}>
                Spikes<SortIcon column="spike_count" sort={sort} />
              </th>
              <th className={`${headerClass} text-left`} onClick={() => onSort('growth_event_count')}>
                Growth<SortIcon column="growth_event_count" sort={sort} />
              </th>
              <th className={`${headerClass} text-right`} onClick={() => onSort('highest_spike_pct')}>
                Top Spike<SortIcon column="highest_spike_pct" sort={sort} />
              </th>
              <th className={`${headerClass} text-right`} onClick={() => onSort('highest_growth_pct')}>
                Top Growth<SortIcon column="highest_growth_pct" sort={sort} />
              </th>
              <th className={`${headerClass} text-center`} onClick={() => onSort('detection_date')}>
                Detected<SortIcon column="detection_date" sort={sort} />
              </th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {stocks.map((stock, index) => {
              const isSelected = selectedIds.has(stock.id);
              const spikeDots = getSpikeDotColors(stock.spike_count, stock.highest_spike_pct);
              const growthDots = getGrowthDotColors(stock.growth_event_count, stock.highest_growth_pct);

              return (
                <tr
                  key={stock.id}
                  className={`animate-row color-transition hover:bg-[var(--bg-tertiary)] transition-colors ${
                    isSelected ? 'bg-[var(--bg-tertiary)]' : ''
                  }`}
                  style={{ animationDelay: `${Math.min(index * 0.02, 0.3)}s` }}
                >
                  <td className="px-2 py-2.5 text-center text-xs font-mono text-[var(--text-muted)]">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(stock.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleFavoriteClick(stock.id)}
                      className={`star-btn text-lg ${favAnimating === stock.id ? 'star-pop' : ''}`}
                      title="Toggle favorite (F)"
                    >
                      {stock.is_favorite ? (
                        <span className="text-yellow-400">★</span>
                      ) : (
                        <span className="text-[var(--text-muted)] hover:text-yellow-400">☆</span>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-600 text-white">
                        {getExchangeFlag(stock.exchange, stock.ticker)}
                      </span>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' ' + (stock.company_name || '') + ' stock')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ticker-link font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {stock.ticker}
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell max-w-[200px] truncate text-[var(--text-secondary)]">
                    {stock.company_name}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <MatchBadge matchType={stock.match_type} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatPrice(stock.current_price)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatPct(stock.ath_decline_pct)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <RainbowScore score={stock.score} />
                  </td>
                  <td className="px-3 py-2.5">
                    <DotDisplay dots={spikeDots} />
                  </td>
                  <td className="px-3 py-2.5">
                    <DotDisplay dots={growthDots} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    <span className={`text-xs font-semibold ${
                      (stock.highest_spike_pct || 0) >= 200 ? 'text-green-400' :
                      (stock.highest_spike_pct || 0) >= 100 ? 'text-yellow-400' :
                      'text-[var(--text-secondary)]'
                    }`}>
                      {stock.highest_spike_pct ? `+${stock.highest_spike_pct.toFixed(0)}%` : '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    <span className={`text-xs font-semibold ${
                      (stock.highest_growth_pct || 0) >= 500 ? 'text-green-400' :
                      (stock.highest_growth_pct || 0) >= 300 ? 'text-yellow-400' :
                      'text-[var(--text-secondary)]'
                    }`}>
                      {stock.highest_growth_pct ? `+${stock.highest_growth_pct.toFixed(0)}%` : '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {formatShortDate(stock.detection_date)}
                  </td>
                  <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onDelete(stock.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-red)] color-transition btn-press"
                      title="Delete (Del)"
                    >
                      ✗
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-[var(--bg-tertiary)] text-sm text-[var(--text-muted)] flex justify-between flex-wrap gap-2">
        <span>{stocks.length} stocks</span>
        <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : ''}</span>
      </div>

      {stocks.length === 0 && (
        <div className="py-12 text-center text-[var(--text-muted)]">
          No stocks to display
        </div>
      )}
    </div>
  );
}
