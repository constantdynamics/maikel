import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { stocksToCSV, generateCsvFilename } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);

  const range = searchParams.get('range') || 'all';

  let query = supabase
    .from('stocks')
    .select('*')
    .eq('is_deleted', false)
    .order('score', { ascending: false });

  // Apply date range filter
  if (range === '6months') {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    query = query.gte('detection_date', sixMonthsAgo.toISOString());
  } else if (range === '1year') {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    query = query.gte('detection_date', oneYearAgo.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const csv = stocksToCSV((data || []) as unknown as Record<string, unknown>[]);
  const filename = generateCsvFilename();

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
