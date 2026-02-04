'use client';

import { useState, useCallback, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import StockTable from '@/components/StockTable';
import FilterBar from '@/components/FilterBar';
import { useStocks } from '@/hooks/useStocks';
import { stocksToCSV, downloadCSV, generateCsvFilename } from '@/lib/utils';
import type { Stock } from '@/lib/types';

export default function DashboardPage() {
  const {
    stocks,
    loading,
    filters,
    setFilters,
    sort,
    handleSort,
    sectors,
    toggleFavorite,
    deleteStock,
    bulkFavorite,
    bulkDelete,
    refreshStocks,
  } = useStocks();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanRunning, setScanRunning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        if (selectedIds.size > 0) {
          bulkFavorite(selectedIds);
          setSelectedIds(new Set());
        }
      }
      if (e.key === 'Delete') {
        if (selectedIds.size > 0) {
          bulkDelete(selectedIds);
          setSelectedIds(new Set());
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, bulkFavorite, bulkDelete]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === stocks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(stocks.map((s) => s.id)));
    }
  }

  const handleExport = useCallback(() => {
    const csv = stocksToCSV(stocks as unknown as Record<string, unknown>[]);
    if (csv) {
      downloadCSV(csv, generateCsvFilename());
    }
  }, [stocks]);

  async function handleRunScan() {
    setScanRunning(true);
    setScanMessage('Scan started...');

    try {
      const response = await fetch('/api/scan', { method: 'POST' });
      const result = await response.json();

      if (result.error) {
        setScanMessage(`Scan failed: ${result.error}`);
      } else {
        setScanMessage(
          `Scan complete: ${result.stocksFound} stocks found out of ${result.stocksScanned} scanned (${result.durationSeconds}s)`,
        );
        refreshStocks();
      }
    } catch (error) {
      setScanMessage('Scan failed: Network error');
    } finally {
      setScanRunning(false);
      setTimeout(() => setScanMessage(null), 10000);
    }
  }

  function handleBulkFavorite() {
    bulkFavorite(selectedIds);
    setSelectedIds(new Set());
  }

  function handleBulkDelete() {
    bulkDelete(selectedIds);
    setSelectedIds(new Set());
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {scanMessage && (
            <div className={`text-sm px-3 py-1.5 rounded ${
              scanMessage.includes('failed')
                ? 'bg-red-900/30 text-red-400'
                : 'bg-blue-900/30 text-blue-400'
            }`}>
              {scanMessage}
            </div>
          )}
        </div>

        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          sectors={sectors}
          onExport={handleExport}
          onRunScan={handleRunScan}
          scanRunning={scanRunning}
          selectedCount={selectedIds.size}
          onBulkFavorite={handleBulkFavorite}
          onBulkDelete={handleBulkDelete}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-400">Loading stocks...</div>
          </div>
        ) : stocks.length === 0 && !filters.search && !filters.sectorFilter ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-16 text-center">
            <h2 className="text-xl font-semibold mb-2">No Data Yet</h2>
            <p className="text-slate-400 mb-6">
              Click &ldquo;Run Scan&rdquo; to start scanning for stocks matching your criteria.
              The scan will check NYSE and NASDAQ stocks that have declined 95-99% from their
              all-time high but showed multiple 200%+ growth events.
            </p>
            <button
              onClick={handleRunScan}
              disabled={scanRunning}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg font-medium transition-colors"
            >
              {scanRunning ? 'Scanning...' : 'Run First Scan'}
            </button>
          </div>
        ) : (
          <StockTable
            stocks={stocks}
            sort={sort}
            onSort={handleSort}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onToggleFavorite={toggleFavorite}
            onDelete={deleteStock}
          />
        )}
      </div>
    </AuthGuard>
  );
}
