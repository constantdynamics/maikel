'use client';

import { useState, useEffect } from 'react';
import type { Stock, SortConfig, SortDirection } from '@/lib/types';
import { getScoreColor } from '@/lib/types';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';
import { getExchangeFlag } from '@/lib/exchanges';
import RainbowScore from './RainbowScore';
import StockDetailModal from './StockDetailModal';
import ColumnSettings, { type ColumnConfig } from './ColumnSettings';

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

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'ticker', label: 'Ticker', visible: true },
  { key: 'company_name', label: 'Company Name', visible: true },
  { key: 'exchange', label: 'Exchange', visible: true },
  { key: 'sector', label: 'Sector', visible: false },
  { key: 'current_price', label: 'Price', visible: true },
  { key: 'all_time_high', label: 'ATH', visible: true },
  { key: 'ath_decline_pct', label: 'ATH%', visible: true },
  { key: 'score', label: 'Score', visible: true },
  { key: 'growth_event_count', label: 'Events', visible: true },
  { key: 'sunflower_events', label: 'Growth', visible: true },
  { key: 'highest_growth_pct', label: 'Top Growth', visible: true },
  { key: 'five_year_low', label: '5Y Low', visible: false },
  { key: 'purchase_limit', label: 'Buy Limit', visible: false },
  { key: 'detection_date', label: 'Detected', visible: true },
  { key: 'scan_info', label: 'Scan #', visible: true },
  { key: 'is_stable_with_spikes', label: 'Stable+Spike', visible: false },
];

const COLUMN_ALIGNMENTS: Record<string, string> = {
  current_price: 'right',
  all_time_high: 'right',
  ath_decline_pct: 'right',
  score: 'right',
  growth_event_count: 'right',
  sunflower_events: 'left',
  highest_growth_pct: 'right',
  five_year_low: 'right',
  purchase_limit: 'right',
  scan_info: 'center',
  is_stable_with_spikes: 'center',
};

