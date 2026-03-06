'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, fetchAllRows } from '@/lib/supabase';
import type { MoriaStock, SortConfig } from '@/lib/types';

interface MoriaFilterConfig {
  search: string;
  marketFilter: string;
  showFavorites: boolean;
}

const defaultFilters: MoriaFilterConfig = {
  search: '',
  marketFilter: '',
  showFavorites: false,
};

const defaultSort: SortConfig = {
  column: 'ath_decline_pct' as never,
  direction: 'desc',
};

export function useMoriaStocks() {
  const [stocks, setStocks] = useState<MoriaStock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<MoriaStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<MoriaFilterConfig>(defaultFilters);
  const [sort, setSort] = useState<SortConfig>(defaultSort);
  const [markets, setMarkets] = useState<string[]>([]);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchAllRows<MoriaStock>(() =>
      supabase
        .from('moria_stocks')
        .select('*')
        .eq('is_deleted', false)
        .eq('is_archived', false)
        .order('ath_decline_pct', { ascending: false })
    );

    if (error) {
      // Table might not exist yet — don't spam console
      const msg = typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : '';
      if (!msg.includes('moria_stocks')) {
        console.error('Error fetching Moria stocks:', error);
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

    result.sort((a, b) => {
      const aVal = a[sort.column as keyof MoriaStock];
      const bVal = b[sort.column as keyof MoriaStock];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    setFilteredStocks(result);
  }, [stocks, filters, sort]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  function handleSort(column: keyof MoriaStock) {
    setSort((prev) => ({
      column: column as never,
      direction: prev.column === (column as never) && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  async function toggleFavorite(id: string) {
    const stock = stocks.find((s) => s.id === id);
    if (!stock) return;
    const newValue = !stock.is_favorite;
    const { error } = await supabase.from('moria_stocks').update({ is_favorite: newValue }).eq('id', id);
    if (!error) setStocks((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite: newValue } : s)));
  }

  async function deleteStock(id: string) {
    const { error } = await supabase.from('moria_stocks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id);
    if (!error) setStocks((prev) => prev.filter((s) => s.id !== id));
  }

  async function bulkFavorite(ids: Set<string>) {
    const { error } = await supabase.from('moria_stocks').update({ is_favorite: true }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.map((s) => (ids.has(s.id) ? { ...s, is_favorite: true } : s)));
  }

  async function bulkDelete(ids: Set<string>) {
    const { error } = await supabase.from('moria_stocks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).in('id', Array.from(ids));
    if (!error) setStocks((prev) => prev.filter((s) => !ids.has(s.id)));
  }

  async function bulkArchive(ids: Set<string>) {
    const { error } = await supabase.from('moria_stocks').update({ is_archived: true, archived_at: new Date().toISOString() }).in('id', Array.from(ids));
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
