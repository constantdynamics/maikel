'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getSelectedMarkets } from '@/components/MarketSelector';
import StockTable from '@/components/StockTable';
import FilterBar, { type QuickSelectType } from '@/components/FilterBar';
import ScanProgress from '@/components/ScanProgress';
import ZonnebloemScanProgress from '@/components/ZonnebloemScanProgress';
import SectorScanProgress from '@/components/SectorScanProgress';
import ZonnebloemTable from '@/components/ZonnebloemTable';
import SectorStockTable from '@/components/SectorStockTable';
import UnderwaterMode from '@/components/UnderwaterMode';
import ConfirmDialog from '@/components/ConfirmDialog';
import Pagination from '@/components/Pagination';
import FixedUI from '@/components/FixedUI';
import ExportReminder from '@/components/ExportReminder';
import { useStocks } from '@/hooks/useStocks';
import { useZonnebloemStocks } from '@/hooks/useZonnebloemStocks';
import { useSectorStocks } from '@/hooks/useSectorStocks';
import { stocksToCSV, downloadCSV, generateCsvFilename } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { SectorScannerType } from '@/lib/types';

type ScannerTab = 'kuifje' | 'zonnebloem' | 'biopharma' | 'mining';

interface ScanSession {
  id: string;
  started_at: string;
  stocks_found: number;
}

const ITEMS_PER_PAGE = 200;

