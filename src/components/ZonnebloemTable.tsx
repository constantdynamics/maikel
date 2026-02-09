'use client';

import type { ZonnebloemStock, SortConfig } from '@/lib/types';
import { getExchangeFlag } from '@/lib/exchanges';
import RainbowScore from './RainbowScore';

interface ZonnebloemTableProps {
  stocks: ZonnebloemStock[];
  sort: SortConfig;
  onSort: (column: keyof ZonnebloemStock) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}

const columns: { key: keyof ZonnebloemStock; label: string; shortLabel: string; align?: string }[] = [
  { key: 'ticker', label: 'Ticker', shortLabel: 'Ticker' },
  { key: 'company_name', label: 'Company Name', shortLabel: 'Company' },
  { key: 'market', label: 'Market', shortLabel: 'Market' },
  { key: 'current_price', label: 'Current Price', shortLabel: 'Price', align: 'right' },
  { key: 'base_price_median', label: 'Base Price', shortLabel: 'Base', align: 'right' },
  { key: 'spike_score', label: 'Spike Score', shortLabel: 'Score', align: 'center' },
  { key: 'spike_count', label: '# Spikes', shortLabel: 'Spikes', align: 'right' },
  { key: 'highest_spike_pct', label: 'Highest Spike %', shortLabel: 'Max Spike', align: 'right' },
  { key: 'price_change_12m_pct', label: '12m Change', shortLabel: '12m%', align: 'right' },
  { key: 'avg_volume_30d', label: 'Avg Volume', shortLabel: 'Vol 30d', align: 'right' },
  { key: 'detection_date', label: 'Detected', shortLabel: 'Detected', align: 'center' },
];

const RIGHT_ALIGNED = new Set(['current_price', 'base_price_median', 'spike_count', 'highest_spike_pct', 'price_change_12m_pct', 'avg_volume_30d']);
const CENTER_ALIGNED = new Set(['spike_score', 'detection_date']);

function formatCurrency(val: number | null): string {
  if (val === null || val === undefined) return '-';
  return val < 1 ? `$${val.toFixed(4)}` : `$${val.toFixed(2)}`;
}

function formatVolume(val: number | null): string {
  if (val === null || val === undefined) return '-';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return String(val);
}

function formatPct(val: number | null): string {
  if (val === null || val === undefined) return '-';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

function formatShortDate(val: string | null): string {
  if (!val) return '-';
  const d = new Date(val);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function ZonnebloemTable({
  stocks,
  sort,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onToggleFavorite,
  onDelete,
}: ZonnebloemTableProps) {
  function renderCell(stock: ZonnebloemStock, key: keyof ZonnebloemStock) {
    switch (key) {
      case 'ticker':
        return (
          <span className="flex items-center gap-1.5">
            <span className="text-xs">{getExchangeFlag(stock.exchange, stock.ticker)}</span>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' stock')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ticker-link font-mono font-semibold text-purple-400 hover:text-purple-300 hover:underline transition-colors"
            >
              {stock.ticker}
            </a>
          </span>
        );

      case 'company_name':
        return (
          <span className="text-[var(--text-secondary)] truncate max-w-[200px] inline-block" title={stock.company_name}>
            {stock.company_name}
          </span>
        );

      case 'market':
        return <span className="text-xs text-[var(--text-muted)]">{stock.market || '-'}</span>;

      case 'current_price':
        return <span className="font-mono text-xs">{formatCurrency(stock.current_price)}</span>;

      case 'base_price_median':
        return <span className="font-mono text-xs text-[var(--text-muted)]">{formatCurrency(stock.base_price_median)}</span>;

      case 'spike_score': {
        const score = stock.spike_score;
        const normalizedScore = Math.min(10, Math.max(0, Math.round(score)));
        return <RainbowScore score={normalizedScore} maxScore={10} />;
      }

      case 'spike_count':
        return (
          <span className={`font-mono text-xs font-semibold ${stock.spike_count >= 3 ? 'text-green-400' : stock.spike_count >= 2 ? 'text-yellow-400' : 'text-[var(--text-secondary)]'}`}>
            {stock.spike_count}
          </span>
        );

      case 'highest_spike_pct':
        return (
          <span className={`font-mono text-xs font-semibold ${(stock.highest_spike_pct || 0) >= 200 ? 'text-green-400' : (stock.highest_spike_pct || 0) >= 100 ? 'text-yellow-400' : 'text-[var(--text-secondary)]'}`}>
            {stock.highest_spike_pct !== null ? `+${stock.highest_spike_pct.toFixed(0)}%` : '-'}
          </span>
        );

      case 'price_change_12m_pct': {
        const pct = stock.price_change_12m_pct;
        return (
          <span className={`font-mono text-xs ${pct !== null && pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatPct(pct)}
          </span>
        );
      }

      case 'avg_volume_30d':
        return <span className="font-mono text-xs text-[var(--text-muted)]">{formatVolume(stock.avg_volume_30d)}</span>;

      case 'detection_date':
        return (
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
            {formatShortDate(stock.detection_date)}
            {stock.scan_session_id && (
              <span className="ml-1 text-purple-400">#{stock.scan_session_id.slice(0, 4)}</span>
            )}
          </span>
        );

      default:
        return <span className="text-xs">{String(stock[key] ?? '-')}</span>;
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-color)]">
            <th className="w-8 p-2">
              <input
                type="checkbox"
                checked={stocks.length > 0 && selectedIds.size === stocks.length}
                onChange={onToggleSelectAll}
                className="rounded"
              />
            </th>
            <th className="w-8 p-2" />
            {columns.map((col) => (
              <th
                key={col.key}
                className={`p-2 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider ${
                  RIGHT_ALIGNED.has(col.key) ? 'text-right' : CENTER_ALIGNED.has(col.key) ? 'text-center' : 'text-left'
                }`}
                onClick={() => onSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.shortLabel}
                  {sort.column === (col.key as never) && (
                    <span className="text-purple-400">{sort.direction === 'desc' ? '\u25BC' : '\u25B2'}</span>
                  )}
                </span>
              </th>
            ))}
            <th className="w-8 p-2" />
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr
              key={stock.id}
              className={`border-b border-[var(--border-color)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer ${
                selectedIds.has(stock.id) ? 'bg-purple-900/20' : ''
              }`}
              onClick={() => onToggleSelect(stock.id)}
            >
              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(stock.id)}
                  onChange={() => onToggleSelect(stock.id)}
                  className="rounded"
                />
              </td>
              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onToggleFavorite(stock.id)}
                  className={`text-lg transition-colors ${stock.is_favorite ? 'text-yellow-400' : 'text-[var(--text-muted)] hover:text-yellow-400'}`}
                >
                  {stock.is_favorite ? '\u2605' : '\u2606'}
                </button>
              </td>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`p-2 ${
                    RIGHT_ALIGNED.has(col.key) ? 'text-right' : CENTER_ALIGNED.has(col.key) ? 'text-center' : 'text-left'
                  }`}
                >
                  {renderCell(stock, col.key)}
                </td>
              ))}
              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onDelete(stock.id)}
                  className="text-[var(--text-muted)] hover:text-red-400 transition-colors text-xs"
                  title="Delete"
                >
                  \u2716
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
