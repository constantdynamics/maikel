import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getAllCircuitBreakerStatus } from '@/lib/circuit-breaker';
import { validateEnvironment } from '@/lib/validate-env';
import packageJson from '../../../../package.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'error'; detail?: string }> = {};

  // Check 1: Database connectivity (#10)
  let supabase;
  try {
    supabase = createServiceClient();
    const { error: dbError } = await supabase.from('scan_logs').select('id').limit(1);
    checks.database = dbError
      ? { status: 'error', detail: dbError.message }
      : { status: 'ok' };
  } catch (error) {
    checks.database = { status: 'error', detail: error instanceof Error ? error.message : 'Connection failed' };
    return NextResponse.json({
      version: packageJson.version,
      status: 'unhealthy',
      checks,
      circuitBreakers: getAllCircuitBreakerStatus(),
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }

  // Check 2: Environment variables (#28)
  const envResult = validateEnvironment();
  checks.environment = envResult.valid
    ? { status: 'ok' }
    : { status: 'error', detail: envResult.errors.join('; ') };

  // Check 3: Circuit breaker status (#1, #2)
  const circuitBreakers = getAllCircuitBreakerStatus();
  checks.circuitBreakers = (circuitBreakers.tradingView.state === 'OPEN' || circuitBreakers.yahoo.state === 'OPEN')
    ? { status: 'error', detail: `TV: ${circuitBreakers.tradingView.state}, Yahoo: ${circuitBreakers.yahoo.state}` }
    : { status: 'ok' };

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

    // Check for stale scans (#9, #22)
    const { data: staleScans } = await supabase
      .from('scan_logs')
      .select('id, started_at')
      .eq('status', 'running')
      .lt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    checks.staleScans = staleScans && staleScans.length > 0
      ? { status: 'error', detail: `${staleScans.length} scan(s) stuck in 'running' state` }
      : { status: 'ok' };

    // Get stock count
    const { count: stockCount } = await supabase
      .from('stocks')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false);

    const allHealthy = Object.values(checks).every(c => c.status === 'ok');

    return NextResponse.json({
      version: packageJson.version,
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      circuitBreakers,
      health: healthCheck || null,
      lastScan: lastScan || null,
      stockCount: stockCount || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      version: packageJson.version,
      status: 'unhealthy',
      checks,
      circuitBreakers,
      error: message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
