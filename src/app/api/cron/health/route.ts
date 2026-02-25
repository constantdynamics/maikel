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

  // ── Periodic cleanup: delete old data to reduce disk IO ──
  // Runs every health check (hourly) but operations are cheap (DELETE with date filter)
  const cleanup: Record<string, number> = {};
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const twoYearCutoff = twoYearsAgo.toISOString().split('T')[0];

  try {
    // Delete old health_checks (>30 days)
    const { count: hc } = await supabase.from('health_checks').delete({ count: 'exact' }).lt('created_at', thirtyDaysAgo);
    if (hc) cleanup.health_checks = hc;

    // Delete old scan_logs (>30 days)
    const { count: sl } = await supabase.from('scan_logs').delete({ count: 'exact' }).lt('started_at', thirtyDaysAgo);
    if (sl) cleanup.scan_logs = sl;

    // Delete old zonnebloem_scan_logs (>30 days)
    const { count: zsl } = await supabase.from('zonnebloem_scan_logs').delete({ count: 'exact' }).lt('started_at', thirtyDaysAgo);
    if (zsl) cleanup.zonnebloem_scan_logs = zsl;

    // Delete old error_logs (>30 days)
    const { count: el } = await supabase.from('error_logs').delete({ count: 'exact' }).lt('created_at', thirtyDaysAgo);
    if (el) cleanup.error_logs = el;

    // Delete old price_history (>2 years — lows are pre-calculated on stocks row)
    const { count: ph } = await supabase.from('price_history').delete({ count: 'exact' }).lt('trade_date', twoYearCutoff);
    if (ph) cleanup.price_history = ph;

    if (Object.keys(cleanup).length > 0) {
      console.log('[Cleanup] Deleted old rows:', cleanup);
    }
  } catch (e) {
    console.warn('[Cleanup] Error during cleanup:', e);
  }

  return NextResponse.json({ ...healthCheck, cleanup });
}
