'use client';

import { useState } from 'react';
import type { ZonnebloemStock, SortConfig } from '@/lib/types';
import { getExchangeFlag } from '@/lib/exchanges';
import { ALL_ZB_COLUMNS, type ScanSessionInfo } from '@/hooks/useZonnebloemStocks';
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
  scanSessions: Map<string, ScanSessionInfo>;
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
}

// Spike dot categories for Zonnebloem:
type DotColor = 'green' | 'yellow' | 'white';

function getSpikeDots(spikeCount: number, highestSpikePct: number | null) {
  const count = Math.min(spikeCount, 10);
  if (count === 0) return { total: 0, green: 0, yellow: 0, white: 0, dots: [] as DotColor[] };

  const highest = highestSpikePct || 75;
  const avgSpike = highest / Math.max(spikeCount, 1);
  const dots: DotColor[] = [];

  for (let i = 0; i < count; i++) {
    const est = i === 0 ? highest : avgSpike * (1 - i * 0.08);
    if (est >= 200) dots.push('green');
    else if (est >= 100) dots.push('yellow');
    else dots.push('white');
  }

  dots.sort((a, b) => {
    const order: Record<DotColor, number> = { green: 0, yellow: 1, white: 2 };
    return order[a] - order[b];
  });

  return {
    total: dots.length,
    green: dots.filter(d => d === 'green').length,
    yellow: dots.filter(d => d === 'yellow').length,
    white: dots.filter(d => d === 'white').length,
    dots,
  };
}

export function spikeDotsSortValue(stock: ZonnebloemStock): number {
  const d = getSpikeDots(stock.spike_count, stock.highest_spike_pct);
  return d.total * 1_000_000 + d.green * 10_000 + d.yellow * 100 + d.white;
}

const DOT_COLORS: Record<DotColor, string> = {
  green: '#22c55e',
  yellow: '#facc15',
  white: '#ffffff',
};

function SpikeDotDisplay({ spikeCount, highestSpikePct }: { spikeCount: number; highestSpikePct: number | null }) {
  const { dots } = getSpikeDots(spikeCount, highestSpikePct);
  if (dots.length === 0) return <span className="text-[var(--text-muted)]">-</span>;

  const topRow = dots.slice(0, 5);
  const bottomRow = dots.slice(5, 10);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {topRow.map((color, idx) => (
          <span key={idx} className="inline-block w-2 h-2 rounded-full border border-gray-600"
            style={{ backgroundColor: DOT_COLORS[color] }}
            title={`${color === 'green' ? '>=200%' : color === 'yellow' ? '100-200%' : '<100%'} spike`}
          />
        ))}
      </div>
      {bottomRow.length > 0 && (
        <div className="flex items-center gap-0.5">
          {bottomRow.map((color, idx) => (
            <span key={idx + 5} className="inline-block w-2 h-2 rounded-full border border-gray-600"
              style={{ backgroundColor: DOT_COLORS[color] }}
              title={`${color === 'green' ? '>=200%' : color === 'yellow' ? '100-200%' : '<100%'} spike`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const RIGHT_ALIGNED = new Set(['current_price', 'base_price_median', 'highest_spike_pct', 'price_change_12m_pct', 'avg_volume_30d', 'market_cap', 'spike_score']);
const CENTER_ALIGNED = new Set(['spike_dots', 'detection_date', 'scan_number', 'scan_time']);

function formatCurrency(val: number | null): string {
  if (val === null || val === undefined) return '-';
  return val < 1 ? `$${val.toFixed(4)}` : `$${val.toFixed(2)}`;
}

function formatVolume(val: number | null): string {
  if (val === null || val === undefined) return '-';
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
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

function ColumnPicker({ visibleColumns, onToggle }: { visibleColumns: Set<string>; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] rounded transition-colors"
        title="Choose columns"
      >
        Columns
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-xl p-3 min-w-[200px]">
            <div className="text-xs font-medium text-[var(--text-muted)] uppercase mb-2">Show/Hide Columns</div>
            {ALL_ZB_COLUMNS.map((col) => (
              <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--hover-bg)] px-1 rounded text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={visibleColumns.has(col.key)}
                  onChange={() => onToggle(col.key)}
                  className="rounded"
                />
                {col.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
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
  scanSessions,
  visibleColumns,
  onToggleColumn,
}: ZonnebloemTableProps) {
  const activeColumns = ALL_ZB_COLUMNS.filter(col => visibleColumns.has(col.key));

  function handleSort(key: string) {
    onSort(key as keyof ZonnebloemStock);
  }

  function renderCell(stock: ZonnebloemStock, key: string) {
    const session = stock.scan_session_id ? scanSessions.get(stock.scan_session_id) : null;

    switch (key) {
      case 'ticker':
        return (
          <span className="flex items-center gap-1.5">
            <span className="text-xs">{getExchangeFlag(stock.exchange, stock.ticker)}</span>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' ' + (stock.company_name || '') + ' stock')}`}
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

      case 'spike_dots':
        return <SpikeDotDisplay spikeCount={stock.spike_count} highestSpikePct={stock.highest_spike_pct} />;

      case 'spike_score': {
        const normalizedScore = Math.min(10, Math.max(0, Math.round(stock.spike_score)));
        return <RainbowScore score={normalizedScore} maxScore={10} />;
      }

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

      case 'market_cap':
        return <span className="font-mono text-xs text-[var(--text-muted)]">{formatVolume(stock.market_cap)}</span>;

      case 'sector':
        return <span className="text-xs text-[var(--text-muted)] truncate max-w-[120px] inline-block" title={stock.sector || ''}>{stock.sector || '-'}</span>;

      case 'country':
        return <span className="text-xs text-[var(--text-muted)]">{stock.country || '-'}</span>;

      case 'scan_number':
        return (
          <span className="text-xs font-mono text-purple-400">
            {session ? `#${session.dailyNumber}` : '-'}
          </span>
        );

      case 'scan_time':
        return (
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
            {session ? `${session.date.slice(5)} ${session.time}` : '-'}
          </span>
        );

      case 'detection_date':
        return (
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
            {formatShortDate(stock.detection_date)}
          </span>
        );

      default:
        return <span className="text-xs">{String(stock[key as keyof ZonnebloemStock] ?? '-')}</span>;
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <ColumnPicker visibleColumns={visibleColumns} onToggle={onToggleColumn} />
      </div>
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
              {activeColumns.map((col) => (
                <th
                  key={col.key}
                  className={`p-2 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider ${
                    RIGHT_ALIGNED.has(col.key) ? 'text-right' : CENTER_ALIGNED.has(col.key) ? 'text-center' : 'text-left'
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
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
                {activeColumns.map((col) => (
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
                    &#x2716;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
