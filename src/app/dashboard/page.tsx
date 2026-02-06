'use client';

import { useState, useCallback, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import StockTable from '@/components/StockTable';
import FilterBar from '@/components/FilterBar';
import ScanProgress from '@/components/ScanProgress';
import ConfirmDialog from '@/components/ConfirmDialog';
import Pagination from '@/components/Pagination';
import FixedUI from '@/components/FixedUI';
import ExportReminder from '@/components/ExportReminder';
import { useStocks } from '@/hooks/useStocks';
import { stocksToCSV, downloadCSV, generateCsvFilename } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface ScanSession {
  id: string;
  started_at: string;
  stocks_found: number;
}

const ITEMS_PER_PAGE = 200;

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
    bulkArchive,
    refreshStocks,
  } = useStocks();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanRunning, setScanRunning] = useState(false);
  const [scanTriggered, setScanTriggered] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sessions, setSessions] = useState<ScanSession[]>([]);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  // Load scan sessions
  useEffect(() => {
    async function loadSessions() {
      const { data } = await supabase
        .from('scan_logs')
        .select('id, started_at, stocks_found')
        .eq('status', 'completed')
        .gt('stocks_found', 0)
        .order('started_at', { ascending: false })
        .limit(20);

      if (data) {
        setSessions(data);
      }
    }
    loadSessions();
  }, [scanTriggered]);

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
      if (e.key === 'a' || e.key === 'A') {
        if (selectedIds.size > 0) {
          bulkArchive(selectedIds);
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
  }, [selectedIds, bulkFavorite, bulkArchive]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sort]);

  // Pagination
  const totalPages = Math.ceil(stocks.length / ITEMS_PER_PAGE);
  const paginatedStocks = stocks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === paginatedStocks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedStocks.map((s) => s.id)));
    }
  }

  const handleExport = useCallback(() => {
    const csv = stocksToCSV(stocks as unknown as Record<string, unknown>[]);
    if (csv) {
      downloadCSV(csv, generateCsvFilename());
    }
  }, [stocks]);

  async function handleRunScan(markets: string[]) {
    setScanRunning(true);
    setScanTriggered(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ markets }),
      });
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

  function handleBulkArchive() {
    bulkArchive(selectedIds);
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

  function handlePageChange(page: number) {
    setCurrentPage(page);
    setSelectedIds(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        <ExportReminder onExport={handleExport} />

        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Dashboard
            <span className="ml-3 text-sm font-normal text-[var(--text-muted)]">
              {stocks.length} stocks total
            </span>
          </h1>

          {/* Session info */}
          {sessions.length > 0 && (
            <div className="text-sm text-[var(--text-muted)]">
              Last scan: {new Date(sessions[0]?.started_at).toLocaleDateString()} ({sessions[0]?.stocks_found} found)
            </div>
          )}
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
          onBulkArchive={handleBulkArchive}
          onBulkDelete={requestBulkDelete}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[var(--text-muted)]">Loading stocks...</div>
          </div>
        ) : stocks.length === 0 && !filters.search && !filters.sectorFilter ? (
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-16 text-center">
            <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">No Data Yet</h2>
            <p className="text-[var(--text-secondary)] mb-4">
              Click &ldquo;Run Scan&rdquo; to start scanning for high-potential recovery stocks.
            </p>
            <p className="text-[var(--text-muted)] text-sm mb-6">
              Scans for stocks with 85-100% ATH decline and multiple 200%+ growth events.
            </p>
            <button
              onClick={() => handleRunScan(['us', 'ca'])}
              disabled={scanRunning}
              className="px-6 py-3 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 rounded-lg font-medium text-white transition-colors"
            >
              {scanRunning ? 'Scanning...' : 'Run First Scan'}
            </button>
          </div>
        ) : (
          <>
            <StockTable
              stocks={paginatedStocks}
              sort={sort}
              onSort={handleSort}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onToggleFavorite={toggleFavorite}
              onDelete={requestDelete}
            />

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                totalItems={stocks.length}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            )}
          </>
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

        <FixedUI />
      </div>
    </AuthGuard>
  );
}
