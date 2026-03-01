import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import type { SectorScannerType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_TYPES: SectorScannerType[] = ['biopharma', 'mining', 'hydrogen', 'shipping'];

/**
 * GET /api/sector/scan/progress?type=biopharma
 * Returns the latest sector scan's progress.
 */
export async function GET(request: NextRequest) {
  try {
    const scannerType = request.nextUrl.searchParams.get('type') as SectorScannerType;

    if (!scannerType || !VALID_TYPES.includes(scannerType)) {
      return NextResponse.json({ error: 'Missing or invalid type parameter' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: scan } = await supabase
      .from('sector_scan_logs')
      .select('*')
      .eq('scanner_type', scannerType)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (!scan) {
      return NextResponse.json({ running: false, scan: null });
    }

    // Auto-clean stuck scans
    let isRunning = scan.status === 'running';
    if (isRunning && scan.started_at) {
      const startedAt = new Date(scan.started_at).getTime();
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (startedAt < tenMinutesAgo) {
        await supabase.from('sector_scan_logs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          errors: [...(scan.errors || []), 'Scan timed out'],
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
        scannerType: scan.scanner_type,
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
