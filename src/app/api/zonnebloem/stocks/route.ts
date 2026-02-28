import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);

  const showDeleted = searchParams.get('deleted') === 'true';
  const limitParam = searchParams.get('limit');

  let query = supabase.from('zonnebloem_stocks').select('*');

  if (!showDeleted) {
    query = query.eq('is_deleted', false);
  }

  query = query.order('spike_score', { ascending: false });

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

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient();
  const body = await request.json();

  const { id, ids, ...updates } = body;

  if (ids && Array.isArray(ids)) {
    const { error } = await supabase.from('zonnebloem_stocks').update(updates).in('id', ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (id) {
    const { error } = await supabase.from('zonnebloem_stocks').update(updates).eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Missing id or ids' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
