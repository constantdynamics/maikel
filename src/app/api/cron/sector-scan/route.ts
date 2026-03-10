import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth';
import { runSectorScan } from '@/lib/sector-scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Weekly cron endpoint for sector scans (BioPharma & Mining).
 * Runs both sector scanners to keep sector_stocks table up to date.
 * The Defog client-side weekly refresh will then pick up the latest top 250.
 *
 * Schedule: Sundays at 12:00 UTC (markets closed, no rate limit pressure)
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  // Run BioPharma scan
  try {
    const biopharmaResult = await runSectorScan('biopharma');
    results.biopharma = biopharmaResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`biopharma: ${message}`);
    results.biopharma = { error: message };
  }

  // Run Mining scan
  try {
    const miningResult = await runSectorScan('mining');
    results.mining = miningResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`mining: ${message}`);
    results.mining = { error: message };
  }

  const status = errors.length === 0 ? 200 : errors.length === 2 ? 500 : 207;

  return NextResponse.json({
    message: errors.length === 0
      ? 'Both sector scans completed successfully'
      : `Completed with ${errors.length} error(s)`,
    results,
    errors: errors.length > 0 ? errors : undefined,
  }, { status });
}
