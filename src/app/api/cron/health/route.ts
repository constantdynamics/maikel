import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import * as yahoo from '@/lib/scanner/yahoo';
import * as alphavantage from '@/lib/scanner/alphavantage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const healthCheck: Record<string, string> = {
    yahoo_finance_status: 'unknown',
    alpha_vantage_status: 'unknown',
    database_status: 'unknown',
    last_scan_status: 'unknown',
  };

  // Check Yahoo Finance
  try {
    const quote = await yahoo.getStockQuote('AAPL');
    healthCheck.yahoo_finance_status = quote ? 'healthy' : 'degraded';
  } catch {
    healthCheck.yahoo_finance_status = 'down';
  }

  // Check Alpha Vantage
  try {
    const remaining = alphavantage.getRemainingCalls();
    healthCheck.alpha_vantage_status = remaining > 0 ? 'healthy' : 'rate_limited';
  } catch {
    healthCheck.alpha_vantage_status = 'down';
  }

  // Check Database
  try {
    const { error } = await supabase.from('settings').select('key').limit(1);
    healthCheck.database_status = error ? 'down' : 'healthy';
  } catch {
    healthCheck.database_status = 'down';
  }

  // Get last scan status
  try {
    const { data } = await supabase
      .from('scan_logs')
      .select('status, started_at')
      .order('started_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      healthCheck.last_scan_status = data[0].status;
    }
  } catch {
    // ignore
  }

  // Store health check
  await supabase.from('health_checks').insert({
    yahoo_finance_status: healthCheck.yahoo_finance_status,
    alpha_vantage_status: healthCheck.alpha_vantage_status,
    database_status: healthCheck.database_status,
    last_scan_status: healthCheck.last_scan_status,
  });

  return NextResponse.json(healthCheck);
}
