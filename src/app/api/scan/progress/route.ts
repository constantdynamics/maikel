import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scan/progress
 * Returns the latest running or recently completed scan's progress.
 * Polled by the dashboard to show real-time scan progress.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data: scan } = await supabase
      .from('scan_logs')
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
        stocksScanned: scan.stocks_scanned || 0,
        stocksFound: scan.stocks_found || 0,
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
