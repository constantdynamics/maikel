import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);

  const scannerType = searchParams.get('type'); // 'biopharma' | 'mining' | 'hydrogen' | 'shipping'
  if (!scannerType || !['biopharma', 'mining', 'hydrogen', 'shipping'].includes(scannerType)) {
    return NextResponse.json(
      { error: 'Missing or invalid type parameter. Use ?type=biopharma, mining, hydrogen, or shipping' },
      { status: 400 },
    );
  }

  const showDeleted = searchParams.get('deleted') === 'true';
  const sortBy = searchParams.get('sort') === 'score' ? 'score' : 'spike_score';
  const limitParam = searchParams.get('limit');

  let query = supabase
    .from('sector_stocks')
    .select('*')
    .eq('scanner_type', scannerType);

  if (!showDeleted) {
    query = query.eq('is_deleted', false);
  }

  query = query.order(sortBy, { ascending: false });

  if (limitParam) {
    const limit = Math.min(Math.max(1, parseInt(limitParam, 10) || 250), 1000);
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
