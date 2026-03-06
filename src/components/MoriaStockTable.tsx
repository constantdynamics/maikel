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

/**
 * Get dot colors for growth events (Kuifje-style).
 * Green = 500%+, Yellow = 300-500%, White = <300%
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
 * Green = 200%+, Yellow = 100-200%, White = <100%
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

/**
 * Medal ranking sort value for dots (medaillespiegel).
 * Green × 1,000,000 + Yellow × 10,000 + White × 100
 */
export function dotsSortValue(dots: string[]): number {
  let green = 0, yellow = 0, white = 0;
  for (const c of dots) {
    if (c === '#22c55e') green++;
    else if (c === '#facc15') yellow++;
    else white++;
  }
  return green * 1_000_000 + yellow * 10_000 + white * 100;
}

function DotDisplay({ dots, tooltip }: { dots: string[]; tooltip: string }) {
  if (dots.length === 0) return <span className="text-[var(--text-muted)]">-</span>;

  const topRow = dots.slice(0, 5);
  const bottomRow = dots.slice(5, 10);

  return (
    <div className="flex flex-col gap-0.5" title={tooltip}>
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

export default function MoriaStockTable({
  stocks, sort, onSort, selectedIds, onToggleSelect, onToggleSelectAll,
  onToggleFavorite, onDelete,
}: Props) {
  const allSelected = stocks.length > 0 && selectedIds.size === stocks.length;

  const columns: { key: keyof MoriaStock; label: string; align?: string; tooltip?: string }[] = [
    { key: 'ticker', label: 'Ticker' },
    { key: 'company_name', label: 'Company' },
    { key: 'exchange', label: 'Exchange' },
    { key: 'current_price', label: 'Price', align: 'right' },
    { key: 'ath_decline_pct', label: 'ATH Drop', align: 'right' },
    { key: 'decline_from_3y_pct', label: '3Y Drop', align: 'right' },
    { key: 'decline_from_1y_pct', label: '1Y Drop', align: 'right' },
    { key: 'decline_from_6m_pct', label: '6M Drop', align: 'right' },
    { key: 'growth_event_count', label: 'Growth', tooltip: 'Growth events (Kuifje). Groen=500%+, Geel=300-500%, Wit=<300%' },
    { key: 'spike_count', label: 'Spikes', tooltip: 'Spike events (Zonnebloem). Groen=200%+, Geel=100-200%, Wit=<100%' },
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
                  onClick={() => onSort(col.key)}
                  title={col.tooltip}>
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
              const growthDots = getGrowthDotColors(stock.growth_event_count, stock.highest_growth_pct);
              const spikeDots = getSpikeDotColors(stock.spike_count, stock.highest_spike_pct);
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
                  <td className="p-3">
                    <DotDisplay dots={growthDots} tooltip={`${stock.growth_event_count} growth events, highest: ${stock.highest_growth_pct?.toFixed(0) ?? '-'}%`} />
                  </td>
                  <td className="p-3">
                    <DotDisplay dots={spikeDots} tooltip={`${stock.spike_count} spikes, highest: ${stock.highest_spike_pct?.toFixed(0) ?? '-'}%`} />
                  </td>
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
