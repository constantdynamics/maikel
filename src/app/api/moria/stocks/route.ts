import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);

  const showDeleted = searchParams.get('deleted') === 'true';

  let query = supabase
    .from('moria_stocks')
    .select('*');

  if (!showDeleted) {
    query = query.eq('is_deleted', false);
  }

  query = query.order('ath_decline_pct', { ascending: false });

  const { data, error } = await query;

  if (error) {
    // Table might not exist yet — return empty array instead of 500
    if (error.code === 'PGRST205' || error.message?.includes('moria_stocks')) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
