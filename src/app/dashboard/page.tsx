'use client';

import { useState, useCallback, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import StockTable from '@/components/StockTable';
import FilterBar, { type QuickSelectType } from '@/components/FilterBar';
import ScanProgress from '@/components/ScanProgress';
import ZonnebloemScanProgress from '@/components/ZonnebloemScanProgress';
import ZonnebloemTable from '@/components/ZonnebloemTable';
import TileGrid from '@/components/TileGrid';
import ConfirmDialog from '@/components/ConfirmDialog';
import Pagination from '@/components/Pagination';
import FixedUI from '@/components/FixedUI';
import ExportReminder from '@/components/ExportReminder';
import { useStocks } from '@/hooks/useStocks';
import { useZonnebloemStocks } from '@/hooks/useZonnebloemStocks';
import { stocksToCSV, downloadCSV, generateCsvFilename } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

type ScannerTab = 'kuifje' | 'zonnebloem';

interface ScanSession {
  id: string;
  started_at: string;
  stocks_found: number;
}

const ITEMS_PER_PAGE = 200;

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<ScannerTab>('kuifje');

  // Kuifje state
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

  // Zonnebloem state
  const {
    stocks: zbStocks,
    loading: zbLoading,
    filters: zbFilters,
    setFilters: setZbFilters,
    sort: zbSort,
    handleSort: zbHandleSort,
    sectors: zbSectors,
    markets: zbMarkets,
    scanSessions: zbScanSessions,
    visibleColumns: zbVisibleColumns,
    toggleColumn: zbToggleColumn,
    toggleFavorite: zbToggleFavorite,
    deleteStock: zbDeleteStock,
    bulkFavorite: zbBulkFavorite,
    bulkDelete: zbBulkDelete,
    bulkArchive: zbBulkArchive,
    refreshStocks: zbRefreshStocks,
  } = useZonnebloemStocks();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [kuifjeView, setKuifjeView] = useState<'table' | 'tiles'>('table');
  const [scanRunning, setScanRunning] = useState(false);
  const [scanTriggered, setScanTriggered] = useState(false);
  const [zbScanRunning, setZbScanRunning] = useState(false);
  const [zbScanTriggered, setZbScanTriggered] = useState(false);
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
          if (activeTab === 'kuifje') bulkFavorite(selectedIds);
          else zbBulkFavorite(selectedIds);
          setSelectedIds(new Set());
        }
      }
      if (e.key === 'a' || e.key === 'A') {
        if (selectedIds.size > 0 && activeTab === 'kuifje') {
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
  }, [selectedIds, bulkFavorite, bulkArchive, zbBulkFavorite, activeTab]);

  // Reset page when filters/tab change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [filters, sort, zbFilters, zbSort, activeTab]);

  // Pagination for active tab
  const activeStocks = activeTab === 'kuifje' ? stocks : zbStocks;
  const totalPages = Math.ceil(activeStocks.length / ITEMS_PER_PAGE);
  const paginatedStocks = activeStocks.slice(
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

  async function handleRunZbScan() {
    setZbScanRunning(true);
    setZbScanTriggered(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/zonnebloem/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({}),
      });
    } catch {
      setZbScanRunning(false);
    }
  }

  function handleScanComplete() {
    setScanRunning(false);
    setScanTriggered(false);
    refreshStocks();
  }

  function handleZbScanComplete() {
    setZbScanRunning(false);
    setZbScanTriggered(false);
    zbRefreshStocks();
  }

  function handleBulkFavorite() {
    if (activeTab === 'kuifje') bulkFavorite(selectedIds);
    else zbBulkFavorite(selectedIds);
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
        if (activeTab === 'kuifje') bulkDelete(selectedIds);
        else zbBulkDelete(selectedIds);
        setSelectedIds(new Set());
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  function requestDelete(id: string) {
    const allStocks = activeTab === 'kuifje' ? stocks : zbStocks;
    const stock = allStocks.find((s) => s.id === id);
    setConfirmDialog({
      open: true,
      title: `Delete ${stock?.ticker || 'stock'}?`,
      message: `This stock will be moved to the recycle bin. You can restore it later.`,
      onConfirm: () => {
        if (activeTab === 'kuifje') deleteStock(id);
        else zbDeleteStock(id);
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  function handlePageChange(page: number) {
    setCurrentPage(page);
    setSelectedIds(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleQuickSelect(type: QuickSelectType) {
    if (type === 'none') {
      setSelectedIds(new Set());
      return;
    }

    let toSelect: string[] = [];
    const pageStocks = paginatedStocks;

    switch (type) {
      case 'top5':
        toSelect = pageStocks.slice(0, 5).map((s) => s.id);
        break;
      case 'top10':
        toSelect = pageStocks.slice(0, 10).map((s) => s.id);
        break;
      case 'score10':
        toSelect = pageStocks.filter((s) => 'score' in s && (s as { score: number }).score === 10).map((s) => s.id);
        break;
      case 'scoreMin8':
        toSelect = pageStocks.filter((s) => 'score' in s && (s as { score: number }).score >= 8).map((s) => s.id);
        break;
      case 'scoreMin6':
        toSelect = pageStocks.filter((s) => 'score' in s && (s as { score: number }).score >= 6).map((s) => s.id);
        break;
    }

    setSelectedIds(new Set(toSelect));
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        <ExportReminder onExport={handleExport} />

        {/* Scanner tabs */}
        <div className="flex items-center gap-4 border-b border-[var(--border-color)]">
          <button
            onClick={() => setActiveTab('kuifje')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'kuifje'
                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Kuifje
            <span className="ml-2 text-xs text-[var(--text-muted)]">({stocks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('zonnebloem')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'zonnebloem'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Prof. Zonnebloem
            <span className="ml-2 text-xs text-[var(--text-muted)]">({zbStocks.length})</span>
          </button>
        </div>

        {/* Kuifje Tab */}
        {activeTab === 'kuifje' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                Dashboard
                <span className="ml-3 text-sm font-normal text-[var(--text-muted)]">
                  {stocks.length} stocks total
                </span>
              </h1>

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
              onOpenInGoogle={() => {
                const selected = stocks.filter((s) => selectedIds.has(s.id));
                for (const s of selected) {
                  window.open(`https://www.google.com/search?q=${encodeURIComponent(s.ticker + ' ' + (s.company_name || '') + ' stock')}`, '_blank');
                }
              }}
              onQuickSelect={handleQuickSelect}
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
                <div className="flex justify-end mb-2">
                  <div className="inline-flex bg-[var(--bg-tertiary)] rounded p-0.5 border border-[var(--border-color)]">
                    <button
                      onClick={() => setKuifjeView('table')}
                      className={`px-3 py-1 text-xs rounded transition-colors ${kuifjeView === 'table' ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      Table
                    </button>
                    <button
                      onClick={() => setKuifjeView('tiles')}
                      className={`px-3 py-1 text-xs rounded transition-colors ${kuifjeView === 'tiles' ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      Tiles
                    </button>
                  </div>
                </div>

                {kuifjeView === 'tiles' ? (
                  <TileGrid stocks={stocks as Parameters<typeof TileGrid>[0]['stocks']} />
                ) : (
                  <>
                    <StockTable
                      stocks={paginatedStocks as Parameters<typeof StockTable>[0]['stocks']}
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
              </>
            )}
          </>
        )}

        {/* Zonnebloem Tab */}
        {activeTab === 'zonnebloem' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                Prof. Zonnebloem
                <span className="ml-3 text-sm font-normal text-[var(--text-muted)]">
                  {zbStocks.length} stocks total — stable base + explosive spikes
                </span>
              </h1>

              <button
                onClick={handleRunZbScan}
                disabled={zbScanRunning}
                className="px-4 py-2 text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 rounded font-medium transition-colors"
              >
                {zbScanRunning ? 'Scanning...' : 'Run Zonnebloem Scan'}
              </button>
            </div>

            <ZonnebloemScanProgress
              scanTriggered={zbScanTriggered}
              onScanComplete={handleZbScanComplete}
            />

            {/* Zonnebloem filters */}
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 mb-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search ticker or company name..."
                    value={zbFilters.search}
                    onChange={(e) => setZbFilters({ ...zbFilters, search: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500 text-sm"
                  />
                </div>

                <select
                  value={zbFilters.marketFilter}
                  onChange={(e) => setZbFilters({ ...zbFilters, marketFilter: e.target.value })}
                  className="px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none cursor-pointer [&>option]:bg-[#1a1a2e] [&>option]:text-white"
                >
                  <option value="">All Markets</option>
                  {zbMarkets.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <select
                  value={zbFilters.sectorFilter}
                  onChange={(e) => setZbFilters({ ...zbFilters, sectorFilter: e.target.value })}
                  className="px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none cursor-pointer [&>option]:bg-[#1a1a2e] [&>option]:text-white"
                >
                  <option value="">All Sectors</option>
                  {zbSectors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={zbFilters.showFavorites}
                    onChange={(e) => setZbFilters({ ...zbFilters, showFavorites: e.target.checked })}
                    className="rounded"
                  />
                  Favorites
                </label>

                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-sm text-[var(--text-muted)]">{selectedIds.size} selected</span>
                    <button
                      onClick={() => {
                        const selected = zbStocks.filter((s) => selectedIds.has(s.id));
                        for (const s of selected) {
                          window.open(`https://www.google.com/search?q=${encodeURIComponent(s.ticker + ' ' + (s.company_name || '') + ' stock')}`, '_blank');
                        }
                      }}
                      className="px-3 py-2 text-sm bg-purple-600 text-white hover:opacity-90 rounded transition-colors"
                    >
                      Open in Google
                    </button>
                    <button
                      onClick={handleBulkFavorite}
                      className="px-3 py-2 text-sm bg-[var(--accent-orange)] text-white hover:opacity-90 rounded transition-colors"
                    >
                      Favorite
                    </button>
                    <button
                      onClick={() => { zbBulkArchive(selectedIds); setSelectedIds(new Set()); }}
                      className="px-3 py-2 text-sm bg-blue-600 text-white hover:opacity-90 rounded transition-colors"
                    >
                      Archive
                    </button>
                    <button
                      onClick={requestBulkDelete}
                      className="px-3 py-2 text-sm bg-[var(--accent-red)] text-white hover:opacity-90 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>

            {zbLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-[var(--text-muted)]">Loading Zonnebloem stocks...</div>
              </div>
            ) : zbStocks.length === 0 ? (
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-16 text-center">
                <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">No Zonnebloem Stocks Yet</h2>
                <p className="text-[var(--text-secondary)] mb-4">
                  Click &ldquo;Run Zonnebloem Scan&rdquo; to find stocks with stable base prices and explosive upward spikes.
                </p>
                <button
                  onClick={handleRunZbScan}
                  disabled={zbScanRunning}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg font-medium text-white transition-colors"
                >
                  {zbScanRunning ? 'Scanning...' : 'Run First Zonnebloem Scan'}
                </button>
              </div>
            ) : (
              <>
                <ZonnebloemTable
                  stocks={paginatedStocks as Parameters<typeof ZonnebloemTable>[0]['stocks']}
                  sort={zbSort}
                  onSort={zbHandleSort}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAll={toggleSelectAll}
                  onToggleFavorite={zbToggleFavorite}
                  onDelete={requestDelete}
                  scanSessions={zbScanSessions}
                  visibleColumns={zbVisibleColumns}
                  onToggleColumn={zbToggleColumn}
                />

                {totalPages > 1 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                    totalItems={zbStocks.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                  />
                )}
              </>
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
