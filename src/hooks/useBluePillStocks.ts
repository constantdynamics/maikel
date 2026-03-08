'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, fetchAllRows } from '@/lib/supabase';
import type { BluePillStock, SortConfig } from '@/lib/types';

interface BluePillFilterConfig {
  search: string;
  marketFilter: string;
  showFavorites: boolean;
}

const defaultFilters: BluePillFilterConfig = {
  search: '',
  marketFilter: '',
  showFavorites: false,
};

const defaultSort: SortConfig = {
  column: 'ath_decline_pct' as never,
  direction: 'desc',
};

export function useBluePillStocks() {
  const [stocks, setStocks] = useState<BluePillStock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<BluePillStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<BluePillFilterConfig>(defaultFilters);
  const [sort, setSort] = useState<SortConfig>(defaultSort);
  const [markets, setMarkets] = useState<string[]>([]);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchAllRows<BluePillStock>(() =>
      supabase
        .from('bluepill_stocks')
        .select('*')
        .eq('is_deleted', false)
        .eq('is_archived', false)
        .order('ath_decline_pct', { ascending: false })
    );

    if (error) {
      const msg = typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : '';
      if (!msg.includes('bluepill_stocks')) {
        console.error('Error fetching BluePill stocks:', error);
      }
    } else if (data) {
      setStocks(data);
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
    if (filters.marketFilter) {
      result = result.filter((s) => s.market === filters.marketFilter);
    }
    if (filters.showFavorites) {
      result = result.filter((s) => s.is_favorite);
    }

    // Medal sort for dot columns: green × 1M + yellow × 10K + white × 100
    const medalKey = (count: number, highestPct: number | null, greenThreshold: number, yellowThreshold: number): number => {
      if (count === 0) return 0;
      const avg = highestPct ? highestPct / Math.max(count, 1) : yellowThreshold;
      let green = 0, yellow = 0, white = 0;
      for (let i = 0; i < Math.min(count, 10); i++) {
        const est = i === 0 ? (highestPct || yellowThreshold) : avg * (1 - i * 0.1);
        if (est >= greenThreshold) green++;
        else if (est >= yellowThreshold) yellow++;
        else white++;
      }
      return green * 1_000_000 + yellow * 10_000 + white * 100;
    };

    result.sort((a, b) => {
      let comparison: number;
      const col = sort.column as keyof BluePillStock;

      if (col === 'growth_event_count') {
        const aKey = medalKey(a.growth_event_count, a.highest_growth_pct, 500, 300);
        const bKey = medalKey(b.growth_event_count, b.highest_growth_pct, 500, 300);
        comparison = aKey - bKey;
      } else if (col === 'spike_count') {
        const aKey = medalKey(a.spike_count, a.highest_spike_pct, 200, 100);
        const bKey = medalKey(b.spike_count, b.highest_spike_pct, 200, 100);
        comparison = aKey - bKey;
      } else {
        const aVal = a[col];
        const bVal = b[col];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    setFilteredStocks(result);
  }, [stocks, filters, sort]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  function handleSort(column: keyof BluePillStock) {
    setSort((prev) => ({
      column: column as never,
      direction: prev.column === (column as never) && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  async function toggleFavorite(id: string) {
    const stock = stocks.find((s) => s.id === id);
    if (!stock) return;
    const newValue = !stock.is_favorite;
    const { error } = await supabase.from('bluepill_stocks').update({ is_favorite: newValue }).eq('id', id);
    if (!error) setStocks((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite: newValue } : s)));
  }

  async function deleteStock(id: string) {
    const { error } = await supabase.from('bluepill_stocks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id);
    if (!error) setStocks((prev) => prev.filter((s) => s.id !== id));
  }

  async function bulkFavorite(ids: Set<string>) {
    const { error } = await supabase.from('bluepill_stocks').update({ is_favorite: true }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.map((s) => (ids.has(s.id) ? { ...s, is_favorite: true } : s)));
  }

  async function bulkDelete(ids: Set<string>) {
    const { error } = await supabase.from('bluepill_stocks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.filter((s) => !ids.has(s.id)));
  }

  async function bulkArchive(ids: Set<string>) {
    const { error } = await supabase.from('bluepill_stocks').update({ is_archived: true, archived_at: new Date().toISOString() }).in('id', Array.from(ids));
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
    markets,
    toggleFavorite,
    deleteStock,
    bulkFavorite,
    bulkDelete,
    bulkArchive,
    refreshStocks: fetchStocks,
  };
}
