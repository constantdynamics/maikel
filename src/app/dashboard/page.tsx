'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getSelectedMarkets } from '@/components/MarketSelector';
import StockTable from '@/components/StockTable';
import FilterBar, { type QuickSelectType } from '@/components/FilterBar';
import ScanProgress from '@/components/ScanProgress';
import ZonnebloemScanProgress from '@/components/ZonnebloemScanProgress';
import ZonnebloemTable from '@/components/ZonnebloemTable';
import UnderwaterMode from '@/components/UnderwaterMode';
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
  const [underwaterMode, setUnderwaterMode] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanTriggered, setScanTriggered] = useState(false);
  const [zbScanRunning, setZbScanRunning] = useState(false);
  const [zbScanTriggered, setZbScanTriggered] = useState(false);
  const [kuifjeAutoScan, setKuifjeAutoScan] = useState(false);
  const [kuifjeAutoNext, setKuifjeAutoNext] = useState<Date | null>(null);
  const kuifjeAutoLastRun = useRef<number>(0);
  const [zbAutoScan, setZbAutoScan] = useState(false);
  const [zbAutoNext, setZbAutoNext] = useState<Date | null>(null);
  const zbAutoLastRun = useRef<number>(0);
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
    console.log(`[Kuifje] Starting scan for markets: ${markets.join(', ')}`);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('[Kuifje] No auth token available');
        setScanRunning(false);
        return;
      }
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ markets }),
      });
      const result = await res.json();
      if (!res.ok) {
        console.error(`[Kuifje] Scan failed (${res.status}):`, result);
      } else {
        console.log(`[Kuifje] Scan result: ${result.stocksFound}/${result.stocksScanned} matches (${result.durationSeconds}s)`);
        if (result.effectiveSettings) {
          console.log(`[Kuifje] Settings used:`, result.effectiveSettings);
        }
        if (result.rejectionSummary && Object.keys(result.rejectionSummary).length > 0) {
          console.log(`[Kuifje] Rejection breakdown:`, result.rejectionSummary);
        }
      }
      // Safety net: always refresh stocks after scan API returns,
      // even if ScanProgress already triggered a refresh (handles race condition
      // where ScanProgress detected the previous scan's completion too early)
      refreshStocks();
    } catch (err) {
      console.error('[Kuifje] Scan error:', err);
      setScanRunning(false);
      setScanTriggered(false);
    }
  }

  async function handleRunZbScan() {
    setZbScanRunning(true);
    setZbScanTriggered(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/zonnebloem/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const result = await res.json();
        console.log(`[Zonnebloem] Scan result: ${result.stocksMatched} matches (${result.newStocksFound} new) in ${result.durationSeconds}s`);
      }
      // Safety net: always refresh stocks after scan API returns
      zbRefreshStocks();
    } catch (err) {
      console.error('[Zonnebloem] Scan error:', err);
      setZbScanRunning(false);
      setZbScanTriggered(false);
    }
  }

  function handleScanComplete() {
    setScanRunning(false);
    setScanTriggered(false);
    refreshStocks();
    if (kuifjeAutoScan) {
      if (underwaterMode) {
        // In underwater mode: restart scan immediately (small delay to let state settle)
        setTimeout(() => handleRunScan(getSelectedMarkets()), 3000);
        setKuifjeAutoNext(new Date(Date.now() + 3000));
      } else {
        kuifjeAutoLastRun.current = Date.now();
        setKuifjeAutoNext(new Date(Date.now() + AUTO_INTERVAL));
      }
    }
  }

  function handleZbScanComplete() {
    setZbScanRunning(false);
    setZbScanTriggered(false);
    zbRefreshStocks();
    if (zbAutoScan) {
      if (underwaterMode) {
        // In underwater mode: restart scan immediately (small delay to let state settle)
        setTimeout(() => handleRunZbScan(), 3000);
        setZbAutoNext(new Date(Date.now() + 3000));
      } else {
        zbAutoLastRun.current = Date.now();
        setZbAutoNext(new Date(Date.now() + AUTO_INTERVAL));
      }
    }
  }

  // Auto-scan — robust against background tabs and sleep
  const AUTO_INTERVAL = 15 * 60 * 1000; // 15 minutes

  // Kuifje auto-scan check
  const kuifjeAutoCheck = useCallback(() => {
    if (!kuifjeAutoScan || scanRunning) return;
    if (Date.now() - kuifjeAutoLastRun.current >= AUTO_INTERVAL) {
      handleRunScan(getSelectedMarkets());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kuifjeAutoScan, scanRunning]);

  // Zonnebloem auto-scan check
  const zbAutoCheck = useCallback(() => {
    if (!zbAutoScan || zbScanRunning) return;
    if (Date.now() - zbAutoLastRun.current >= AUTO_INTERVAL) {
      handleRunZbScan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zbAutoScan, zbScanRunning]);

  // Start first scan when Kuifje auto-scan is toggled on
  useEffect(() => {
    if (kuifjeAutoScan) {
      if (!scanRunning) {
        kuifjeAutoLastRun.current = Date.now();
        handleRunScan(getSelectedMarkets());
        setKuifjeAutoNext(new Date(Date.now() + AUTO_INTERVAL));
      }
    } else {
      setKuifjeAutoNext(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kuifjeAutoScan]);

  // Start first scan when Zonnebloem auto-scan is toggled on
  useEffect(() => {
    if (zbAutoScan) {
      if (!zbScanRunning) {
        zbAutoLastRun.current = Date.now();
        handleRunZbScan();
        setZbAutoNext(new Date(Date.now() + AUTO_INTERVAL));
      }
    } else {
      setZbAutoNext(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zbAutoScan]);

  // Polling timer — runs every 30s to catch missed intervals
  useEffect(() => {
    if (!kuifjeAutoScan && !zbAutoScan) return;
    const timer = setInterval(() => {
      kuifjeAutoCheck();
      zbAutoCheck();
    }, 30_000);
    return () => clearInterval(timer);
  }, [kuifjeAutoScan, zbAutoScan, kuifjeAutoCheck, zbAutoCheck]);

  // Catch up after tab becomes visible again (laptop open, tab switch)
  useEffect(() => {
    if (!kuifjeAutoScan && !zbAutoScan) return;
    function onVisible() {
      if (document.visibilityState === 'visible') {
        kuifjeAutoCheck();
        zbAutoCheck();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [kuifjeAutoScan, zbAutoScan, kuifjeAutoCheck, zbAutoCheck]);

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
    <>
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

          <button
            onClick={() => {
              const newState = !(kuifjeAutoScan && zbAutoScan);
              setKuifjeAutoScan(newState);
              setZbAutoScan(newState);
            }}
            className={`ml-auto flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded transition-all ${
              kuifjeAutoScan && zbAutoScan
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:opacity-90'
                : 'bg-gradient-to-r from-[var(--accent-primary)] to-purple-600 text-white hover:opacity-90'
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${kuifjeAutoScan && zbAutoScan ? 'bg-white animate-pulse' : 'bg-white/50'}`} />
            {kuifjeAutoScan && zbAutoScan ? 'Auto-scan Both ON' : 'Auto-scan Both'}
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

              <div className="flex items-center gap-3">
                {sessions.length > 0 && (
                  <div className="text-sm text-[var(--text-muted)]">
                    Last scan: {new Date(sessions[0]?.started_at).toLocaleDateString()} ({sessions[0]?.stocks_found} found)
                  </div>
                )}

                <button
                  onClick={() => setKuifjeAutoScan(!kuifjeAutoScan)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded font-medium transition-colors ${
                    kuifjeAutoScan
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full ${kuifjeAutoScan ? 'bg-white animate-pulse' : 'bg-[var(--text-muted)]'}`} />
                  {kuifjeAutoScan ? 'Auto-scan ON' : 'Auto-scan'}
                </button>

                {kuifjeAutoScan && kuifjeAutoNext && !scanRunning && (
                  <span className="text-xs text-[var(--text-muted)]">
                    Next: {kuifjeAutoNext.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}

                <button
                  onClick={() => setUnderwaterMode(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded font-medium transition-colors bg-[#1a1c1e] text-[#6a6d72] border border-[#3a3d41] hover:text-[#9a9da2]"
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-[#3a3d41]" />
                  Underwater
                </button>
              </div>
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
                  Scans for stocks with significant ATH decline and recovery growth events.
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

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRunZbScan}
                  disabled={zbScanRunning}
                  className="px-4 py-2 text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 rounded font-medium transition-colors"
                >
                  {zbScanRunning ? 'Scanning...' : 'Run Zonnebloem Scan'}
                </button>

                <button
                  onClick={() => setZbAutoScan(!zbAutoScan)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded font-medium transition-colors ${
                    zbAutoScan
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full ${zbAutoScan ? 'bg-white animate-pulse' : 'bg-[var(--text-muted)]'}`} />
                  {zbAutoScan ? 'Auto-scan ON' : 'Auto-scan'}
                </button>

                {zbAutoScan && zbAutoNext && !zbScanRunning && (
                  <span className="text-xs text-[var(--text-muted)]">
                    Next: {zbAutoNext.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}

                <button
                  onClick={() => setUnderwaterMode(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded font-medium transition-colors bg-[#1a1c1e] text-[#6a6d72] border border-[#3a3d41] hover:text-[#9a9da2]"
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-[#3a3d41]" />
                  Underwater
                </button>
              </div>
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

        {underwaterMode && (
          <UnderwaterMode
            zbStocks={zbStocks}
            kuifjeStocks={stocks}
            onExit={() => setUnderwaterMode(false)}
            autoScanActive={zbAutoScan}
            autoScanNext={zbAutoNext}
            scanRunning={zbScanRunning}
            onRefreshStocks={zbRefreshStocks}
            kuifjeAutoScanActive={kuifjeAutoScan}
            kuifjeAutoScanNext={kuifjeAutoNext}
            kuifjeScanRunning={scanRunning}
            onRefreshKuifjeStocks={refreshStocks}
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

        <FixedUI />
      </div>
    </>
  );
}