// Get growth event dots - max 10 in two rows, colors: green/yellow/white
function getGrowthDots(eventCount: number, highestGrowthPct: number | null): React.ReactNode {
  const count = Math.min(eventCount, 10);
  if (count === 0) return <span className="text-[var(--text-muted)]">-</span>;

  // Determine sizes based on growth percentage
  const sizes: ('small' | 'medium' | 'large')[] = [];
  const avgGrowth = highestGrowthPct ? highestGrowthPct / Math.max(eventCount, 1) : 200;

  for (let i = 0; i < count; i++) {
    // First event uses highest growth %, others estimate decreasing sizes
    const estimatedGrowth = i === 0 ? (highestGrowthPct || 200) : avgGrowth * (1 - i * 0.1);

    if (estimatedGrowth >= 500) {
      sizes.push('large');
    } else if (estimatedGrowth >= 300) {
      sizes.push('medium');
    } else {
      sizes.push('small');
    }
  }

  // Sort by size (largest first)
  sizes.sort((a, b) => {
    const order = { large: 0, medium: 1, small: 2 };
    return order[a] - order[b];
  });

  // Color mapping: large=green, medium=yellow, small=white
  const colorMap = {
    large: '#22c55e',   // Green
    medium: '#facc15',  // Yellow
    small: '#ffffff',   // White
  };

  // Split into two rows (max 5 per row)
  const topRow = sizes.slice(0, 5);
  const bottomRow = sizes.slice(5, 10);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {topRow.map((size, idx) => (
          <span
            key={idx}
            className="inline-block w-2 h-2 rounded-full border border-gray-600"
            style={{ backgroundColor: colorMap[size] }}
            title={`${size === 'large' ? '500%+' : size === 'medium' ? '300-500%' : '<300%'} growth`}
          />
        ))}
      </div>
      {bottomRow.length > 0 && (
        <div className="flex items-center gap-0.5">
          {bottomRow.map((size, idx) => (
            <span
              key={idx + 5}
              className="inline-block w-2 h-2 rounded-full border border-gray-600"
              style={{ backgroundColor: colorMap[size] }}
              title={`${size === 'large' ? '500%+' : size === 'medium' ? '300-500%' : '<300%'} growth`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (!direction) {
    return <span className="text-[var(--text-muted)] ml-1 opacity-50">↕</span>;
  }
  return (
    <span className="ml-1 text-[var(--accent-primary)]">
      {direction === 'asc' ? '▲' : '▼'}
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
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('stockTableColumns');
      if (saved) {
        try {
          const savedColumns = JSON.parse(saved) as ColumnConfig[];
          // Merge saved columns with defaults to include any new columns
          const savedKeys = new Set(savedColumns.map(c => c.key));
          const mergedColumns = [...savedColumns];

          // Add any new columns from defaults that aren't in saved
          for (const defaultCol of DEFAULT_COLUMNS) {
            if (!savedKeys.has(defaultCol.key)) {
              // Insert new column at the correct position
              const defaultIndex = DEFAULT_COLUMNS.findIndex(c => c.key === defaultCol.key);
              mergedColumns.splice(defaultIndex, 0, defaultCol);
            }
          }
          return mergedColumns;
        } catch { /* ignore */ }
      }
    }
    return DEFAULT_COLUMNS;
  });

  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  useEffect(() => {
    localStorage.setItem('stockTableColumns', JSON.stringify(columns));
  }, [columns]);

  const allSelected = stocks.length > 0 && selectedIds.size === stocks.length;
  const visibleColumns = columns.filter((c) => c.visible);

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

  function handleOpenSelectedInTabs() {
    const selectedStocks = stocks.filter((s) => selectedIds.has(s.id));

    // Open all tabs at once - browsers may block some, user needs to allow popups
    // This works better than setTimeout which only allows the first one
    selectedStocks.forEach((stock) => {
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' stock')}`,
        '_blank',
        'noopener,noreferrer',
      );
    });
  }

  function renderCell(stock: Stock, key: string) {
    const value = stock[key as keyof Stock];

    switch (key) {
      case 'ticker':
        return (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-600 text-white">
              {getExchangeFlag(stock.exchange, stock.ticker)}
            </span>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(String(value) + ' stock')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ticker-link font-mono"
              onClick={(e) => e.stopPropagation()}
            >
              {String(value)}
            </a>
          </div>
        );
      case 'exchange':
        return (
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
            {String(value || 'N/A')}
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
        return <RainbowScore score={stock.score} />;
      case 'sunflower_events':
        return getGrowthDots(stock.growth_event_count, stock.highest_growth_pct);
      case 'detection_date':
        return formatDate(value as string | null);
      case 'scan_info':
        // Show scan date with scan number (e.g., "07 Feb #2")
        if (!stock.scan_date) return '-';
        const scanDate = new Date(stock.scan_date);
        const dayMonth = scanDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const scanNum = stock.scan_number || 1;
        return (
          <span className="text-xs whitespace-nowrap">
            {dayMonth} <span className="text-[var(--accent-primary)]">#{scanNum}</span>
          </span>
        );
      case 'is_stable_with_spikes':
        // Show indicator for NovaBay-type stocks
        if (stock.is_stable_with_spikes) {
          return (
            <span
              className="text-green-400 text-lg"
              title={`Stable base (max ${stock.twelve_month_max_decline_pct?.toFixed(0)}% decline) with ${stock.twelve_month_max_spike_pct?.toFixed(0)}% spike`}
            >
              ⚡
            </span>
          );
        }
        return <span className="text-[var(--text-muted)]">-</span>;
      default:
        return String(value ?? '-');
    }
  }

  if (stocks.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-12 text-center">
        <div className="text-[var(--text-secondary)] text-lg mb-2">No stocks found</div>
        <p className="text-[var(--text-muted)] text-sm">
          Run a scan to detect stocks matching your criteria, or adjust your filters.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleOpenSelectedInTabs}
              className="px-3 py-1.5 text-sm bg-[var(--accent-primary)] text-white rounded-lg hover:opacity-90 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open {selectedIds.size} in Tabs
            </button>
          )}
        </div>
        <ColumnSettings
          columns={columns}
          onChange={setColumns}
          onReset={() => {
            setColumns(DEFAULT_COLUMNS);
            localStorage.removeItem('stockTableColumns');
          }}
        />
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="stock-table w-full text-sm">
            <thead className="bg-[var(--bg-tertiary)]">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-2 py-3 text-center w-10"></th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => onSort(col.key as keyof Stock)}
                    className={`px-3 py-3 text-[var(--text-secondary)] font-medium text-xs uppercase tracking-wider cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors ${
                      COLUMN_ALIGNMENTS[col.key] === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.label}
                    <SortIcon
                      direction={sort.column === col.key ? sort.direction : null}
                    />
                  </th>
                ))}
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {stocks.map((stock) => (
                <tr
                  key={stock.id}
                  onClick={() => setSelectedStock(stock)}
                  className={`${getRowColorClass(stock.score)} transition-colors cursor-pointer`}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(stock.id)}
                      onChange={() => onToggleSelect(stock.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleFavorite(stock.id)}
                      className="star-btn text-lg"
                      title="Toggle favorite (F)"
                    >
                      {stock.is_favorite ? (
                        <span className="text-yellow-400">★</span>
                      ) : (
                        <span className="text-[var(--text-muted)] hover:text-yellow-400">☆</span>
                      )}
                    </button>
                  </td>
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 ${
                        COLUMN_ALIGNMENTS[col.key] === 'right' ? 'text-right font-mono' : ''
                      }`}
                    >
                      {renderCell(stock, col.key)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onDelete(stock.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors"
                      title="Delete (Del)"
                    >
                      ✗
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-[var(--bg-tertiary)] text-sm text-[var(--text-muted)] flex justify-between">
          <span>{stocks.length} stocks</span>
          <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : ''}</span>
        </div>
      </div>

      {/* Detail Modal */}
      <StockDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
    </>
  );
}
