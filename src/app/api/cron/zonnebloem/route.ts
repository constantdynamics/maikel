import { NextRequest, NextResponse } from 'next/server';
import { runZonnebloemScan } from '@/lib/zonnebloem';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Zonnebloem scans global markets, so it can run any day
  // (different markets have different schedules)
  // But skip weekends for simplicity
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) {
    return NextResponse.json({ message: 'Skipping weekend scan' });
  }

  try {
    const result = await runZonnebloemScan();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
