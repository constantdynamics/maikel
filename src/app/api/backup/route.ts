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

// Create a backup
export async function POST(request: NextRequest) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Parse request body for backup type
    let backupType = 'manual';
    try {
      const body = await request.json();
      if (body.type) backupType = body.type;
    } catch {
      // Default to manual
    }

    // Fetch all non-deleted stocks
    const { data: stocks, error: stocksError } = await supabase
      .from('stocks')
      .select('*')
      .eq('is_deleted', false);

    if (stocksError) throw stocksError;

    const stockCount = stocks?.length || 0;
    const favoriteCount = stocks?.filter(s => s.is_favorite).length || 0;

    // Create backup entry
    const backupData = {
      stocks: stocks || [],
      backed_up_at: new Date().toISOString(),
    };

    const dataString = JSON.stringify(backupData);

    const { data: backup, error: backupError } = await supabase
      .from('backups')
      .insert({
        backup_type: backupType,
        stock_count: stockCount,
        favorite_count: favoriteCount,
        data: backupData,
        size_bytes: dataString.length,
      })
      .select()
      .single();

    if (backupError) throw backupError;

    // Cleanup old backups (keep only last 30)
    const { data: oldBackups } = await supabase
      .from('backups')
      .select('id')
      .order('created_at', { ascending: false })
      .range(30, 100);

    if (oldBackups && oldBackups.length > 0) {
      const idsToDelete = oldBackups.map(b => b.id);
      await supabase
        .from('backups')
        .delete()
        .in('id', idsToDelete);
    }

    return NextResponse.json({
      success: true,
      backup: {
        id: backup.id,
        stock_count: stockCount,
        favorite_count: favoriteCount,
        created_at: backup.created_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Get backup history
export async function GET(request: NextRequest) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { data: backups, error } = await supabase
      .from('backups')
      .select('id, backup_type, stock_count, favorite_count, size_bytes, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({ backups: backups || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch backups';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
