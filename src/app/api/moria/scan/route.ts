import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { runMoriaScan } from '@/lib/moria';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Auto-create Moria tables if they don't exist yet.
 */
async function ensureMoriaTables() {
  const supabase = createServiceClient();

  // Test if table exists by trying a simple query
  const { error } = await supabase.from('moria_stocks').select('id').limit(1);

  if (error?.code === 'PGRST205' || error?.message?.includes('moria_stocks')) {
    // Table doesn't exist — create it via raw SQL using the service client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const sql = `
      CREATE TABLE IF NOT EXISTS moria_stocks (
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
      CREATE INDEX IF NOT EXISTS idx_moria_stocks_ticker ON moria_stocks(ticker);
      CREATE INDEX IF NOT EXISTS idx_moria_stocks_market ON moria_stocks(market);
      CREATE INDEX IF NOT EXISTS idx_moria_stocks_deleted ON moria_stocks(is_deleted);

      CREATE TABLE IF NOT EXISTS moria_scan_logs (
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

    // If RPC doesn't work, try the SQL endpoint
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
        console.error('[Moria] Could not auto-create tables. Please run the migration manually:');
        console.error('[Moria] supabase/migrations/add_moria_tables.sql');
        return false;
      }
    }

    console.log('[Moria] Tables created successfully');
    return true;
  }

  return true; // Table exists
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    // Ensure tables exist before scanning
    await ensureMoriaTables();

    const result = await runMoriaScan();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Moria] Scan error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
