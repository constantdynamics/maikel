'use client';

import { useState, useCallback, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import StockTable from '@/components/StockTable';
import FilterBar from '@/components/FilterBar';
import ScanProgress from '@/components/ScanProgress';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useStocks } from '@/hooks/useStocks';
import { stocksToCSV, downloadCSV, generateCsvFilename } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

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
  const [scanTriggered, setScanTriggered] = useState(false);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

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
          requestBulkDelete();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, bulkFavorite]);

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
    setScanTriggered(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/scan', {
        method: 'POST',
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      // The ScanProgress component handles polling and completion
    } catch {
      setScanRunning(false);
    }
  }

  function handleScanComplete() {
    setScanRunning(false);
    setScanTriggered(false);
    refreshStocks();
  }

  function handleBulkFavorite() {
    bulkFavorite(selectedIds);
    setSelectedIds(new Set());
  }

  function requestBulkDelete() {
    const count = selectedIds.size;
    setConfirmDialog({
      open: true,
      title: `Delete ${count} stock${count !== 1 ? 's' : ''}?`,
      message: `${count} stock${count !== 1 ? 's' : ''} will be moved to the recycle bin. You can restore them later.`,
      onConfirm: () => {
        bulkDelete(selectedIds);
        setSelectedIds(new Set());
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  function requestDelete(id: string) {
    const stock = stocks.find((s) => s.id === id);
    setConfirmDialog({
      open: true,
      title: `Delete ${stock?.ticker || 'stock'}?`,
      message: `This stock will be moved to the recycle bin. You can restore it later.`,
      onConfirm: () => {
        deleteStock(id);
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>

        <ScanProgress
          scanTriggered={scanTriggered}
          onScanComplete={handleScanComplete}
        />

        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          sectors={sectors}
          onExport={handleExport}
          onRunScan={handleRunScan}
          scanRunning={scanRunning}
          selectedCount={selectedIds.size}
          onBulkFavorite={handleBulkFavorite}
          onBulkDelete={requestBulkDelete}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-400">Loading stocks...</div>
          </div>
        ) : stocks.length === 0 && !filters.search && !filters.sectorFilter ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-16 text-center">
            <h2 className="text-xl font-semibold mb-2">No Data Yet</h2>
            <p className="text-slate-400 mb-4">
              Click &ldquo;Run Scan&rdquo; to start scanning for high-potential recovery stocks.
            </p>
            <p className="text-slate-500 text-sm mb-6">
              Scans for stocks with 85-100% ATH decline and multiple 200%+ growth events.
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
            onDelete={requestDelete}
          />
        )}

        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        />
      </div>
    </AuthGuard>
  );
}
