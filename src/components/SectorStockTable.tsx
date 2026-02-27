'use client';

import type { SectorStock, SortConfig } from '@/lib/types';
import type { ScanSessionInfo } from '@/hooks/useSectorStocks';

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
  if (sort.column !== (column as never)) return <span className="text-[var(--text-muted)] ml-1">↕</span>;
  return <span className="ml-1">{sort.direction === 'asc' ? '↑' : '↓'}</span>;
}

function formatNumber(n: number | null): string {
  if (n === null || n === undefined) return '-';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

function formatPrice(p: number | null): string {
  if (p === null) return '-';
  return `$${p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(2) : p.toFixed(0)}`;
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
    dots.push(est >= 500 ? '#22c55e' : est >= 200 ? '#facc15' : '#ffffff');
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

export default function SectorStockTable({
  stocks, sort, onSort, selectedIds, onToggleSelect, onToggleSelectAll,
  onToggleFavorite, onDelete, scanSessions, accentColor,
}: Props) {
  const allSelected = stocks.length > 0 && selectedIds.size === stocks.length;

  const headerClass = 'px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)] select-none whitespace-nowrap';

  return (
    <div className="overflow-x-auto bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-color)]">
            <th className="px-3 py-2 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="rounded"
              />
            </th>
            <th className={headerClass} onClick={() => onSort('ticker')}>
              Ticker<SortIcon column="ticker" sort={sort} />
            </th>
            <th className={headerClass} onClick={() => onSort('company_name')}>
              Company<SortIcon column="company_name" sort={sort} />
            </th>
            <th className={headerClass}>Match</th>
            <th className={headerClass} onClick={() => onSort('current_price')}>
              Price<SortIcon column="current_price" sort={sort} />
            </th>
            <th className={headerClass} onClick={() => onSort('spike_count')}>
              Spikes<SortIcon column="spike_count" sort={sort} />
            </th>
            <th className={headerClass} onClick={() => onSort('growth_event_count')}>
              Growth<SortIcon column="growth_event_count" sort={sort} />
            </th>
            <th className={headerClass} onClick={() => onSort('highest_spike_pct')}>
              Max Spike<SortIcon column="highest_spike_pct" sort={sort} />
            </th>
            <th className={headerClass} onClick={() => onSort('ath_decline_pct')}>
              ATH Decline<SortIcon column="ath_decline_pct" sort={sort} />
            </th>
            <th className={headerClass} onClick={() => onSort('market_cap')}>
              Mkt Cap<SortIcon column="market_cap" sort={sort} />
            </th>
            <th className={headerClass} onClick={() => onSort('market')}>
              Market<SortIcon column="market" sort={sort} />
            </th>
            <th className={headerClass}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => {
            const isSelected = selectedIds.has(stock.id);
            const spikeDots = getSpikeDotColors(stock.spike_count, stock.highest_spike_pct);
            const growthDots = getGrowthDotColors(stock.growth_event_count, stock.highest_growth_pct);

            return (
              <tr
                key={stock.id}
                className={`border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors ${
                  isSelected ? 'bg-[var(--bg-tertiary)]' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(stock.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' ' + (stock.company_name || '') + ' stock')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-medium text-[var(--accent-primary)] hover:underline"
                  >
                    {stock.ticker}
                  </a>
                </td>
                <td className="px-3 py-2 max-w-[200px] truncate text-[var(--text-secondary)]">
                  {stock.company_name}
                </td>
                <td className="px-3 py-2">
                  <MatchBadge matchType={stock.match_type} />
                </td>
                <td className="px-3 py-2 font-mono text-[var(--text-primary)]">
                  {formatPrice(stock.current_price)}
                </td>
                <td className="px-3 py-2">
                  {spikeDots.length > 0 ? (
                    <div className="flex items-center gap-0.5">
                      {spikeDots.map((color, idx) => (
                        <span
                          key={idx}
                          className="inline-block w-2 h-2 rounded-full border border-gray-600"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {growthDots.length > 0 ? (
                    <div className="flex items-center gap-0.5">
                      {growthDots.map((color, idx) => (
                        <span
                          key={idx}
                          className="inline-block w-2 h-2 rounded-full border border-gray-600"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">
                  {stock.highest_spike_pct ? `${stock.highest_spike_pct.toFixed(0)}%` : '-'}
                </td>
                <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">
                  {stock.ath_decline_pct ? `${stock.ath_decline_pct.toFixed(0)}%` : '-'}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
                  {formatNumber(stock.market_cap)}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                  {stock.market || '-'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleFavorite(stock.id)}
                      className={`text-sm ${stock.is_favorite ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)] hover:text-[var(--accent-orange)]'}`}
                      title={stock.is_favorite ? 'Remove favorite' : 'Add favorite'}
                    >
                      {stock.is_favorite ? '★' : '☆'}
                    </button>
                    <button
                      onClick={() => onDelete(stock.id)}
                      className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-red)]"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {stocks.length === 0 && (
        <div className="py-12 text-center text-[var(--text-muted)]">
          No stocks to display
        </div>
      )}
    </div>
  );
}
