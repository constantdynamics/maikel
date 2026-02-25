import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Paginate through ALL rows from a Supabase query.
 * Supabase/PostgREST has a server-side max_rows default of 1000.
 * This fetches in pages of 1000 until all rows are retrieved.
 */
async function fetchAllRows(
  supabase: ReturnType<typeof createServiceClient>,
  showDeleted: boolean,
  showArchived: boolean,
) {
  const PAGE_SIZE = 1000;
  const allRows: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    let query = supabase.from('stocks').select('*');

    if (!showDeleted) {
      query = query.eq('is_deleted', false);
    }
    if (!showArchived) {
      query = query.eq('is_archived', false);
    }

    const { data, error } = await query
      .order('score', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    if (!data || data.length === 0) break;

    allRows.push(...data);

    // If we got fewer than PAGE_SIZE rows, we've reached the end
    if (data.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
  }

  return { data: allRows, error: null };
}

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);

  const showDeleted = searchParams.get('deleted') === 'true';
  const showArchived = searchParams.get('archived') === 'true';

  const { data, error } = await fetchAllRows(supabase, showDeleted, showArchived);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // three_year_low is pre-calculated during scan and stored on the stocks row.
  // No need to query price_history on every page load — saves massive disk IO.

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient();
  const body = await request.json();

  const { id, ids, ...updates } = body;

  if (ids && Array.isArray(ids)) {
    const { error } = await supabase.from('stocks').update(updates).in('id', ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (id) {
    const { error } = await supabase.from('stocks').update(updates).eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Missing id or ids' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
