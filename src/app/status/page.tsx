'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';
import type { ScanLog, HealthCheck, ErrorLog } from '@/lib/types';

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    degraded: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    partial: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    rate_limited: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    down: 'bg-red-500/20 text-red-400 border-red-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  const classes = colorMap[status] || colorMap.unknown;

  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}

export default function StatusPage() {
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockCount, setStockCount] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [healthRes, scanRes, errorRes, countRes] = await Promise.all([
      supabase
        .from('health_checks')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(10),
      supabase
        .from('scan_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20),
      supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('stocks')
        .select('id', { count: 'exact', head: true })
        .eq('is_deleted', false),
    ]);

    if (healthRes.data) setHealthChecks(healthRes.data as HealthCheck[]);
    if (scanRes.data) setScanLogs(scanRes.data as ScanLog[]);
    if (errorRes.data) setErrorLogs(errorRes.data as ErrorLog[]);
    if (countRes.count !== null) setStockCount(countRes.count);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const latestHealth = healthChecks[0];

  return (
    <>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">System Status</h1>

        {loading ? (
          <div className="text-slate-400 py-8 text-center">Loading...</div>
        ) : (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">Total Stocks</div>
                <div className="text-2xl font-bold">{stockCount}</div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">Yahoo Finance</div>
                <StatusBadge status={latestHealth?.yahoo_finance_status || 'unknown'} />
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">Alpha Vantage</div>
                <StatusBadge status={latestHealth?.alpha_vantage_status || 'unknown'} />
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">Database</div>
                <StatusBadge status={latestHealth?.database_status || 'unknown'} />
              </div>
            </div>

            {/* Scan History */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Scan History</h2>
              {scanLogs.length === 0 ? (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
                  No scans recorded yet
                </div>
              ) : (
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-700/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Started</th>
                          <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Status</th>
                          <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Scanned</th>
                          <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Found</th>
                          <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Duration</th>
                          <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Yahoo Calls</th>
                          <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">AV Calls</th>
                          <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Errors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {scanLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-700/30">
                            <td className="px-4 py-2.5 text-slate-300">{formatDateTime(log.started_at)}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={log.status} /></td>
                            <td className="px-4 py-2.5 text-right font-mono">{log.stocks_scanned}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{log.stocks_found}</td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {log.duration_seconds ? `${log.duration_seconds}s` : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">{log.api_calls_yahoo}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{log.api_calls_alphavantage}</td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {log.errors?.length || 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Error Log */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Recent Errors</h2>
              {errorLogs.length === 0 ? (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
                  No errors recorded
                </div>
              ) : (
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Time</th>
                          <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Severity</th>
                          <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Source</th>
                          <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {errorLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-700/30">
                            <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                              {formatDateTime(log.created_at)}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusBadge status={log.severity} />
                            </td>
                            <td className="px-4 py-2.5 text-slate-300">{log.source}</td>
                            <td className="px-4 py-2.5 text-slate-400 max-w-md truncate">
                              {log.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