// Auto-scan interval
const AUTO_INTERVAL = 15 * 60 * 1000; // 15 minutes

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

  // BioPharma state
  const {
    stocks: bpStocks,
    loading: bpLoading,
    filters: bpFilters,
    setFilters: setBpFilters,
    sort: bpSort,
    handleSort: bpHandleSort,
    sectors: bpSectors,
    markets: bpMarkets,
    scanSessions: bpScanSessions,
    toggleFavorite: bpToggleFavorite,
    deleteStock: bpDeleteStock,
    bulkFavorite: bpBulkFavorite,
    bulkDelete: bpBulkDelete,
    bulkArchive: bpBulkArchive,
    refreshStocks: bpRefreshStocks,
  } = useSectorStocks('biopharma');

  // Mining state
  const {
    stocks: mnStocks,
    loading: mnLoading,
    filters: mnFilters,
    setFilters: setMnFilters,
    sort: mnSort,
    handleSort: mnHandleSort,
    sectors: mnSectors,
    markets: mnMarkets,
    scanSessions: mnScanSessions,
    toggleFavorite: mnToggleFavorite,
    deleteStock: mnDeleteStock,
    bulkFavorite: mnBulkFavorite,
    bulkDelete: mnBulkDelete,
    bulkArchive: mnBulkArchive,
    refreshStocks: mnRefreshStocks,
  } = useSectorStocks('mining');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [underwaterMode, setUnderwaterMode] = useState(false);

  // Kuifje scan state
  const [scanRunning, setScanRunning] = useState(false);
  const [scanTriggered, setScanTriggered] = useState(false);
  const [kuifjeAutoScan, setKuifjeAutoScan] = useState(false);
  const [kuifjeAutoNext, setKuifjeAutoNext] = useState<Date | null>(null);
  const kuifjeAutoLastRun = useRef<number>(0);

  // Zonnebloem scan state
  const [zbScanRunning, setZbScanRunning] = useState(false);
  const [zbScanTriggered, setZbScanTriggered] = useState(false);
  const [zbAutoScan, setZbAutoScan] = useState(false);
  const [zbAutoNext, setZbAutoNext] = useState<Date | null>(null);
  const zbAutoLastRun = useRef<number>(0);

  // BioPharma scan state
  const [bpScanRunning, setBpScanRunning] = useState(false);
  const [bpScanTriggered, setBpScanTriggered] = useState(false);
  const [bpAutoScan, setBpAutoScan] = useState(false);
  const [bpAutoNext, setBpAutoNext] = useState<Date | null>(null);
  const bpAutoLastRun = useRef<number>(0);

  // Mining scan state
  const [mnScanRunning, setMnScanRunning] = useState(false);
  const [mnScanTriggered, setMnScanTriggered] = useState(false);
  const [mnAutoScan, setMnAutoScan] = useState(false);
  const [mnAutoNext, setMnAutoNext] = useState<Date | null>(null);
  const mnAutoLastRun = useRef<number>(0);

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

      if (data) setSessions(data);
    }
    loadSessions();
  }, [scanTriggered]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'f' || e.key === 'F') {
        if (selectedIds.size > 0) {
          handleBulkFavorite();
        }
      }
      if (e.key === 'a' || e.key === 'A') {
        if (selectedIds.size > 0 && (activeTab === 'kuifje' || activeTab === 'biopharma' || activeTab === 'mining')) {
          handleBulkArchive();
        }
      }
      if (e.key === 'Delete') {
        if (selectedIds.size > 0) requestBulkDelete();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, activeTab]);

  // Reset page when filters/tab change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [filters, sort, zbFilters, zbSort, bpFilters, bpSort, mnFilters, mnSort, activeTab]);

  // Pagination for active tab
  const activeStocks = activeTab === 'kuifje' ? stocks
    : activeTab === 'zonnebloem' ? zbStocks
    : activeTab === 'biopharma' ? bpStocks
    : mnStocks;
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
    if (csv) downloadCSV(csv, generateCsvFilename());
  }, [stocks]);

  // ===== SCAN HANDLERS =====

  async function handleRunScan(markets: string[]) {
    setScanRunning(true);
    setScanTriggered(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setScanRunning(false); return; }
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ markets }),
      });
      const result = await res.json();
      if (res.ok) console.log(`[Kuifje] Scan: ${result.stocksFound}/${result.stocksScanned} matches`);
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
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({}),
      });
      if (res.ok) { const result = await res.json(); console.log(`[Zonnebloem] Scan: ${result.stocksMatched} matches`); }
      zbRefreshStocks();
    } catch (err) {
      console.error('[Zonnebloem] Scan error:', err);
      setZbScanRunning(false);
      setZbScanTriggered(false);
    }
  }

  async function handleRunSectorScan(type: SectorScannerType) {
    const setRunning = type === 'biopharma' ? setBpScanRunning : setMnScanRunning;
    const setTriggered = type === 'biopharma' ? setBpScanTriggered : setMnScanTriggered;
    const refresh = type === 'biopharma' ? bpRefreshStocks : mnRefreshStocks;
    const label = type === 'biopharma' ? 'BioPharma' : 'Mining';

    setRunning(true);
    setTriggered(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/sector/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ scannerType: type }),
      });
      if (res.ok) { const result = await res.json(); console.log(`[${label}] Scan: ${result.stocksMatched} matches`); }
      refresh();
    } catch (err) {
      console.error(`[${label}] Scan error:`, err);
      setRunning(false);
      setTriggered(false);
    }
  }

  // ===== SCAN COMPLETE HANDLERS =====

  function handleScanComplete() {
    setScanRunning(false);
    setScanTriggered(false);
    refreshStocks();
    if (kuifjeAutoScan) {
      if (underwaterMode) {
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
        setTimeout(() => handleRunZbScan(), 3000);
        setZbAutoNext(new Date(Date.now() + 3000));
      } else {
        zbAutoLastRun.current = Date.now();
        setZbAutoNext(new Date(Date.now() + AUTO_INTERVAL));
      }
    }
  }

  function handleSectorScanComplete(type: SectorScannerType) {
    const setRunning = type === 'biopharma' ? setBpScanRunning : setMnScanRunning;
    const setTriggered = type === 'biopharma' ? setBpScanTriggered : setMnScanTriggered;
    const refresh = type === 'biopharma' ? bpRefreshStocks : mnRefreshStocks;
    const autoScan = type === 'biopharma' ? bpAutoScan : mnAutoScan;
    const setAutoNext = type === 'biopharma' ? setBpAutoNext : setMnAutoNext;
    const autoLastRun = type === 'biopharma' ? bpAutoLastRun : mnAutoLastRun;

    setRunning(false);
    setTriggered(false);
    refresh();
    if (autoScan) {
      if (underwaterMode) {
        setTimeout(() => handleRunSectorScan(type), 3000);
        setAutoNext(new Date(Date.now() + 3000));
      } else {
        autoLastRun.current = Date.now();
        setAutoNext(new Date(Date.now() + AUTO_INTERVAL));
      }
    }
  }

  // ===== AUTO-SCAN LOGIC =====

  const kuifjeAutoCheck = useCallback(() => {
    if (!kuifjeAutoScan || scanRunning) return;
    if (Date.now() - kuifjeAutoLastRun.current >= AUTO_INTERVAL) handleRunScan(getSelectedMarkets());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kuifjeAutoScan, scanRunning]);

  const zbAutoCheck = useCallback(() => {
    if (!zbAutoScan || zbScanRunning) return;
    if (Date.now() - zbAutoLastRun.current >= AUTO_INTERVAL) handleRunZbScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zbAutoScan, zbScanRunning]);

  const bpAutoCheck = useCallback(() => {
    if (!bpAutoScan || bpScanRunning) return;
    if (Date.now() - bpAutoLastRun.current >= AUTO_INTERVAL) handleRunSectorScan('biopharma');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpAutoScan, bpScanRunning]);

  const mnAutoCheck = useCallback(() => {
    if (!mnAutoScan || mnScanRunning) return;
    if (Date.now() - mnAutoLastRun.current >= AUTO_INTERVAL) handleRunSectorScan('mining');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mnAutoScan, mnScanRunning]);

  // Start first scan when auto-scan toggles on
  useEffect(() => {
    if (kuifjeAutoScan && !scanRunning) {
      kuifjeAutoLastRun.current = Date.now();
      handleRunScan(getSelectedMarkets());
      setKuifjeAutoNext(new Date(Date.now() + AUTO_INTERVAL));
    } else if (!kuifjeAutoScan) setKuifjeAutoNext(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kuifjeAutoScan]);

  useEffect(() => {
    if (zbAutoScan && !zbScanRunning) {
      zbAutoLastRun.current = Date.now();
      handleRunZbScan();
      setZbAutoNext(new Date(Date.now() + AUTO_INTERVAL));
    } else if (!zbAutoScan) setZbAutoNext(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zbAutoScan]);

  useEffect(() => {
    if (bpAutoScan && !bpScanRunning) {
      bpAutoLastRun.current = Date.now();
      handleRunSectorScan('biopharma');
      setBpAutoNext(new Date(Date.now() + AUTO_INTERVAL));
    } else if (!bpAutoScan) setBpAutoNext(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpAutoScan]);

  useEffect(() => {
    if (mnAutoScan && !mnScanRunning) {
      mnAutoLastRun.current = Date.now();
      handleRunSectorScan('mining');
      setMnAutoNext(new Date(Date.now() + AUTO_INTERVAL));
    } else if (!mnAutoScan) setMnAutoNext(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mnAutoScan]);

  // Polling timer
  useEffect(() => {
    if (!kuifjeAutoScan && !zbAutoScan && !bpAutoScan && !mnAutoScan) return;
    const timer = setInterval(() => {
      kuifjeAutoCheck();
      zbAutoCheck();
      bpAutoCheck();
      mnAutoCheck();
    }, 30_000);
    return () => clearInterval(timer);
  }, [kuifjeAutoScan, zbAutoScan, bpAutoScan, mnAutoScan, kuifjeAutoCheck, zbAutoCheck, bpAutoCheck, mnAutoCheck]);

  // Visibility change catch-up
  useEffect(() => {
    if (!kuifjeAutoScan && !zbAutoScan && !bpAutoScan && !mnAutoScan) return;
    function onVisible() {
      if (document.visibilityState === 'visible') {
        kuifjeAutoCheck();
        zbAutoCheck();
        bpAutoCheck();
        mnAutoCheck();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [kuifjeAutoScan, zbAutoScan, bpAutoScan, mnAutoScan, kuifjeAutoCheck, zbAutoCheck, bpAutoCheck, mnAutoCheck]);

  // ===== BULK ACTIONS =====

  function handleBulkFavorite() {
    if (activeTab === 'kuifje') bulkFavorite(selectedIds);
    else if (activeTab === 'zonnebloem') zbBulkFavorite(selectedIds);
    else if (activeTab === 'biopharma') bpBulkFavorite(selectedIds);
    else mnBulkFavorite(selectedIds);
    setSelectedIds(new Set());
  }

  function handleBulkArchive() {
    if (activeTab === 'kuifje') bulkArchive(selectedIds);
    else if (activeTab === 'zonnebloem') zbBulkArchive(selectedIds);
    else if (activeTab === 'biopharma') bpBulkArchive(selectedIds);
    else mnBulkArchive(selectedIds);
    setSelectedIds(new Set());
  }

  function requestBulkDelete() {
    const count = selectedIds.size;
    setConfirmDialog({
      open: true,
      title: `Delete ${count} stock${count !== 1 ? 's' : ''}?`,
      message: `${count} stock${count !== 1 ? 's' : ''} will be moved to the recycle bin.`,
      onConfirm: () => {
        if (activeTab === 'kuifje') bulkDelete(selectedIds);
        else if (activeTab === 'zonnebloem') zbBulkDelete(selectedIds);
        else if (activeTab === 'biopharma') bpBulkDelete(selectedIds);
        else mnBulkDelete(selectedIds);
        setSelectedIds(new Set());
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  function requestDelete(id: string) {
    const allStocks = activeTab === 'kuifje' ? stocks : activeTab === 'zonnebloem' ? zbStocks : activeTab === 'biopharma' ? bpStocks : mnStocks;
    const stock = allStocks.find((s) => s.id === id);
    setConfirmDialog({
      open: true,
      title: `Delete ${stock?.ticker || 'stock'}?`,
      message: `This stock will be moved to the recycle bin.`,
      onConfirm: () => {
        if (activeTab === 'kuifje') deleteStock(id);
        else if (activeTab === 'zonnebloem') zbDeleteStock(id);
        else if (activeTab === 'biopharma') bpDeleteStock(id);
        else mnDeleteStock(id);
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
    if (type === 'none') { setSelectedIds(new Set()); return; }
    let toSelect: string[] = [];
    const pageStocks = paginatedStocks;
    switch (type) {
      case 'top5': toSelect = pageStocks.slice(0, 5).map((s) => s.id); break;
      case 'top10': toSelect = pageStocks.slice(0, 10).map((s) => s.id); break;
      case 'score10': toSelect = pageStocks.filter((s) => 'score' in s && (s as { score: number }).score === 10).map((s) => s.id); break;
      case 'scoreMin8': toSelect = pageStocks.filter((s) => 'score' in s && (s as { score: number }).score >= 8).map((s) => s.id); break;
      case 'scoreMin6': toSelect = pageStocks.filter((s) => 'score' in s && (s as { score: number }).score >= 6).map((s) => s.id); break;
    }
    setSelectedIds(new Set(toSelect));
  }

  // Count how many auto-scans are active
  const allAutoActive = kuifjeAutoScan && zbAutoScan && bpAutoScan && mnAutoScan;
  const anyAutoActive = kuifjeAutoScan || zbAutoScan || bpAutoScan || mnAutoScan;
  const autoCount = [kuifjeAutoScan, zbAutoScan, bpAutoScan, mnAutoScan].filter(Boolean).length;

  // ===== RENDER SECTOR TAB (shared for BioPharma & Mining) =====
  function renderSectorTab(
    type: SectorScannerType,
    label: string,
    colorName: string,
    btnColor: string,
    sectorStocks: typeof bpStocks,
    sectorLoading: boolean,
    sectorFilters: typeof bpFilters,
    setSectorFilters: typeof setBpFilters,
    sectorSort: typeof bpSort,
    sectorHandleSort: typeof bpHandleSort,
    sectorSectors: string[],
    sectorMarkets: string[],
    sectorScanSessions: typeof bpScanSessions,
    sectorToggleFavorite: typeof bpToggleFavorite,
    sectorScanRunning: boolean,
    sectorScanTriggered: boolean,
    sectorAutoScan: boolean,
    setSectorAutoScan: (v: boolean) => void,
    sectorAutoNext: Date | null,
  ) {
    return (
      <>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {label}
            <span className="ml-3 text-sm font-normal text-[var(--text-muted)]">
              {sectorStocks.length} stocks — combined Kuifje + Zonnebloem criteria
            </span>
          </h1>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleRunSectorScan(type)}
              disabled={sectorScanRunning}
              className={`px-4 py-2 text-sm ${btnColor} text-white disabled:opacity-50 rounded font-medium transition-colors`}
            >
              {sectorScanRunning ? 'Scanning...' : `Run ${label} Scan`}
            </button>

            <button
              onClick={() => setSectorAutoScan(!sectorAutoScan)}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded font-medium transition-colors ${
                sectorAutoScan
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${sectorAutoScan ? 'bg-white animate-pulse' : 'bg-[var(--text-muted)]'}`} />
              {sectorAutoScan ? 'Auto-scan ON' : 'Auto-scan'}
            </button>

            {sectorAutoScan && sectorAutoNext && !sectorScanRunning && (
              <span className="text-xs text-[var(--text-muted)]">
                Next: {sectorAutoNext.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

        <SectorScanProgress
          scannerType={type}
          label={label}
          color={colorName}
          scanTriggered={sectorScanTriggered}
          onScanComplete={() => handleSectorScanComplete(type)}
        />

        {/* Sector filters */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search ticker or company name..."
                value={sectorFilters.search}
                onChange={(e) => setSectorFilters({ ...sectorFilters, search: e.target.value })}
                className={`w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-${colorName}-500 text-sm`}
              />
            </div>

            <select
              value={sectorFilters.marketFilter}
              onChange={(e) => setSectorFilters({ ...sectorFilters, marketFilter: e.target.value })}
              className="px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none cursor-pointer [&>option]:bg-[#1a1a2e] [&>option]:text-white"
            >
              <option value="">All Markets</option>
              {sectorMarkets.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>

            <select
              value={sectorFilters.sectorFilter}
              onChange={(e) => setSectorFilters({ ...sectorFilters, sectorFilter: e.target.value })}
              className="px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none cursor-pointer [&>option]:bg-[#1a1a2e] [&>option]:text-white"
            >
              <option value="">All Sectors</option>
              {sectorSectors.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>

            <select
              value={sectorFilters.matchTypeFilter}
              onChange={(e) => setSectorFilters({ ...sectorFilters, matchTypeFilter: e.target.value })}
              className="px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none cursor-pointer [&>option]:bg-[#1a1a2e] [&>option]:text-white"
            >
              <option value="">All Match Types</option>
              <option value="kuifje">Kuifje only</option>
              <option value="zonnebloem">Zonnebloem only</option>
              <option value="both">Both</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={sectorFilters.showFavorites}
                onChange={(e) => setSectorFilters({ ...sectorFilters, showFavorites: e.target.checked })}
                className="rounded"
              />
              Favorites
            </label>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-[var(--text-muted)]">{selectedIds.size} selected</span>
                <button onClick={() => {
                  const selected = sectorStocks.filter((s) => selectedIds.has(s.id));
                  for (const s of selected) {
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(s.ticker + ' ' + (s.company_name || '') + ' stock')}`, '_blank');
                  }
                }} className={`px-3 py-2 text-sm ${btnColor} text-white hover:opacity-90 rounded transition-colors`}>
                  Open in Google
                </button>
                <button onClick={handleBulkFavorite} className="px-3 py-2 text-sm bg-[var(--accent-orange)] text-white hover:opacity-90 rounded transition-colors">
                  Favorite
                </button>
                <button onClick={handleBulkArchive} className="px-3 py-2 text-sm bg-blue-600 text-white hover:opacity-90 rounded transition-colors">
                  Archive
                </button>
                <button onClick={requestBulkDelete} className="px-3 py-2 text-sm bg-[var(--accent-red)] text-white hover:opacity-90 rounded transition-colors">
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {sectorLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[var(--text-muted)]">Loading {label} stocks...</div>
          </div>
        ) : sectorStocks.length === 0 ? (
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-16 text-center">
            <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">No {label} Stocks Yet</h2>
            <p className="text-[var(--text-secondary)] mb-4">
              Click &ldquo;Run {label} Scan&rdquo; to find sector-specific stocks using combined Kuifje + Zonnebloem criteria.
            </p>
            <button
              onClick={() => handleRunSectorScan(type)}
              disabled={sectorScanRunning}
              className={`px-6 py-3 ${btnColor} disabled:opacity-50 rounded-lg font-medium text-white transition-colors`}
            >
              {sectorScanRunning ? 'Scanning...' : `Run First ${label} Scan`}
            </button>
          </div>
        ) : (
          <>
            <SectorStockTable
              stocks={paginatedStocks as Parameters<typeof SectorStockTable>[0]['stocks']}
              sort={sectorSort}
              onSort={sectorHandleSort}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onToggleFavorite={sectorToggleFavorite}
              onDelete={requestDelete}
              scanSessions={sectorScanSessions}
              accentColor={colorName}
            />

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                totalItems={sectorStocks.length}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <ExportReminder onExport={handleExport} />

        {/* Scanner tabs + actions */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('kuifje')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === 'zonnebloem'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Prof. Zonnebloem
              <span className="ml-2 text-xs text-[var(--text-muted)]">({zbStocks.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('biopharma')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === 'biopharma'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              BioPharma
              <span className="ml-2 text-xs text-[var(--text-muted)]">({bpStocks.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('mining')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === 'mining'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Mining
              <span className="ml-2 text-xs text-[var(--text-muted)]">({mnStocks.length})</span>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2 py-1">
            <button
              onClick={() => {
                const newState = !allAutoActive;
                setKuifjeAutoScan(newState);
                setZbAutoScan(newState);
                setBpAutoScan(newState);
                setMnAutoScan(newState);
              }}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded transition-all whitespace-nowrap ${
                allAutoActive
                  ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:opacity-90'
                  : 'bg-gradient-to-r from-[var(--accent-primary)] to-purple-600 text-white hover:opacity-90'
              }`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${allAutoActive ? 'bg-white animate-pulse' : 'bg-white/50'}`} />
              {allAutoActive ? 'Auto-scan All ON' : anyAutoActive ? `Auto-scan (${autoCount}/4)` : 'Auto-scan All'}
            </button>

            {/* Export moved to Defog Settings > Data tab */}
          </div>
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

            <ScanProgress scanTriggered={scanTriggered} onScanComplete={handleScanComplete} />

            <FilterBar
              filters={filters} onFilterChange={setFilters} sectors={sectors}
              onExport={handleExport} onRunScan={handleRunScan} scanRunning={scanRunning}
              selectedCount={selectedIds.size} onBulkFavorite={handleBulkFavorite}
              onBulkArchive={handleBulkArchive} onBulkDelete={requestBulkDelete}
              onOpenInGoogle={() => {
                const selected = stocks.filter((s) => selectedIds.has(s.id));
                for (const s of selected) window.open(`https://www.google.com/search?q=${encodeURIComponent(s.ticker + ' ' + (s.company_name || '') + ' stock')}`, '_blank');
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
                <button onClick={() => handleRunScan(['us', 'ca'])} disabled={scanRunning}
                  className="px-6 py-3 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 rounded-lg font-medium text-white transition-colors">
                  {scanRunning ? 'Scanning...' : 'Run First Scan'}
                </button>
              </div>
            ) : (
              <>
                <StockTable stocks={paginatedStocks as Parameters<typeof StockTable>[0]['stocks']}
                  sort={sort} onSort={handleSort} selectedIds={selectedIds}
                  onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAll}
                  onToggleFavorite={toggleFavorite} onDelete={requestDelete} />
                {totalPages > 1 && (
                  <Pagination currentPage={currentPage} totalPages={totalPages}
                    onPageChange={handlePageChange} totalItems={stocks.length} itemsPerPage={ITEMS_PER_PAGE} />
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
                <button onClick={handleRunZbScan} disabled={zbScanRunning}
                  className="px-4 py-2 text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 rounded font-medium transition-colors">
                  {zbScanRunning ? 'Scanning...' : 'Run Zonnebloem Scan'}
                </button>

                <button onClick={() => setZbAutoScan(!zbAutoScan)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded font-medium transition-colors ${
                    zbAutoScan ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-primary)]'
                  }`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${zbAutoScan ? 'bg-white animate-pulse' : 'bg-[var(--text-muted)]'}`} />
                  {zbAutoScan ? 'Auto-scan ON' : 'Auto-scan'}
                </button>

                {zbAutoScan && zbAutoNext && !zbScanRunning && (
                  <span className="text-xs text-[var(--text-muted)]">
                    Next: {zbAutoNext.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}

                <button onClick={() => setUnderwaterMode(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded font-medium transition-colors bg-[#1a1c1e] text-[#6a6d72] border border-[#3a3d41] hover:text-[#9a9da2]">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#3a3d41]" />
                  Underwater
                </button>
              </div>
            </div>

            <ZonnebloemScanProgress scanTriggered={zbScanTriggered} onScanComplete={handleZbScanComplete} />

            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 mb-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <input type="text" placeholder="Search ticker or company name..."
                    value={zbFilters.search} onChange={(e) => setZbFilters({ ...zbFilters, search: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500 text-sm" />
                </div>
                <select value={zbFilters.marketFilter} onChange={(e) => setZbFilters({ ...zbFilters, marketFilter: e.target.value })}
                  className="px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none cursor-pointer [&>option]:bg-[#1a1a2e] [&>option]:text-white">
                  <option value="">All Markets</option>
                  {zbMarkets.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
                <select value={zbFilters.sectorFilter} onChange={(e) => setZbFilters({ ...zbFilters, sectorFilter: e.target.value })}
                  className="px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none cursor-pointer [&>option]:bg-[#1a1a2e] [&>option]:text-white">
                  <option value="">All Sectors</option>
                  {zbSectors.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input type="checkbox" checked={zbFilters.showFavorites} onChange={(e) => setZbFilters({ ...zbFilters, showFavorites: e.target.checked })} className="rounded" />
                  Favorites
                </label>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-sm text-[var(--text-muted)]">{selectedIds.size} selected</span>
                    <button onClick={() => { const selected = zbStocks.filter((s) => selectedIds.has(s.id)); for (const s of selected) window.open(`https://www.google.com/search?q=${encodeURIComponent(s.ticker + ' ' + (s.company_name || '') + ' stock')}`, '_blank'); }}
                      className="px-3 py-2 text-sm bg-purple-600 text-white hover:opacity-90 rounded transition-colors">Open in Google</button>
                    <button onClick={handleBulkFavorite} className="px-3 py-2 text-sm bg-[var(--accent-orange)] text-white hover:opacity-90 rounded transition-colors">Favorite</button>
                    <button onClick={() => { zbBulkArchive(selectedIds); setSelectedIds(new Set()); }} className="px-3 py-2 text-sm bg-blue-600 text-white hover:opacity-90 rounded transition-colors">Archive</button>
                    <button onClick={requestBulkDelete} className="px-3 py-2 text-sm bg-[var(--accent-red)] text-white hover:opacity-90 rounded transition-colors">Delete</button>
                  </div>
                )}
              </div>
            </div>

            {zbLoading ? (
              <div className="flex items-center justify-center py-20"><div className="text-[var(--text-muted)]">Loading Zonnebloem stocks...</div></div>
            ) : zbStocks.length === 0 ? (
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-16 text-center">
                <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">No Zonnebloem Stocks Yet</h2>
                <p className="text-[var(--text-secondary)] mb-4">Click &ldquo;Run Zonnebloem Scan&rdquo; to find stocks with stable base prices and explosive upward spikes.</p>
                <button onClick={handleRunZbScan} disabled={zbScanRunning}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg font-medium text-white transition-colors">
                  {zbScanRunning ? 'Scanning...' : 'Run First Zonnebloem Scan'}
                </button>
              </div>
            ) : (
              <>
                <ZonnebloemTable stocks={paginatedStocks as Parameters<typeof ZonnebloemTable>[0]['stocks']}
                  sort={zbSort} onSort={zbHandleSort} selectedIds={selectedIds}
                  onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAll}
                  onToggleFavorite={zbToggleFavorite} onDelete={requestDelete}
                  scanSessions={zbScanSessions} visibleColumns={zbVisibleColumns} onToggleColumn={zbToggleColumn} />
                {totalPages > 1 && (
                  <Pagination currentPage={currentPage} totalPages={totalPages}
                    onPageChange={handlePageChange} totalItems={zbStocks.length} itemsPerPage={ITEMS_PER_PAGE} />
                )}
              </>
            )}
          </>
        )}

        {/* BioPharma Tab */}
        {activeTab === 'biopharma' && renderSectorTab(
          'biopharma', 'BioPharma', 'emerald', 'bg-emerald-600 hover:bg-emerald-700',
          bpStocks, bpLoading, bpFilters, setBpFilters, bpSort, bpHandleSort,
          bpSectors, bpMarkets, bpScanSessions, bpToggleFavorite,
          bpScanRunning, bpScanTriggered, bpAutoScan, setBpAutoScan, bpAutoNext,
        )}

        {/* Mining Tab */}
        {activeTab === 'mining' && renderSectorTab(
          'mining', 'Mining', 'amber', 'bg-amber-600 hover:bg-amber-700',
          mnStocks, mnLoading, mnFilters, setMnFilters, mnSort, mnHandleSort,
          mnSectors, mnMarkets, mnScanSessions, mnToggleFavorite,
          mnScanRunning, mnScanTriggered, mnAutoScan, setMnAutoScan, mnAutoNext,
        )}

        {underwaterMode && (
          <UnderwaterMode
            zbStocks={zbStocks}
            kuifjeStocks={stocks}
            biopharmaStocks={bpStocks}
            miningStocks={mnStocks}
            onExit={() => setUnderwaterMode(false)}
            autoScanActive={zbAutoScan}
            autoScanNext={zbAutoNext}
            scanRunning={zbScanRunning}
            onRefreshStocks={zbRefreshStocks}
            kuifjeAutoScanActive={kuifjeAutoScan}
            kuifjeAutoScanNext={kuifjeAutoNext}
            kuifjeScanRunning={scanRunning}
            onRefreshKuifjeStocks={refreshStocks}
            bpAutoScanActive={bpAutoScan}
            bpAutoScanNext={bpAutoNext}
            bpScanRunning={bpScanRunning}
            onRefreshBpStocks={bpRefreshStocks}
            mnAutoScanActive={mnAutoScan}
            mnAutoScanNext={mnAutoNext}
            mnScanRunning={mnScanRunning}
            onRefreshMnStocks={mnRefreshStocks}
          />
        )}

        <ConfirmDialog
          open={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message}
          confirmLabel="Delete" variant="danger"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        />

        <FixedUI />
      </div>
    </>
  );
}
