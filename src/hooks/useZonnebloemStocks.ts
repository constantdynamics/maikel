'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ZonnebloemStock, SortConfig } from '@/lib/types';

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
  column: 'spike_score' as keyof ZonnebloemStock as never,
  direction: 'desc',
};

export function useZonnebloemStocks() {
  const [stocks, setStocks] = useState<ZonnebloemStock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<ZonnebloemStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ZBFilterConfig>(defaultFilters);
  const [sort, setSort] = useState<SortConfig>(defaultSort);
  const [sectors, setSectors] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('zonnebloem_stocks')
      .select('*')
      .eq('is_deleted', false)
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

  // Client-side filtering
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

    // Sort
    result.sort((a, b) => {
      const aVal = a[sort.column as keyof ZonnebloemStock];
      const bVal = b[sort.column as keyof ZonnebloemStock];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    setFilteredStocks(result);
  }, [stocks, filters, sort]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  function handleSort(column: keyof ZonnebloemStock) {
    setSort((prev) => ({
      column: column as never,
      direction: prev.column === (column as never) && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  async function toggleFavorite(id: string) {
    const stock = stocks.find((s) => s.id === id);
    if (!stock) return;
    const newValue = !stock.is_favorite;
    const { error } = await supabase
      .from('zonnebloem_stocks')
      .update({ is_favorite: newValue })
      .eq('id', id);
    if (!error) {
      setStocks((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_favorite: newValue } : s)),
      );
    }
  }

  async function deleteStock(id: string) {
    const { error } = await supabase
      .from('zonnebloem_stocks')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      setStocks((prev) => prev.filter((s) => s.id !== id));
    }
  }

  async function bulkFavorite(ids: Set<string>) {
    const { error } = await supabase
      .from('zonnebloem_stocks')
      .update({ is_favorite: true })
      .in('id', Array.from(ids));
    if (!error) {
      setStocks((prev) =>
        prev.map((s) => (ids.has(s.id) ? { ...s, is_favorite: true } : s)),
      );
    }
  }

  async function bulkDelete(ids: Set<string>) {
    const { error } = await supabase
      .from('zonnebloem_stocks')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .in('id', Array.from(ids));
    if (!error) {
      setStocks((prev) => prev.filter((s) => !ids.has(s.id)));
    }
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
    toggleFavorite,
    deleteStock,
    bulkFavorite,
    bulkDelete,
    refreshStocks: fetchStocks,
  };
}
