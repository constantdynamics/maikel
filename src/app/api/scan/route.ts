import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runScan } from '@/lib/scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for Vercel

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    // Parse request body for market selection
    let markets: string[] | undefined;
    try {
      const body = await request.json();
      if (body.markets && Array.isArray(body.markets)) {
        markets = body.markets;
      }
    } catch {
      // No body or invalid JSON - use defaults
    }

    const result = await runScan(markets);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
