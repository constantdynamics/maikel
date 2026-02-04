import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { stocksToCSV } from '@/lib/utils';
import { format, subMonths } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const lastMonth = subMonths(new Date(), 1);
    const monthStr = format(lastMonth, 'yyyy-MM');
    const filename = `StockScreener_Archive_${monthStr}.csv`;

    // Get all stocks that were active last month
    const { data: stocks, error } = await supabase
      .from('stocks')
      .select('*')
      .eq('is_deleted', false)
      .lte('detection_date', format(new Date(), 'yyyy-MM-dd'))
      .order('score', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!stocks || stocks.length === 0) {
      return NextResponse.json({ message: 'No stocks to archive' });
    }

    // Generate CSV
    const csv = stocksToCSV(stocks as unknown as Record<string, unknown>[]);

    // Store archive
    const { error: archiveError } = await supabase.from('archives').insert({
      filename,
      month: `${monthStr}-01`,
      stock_count: stocks.length,
      file_size_bytes: new Blob([csv]).size,
      csv_data: csv,
    });

    if (archiveError) {
      return NextResponse.json({ error: archiveError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Archive created: ${filename}`,
      stockCount: stocks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
