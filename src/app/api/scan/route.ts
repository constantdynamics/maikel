import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runScan } from '@/lib/scanner';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeMarketIds } from '@/lib/input-sanitize';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for Vercel

export async function POST(request: NextRequest) {
  // Rate limit: max 3 scan requests per 5 minutes per IP (#103)
  const ip = getClientIP(request.headers);
  const rateLimit = checkRateLimit(`scan:${ip}`, 3, 5 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.', retryAfterMs: rateLimit.retryAfterMs },
      { status: 429 },
    );
  }

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    // Parse request body for market selection
    let markets: string[] | undefined;
    try {
      const body = await request.json();
      if (body.markets && Array.isArray(body.markets)) {
        markets = sanitizeMarketIds(body.markets); // (#106)
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
