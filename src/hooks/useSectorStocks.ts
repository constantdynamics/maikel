'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, fetchAllRows } from '@/lib/supabase';
import type { SectorStock, SortConfig, SectorScannerType } from '@/lib/types';

interface SectorFilterConfig {
  search: string;
  sectorFilter: string;
  marketFilter: string;
  showFavorites: boolean;
  matchTypeFilter: string; // 'kuifje' | 'zonnebloem' | 'both' | '' (all)
}

const defaultFilters: SectorFilterConfig = {
  search: '',
  sectorFilter: '',
  marketFilter: '',
  showFavorites: false,
  matchTypeFilter: '',
};

const defaultSort: SortConfig = {
  column: 'spike_count' as never,
  direction: 'desc',
};

export interface ScanSessionInfo {
  dailyNumber: number;
  time: string;
  date: string;
}

/**
 * Medal ranking for sector stocks — medaillespiegel style.
 * Combines spike dots (Zonnebloem) + growth dots (Kuifje) into one medal tally.
 * Sort: total dots desc → green count desc → yellow desc → white desc.
 */
function getSpikeDotColors(spikeCount: number, highestSpikePct: number | null): string[] {
  const count = Math.min(spikeCount, 10);
  if (count === 0) return [];
  const avg = highestSpikePct ? highestSpikePct / Math.max(spikeCount, 1) : 100;
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const est = i === 0 ? (highestSpikePct || 100) : avg * (1 - i * 0.08);
    dots.push(est >= 200 ? 'green' : est >= 100 ? 'yellow' : 'white');
  }
  return dots;
}

function getGrowthDotColors(eventCount: number, highestGrowthPct: number | null): string[] {
  const count = Math.min(eventCount, 10);
  if (count === 0) return [];
  const avg = highestGrowthPct ? highestGrowthPct / Math.max(eventCount, 1) : 200;
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const est = i === 0 ? (highestGrowthPct || 200) : avg * (1 - i * 0.1);
    dots.push(est >= 500 ? 'green' : est >= 300 ? 'yellow' : 'white');
  }
  return dots;
}

function sectorMedalKey(stock: SectorStock): [number, number, number, number] {
  const spikeDots = getSpikeDotColors(stock.spike_count, stock.highest_spike_pct);
  const growthDots = getGrowthDotColors(stock.growth_event_count, stock.highest_growth_pct);
  const allDots = [...spikeDots, ...growthDots];
  const total = allDots.length;
  const green = allDots.filter(d => d === 'green').length;
  const yellow = allDots.filter(d => d === 'yellow').length;
  const white = allDots.filter(d => d === 'white').length;
  return [total, green, yellow, white];
}

export function useSectorStocks(scannerType: SectorScannerType) {
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<SectorStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SectorFilterConfig>(defaultFilters);
  const [sort, setSort] = useState<SortConfig>(defaultSort);
  const [sectors, setSectors] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);
  const [scanSessions, setScanSessions] = useState<Map<string, ScanSessionInfo>>(new Map());

  const fetchScanSessions = useCallback(async () => {
    const { data } = await supabase
      .from('sector_scan_logs')
      .select('id, started_at')
      .eq('scanner_type', scannerType)
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

      sessionMap.set(log.id, { dailyNumber: count, time: timeStr, date: dateStr });
    }

    setScanSessions(sessionMap);
  }, [scannerType]);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchAllRows<SectorStock>(() =>
      supabase
        .from('sector_stocks')
        .select('*')
        .eq('scanner_type', scannerType)
        .eq('is_deleted', false)
        .eq('is_archived', false)
        .order('spike_score', { ascending: false })
    );

    if (error) {
      console.error(`Error fetching ${scannerType} stocks:`, error);
    } else if (data) {
      setStocks(data);
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
  }, [scannerType]);

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
    if (filters.matchTypeFilter) {
      result = result.filter((s) =>
        s.match_type === filters.matchTypeFilter || s.match_type === 'both',
      );
    }

    result.sort((a, b) => {
      // Medal ranking for spike_count (default) — medaillespiegel
      if (sort.column === ('spike_count' as never)) {
        const [aT, aG, aY, aW] = sectorMedalKey(a);
        const [bT, bG, bY, bW] = sectorMedalKey(b);
        const comparison = (bT - aT) || (bG - aG) || (bY - aY) || (bW - aW);
        return sort.direction === 'asc' ? -comparison : comparison;
      }
      const aVal = a[sort.column as keyof SectorStock];
      const bVal = b[sort.column as keyof SectorStock];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    setFilteredStocks(result);
  }, [stocks, filters, sort, scanSessions]);

  useEffect(() => { fetchStocks(); fetchScanSessions(); }, [fetchStocks, fetchScanSessions]);

  function handleSort(column: keyof SectorStock) {
    setSort((prev) => ({
      column: column as never,
      direction: prev.column === (column as never) && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  async function toggleFavorite(id: string) {
    const stock = stocks.find((s) => s.id === id);
    if (!stock) return;
    const newValue = !stock.is_favorite;
    const { error } = await supabase.from('sector_stocks').update({ is_favorite: newValue }).eq('id', id);
    if (!error) setStocks((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite: newValue } : s)));
  }

  async function deleteStock(id: string) {
    const { error } = await supabase.from('sector_stocks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id);
    if (!error) setStocks((prev) => prev.filter((s) => s.id !== id));
  }

  async function bulkFavorite(ids: Set<string>) {
    const { error } = await supabase.from('sector_stocks').update({ is_favorite: true }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.map((s) => (ids.has(s.id) ? { ...s, is_favorite: true } : s)));
  }

  async function bulkDelete(ids: Set<string>) {
    const { error } = await supabase.from('sector_stocks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.filter((s) => !ids.has(s.id)));
  }

  async function bulkArchive(ids: Set<string>) {
    const { error } = await supabase.from('sector_stocks').update({ is_archived: true, archived_at: new Date().toISOString() }).in('id', Array.from(ids));
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
    toggleFavorite,
    deleteStock,
    bulkFavorite,
    bulkDelete,
    bulkArchive,
    refreshStocks: fetchStocks,
  };
}
