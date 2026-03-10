/**
 * Scan guard utilities:
 * - Stale scan detection: marks 'running' scans as 'failed' after 10 minutes (#9, #22)
 * - Duplicate scan prevention at DB level (#17)
 * - Fallback: preserve previous results when scan finds 0 candidates (#6)
 */

import { SupabaseClient } from '@supabase/supabase-js';

const STALE_SCAN_TIMEOUT_MINUTES = 10;

/**
 * Mark any scans that have been 'running' for more than 10 minutes as 'failed'.
 * Should be called at the start of each new scan to clean up crashed scans.
 */
export async function cleanupStaleScanLogs(
  supabase: SupabaseClient,
  scanTable: string = 'scan_logs',
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SCAN_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data: staleScans } = await supabase
    .from(scanTable)
    .select('id, started_at')
    .eq('status', 'running')
    .lt('started_at', cutoff);

  if (!staleScans || staleScans.length === 0) return 0;

  const ids = staleScans.map(s => s.id);
  await supabase
    .from(scanTable)
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      errors: ['Scan marked as failed: exceeded 10 minute timeout (likely crashed or timed out)'],
    })
    .in('id', ids);

  console.warn(`[ScanGuard] Marked ${ids.length} stale scan(s) as failed in ${scanTable}`);
  return ids.length;
}

/**
 * Check if there's already a scan running at DB level (not just in-memory).
 * Returns the running scan ID if one exists, null otherwise.
 */
export async function checkForRunningScans(
  supabase: SupabaseClient,
  scanTable: string = 'scan_logs',
): Promise<string | null> {
  // First clean up stale scans
  await cleanupStaleScanLogs(supabase, scanTable);

  const { data: running } = await supabase
    .from(scanTable)
    .select('id, started_at')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1);

  if (running && running.length > 0) {
    return running[0].id;
  }

  return null;
}

/**
 * Before a scan replaces results with 0 candidates, check if we should keep previous data.
 * Returns true if previous results should be preserved (i.e., current scan found nothing).
 */
export async function shouldPreserveResults(
  supabase: SupabaseClient,
  stockTable: string,
  newCandidateCount: number,
): Promise<boolean> {
  if (newCandidateCount > 0) return false;

  // Check if there are existing stocks in the table
  const { count } = await supabase
    .from(stockTable)
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false);

  if (count && count > 0) {
    console.warn(`[ScanGuard] Current scan found 0 candidates but ${count} existing stocks in ${stockTable}. Preserving previous results.`);
    return true;
  }

  return false;
}
