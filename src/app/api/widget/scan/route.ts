import { NextRequest, NextResponse } from 'next/server';
import { runScan } from '@/lib/scanner';
import { runZonnebloemScan } from '@/lib/zonnebloem';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/widget/scan
 *
 * Lightweight scan trigger for the widget.
 * Accepts a simple secret token for auth (same as CRON_SECRET).
 * Body: { scanner: 'kuifje' | 'zonnebloem', secret: string }
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  let body: { scanner?: string; secret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Auth via body secret or Authorization header
  const secret = body.secret || request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scanner = body.scanner || 'kuifje';

  try {
    if (scanner === 'zonnebloem') {
      const result = await runZonnebloemScan();
      return NextResponse.json({ scanner: 'zonnebloem', ...result });
    } else {
      const result = await runScan();
      return NextResponse.json({ scanner: 'kuifje', ...result });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message, scanner }, { status: 500 });
  }
}

/**
 * GET /api/widget/scan?scanner=kuifje|zonnebloem
 *
 * Returns combined progress for both scanners.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scanner = searchParams.get('scanner');

  // Fetch progress from both scanners in parallel
  const baseUrl = request.nextUrl.origin;

  if (scanner === 'kuifje' || !scanner) {
    const kuifjeProgress = await fetchProgress(`${baseUrl}/api/scan/progress`);
    if (scanner === 'kuifje') {
      return NextResponse.json({ kuifje: kuifjeProgress });
    }
    const zbProgress = await fetchProgress(`${baseUrl}/api/zonnebloem/scan/progress`);
    return NextResponse.json({ kuifje: kuifjeProgress, zonnebloem: zbProgress });
  }

  const zbProgress = await fetchProgress(`${baseUrl}/api/zonnebloem/scan/progress`);
  return NextResponse.json({ zonnebloem: zbProgress });
}

async function fetchProgress(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return await res.json();
  } catch {
    return { running: false, error: 'Failed to fetch progress' };
  }
}
