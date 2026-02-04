'use client';

import { useState } from 'react';
import type { FilterConfig } from '@/lib/types';

interface FilterBarProps {
  filters: FilterConfig;
  onFilterChange: (filters: FilterConfig) => void;
  sectors: string[];
  onExport: () => void;
  onRunScan: () => void;
  scanRunning: boolean;
  selectedCount: number;
  onBulkFavorite: () => void;
  onBulkDelete: () => void;
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
  onBulkDelete,
}: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  function updateFilter(key: keyof FilterConfig, value: unknown) {
    onFilterChange({ ...filters, [key]: value });
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4 space-y-3">
      {/* Top row: Search, actions, scan */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search ticker or company name..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>

        <select
          value={filters.sectorFilter}
          onChange={(e) => updateFilter('sectorFilter', e.target.value)}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showFavorites}
            onChange={(e) => updateFilter('showFavorites', e.target.checked)}
            className="rounded bg-slate-700 border-slate-600"
          />
          Favorites only
        </label>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="px-3 py-2 text-sm text-slate-300 hover:text-white border border-slate-600 rounded hover:bg-slate-700 transition-colors"
        >
          {showAdvanced ? 'Hide Filters' : 'More Filters'}
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {selectedCount > 0 && (
            <>
              <span className="text-sm text-slate-400">{selectedCount} selected</span>
              <button
                onClick={onBulkFavorite}
                className="px-3 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 rounded transition-colors"
                title="Mark as Favorite (F)"
              >
                Mark Favorite
              </button>
              <button
                onClick={onBulkDelete}
                className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors"
                title="Delete Selected (Del)"
              >
                Delete
              </button>
            </>
          )}

          <button
            onClick={onExport}
            className="px-3 py-2 text-sm bg-slate-600 hover:bg-slate-500 rounded transition-colors"
          >
            Export CSV
          </button>

          <button
            onClick={onRunScan}
            disabled={scanRunning}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-slate-400 rounded font-medium transition-colors"
          >
            {scanRunning ? 'Scanning...' : 'Run Scan'}
          </button>
        </div>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="flex items-center gap-4 flex-wrap pt-2 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Score:</span>
            <input
              type="number"
              placeholder="Min"
              value={filters.scoreMin ?? ''}
              onChange={(e) =>
                updateFilter('scoreMin', e.target.value ? Number(e.target.value) : null)
              }
              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
            <span className="text-slate-500">-</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.scoreMax ?? ''}
              onChange={(e) =>
                updateFilter('scoreMax', e.target.value ? Number(e.target.value) : null)
              }
              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">ATH% Decline:</span>
            <input
              type="number"
              placeholder="Min"
              value={filters.athDeclineMin ?? ''}
              onChange={(e) =>
                updateFilter('athDeclineMin', e.target.value ? Number(e.target.value) : null)
              }
              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
            <span className="text-slate-500">-</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.athDeclineMax ?? ''}
              onChange={(e) =>
                updateFilter('athDeclineMax', e.target.value ? Number(e.target.value) : null)
              }
              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
          </div>

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
              })
            }
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Reset All
          </button>
        </div>
      )}
    </div>
  );
}
