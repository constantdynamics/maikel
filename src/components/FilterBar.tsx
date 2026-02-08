'use client';

import { useState, useCallback } from 'react';
import type { FilterConfig } from '@/lib/types';
import MarketSelector, { getSelectedMarkets } from './MarketSelector';
import ApiStatus from './ApiStatus';
import AutoScanner from './AutoScanner';

export type QuickSelectType = 'top5' | 'top10' | 'score10' | 'scoreMin8' | 'scoreMin6' | 'none';

interface FilterBarProps {
  filters: FilterConfig;
  onFilterChange: (filters: FilterConfig) => void;
  sectors: string[];
  onExport: () => void;
  onRunScan: (markets: string[]) => void;
  scanRunning: boolean;
  selectedCount: number;
  onBulkFavorite: () => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onQuickSelect: (type: QuickSelectType) => void;
}

export default function FilterBar({
  filters,
  onFilterChange,
  sectors,
  onExport,
  onRunScan,
  scanRunning,
  selectedCount,
  onBulkFavorite,
  onBulkArchive,
  onBulkDelete,
  onQuickSelect,
}: FilterBarProps) {
  const [showQuickSelect, setShowQuickSelect] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(getSelectedMarkets);

  const handleMarketsChange = useCallback((markets: string[]) => {
    setSelectedMarkets(markets);
  }, []);

  function updateFilter(key: keyof FilterConfig, value: unknown) {
    onFilterChange({ ...filters, [key]: value });
  }

  function handleRunScan() {
    onRunScan(selectedMarkets);
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 mb-4 space-y-3">
      {/* Top row: Search, actions, scan */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search ticker or company name..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-sm"
          />
        </div>

        {/* Quick Select dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowQuickSelect(!showQuickSelect)}
            className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] rounded hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Select ▾
          </button>
          {showQuickSelect && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowQuickSelect(false)} />
              <div className="absolute left-0 top-full mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-xl z-20 min-w-[160px] py-1">
                <button
                  onClick={() => { onQuickSelect('top5'); setShowQuickSelect(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Top 5
                </button>
                <button
                  onClick={() => { onQuickSelect('top10'); setShowQuickSelect(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Top 10
                </button>
                <div className="border-t border-[var(--border-color)] my-1" />
                <button
                  onClick={() => { onQuickSelect('score10'); setShowQuickSelect(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Score = 10
                </button>
                <button
                  onClick={() => { onQuickSelect('scoreMin8'); setShowQuickSelect(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Score ≥ 8
                </button>
                <button
                  onClick={() => { onQuickSelect('scoreMin6'); setShowQuickSelect(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Score ≥ 6
                </button>
                <div className="border-t border-[var(--border-color)] my-1" />
                <button
                  onClick={() => { onQuickSelect('none'); setShowQuickSelect(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Clear Selection
                </button>
              </div>
            </>
          )}
        </div>

        <select
          value={filters.sectorFilter}
          onChange={(e) => updateFilter('sectorFilter', e.target.value)}
          className="px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-primary)] cursor-pointer [&>option]:bg-[#1a1a2e] [&>option]:text-white"
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showFavorites}
            onChange={(e) => updateFilter('showFavorites', e.target.checked)}
            className="rounded"
          />
          Favorites only
        </label>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] rounded hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          {showAdvanced ? 'Hide Filters' : 'More Filters'}
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {selectedCount > 0 && (
            <>
              <span className="text-sm text-[var(--text-muted)]">{selectedCount} selected</span>
              <button
                onClick={onBulkFavorite}
                className="px-3 py-2 text-sm bg-[var(--accent-orange)] text-white hover:opacity-90 rounded transition-colors"
                title="Mark as Favorite (F)"
              >
                Favorite
              </button>
              <button
                onClick={onBulkArchive}
                className="px-3 py-2 text-sm bg-blue-600 text-white hover:opacity-90 rounded transition-colors"
                title="Archive Selected (A)"
              >
                Archive
              </button>
              <button
                onClick={onBulkDelete}
                className="px-3 py-2 text-sm bg-[var(--accent-red)] text-white hover:opacity-90 rounded transition-colors"
                title="Delete Selected (Del)"
              >
                Delete
              </button>
            </>
          )}

          <button
            onClick={onExport}
            className="px-3 py-2 text-sm bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:opacity-90 rounded transition-colors"
          >
            Export CSV
          </button>

          <MarketSelector onChange={handleMarketsChange} />

          <button
            onClick={handleRunScan}
            disabled={scanRunning}
            className="px-4 py-2 text-sm bg-[var(--accent-primary)] text-white hover:opacity-90 disabled:opacity-50 rounded font-medium transition-colors"
          >
            {scanRunning ? 'Scanning...' : 'Run Scan'}
          </button>

          <AutoScanner
            onRunScan={onRunScan}
            scanRunning={scanRunning}
            selectedMarkets={selectedMarkets}
          />

          <ApiStatus />
        </div>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="flex items-center gap-4 flex-wrap pt-2 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">Score:</span>
            <input
              type="number"
              placeholder="Min"
              value={filters.scoreMin ?? ''}
              onChange={(e) =>
                updateFilter('scoreMin', e.target.value ? Number(e.target.value) : null)
              }
              className="w-20 px-2 py-1 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm"
            />
            <span className="text-[var(--text-muted)]">-</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.scoreMax ?? ''}
              onChange={(e) =>
                updateFilter('scoreMax', e.target.value ? Number(e.target.value) : null)
              }
              className="w-20 px-2 py-1 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">ATH% Decline:</span>
            <input
              type="number"
              placeholder="Min"
              value={filters.athDeclineMin ?? ''}
              onChange={(e) =>
                updateFilter('athDeclineMin', e.target.value ? Number(e.target.value) : null)
              }
              className="w-20 px-2 py-1 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm"
            />
            <span className="text-[var(--text-muted)]">-</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.athDeclineMax ?? ''}
              onChange={(e) =>
                updateFilter('athDeclineMax', e.target.value ? Number(e.target.value) : null)
              }
              className="w-20 px-2 py-1 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">Market Cap (M):</span>
            <input
              type="number"
              placeholder="Min"
              value={filters.marketCapMin ? filters.marketCapMin / 1000000 : ''}
              onChange={(e) =>
                updateFilter('marketCapMin', e.target.value ? Number(e.target.value) * 1000000 : null)
              }
              className="w-20 px-2 py-1 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm"
            />
            <span className="text-[var(--text-muted)]">-</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.marketCapMax ? filters.marketCapMax / 1000000 : ''}
              onChange={(e) =>
                updateFilter('marketCapMax', e.target.value ? Number(e.target.value) * 1000000 : null)
              }
              className="w-20 px-2 py-1 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hideVolatileSectors}
              onChange={(e) => updateFilter('hideVolatileSectors', e.target.checked)}
              className="rounded"
            />
            <span title="Hide: Biotechnology, Pharmaceuticals, Cannabis, etc.">
              Hide volatile sectors
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={filters.showStableWithSpikes}
              onChange={(e) => updateFilter('showStableWithSpikes', e.target.checked)}
              className="rounded"
            />
            <span title="NovaBay-type: Stable base with upward spikes" className="flex items-center gap-1">
              Stable+Spikes <span className="text-green-400">⚡</span>
            </span>
          </label>

          <button
            onClick={() =>
              onFilterChange({
                search: '',
                sectorFilter: '',
                scoreMin: null,
                scoreMax: null,
                athDeclineMin: null,
                athDeclineMax: null,
                showFavorites: false,
                showArchived: false,
                hideVolatileSectors: false,
                marketCapMin: null,
                marketCapMax: null,
                showStableWithSpikes: false,
              })
            }
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Reset All
          </button>
        </div>
      )}
    </div>
  );
}
