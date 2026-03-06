'use client';

import type { MoriaStock, SortConfig } from '@/lib/types';
import { getExchangeFlag } from '@/lib/exchanges';

interface Props {
  stocks: MoriaStock[];
  sort: SortConfig;
  onSort: (column: keyof MoriaStock) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
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

function declineColor(pct: number | null): string {
  if (pct === null) return 'text-[var(--text-muted)]';
  if (pct >= 99) return 'text-red-400';
  if (pct >= 95) return 'text-orange-400';
  if (pct >= 90) return 'text-yellow-400';
  return 'text-[var(--text-secondary)]';
}

export default function MoriaStockTable({
  stocks, sort, onSort, selectedIds, onToggleSelect, onToggleSelectAll,
  onToggleFavorite, onDelete,
}: Props) {
  const allSelected = stocks.length > 0 && selectedIds.size === stocks.length;

  const columns: { key: keyof MoriaStock; label: string; align?: string }[] = [
    { key: 'ticker', label: 'Ticker' },
    { key: 'company_name', label: 'Company' },
    { key: 'exchange', label: 'Exchange' },
    { key: 'current_price', label: 'Price', align: 'right' },
    { key: 'ath_decline_pct', label: 'ATH Drop', align: 'right' },
    { key: 'decline_from_3y_pct', label: '3Y Drop', align: 'right' },
    { key: 'decline_from_1y_pct', label: '1Y Drop', align: 'right' },
    { key: 'decline_from_6m_pct', label: '6M Drop', align: 'right' },
    { key: 'market_cap', label: 'Mkt Cap', align: 'right' },
    { key: 'detection_date', label: 'Found' },
  ];

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
              <th className="p-3 text-left">
                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="rounded" />
              </th>
              <th className="p-3 text-left text-[var(--text-muted)]">
                <span className="cursor-pointer" onClick={() => onSort('is_favorite')}>
                  ★<SortIcon column="is_favorite" sort={sort} />
                </span>
              </th>
              {columns.map((col) => (
                <th key={col.key}
                  className={`p-3 text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => onSort(col.key)}>
                  {col.label}<SortIcon column={col.key} sort={sort} />
                </th>
              ))}
              <th className="p-3 text-right text-[var(--text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => {
              const flag = getExchangeFlag(stock.exchange || '');
              const yahooTicker = stock.yahoo_ticker || stock.ticker;
              return (
                <tr key={stock.id}
                  className={`border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors ${selectedIds.has(stock.id) ? 'bg-[var(--bg-tertiary)]' : ''}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selectedIds.has(stock.id)} onChange={() => onToggleSelect(stock.id)} className="rounded" />
                  </td>
                  <td className="p-3">
                    <button onClick={() => onToggleFavorite(stock.id)}
                      className={`text-lg ${stock.is_favorite ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)] opacity-30 hover:opacity-70'}`}>
                      ★
                    </button>
                  </td>
                  <td className="p-3">
                    <a href={`https://finance.yahoo.com/quote/${yahooTicker}`}
                      target="_blank" rel="noopener noreferrer"
                      className="font-mono font-medium text-rose-400 hover:underline">
                      {flag && <span className="mr-1">{flag}</span>}
                      {stock.ticker}
                    </a>
                  </td>
                  <td className="p-3 text-[var(--text-secondary)] max-w-[200px] truncate" title={stock.company_name}>
                    {stock.company_name}
                  </td>
                  <td className="p-3 text-[var(--text-muted)] text-xs">{stock.exchange}</td>
                  <td className="p-3 text-right font-mono text-[var(--text-secondary)]">{formatPrice(stock.current_price)}</td>
                  <td className={`p-3 text-right font-mono ${declineColor(stock.ath_decline_pct)}`}>{formatPct(stock.ath_decline_pct)}</td>
                  <td className={`p-3 text-right font-mono ${declineColor(stock.decline_from_3y_pct)}`}>{formatPct(stock.decline_from_3y_pct)}</td>
                  <td className={`p-3 text-right font-mono ${declineColor(stock.decline_from_1y_pct)}`}>{formatPct(stock.decline_from_1y_pct)}</td>
                  <td className={`p-3 text-right font-mono ${declineColor(stock.decline_from_6m_pct)}`}>{formatPct(stock.decline_from_6m_pct)}</td>
                  <td className="p-3 text-right font-mono text-[var(--text-muted)] text-xs">
                    {stock.market_cap ? (stock.market_cap >= 1e9 ? `$${(stock.market_cap / 1e9).toFixed(1)}B` : stock.market_cap >= 1e6 ? `$${(stock.market_cap / 1e6).toFixed(0)}M` : `$${(stock.market_cap / 1e3).toFixed(0)}K`) : '-'}
                  </td>
                  <td className="p-3 text-[var(--text-muted)] text-xs whitespace-nowrap">
                    {stock.detection_date ? new Date(stock.detection_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-'}
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => onDelete(stock.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors text-xs">
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
