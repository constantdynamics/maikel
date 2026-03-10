import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

/**
 * Shared authentication utilities for API routes.
 * Centralizes token extraction and Supabase config validation.
 */

/** Validate that Supabase environment variables are configured. */
export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Extract auth token from request (Authorization header or Supabase cookies). */
export function extractToken(request: NextRequest, supabaseUrl: string): string | null {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '') ||
    request.cookies.get('sb-access-token')?.value ||
    request.cookies.get(`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`)?.value;
  return token || null;
}

/**
 * Authenticate a request and return a Supabase client scoped to the user.
 * Returns null if authentication fails.
 */
export async function getAuthenticatedClient(
  request: NextRequest,
): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  const token = extractToken(request, config.url);
  if (!token) return null;

  const supabase = createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;

  return { supabase, userId: user.id };
}

/**
 * Require authentication or return an error response.
 * Use in API routes: `const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;`
 */
export async function requireAuth(
  request: NextRequest,
): Promise<{ supabase: SupabaseClient; userId: string } | NextResponse> {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const token = extractToken(request, config.url);
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const supabase = createClient(config.url, config.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    return { supabase, userId: user.id };
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }
}

/** Verify CRON_SECRET from the Authorization header using timing-safe comparison. */
export function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader) return false;

  const expected = `Bearer ${cronSecret}`;
  if (authHeader.length !== expected.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(authHeader, 'utf8'),
      Buffer.from(expected, 'utf8'),
    );
  } catch {
    return false;
  }
}

/** Parse a limit query parameter with min/max clamping. */
export function parseLimit(
  limitParam: string | null,
  defaultLimit: number = 250,
  max: number = 1000,
): number | null {
  if (!limitParam) return null;
  return Math.min(Math.max(1, parseInt(limitParam, 10) || defaultLimit), max);
}
