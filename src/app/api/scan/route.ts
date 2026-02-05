import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runScan } from '@/lib/scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for Vercel

export async function POST(request: NextRequest) {
  // Verify the user is authenticated before allowing a manual scan
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }

    // Extract auth token from cookie or Authorization header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') ||
      request.cookies.get('sb-access-token')?.value ||
      request.cookies.get(`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`)?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  try {
    const result = await runScan();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
