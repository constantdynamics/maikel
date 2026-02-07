'use client';

import type { ZonnebloemStock, SortConfig, SortDirection } from '@/lib/types';
import { getZBScoreColor } from '@/lib/zonnebloem/scorer';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';

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
  { key: 'price_change_12m_pct', label: '12m Change', shortLabel: '12m%', align: 'right' },
  { key: 'spike_score', label: 'Spike Score', shortLabel: 'Score', align: 'right' },
  { key: 'spike_count', label: '# Spikes', shortLabel: 'Spikes', align: 'right' },
  { key: 'highest_spike_pct', label: 'Highest Spike %', shortLabel: 'Max Spike', align: 'right' },
  { key: 'avg_volume_30d', label: 'Avg Volume', shortLabel: 'Vol 30d', align: 'right' },
  { key: 'detection_date', label: 'Detection Date', shortLabel: 'Detected' },
];

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (!direction) return <span className="text-slate-600 ml-1">&#8597;</span>;
  return <span className="ml-1">{direction === 'asc' ? '\u25B2' : '\u25BC'}</span>;
}

function formatVolume(value: number | null): string {
  if (value === null || value === undefined) return '-';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
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
  const allSelected = stocks.length > 0 && selectedIds.size === stocks.length;

  function getScoreBadgeClass(score: number): string {
    const color = getZBScoreColor(score);
    switch (color) {
      case 'green': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'orange': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'red': return 'bg-red-500/20 text-red-400 border-red-500/30';
    }
  }

  function getRowColorClass(score: number): string {
    const color = getZBScoreColor(score);
    switch (color) {
      case 'green': return 'row-score-green';
      case 'orange': return 'row-score-orange';
      case 'red': return 'row-score-red';
    }
  }

  function renderCell(stock: ZonnebloemStock, key: keyof ZonnebloemStock) {
    const value = stock[key];

    switch (key) {
      case 'ticker':
        return <span className="font-mono font-semibold text-purple-400">{String(value)}</span>;
      case 'current_price':
      case 'base_price_median':
        return formatCurrency(value as number | null);
      case 'price_change_12m_pct':
      case 'highest_spike_pct':
        return (
          <span className={
            (value as number) > 0 ? 'text-green-400' :
            (value as number) < -10 ? 'text-red-400' : ''
          }>
            {formatPercent(value as number | null)}
          </span>
        );
      case 'spike_score':
        return (
          <span className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${getScoreBadgeClass(stock.spike_score)}`}>
            {typeof value === 'number' ? value.toFixed(1) : value}
          </span>
        );
      case 'avg_volume_30d':
        return formatVolume(value as number | null);
      case 'detection_date':
        return formatDate(value as string | null);
      case 'market':
        return <span className="text-xs uppercase text-slate-400">{String(value ?? '-')}</span>;
      default:
        return String(value ?? '-');
    }
  }

  if (stocks.length === 0) {
    return (
      <div className="bg-slate-800 border border-purple-700/30 rounded-lg p-12 text-center">
        <div className="text-slate-400 text-lg mb-2">No Zonnebloem stocks found</div>
        <p className="text-slate-500 text-sm">
          Run a Zonnebloem scan to detect stocks with stable bases and explosive spikes.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-purple-700/30 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="stock-table w-full text-sm">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="px-3 py-3 text-left">
                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="rounded bg-slate-700 border-slate-500" />
              </th>
              <th className="px-2 py-3 text-center w-10"></th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  className={`px-3 py-3 text-slate-300 font-medium text-xs uppercase tracking-wider cursor-pointer hover:text-white ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.shortLabel}
                  <SortIcon direction={sort.column === (col.key as never) ? sort.direction : null} />
                </th>
              ))}
              <th className="px-3 py-3 text-center text-slate-300 font-medium text-xs uppercase tracking-wider">Link</th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {stocks.map((stock) => (
              <tr key={stock.id} className={`${getRowColorClass(stock.spike_score)} transition-colors`}>
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={selectedIds.has(stock.id)} onChange={() => onToggleSelect(stock.id)} className="rounded bg-slate-700 border-slate-500" />
                </td>
                <td className="px-2 py-2.5 text-center">
                  <button onClick={() => onToggleFavorite(stock.id)} className="star-btn text-lg" title="Toggle favorite">
                    {stock.is_favorite
                      ? <span className="text-yellow-400">{'\u2605'}</span>
                      : <span className="text-slate-600 hover:text-yellow-400">{'\u2606'}</span>
                    }
                  </button>
                </td>
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-2.5 ${col.align === 'right' ? 'text-right font-mono' : ''}`}>
                    {renderCell(stock, col.key)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' stock')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 text-xs"
                  >
                    Search
                  </a>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <button onClick={() => onDelete(stock.id)} className="text-slate-500 hover:text-red-400 transition-colors" title="Delete">
                    {'\u2717'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-slate-700/30 text-sm text-slate-400 flex justify-between">
        <span>{stocks.length} stocks</span>
        <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : ''}</span>
      </div>
    </div>
  );
}
