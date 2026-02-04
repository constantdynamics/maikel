import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  try {
    // Get latest health check
    const { data: healthCheck } = await supabase
      .from('health_checks')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(1)
      .single();

    // Get latest scan log
    const { data: lastScan } = await supabase
      .from('scan_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    // Get stock count
    const { count: stockCount } = await supabase
      .from('stocks')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false);

    return NextResponse.json({
      health: healthCheck || null,
      lastScan: lastScan || null,
      stockCount: stockCount || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
