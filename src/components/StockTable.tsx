'use client';

import type { Stock, SortConfig, SortDirection } from '@/lib/types';
import { getScoreColor } from '@/lib/types';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';

interface StockTableProps {
  stocks: Stock[];
  sort: SortConfig;
  onSort: (column: keyof Stock) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}

const columns: { key: keyof Stock; label: string; shortLabel: string; align?: string }[] = [
  { key: 'ticker', label: 'Ticker', shortLabel: 'Ticker' },
  { key: 'company_name', label: 'Company Name', shortLabel: 'Company' },
  { key: 'sector', label: 'Sector', shortLabel: 'Sector' },
  { key: 'current_price', label: 'Current Price', shortLabel: 'Price', align: 'right' },
  { key: 'all_time_high', label: 'ATH', shortLabel: 'ATH', align: 'right' },
  { key: 'ath_decline_pct', label: '% Decline ATH', shortLabel: 'ATH%', align: 'right' },
  { key: 'score', label: 'Score', shortLabel: 'Score', align: 'right' },
  { key: 'highest_growth_pct', label: 'Highest Growth %', shortLabel: 'Max Growth', align: 'right' },
  { key: 'growth_event_count', label: '# Growth Events', shortLabel: 'Events', align: 'right' },
  { key: 'five_year_low', label: '5Y Low', shortLabel: '5YL', align: 'right' },
  { key: 'purchase_limit', label: 'Purchase Limit', shortLabel: 'Kooplim', align: 'right' },
  { key: 'detection_date', label: 'Detection Date', shortLabel: 'Detected' },
];

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (!direction) {
    return <span className="text-slate-600 ml-1">&#8597;</span>;
  }
  return (
    <span className="ml-1">
      {direction === 'asc' ? '\u25B2' : '\u25BC'}
    </span>
  );
}

export default function StockTable({
  stocks,
  sort,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onToggleFavorite,
  onDelete,
}: StockTableProps) {
  const allSelected = stocks.length > 0 && selectedIds.size === stocks.length;

  function getRowColorClass(score: number): string {
    const color = getScoreColor(score);
    switch (color) {
      case 'green':
        return 'row-score-green';
      case 'orange':
        return 'row-score-orange';
      case 'red':
        return 'row-score-red';
    }
  }

  function getScoreBadgeClass(score: number): string {
    const color = getScoreColor(score);
    switch (color) {
      case 'green':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'orange':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'red':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
    }
  }

  function renderCell(stock: Stock, key: keyof Stock) {
    const value = stock[key];

    switch (key) {
      case 'ticker':
        return (
          <span className="font-mono font-semibold text-blue-400">
            {String(value)}
          </span>
        );
      case 'current_price':
      case 'all_time_high':
      case 'five_year_low':
      case 'purchase_limit':
        return formatCurrency(value as number | null);
      case 'ath_decline_pct':
      case 'highest_growth_pct':
        return formatPercent(value as number | null);
      case 'score':
        return (
          <span
            className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${getScoreBadgeClass(
              stock.score,
            )}`}
          >
            {value}
          </span>
        );
      case 'detection_date':
        return formatDate(value as string | null);
      default:
        return String(value ?? '-');
    }
  }

  if (stocks.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
        <div className="text-slate-400 text-lg mb-2">No stocks found</div>
        <p className="text-slate-500 text-sm">
          Run a scan to detect stocks matching your criteria, or adjust your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="stock-table w-full text-sm">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="rounded bg-slate-700 border-slate-500"
                />
              </th>
              <th className="px-2 py-3 text-center w-10"></th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  className={`px-3 py-3 text-slate-300 font-medium text-xs uppercase tracking-wider ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.shortLabel}
                  <SortIcon
                    direction={sort.column === col.key ? sort.direction : null}
                  />
                </th>
              ))}
              <th className="px-3 py-3 text-center text-slate-300 font-medium text-xs uppercase tracking-wider">
                Link
              </th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {stocks.map((stock) => (
              <tr
                key={stock.id}
                className={`${getRowColorClass(stock.score)} transition-colors`}
              >
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(stock.id)}
                    onChange={() => onToggleSelect(stock.id)}
                    className="rounded bg-slate-700 border-slate-500"
                  />
                </td>
                <td className="px-2 py-2.5 text-center">
                  <button
                    onClick={() => onToggleFavorite(stock.id)}
                    className="star-btn text-lg"
                    title="Toggle favorite (F)"
                  >
                    {stock.is_favorite ? (
                      <span className="text-yellow-400">{'\u2605'}</span>
                    ) : (
                      <span className="text-slate-600 hover:text-yellow-400">{'\u2606'}</span>
                    )}
                  </button>
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 ${
                      col.align === 'right' ? 'text-right font-mono' : ''
                    }`}
                  >
                    {renderCell(stock, col.key)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      stock.ticker + ' stock',
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs"
                  >
                    Search
                  </a>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <button
                    onClick={() => onDelete(stock.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete (Del)"
                  >
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
