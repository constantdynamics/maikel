'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ZonnebloemStock, SortConfig } from '@/lib/types';
import { spikeDotsSortValue } from '@/components/ZonnebloemTable';

interface ZBFilterConfig {
  search: string;
  sectorFilter: string;
  marketFilter: string;
  showFavorites: boolean;
  spikeCountMin: number | null;
  spikeScoreMin: number | null;
}

const defaultFilters: ZBFilterConfig = {
  search: '',
  sectorFilter: '',
  marketFilter: '',
  showFavorites: false,
  spikeCountMin: null,
  spikeScoreMin: null,
};

const defaultSort: SortConfig = {
  column: 'spike_dots' as never,
  direction: 'desc',
};

// Scan session info: daily number + time
export interface ScanSessionInfo {
  dailyNumber: number;
  time: string; // HH:mm
  date: string; // YYYY-MM-DD
}

// All available columns - used for visibility picker
export const ALL_ZB_COLUMNS = [
  { key: 'ticker', label: 'Ticker', defaultVisible: true },
  { key: 'company_name', label: 'Company', defaultVisible: true },
  { key: 'market', label: 'Market', defaultVisible: true },
  { key: 'current_price', label: 'Price', defaultVisible: true },
  { key: 'base_price_median', label: 'Base Price', defaultVisible: false },
  { key: 'spike_dots', label: 'Spikes', defaultVisible: true },
  { key: 'spike_score', label: 'Spike Score', defaultVisible: false },
  { key: 'highest_spike_pct', label: 'Max Spike %', defaultVisible: true },
  { key: 'price_change_12m_pct', label: '12m Change', defaultVisible: true },
  { key: 'avg_volume_30d', label: 'Volume 30d', defaultVisible: true },
  { key: 'market_cap', label: 'Market Cap', defaultVisible: false },
  { key: 'sector', label: 'Sector', defaultVisible: false },
  { key: 'country', label: 'Country', defaultVisible: false },
  { key: 'scan_number', label: 'Scan #', defaultVisible: true },
  { key: 'scan_time', label: 'Scan Time', defaultVisible: true },
  { key: 'detection_date', label: 'Detected', defaultVisible: true },
] as const;

const STORAGE_KEY = 'zb-visible-columns';

function loadVisibleColumns(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set(ALL_ZB_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch { /* use defaults */ }
  return new Set(ALL_ZB_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
}

function saveVisibleColumns(cols: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cols)));
  } catch { /* ignore */ }
}

