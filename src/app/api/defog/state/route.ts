import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const DEFOG_STATE_KEY = 'defog_state';

// GET /api/defog/state — load persisted defog state from Supabase
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('settings')
      .select('value, updated_at')
      .eq('key', DEFOG_STATE_KEY)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data yet — return empty
        return NextResponse.json({ data: null });
      }
      console.error('[API /api/defog/state] Load failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.value) {
      return NextResponse.json({ data: null });
    }

    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return NextResponse.json({ data: parsed, updatedAt: data.updated_at });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /api/defog/state] Unexpected error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/defog/state — save defog state to Supabase
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key: DEFOG_STATE_KEY, value: JSON.stringify(body), updated_at: now },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('[API /api/defog/state] Save failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, updatedAt: now });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /api/defog/state] Unexpected error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
