'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Stock, SortConfig, FilterConfig } from '@/lib/types';
import { VOLATILE_SECTORS } from '@/lib/types';

const defaultFilters: FilterConfig = {
  search: '',
  sectorFilter: '',
  scoreMin: null,
  scoreMax: null,
  athDeclineMin: null,
  athDeclineMax: null,
  showFavorites: false,
  showArchived: false,
  hideVolatileSectors: false,
  marketCapMin: null,
  marketCapMax: null,
  showStableWithSpikes: false,
};

const defaultSort: SortConfig = {
  column: 'growth_event_count',
  direction: 'desc',
};

/**
 * Medal ranking sort key for Kuifje stocks (same as underwater mode).
 * Sort like medal table: green count desc, then yellow count desc, then white count desc.
 */
function getKuifjeDotColors(eventCount: number, highestGrowthPct: number | null): string[] {
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

function kuifjeMedalKey(stock: Stock): [number, number, number] {
  const dots = getKuifjeDotColors(stock.growth_event_count, stock.highest_growth_pct);
  const green = dots.filter(d => d === 'green').length;
  const yellow = dots.filter(d => d === 'yellow').length;
  const white = dots.filter(d => d === 'white').length;
  return [green, yellow, white];
}

export function useStocks() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterConfig>(defaultFilters);
  const [sort, setSort] = useState<SortConfig>(defaultSort);
  const [sectors, setSectors] = useState<string[]>([]);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stocks')
      .select('*')
      .eq('is_deleted', false)
      .eq('is_archived', false)
      .order(sort.column, { ascending: sort.direction === 'asc' });

    if (error) {
      console.error('Error fetching stocks:', error);
    } else if (data) {
      setStocks(data as Stock[]);
      // Extract unique sectors
      const uniqueSectors = Array.from(
        new Set(data.map((s) => s.sector).filter(Boolean)),
      ).sort() as string[];
      setSectors(uniqueSectors);
    }
    setLoading(false);
  }, [sort]);

  // Apply client-side filters
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

    if (filters.showFavorites) {
      result = result.filter((s) => s.is_favorite);
    }

    if (filters.scoreMin !== null) {
      result = result.filter((s) => s.score >= filters.scoreMin!);
    }
    if (filters.scoreMax !== null) {
      result = result.filter((s) => s.score <= filters.scoreMax!);
    }

    if (filters.athDeclineMin !== null) {
      result = result.filter(
        (s) => s.ath_decline_pct !== null && s.ath_decline_pct >= filters.athDeclineMin!,
      );
    }
    if (filters.athDeclineMax !== null) {
      result = result.filter(
        (s) => s.ath_decline_pct !== null && s.ath_decline_pct <= filters.athDeclineMax!,
      );
    }

    // Filter volatile sectors
    if (filters.hideVolatileSectors) {
      result = result.filter(
        (s) => !s.sector || !VOLATILE_SECTORS.some(vs =>
          s.sector?.toLowerCase().includes(vs.toLowerCase())
        ),
      );
    }

    // Market cap filter
    if (filters.marketCapMin !== null) {
      result = result.filter(
        (s) => s.market_cap !== null && s.market_cap >= filters.marketCapMin!,
      );
    }
    if (filters.marketCapMax !== null) {
      result = result.filter(
        (s) => s.market_cap !== null && s.market_cap <= filters.marketCapMax!,
      );
    }

    // NovaBay-type filter (stable with spikes)
    if (filters.showStableWithSpikes) {
      result = result.filter((s) => s.is_stable_with_spikes === true);
    }

    // Sort — medal ranking for growth_event_count (like underwater mode)
    result.sort((a, b) => {
      if (sort.column === 'growth_event_count') {
        const [aG, aY, aW] = kuifjeMedalKey(a);
        const [bG, bY, bW] = kuifjeMedalKey(b);
        const comparison = (bG - aG) || (bY - aY) || (bW - aW);
        return sort.direction === 'asc' ? -comparison : comparison;
      }
      const aVal = a[sort.column];
      const bVal = b[sort.column];
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

  function handleSort(column: keyof Stock) {
    setSort((prev) => ({
      column,
      direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  async function toggleFavorite(id: string) {
    const stock = stocks.find((s) => s.id === id);
    if (!stock) return;

    const newValue = !stock.is_favorite;
    const { error } = await supabase
      .from('stocks')
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
      .from('stocks')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      setStocks((prev) => prev.filter((s) => s.id !== id));
    }
  }

  async function bulkFavorite(ids: Set<string>) {
    const { error } = await supabase
      .from('stocks')
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
      .from('stocks')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .in('id', Array.from(ids));

    if (!error) {
      setStocks((prev) => prev.filter((s) => !ids.has(s.id)));
    }
  }

  async function bulkArchive(ids: Set<string>) {
    const { error } = await supabase
      .from('stocks')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
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
    toggleFavorite,
    deleteStock,
    bulkFavorite,
    bulkDelete,
    bulkArchive,
    refreshStocks: fetchStocks,
  };
}
