import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const DEFOG_STATE_KEY = 'defog_state';

/**
 * GET /api/defog-sync
 * Load defog state from cloud. Uses service role key — no client auth needed.
 */
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
        return NextResponse.json({ data: null });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.value) {
      return NextResponse.json({ data: null });
    }

    const parsed = JSON.parse(data.value);
    return NextResponse.json({ data: parsed, updated_at: data.updated_at });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/defog-sync
 * Save defog state to cloud. Uses service role key — no client auth needed.
 * Includes safety checks to prevent overwriting good data with empty state.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { state, minStockCount } = body;

    if (!state) {
      return NextResponse.json({ error: 'Missing state' }, { status: 400 });
    }

    // Safety: never save empty state
    const totalStocks = state.tabs?.reduce(
      (n: number, t: { stocks?: unknown[] }) => n + (t.stocks?.length || 0), 0
    ) || 0;

    if (totalStocks === 0) {
      return NextResponse.json(
        { error: 'Blocked: refusing to save empty state' },
        { status: 400 }
      );
    }

    if (minStockCount && totalStocks < minStockCount) {
      return NextResponse.json(
        { error: `Blocked: stock count ${totalStocks} below safety threshold ${minStockCount}` },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const json = JSON.stringify(state);

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key: DEFOG_STATE_KEY, value: json, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, size: json.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
