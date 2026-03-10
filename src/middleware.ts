import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Timing-safe string comparison to prevent timing attacks on secrets.
 * Edge runtime compatible (no Node.js crypto module).
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function middleware(request: NextRequest) {
  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Allow API health check even without config
    if (request.nextUrl.pathname === '/api/health') {
      return NextResponse.json({
        error: 'Not configured',
        message: 'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
      }, { status: 503 });
    }

    // For pages, show a setup message
    if (!request.nextUrl.pathname.startsWith('/api')) {
      const url = request.nextUrl.clone();
      url.pathname = '/setup-required';
      // Don't redirect to avoid loops - just continue
    }
  }

  // Protect cron endpoints with CRON_SECRET (timing-safe comparison)
  if (request.nextUrl.pathname.startsWith('/api/cron')) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || !authHeader || !timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/cron/:path*',
    '/dashboard',
    '/settings',
    '/status',
    '/archive',
    '/recycle-bin',
  ],
};
