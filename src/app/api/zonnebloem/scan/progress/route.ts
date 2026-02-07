import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/zonnebloem/scan/progress
 * Returns the latest Zonnebloem scan's progress.
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

    return NextResponse.json({
      running: scan.status === 'running',
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
