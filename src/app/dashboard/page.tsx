'use client';

import { useState, useCallback, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import StockTable from '@/components/StockTable';
import ZonnebloemTable from '@/components/ZonnebloemTable';
import FilterBar from '@/components/FilterBar';
import ScanProgress from '@/components/ScanProgress';
import ZonnebloemScanProgress from '@/components/ZonnebloemScanProgress';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useStocks } from '@/hooks/useStocks';
import { useZonnebloemStocks } from '@/hooks/useZonnebloemStocks';
import { stocksToCSV, downloadCSV, generateCsvFilename } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const [activeScanner, setActiveScanner] = useState<'kuifje' | 'zonnebloem'>('kuifje');

  const kuifje = useStocks();
  const zonnebloem = useZonnebloemStocks();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [kuifjeScanRunning, setKuifjeScanRunning] = useState(false);
  const [kuifjeScanTriggered, setKuifjeScanTriggered] = useState(false);

  const [zbScanRunning, setZbScanRunning] = useState(false);
  const [zbScanTriggered, setZbScanTriggered] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeScanner]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F') {
        if (selectedIds.size > 0) {
          if (activeScanner === 'kuifje') kuifje.bulkFavorite(selectedIds);
          else zonnebloem.bulkFavorite(selectedIds);
          setSelectedIds(new Set());
        }
      }
      if (e.key === 'Delete' && selectedIds.size > 0) {
        requestBulkDelete();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, activeScanner, kuifje.bulkFavorite, zonnebloem.bulkFavorite]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const stocks = activeScanner === 'kuifje' ? kuifje.stocks : zonnebloem.stocks;
    if (selectedIds.size === stocks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(stocks.map((s) => s.id)));
  }

  async function handleRunKuifjeScan() {
    setKuifjeScanRunning(true);
    setKuifjeScanTriggered(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/scan', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
    } catch { setKuifjeScanRunning(false); }
  }

  function handleKuifjeScanComplete() {
    setKuifjeScanRunning(false);
    setKuifjeScanTriggered(false);
    kuifje.refreshStocks();
  }

  async function handleRunZbScan() {
    setZbScanRunning(true);
    setZbScanTriggered(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/zonnebloem/scan', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
    } catch { setZbScanRunning(false); }
  }

  function handleZbScanComplete() {
    setZbScanRunning(false);
    setZbScanTriggered(false);
    zonnebloem.refreshStocks();
  }

  const handleExport = useCallback(() => {
    const stocks = activeScanner === 'kuifje' ? kuifje.stocks : zonnebloem.stocks;
    const csv = stocksToCSV(stocks as unknown as Record<string, unknown>[]);
    if (csv) downloadCSV(csv, generateCsvFilename(activeScanner === 'kuifje' ? 'Kuifje' : 'Zonnebloem'));
  }, [activeScanner, kuifje.stocks, zonnebloem.stocks]);

  function handleBulkFavorite() {
    if (activeScanner === 'kuifje') kuifje.bulkFavorite(selectedIds);
    else zonnebloem.bulkFavorite(selectedIds);
    setSelectedIds(new Set());
  }

  function requestBulkDelete() {
    const count = selectedIds.size;
    setConfirmDialog({
      open: true,
      title: `Delete ${count} stock${count !== 1 ? 's' : ''}?`,
      message: `${count} stock${count !== 1 ? 's' : ''} will be moved to the recycle bin.`,
      onConfirm: () => {
        if (activeScanner === 'kuifje') kuifje.bulkDelete(selectedIds);
        else zonnebloem.bulkDelete(selectedIds);
        setSelectedIds(new Set());
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  function requestDelete(id: string) {
    const stock = activeScanner === 'kuifje'
      ? kuifje.stocks.find((s) => s.id === id)
      : zonnebloem.stocks.find((s) => s.id === id);
    setConfirmDialog({
      open: true,
      title: `Delete ${stock?.ticker || 'stock'}?`,
      message: 'This stock will be moved to the recycle bin.',
      onConfirm: () => {
        if (activeScanner === 'kuifje') kuifje.deleteStock(id);
        else zonnebloem.deleteStock(id);
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

        {/* Scanner Tabs */}
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => setActiveScanner('kuifje')}
            className={`flex-1 px-4 py-2.5 rounded text-sm font-medium transition-colors ${
              activeScanner === 'kuifje'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Kuifje
            <span className="ml-2 text-xs opacity-70">ATH Recovery</span>
            {kuifje.allStocks.length > 0 && (
              <span className="ml-2 bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded text-xs">
                {kuifje.allStocks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveScanner('zonnebloem')}
            className={`flex-1 px-4 py-2.5 rounded text-sm font-medium transition-colors ${
              activeScanner === 'zonnebloem'
                ? 'bg-purple-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Prof. Zonnebloem
            <span className="ml-2 text-xs opacity-70">Spike Scanner</span>
            {zonnebloem.allStocks.length > 0 && (
              <span className="ml-2 bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded text-xs">
                {zonnebloem.allStocks.length}
              </span>
            )}
          </button>
        </div>

        {/* KUIFJE VIEW */}
        {activeScanner === 'kuifje' && (
          <>
            <ScanProgress scanTriggered={kuifjeScanTriggered} onScanComplete={handleKuifjeScanComplete} />

            <FilterBar
              filters={kuifje.filters}
              onFilterChange={kuifje.setFilters}
              sectors={kuifje.sectors}
              onExport={handleExport}
              onRunScan={handleRunKuifjeScan}
              scanRunning={kuifjeScanRunning}
              selectedCount={selectedIds.size}
              onBulkFavorite={handleBulkFavorite}
              onBulkDelete={requestBulkDelete}
            />

            {kuifje.loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-slate-400">Loading stocks...</div>
              </div>
            ) : kuifje.stocks.length === 0 && !kuifje.filters.search && !kuifje.filters.sectorFilter ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-16 text-center">
                <h2 className="text-xl font-semibold mb-2">No Kuifje Data Yet</h2>
                <p className="text-slate-400 mb-4">
                  Click &ldquo;Run Scan&rdquo; to start scanning for high-potential recovery stocks.
                </p>
                <button
                  onClick={handleRunKuifjeScan}
                  disabled={kuifjeScanRunning}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg font-medium transition-colors"
                >
                  {kuifjeScanRunning ? 'Scanning...' : 'Run Kuifje Scan'}
                </button>
              </div>
            ) : (
              <StockTable
                stocks={kuifje.stocks}
                sort={kuifje.sort}
                onSort={kuifje.handleSort}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onToggleFavorite={kuifje.toggleFavorite}
                onDelete={requestDelete}
              />
            )}
          </>
        )}

        {/* ZONNEBLOEM VIEW */}
        {activeScanner === 'zonnebloem' && (
          <>
            <ZonnebloemScanProgress scanTriggered={zbScanTriggered} onScanComplete={handleZbScanComplete} />

            <div className="bg-slate-800 border border-purple-700/30 rounded-lg p-4 mb-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search ticker or company..."
                    value={zonnebloem.filters.search}
                    onChange={(e) => zonnebloem.setFilters({ ...zonnebloem.filters, search: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 text-sm"
                  />
                </div>

                <select
                  value={zonnebloem.filters.marketFilter}
                  onChange={(e) => zonnebloem.setFilters({ ...zonnebloem.filters, marketFilter: e.target.value })}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                >
                  <option value="">All Markets</option>
                  {zonnebloem.markets.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <select
                  value={zonnebloem.filters.sectorFilter}
                  onChange={(e) => zonnebloem.setFilters({ ...zonnebloem.filters, sectorFilter: e.target.value })}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                >
                  <option value="">All Sectors</option>
                  {zonnebloem.sectors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={zonnebloem.filters.showFavorites}
                    onChange={(e) => zonnebloem.setFilters({ ...zonnebloem.filters, showFavorites: e.target.checked })}
                    className="rounded bg-slate-700 border-slate-600"
                  />
                  Favorites
                </label>

                <div className="flex items-center gap-2 ml-auto">
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-sm text-slate-400">{selectedIds.size} selected</span>
                      <button onClick={handleBulkFavorite} className="px-3 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 rounded transition-colors">Favorite</button>
                      <button onClick={requestBulkDelete} className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors">Delete</button>
                    </>
                  )}
                  <button onClick={handleExport} className="px-3 py-2 text-sm bg-slate-600 hover:bg-slate-500 rounded transition-colors">Export CSV</button>
                  <button
                    onClick={handleRunZbScan}
                    disabled={zbScanRunning}
                    className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:text-slate-400 rounded font-medium transition-colors"
                  >
                    {zbScanRunning ? 'Scanning...' : 'Run Zonnebloem Scan'}
                  </button>
                </div>
              </div>
            </div>

            {zonnebloem.loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-slate-400">Loading Zonnebloem stocks...</div>
              </div>
            ) : zonnebloem.stocks.length === 0 && !zonnebloem.filters.search ? (
              <div className="bg-slate-800 border border-purple-700/30 rounded-lg p-16 text-center">
                <h2 className="text-xl font-semibold mb-2 text-purple-300">No Zonnebloem Data Yet</h2>
                <p className="text-slate-400 mb-4">
                  Click &ldquo;Run Zonnebloem Scan&rdquo; to find stocks with stable bases and explosive spikes.
                </p>
                <p className="text-slate-500 text-sm mb-6">
                  Scans 8+ global markets for stocks where 52W High is 3x+ the 52W Low,
                  then deep-scans for 100%+ spikes lasting 4+ days from a stable base.
                </p>
                <button
                  onClick={handleRunZbScan}
                  disabled={zbScanRunning}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium transition-colors"
                >
                  {zbScanRunning ? 'Scanning...' : 'Run First Zonnebloem Scan'}
                </button>
              </div>
            ) : (
              <ZonnebloemTable
                stocks={zonnebloem.stocks}
                sort={zonnebloem.sort}
                onSort={zonnebloem.handleSort}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onToggleFavorite={zonnebloem.toggleFavorite}
                onDelete={requestDelete}
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
      </div>
    </AuthGuard>
  );
}
