import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Helper to get authenticated supabase client
async function getAuthenticatedClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '') ||
    request.cookies.get('sb-access-token')?.value ||
    request.cookies.get(`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`)?.value;

  if (!token) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return null;
  }

  return supabase;
}

// Restore from a backup
export async function POST(request: NextRequest) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const backupId = body.backupId;

    if (!backupId) {
      return NextResponse.json({ error: 'Backup ID required' }, { status: 400 });
    }

    // Fetch the backup
    const { data: backup, error: fetchError } = await supabase
      .from('backups')
      .select('data')
      .eq('id', backupId)
      .single();

    if (fetchError || !backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    const backupData = backup.data as { stocks: Array<Record<string, unknown>> };
    const stocks = backupData.stocks || [];

    if (stocks.length === 0) {
      return NextResponse.json({ error: 'Backup contains no stocks' }, { status: 400 });
    }

    // Restore stocks (upsert to avoid duplicates)
    let restored = 0;
    for (const stock of stocks) {
      // Remove id and timestamps to let DB generate new ones
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, ...stockData } = stock;

      const { error } = await supabase
        .from('stocks')
        .upsert(stockData, { onConflict: 'ticker' });

      if (!error) restored++;
    }

    return NextResponse.json({
      success: true,
      restored,
      total: stocks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Restore failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
