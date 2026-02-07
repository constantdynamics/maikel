import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/zonnebloem/scan/progress
 * Returns the latest Zonnebloem scan's progress.
 * Also auto-cleans stuck scans (running for > 10 minutes without completion).
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data: scan } = await supabase
      .from('zonnebloem_scan_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (!scan) {
      return NextResponse.json({ running: false, scan: null });
    }

    // Auto-clean stuck scans: if status is 'running' but started > 10 minutes ago,
    // the serverless function was likely killed by Vercel's timeout.
    let isRunning = scan.status === 'running';
    if (isRunning && scan.started_at) {
      const startedAt = new Date(scan.started_at).getTime();
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (startedAt < tenMinutesAgo) {
        // Mark as failed due to timeout
        await supabase.from('zonnebloem_scan_logs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          errors: [...(scan.errors || []), 'Scan timed out (exceeded Vercel function limit)'],
        }).eq('id', scan.id);

        isRunning = false;
        scan.status = 'failed';
        scan.completed_at = new Date().toISOString();
      }
    }

    return NextResponse.json({
      running: isRunning,
      scan: {
        id: scan.id,
        status: scan.status,
        marketsScanned: scan.markets_scanned || [],
        candidatesFound: scan.candidates_found || 0,
        stocksDeepScanned: scan.stocks_deep_scanned || 0,
        stocksMatched: scan.stocks_matched || 0,
        newStocksFound: scan.new_stocks_found || 0,
        startedAt: scan.started_at,
        completedAt: scan.completed_at,
        durationSeconds: scan.duration_seconds,
        errors: scan.errors || [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