export function useZonnebloemStocks() {
  const [stocks, setStocks] = useState<ZonnebloemStock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<ZonnebloemStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ZBFilterConfig>(defaultFilters);
  const [sort, setSort] = useState<SortConfig>(defaultSort);
  const [sectors, setSectors] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);
  const [scanSessions, setScanSessions] = useState<Map<string, ScanSessionInfo>>(new Map());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(loadVisibleColumns);

  // Fetch scan logs to build daily scan number mapping
  const fetchScanSessions = useCallback(async () => {
    const { data } = await supabase
      .from('zonnebloem_scan_logs')
      .select('id, started_at')
      .order('started_at', { ascending: true });

    if (!data) return;

    const sessionMap = new Map<string, ScanSessionInfo>();
    const dailyCounters = new Map<string, number>();

    for (const log of data) {
      const dt = new Date(log.started_at);
      const dateStr = dt.toISOString().split('T')[0];
      const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      const count = (dailyCounters.get(dateStr) || 0) + 1;
      dailyCounters.set(dateStr, count);

      sessionMap.set(log.id, {
        dailyNumber: count,
        time: timeStr,
        date: dateStr,
      });
    }

    setScanSessions(sessionMap);
  }, []);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('zonnebloem_stocks')
      .select('*')
      .eq('is_deleted', false)
      .eq('is_archived', false)
      .order('spike_score', { ascending: false });

    if (error) {
      console.error('Error fetching Zonnebloem stocks:', error);
    } else if (data) {
      setStocks(data as ZonnebloemStock[]);
      const uniqueSectors = Array.from(
        new Set(data.map((s) => s.sector).filter(Boolean)),
      ).sort() as string[];
      setSectors(uniqueSectors);
      const uniqueMarkets = Array.from(
        new Set(data.map((s) => s.market).filter(Boolean)),
      ).sort() as string[];
      setMarkets(uniqueMarkets);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let result = [...stocks];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          s.company_name.toLowerCase().includes(q),
      );
    }
    if (filters.sectorFilter) {
      result = result.filter((s) => s.sector === filters.sectorFilter);
    }
    if (filters.marketFilter) {
      result = result.filter((s) => s.market === filters.marketFilter);
    }
    if (filters.showFavorites) {
      result = result.filter((s) => s.is_favorite);
    }
    if (filters.spikeCountMin !== null) {
      result = result.filter((s) => s.spike_count >= filters.spikeCountMin!);
    }
    if (filters.spikeScoreMin !== null) {
      result = result.filter((s) => s.spike_score >= filters.spikeScoreMin!);
    }

    result.sort((a, b) => {
      // Special sort for spike_dots: total dots → green → yellow → white
      if (sort.column === ('spike_dots' as never)) {
        const aVal = spikeDotsSortValue(a);
        const bVal = spikeDotsSortValue(b);
        const comparison = aVal - bVal;
        return sort.direction === 'asc' ? comparison : -comparison;
      }

      // Special sort for scan_number: use session date+number
      if (sort.column === ('scan_number' as never) || sort.column === ('scan_time' as never)) {
        const aSession = a.scan_session_id ? scanSessions.get(a.scan_session_id) : null;
        const bSession = b.scan_session_id ? scanSessions.get(b.scan_session_id) : null;
        if (!aSession && !bSession) return 0;
        if (!aSession) return 1;
        if (!bSession) return -1;
        const aKey = `${aSession.date}-${String(aSession.dailyNumber).padStart(3, '0')}`;
        const bKey = `${bSession.date}-${String(bSession.dailyNumber).padStart(3, '0')}`;
        const comparison = aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
        return sort.direction === 'asc' ? comparison : -comparison;
      }

      const aVal = a[sort.column as keyof ZonnebloemStock];
      const bVal = b[sort.column as keyof ZonnebloemStock];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    setFilteredStocks(result);
  }, [stocks, filters, sort, scanSessions]);

  useEffect(() => { fetchStocks(); fetchScanSessions(); }, [fetchStocks, fetchScanSessions]);

  function handleSort(column: keyof ZonnebloemStock) {
    setSort((prev) => ({
      column: column as never,
      direction: prev.column === (column as never) && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  function toggleColumn(key: string) {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveVisibleColumns(next);
      return next;
    });
  }

  async function toggleFavorite(id: string) {
    const stock = stocks.find((s) => s.id === id);
    if (!stock) return;
    const newValue = !stock.is_favorite;
    const { error } = await supabase.from('zonnebloem_stocks').update({ is_favorite: newValue }).eq('id', id);
    if (!error) setStocks((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite: newValue } : s)));
  }

  async function deleteStock(id: string) {
    const { error } = await supabase.from('zonnebloem_stocks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id);
    if (!error) setStocks((prev) => prev.filter((s) => s.id !== id));
  }

  async function bulkFavorite(ids: Set<string>) {
    const { error } = await supabase.from('zonnebloem_stocks').update({ is_favorite: true }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.map((s) => (ids.has(s.id) ? { ...s, is_favorite: true } : s)));
  }

  async function bulkDelete(ids: Set<string>) {
    const { error } = await supabase.from('zonnebloem_stocks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.filter((s) => !ids.has(s.id)));
  }

  async function bulkArchive(ids: Set<string>) {
    const { error } = await supabase.from('zonnebloem_stocks').update({ is_archived: true, archived_at: new Date().toISOString() }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.filter((s) => !ids.has(s.id)));
  }

  return {
    stocks: filteredStocks,
    allStocks: stocks,
    loading,
    filters,
    setFilters,
    sort,
    handleSort,
    sectors,
    markets,
    scanSessions,
    visibleColumns,
    toggleColumn,
    toggleFavorite,
    deleteStock,
    bulkFavorite,
    bulkDelete,
    bulkArchive,
    refreshStocks: fetchStocks,
  };
}
