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

    // Auto-clean stuck scans: if status is 'running' but started > 10 minutes ago,
    // the serverless function was likely killed by Vercel's timeout.
    let isRunning = scan.status === 'running';
    if (isRunning && scan.started_at) {
      const startedAt = new Date(scan.started_at).getTime();
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (startedAt < tenMinutesAgo) {
        await supabase.from('scan_logs').update({
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
