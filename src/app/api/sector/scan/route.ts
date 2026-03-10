import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runSectorScan } from '@/lib/sector-scanner';
import type { SectorScannerType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const VALID_TYPES: SectorScannerType[] = ['biopharma', 'mining', 'hydrogen', 'shipping'];

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const scannerType = body.scannerType as SectorScannerType;

    if (!scannerType || !VALID_TYPES.includes(scannerType)) {
      return NextResponse.json(
        { error: `Invalid scannerType. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const result = await runSectorScan(scannerType);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
