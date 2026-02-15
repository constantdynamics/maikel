import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);

  const showDeleted = searchParams.get('deleted') === 'true';
  const showArchived = searchParams.get('archived') === 'true';

  let query = supabase.from('stocks').select('*');

  if (!showDeleted) {
    query = query.eq('is_deleted', false);
  }
  if (!showArchived) {
    query = query.eq('is_archived', false);
  }

  const { data, error } = await query.order('score', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // For stocks missing three_year_low, calculate from price_history
  if (data && data.length > 0) {
    const tickersNeedingLow = data
      .filter((s: Record<string, unknown>) => s.three_year_low == null)
      .map((s: Record<string, unknown>) => s.ticker as string);

    if (tickersNeedingLow.length > 0) {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      const cutoffDate = threeYearsAgo.toISOString().split('T')[0];

      // Query price_history for 3-year lows in batches
      const lowMap = new Map<string, number>();
      const batchSize = 50;
      for (let i = 0; i < tickersNeedingLow.length; i += batchSize) {
        const batch = tickersNeedingLow.slice(i, i + batchSize);
        const { data: priceData } = await supabase
          .from('price_history')
          .select('ticker, low_price')
          .in('ticker', batch)
          .gte('trade_date', cutoffDate)
          .gt('low_price', 0);

        if (priceData) {
          for (const row of priceData) {
            const current = lowMap.get(row.ticker);
            if (!current || row.low_price < current) {
              lowMap.set(row.ticker, row.low_price);
            }
          }
        }
      }

      // Merge three_year_low into response
      for (const stock of data) {
        if (stock.three_year_low == null && lowMap.has(stock.ticker)) {
          stock.three_year_low = lowMap.get(stock.ticker);
        }
      }
    }
  }

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
