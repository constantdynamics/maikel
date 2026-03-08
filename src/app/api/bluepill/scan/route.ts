import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';
import { runBluePillScan } from '@/lib/bluepill';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Auto-create BluePill tables if they don't exist yet.
 */
async function ensureBluePillTables() {
  const supabase = createServiceClient();

  const { error } = await supabase.from('bluepill_stocks').select('id').limit(1);

  if (error?.code === 'PGRST205' || error?.message?.includes('bluepill_stocks')) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const sql = `
      CREATE TABLE IF NOT EXISTS bluepill_stocks (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        ticker TEXT NOT NULL,
        yahoo_ticker TEXT,
        company_name TEXT NOT NULL DEFAULT '',
        sector TEXT,
        exchange TEXT,
        market TEXT,
        country TEXT,
        current_price NUMERIC,
        all_time_high NUMERIC,
        ath_decline_pct NUMERIC,
        high_3y NUMERIC,
        decline_from_3y_pct NUMERIC,
        high_1y NUMERIC,
        decline_from_1y_pct NUMERIC,
        high_6m NUMERIC,
        decline_from_6m_pct NUMERIC,
        avg_volume_30d NUMERIC,
        market_cap NUMERIC,
        growth_event_count INTEGER DEFAULT 0,
        highest_growth_pct NUMERIC,
        highest_growth_date TEXT,
        spike_count INTEGER DEFAULT 0,
        highest_spike_pct NUMERIC,
        highest_spike_date TEXT,
        spike_score NUMERIC DEFAULT 0,
        detection_date TIMESTAMPTZ DEFAULT NOW(),
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        scan_session_id UUID,
        is_favorite BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMPTZ,
        is_archived BOOLEAN DEFAULT FALSE,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bluepill_stocks_ticker ON bluepill_stocks(ticker);
      CREATE INDEX IF NOT EXISTS idx_bluepill_stocks_market ON bluepill_stocks(market);
      CREATE INDEX IF NOT EXISTS idx_bluepill_stocks_deleted ON bluepill_stocks(is_deleted);

      CREATE TABLE IF NOT EXISTS bluepill_scan_logs (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        status TEXT DEFAULT 'running',
        markets_scanned TEXT[] DEFAULT '{}',
        candidates_found INTEGER DEFAULT 0,
        stocks_saved INTEGER DEFAULT 0,
        new_stocks_found INTEGER DEFAULT 0,
        errors TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      const sqlRes = await fetch(`${supabaseUrl}/pg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!sqlRes.ok) {
        console.error('[BluePill] Could not auto-create tables. Please run the migration manually:');
        console.error('[BluePill] supabase/migrations/add_bluepill_tables.sql');
        return false;
      }
    }

    console.log('[BluePill] Tables created successfully');
    return true;
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }

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
    await ensureBluePillTables();
    const result = await runBluePillScan();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[BluePill] Scan error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
