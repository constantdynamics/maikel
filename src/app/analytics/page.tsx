'use client';

import { useState, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabase';
import type { Stock } from '@/lib/types';

interface SectorStats {
  sector: string;
  count: number;
  avgScore: number;
  topScore: number;
  favorites: number;
  stableWithSpikes: number;
}

interface ScanLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  stocks_scanned: number;
  stocks_found: number;
  duration_seconds: number | null;
  api_calls_yahoo: number;
  api_calls_alphavantage: number;
}

export default function AnalyticsPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // Load stocks
      const { data: stocksData } = await supabase
        .from('stocks')
        .select('*')
        .eq('is_deleted', false)
        .eq('is_archived', false);

      // Load scan logs
      const { data: logsData } = await supabase
        .from('scan_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (stocksData) setStocks(stocksData as Stock[]);
      if (logsData) setScanLogs(logsData as ScanLog[]);

      setLoading(false);
    }
    loadData();
  }, []);

  // Calculate sector statistics
  const sectorStats: SectorStats[] = (() => {
    const sectorMap = new Map<string, {
      count: number;
      totalScore: number;
      topScore: number;
      favorites: number;
      stableWithSpikes: number;
    }>();

    for (const stock of stocks) {
      const sector = stock.sector || 'Unknown';
      const existing = sectorMap.get(sector) || {
        count: 0,
        totalScore: 0,
        topScore: 0,
        favorites: 0,
        stableWithSpikes: 0,
      };

      existing.count++;
      existing.totalScore += stock.score;
      existing.topScore = Math.max(existing.topScore, stock.score);
      if (stock.is_favorite) existing.favorites++;
      if (stock.is_stable_with_spikes) existing.stableWithSpikes++;

      sectorMap.set(sector, existing);
    }

    return Array.from(sectorMap.entries())
      .map(([sector, stats]) => ({
        sector,
        count: stats.count,
        avgScore: stats.totalScore / stats.count,
        topScore: stats.topScore,
        favorites: stats.favorites,
        stableWithSpikes: stats.stableWithSpikes,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  })();

  // Calculate scan efficiency stats
  const scanStats = (() => {
    const completedScans = scanLogs.filter(s => s.status === 'completed' || s.status === 'partial');
    if (completedScans.length === 0) return null;

    const totalScanned = completedScans.reduce((sum, s) => sum + s.stocks_scanned, 0);
    const totalFound = completedScans.reduce((sum, s) => sum + s.stocks_found, 0);
    const totalDuration = completedScans.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    const totalYahooCalls = completedScans.reduce((sum, s) => sum + (s.api_calls_yahoo || 0), 0);
    const totalAlphaCalls = completedScans.reduce((sum, s) => sum + (s.api_calls_alphavantage || 0), 0);

    return {
      totalScans: completedScans.length,
      totalScanned,
      totalFound,
      avgScanned: Math.round(totalScanned / completedScans.length),
      avgFound: (totalFound / completedScans.length).toFixed(1),
      successRate: totalScanned > 0 ? ((totalFound / totalScanned) * 100).toFixed(1) : '0',
      avgDuration: Math.round(totalDuration / completedScans.length),
      totalYahooCalls,
      totalAlphaCalls,
      avgYahooCalls: Math.round(totalYahooCalls / completedScans.length),
    };
  })();

  // Recent scans for timeline
  const recentScans = scanLogs.slice(0, 20);

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center py-20">
          <div className="text-[var(--text-muted)] animate-pulse">Loading analytics...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Analytics</h1>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 animate-card hover-lift">
            <div className="text-3xl font-bold text-[var(--accent-primary)]">{stocks.length}</div>
            <div className="text-sm text-[var(--text-muted)]">Total Stocks</div>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 animate-card hover-lift">
            <div className="text-3xl font-bold text-yellow-400">{stocks.filter(s => s.is_favorite).length}</div>
            <div className="text-sm text-[var(--text-muted)]">Favorites</div>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 animate-card hover-lift">
            <div className="text-3xl font-bold text-green-400">{stocks.filter(s => s.score >= 8).length}</div>
            <div className="text-sm text-[var(--text-muted)]">High Score (8+)</div>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 animate-card hover-lift">
            <div className="text-3xl font-bold text-blue-400">{stocks.filter(s => s.is_stable_with_spikes).length}</div>
            <div className="text-sm text-[var(--text-muted)]">Stable+Spike</div>
          </div>
        </div>

        {/* Sector Performance */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-6 animate-card">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Sector Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-color)]">
                  <th className="pb-2">Sector</th>
                  <th className="pb-2 text-right">Stocks</th>
                  <th className="pb-2 text-right">Avg Score</th>
                  <th className="pb-2 text-right">Top Score</th>
                  <th className="pb-2 text-right">Favorites</th>
                  <th className="pb-2 text-right">Stable+Spike</th>
                  <th className="pb-2">Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {sectorStats.slice(0, 15).map((sector, index) => (
                  <tr key={sector.sector} className="animate-row" style={{ animationDelay: `${index * 0.03}s` }}>
                    <td className="py-2 text-[var(--text-primary)]">{sector.sector}</td>
                    <td className="py-2 text-right text-[var(--text-secondary)]">{sector.count}</td>
                    <td className="py-2 text-right">
                      <span className={`font-medium ${
                        sector.avgScore >= 7 ? 'text-green-400' :
                        sector.avgScore >= 4 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {sector.avgScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2 text-right text-[var(--text-secondary)]">{sector.topScore}</td>
                    <td className="py-2 text-right text-yellow-400">{sector.favorites || '-'}</td>
                    <td className="py-2 text-right text-blue-400">{sector.stableWithSpikes || '-'}</td>
                    <td className="py-2">
                      <div className="w-32 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            sector.avgScore >= 7 ? 'bg-green-500' :
                            sector.avgScore >= 4 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${(sector.avgScore / 10) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scan Efficiency Report */}
        {scanStats && (
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-6 animate-card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Scan Efficiency Report</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <div className="text-2xl font-bold text-[var(--text-primary)]">{scanStats.totalScans}</div>
                <div className="text-xs text-[var(--text-muted)]">Total Scans</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <div className="text-2xl font-bold text-[var(--accent-primary)]">{scanStats.successRate}%</div>
                <div className="text-xs text-[var(--text-muted)]">Success Rate</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <div className="text-2xl font-bold text-[var(--text-primary)]">{scanStats.avgScanned}</div>
                <div className="text-xs text-[var(--text-muted)]">Avg Stocks/Scan</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <div className="text-2xl font-bold text-green-400">{scanStats.avgFound}</div>
                <div className="text-xs text-[var(--text-muted)]">Avg Matches/Scan</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-blue-400">⏱</span>
                </div>
                <div>
                  <div className="text-lg font-semibold text-[var(--text-primary)]">{scanStats.avgDuration}s</div>
                  <div className="text-xs text-[var(--text-muted)]">Avg Duration</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <span className="text-purple-400">📊</span>
                </div>
                <div>
                  <div className="text-lg font-semibold text-[var(--text-primary)]">{scanStats.totalYahooCalls}</div>
                  <div className="text-xs text-[var(--text-muted)]">Yahoo API Calls</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <span className="text-green-400">✓</span>
                </div>
                <div>
                  <div className="text-lg font-semibold text-[var(--text-primary)]">{scanStats.totalAlphaCalls}</div>
                  <div className="text-xs text-[var(--text-muted)]">AlphaVantage Calls</div>
                </div>
              </div>
            </div>

            {/* Recent Scans Timeline */}
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Recent Scans</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentScans.map((scan, index) => (
                <div
                  key={scan.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg-tertiary)] animate-slide-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    scan.status === 'completed' ? 'bg-green-400' :
                    scan.status === 'partial' ? 'bg-yellow-400' :
                    scan.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-red-400'
                  }`} />
                  <div className="flex-1 text-sm">
                    <span className="text-[var(--text-primary)]">
                      {new Date(scan.started_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">
                    {scan.stocks_scanned} scanned
                  </div>
                  <div className="text-sm font-medium text-green-400">
                    {scan.stocks_found} found
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {scan.duration_seconds ? `${scan.duration_seconds}s` : '-'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
