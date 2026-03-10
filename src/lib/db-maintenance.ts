/**
 * Database maintenance utilities:
 * - Orphaned data cleanup (#13, #14)
 * - Stale data marking (#85)
 * - DB write retry with backoff (#42)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { retryWithBackoff } from './utils';

/**
 * Remove orphaned growth_events without a corresponding stock (#13).
 */
export async function cleanupOrphanedGrowthEvents(supabase: SupabaseClient): Promise<number> {
  try {
    // Find growth_events whose ticker doesn't exist in stocks
    const { data: orphans } = await supabase.rpc('cleanup_orphaned_growth_events');

    // If RPC doesn't exist, do it manually with a query
    if (orphans === null) {
      const { data: allTickers } = await supabase
        .from('stocks')
        .select('ticker');
      const validTickers = new Set((allTickers || []).map(s => s.ticker));

      const { data: events } = await supabase
        .from('growth_events')
        .select('ticker');

      if (!events) return 0;

      const orphanTickers = [...new Set(events.map(e => e.ticker))].filter(t => !validTickers.has(t));

      if (orphanTickers.length === 0) return 0;

      // Delete in batches to avoid query size limits
      for (let i = 0; i < orphanTickers.length; i += 100) {
        const batch = orphanTickers.slice(i, i + 100);
        await supabase.from('growth_events').delete().in('ticker', batch);
      }

      console.log(`[Maintenance] Cleaned up ${orphanTickers.length} orphaned growth_event ticker(s)`);
      return orphanTickers.length;
    }

    return typeof orphans === 'number' ? orphans : 0;
  } catch (error) {
    console.warn('[Maintenance] Growth events cleanup failed:', error);
    return 0;
  }
}

/**
 * Remove orphaned spike_events without a corresponding zonnebloem_stock (#14).
 */
export async function cleanupOrphanedSpikeEvents(supabase: SupabaseClient): Promise<number> {
  try {
    const { data: allTickers } = await supabase
      .from('zonnebloem_stocks')
      .select('ticker');
    const validTickers = new Set((allTickers || []).map(s => s.ticker));

    const { data: events } = await supabase
      .from('zonnebloem_spike_events')
      .select('ticker');

    if (!events) return 0;

    const orphanTickers = [...new Set(events.map(e => e.ticker))].filter(t => !validTickers.has(t));

    if (orphanTickers.length === 0) return 0;

    for (let i = 0; i < orphanTickers.length; i += 100) {
      const batch = orphanTickers.slice(i, i + 100);
      await supabase.from('zonnebloem_spike_events').delete().in('ticker', batch);
    }

    console.log(`[Maintenance] Cleaned up ${orphanTickers.length} orphaned spike_event ticker(s)`);
    return orphanTickers.length;
  } catch (error) {
    console.warn('[Maintenance] Spike events cleanup failed:', error);
    return 0;
  }
}

/**
 * Mark stocks with stale data (last_updated > 30 days ago) (#85).
 */
export async function markStaleStocks(supabase: SupabaseClient, maxAgeDays: number = 30): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: stale } = await supabase
      .from('stocks')
      .select('ticker')
      .eq('is_deleted', false)
      .lt('last_updated', cutoff);

    if (!stale || stale.length === 0) return 0;

    // Mark as needs_review
    await supabase
      .from('stocks')
      .update({
        needs_review: true,
        review_reason: `Stale data: not updated in ${maxAgeDays}+ days`,
      })
      .eq('is_deleted', false)
      .eq('needs_review', false) // Don't overwrite existing review reasons
      .lt('last_updated', cutoff);

    console.log(`[Maintenance] Marked ${stale.length} stock(s) with stale data (>${maxAgeDays} days)`);
    return stale.length;
  } catch (error) {
    console.warn('[Maintenance] Stale stock marking failed:', error);
    return 0;
  }
}

/**
 * Retry a database write operation with exponential backoff (#42).
 */
export async function retryDbWrite<T>(
  operation: () => Promise<{ data: T | null; error: { message: string } | null }>,
  operationName: string,
  maxRetries: number = 3,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const result = await retryWithBackoff(async () => {
      const { data, error } = await operation();
      if (error) throw new Error(error.message);
      return data;
    }, maxRetries, 500);

    return { data: result, error: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DB] ${operationName} failed after ${maxRetries} retries: ${msg}`);
    return { data: null, error: msg };
  }
}

/**
 * Run all maintenance tasks. Called from cron or health check.
 */
export async function runAllMaintenance(supabase: SupabaseClient): Promise<{
  orphanedGrowthEvents: number;
  orphanedSpikeEvents: number;
  staleStocks: number;
}> {
  const [orphanedGrowthEvents, orphanedSpikeEvents, staleStocks] = await Promise.all([
    cleanupOrphanedGrowthEvents(supabase),
    cleanupOrphanedSpikeEvents(supabase),
    markStaleStocks(supabase),
  ]);

  return { orphanedGrowthEvents, orphanedSpikeEvents, staleStocks };
}
