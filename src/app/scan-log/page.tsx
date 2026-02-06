'use client';

import { useState, useEffect, useRef } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabase';
import type { StockScanDetail } from '@/lib/types';

interface ScanLogEntry {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  stocks_scanned: number;
  stocks_found: number;
  errors: string[] | null;
  duration_seconds: number | null;
  api_calls_yahoo: number;
  api_calls_alphavantage: number;
  details: StockScanDetail[] | null;
}

type FilterType = 'all' | 'match' | 'rejected' | 'error' | 'deep_scan' | 'pre_filter';

export default function ScanLogPage() {
  const [scanLogs, setScanLogs] = useState<ScanLogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<ScanLogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [copied, setCopied] = useState(false);
  const detailsRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    loadScanLogs();
  }, []);

  async function loadScanLogs() {
    setLoading(true);
    const { data } = await supabase
      .from('scan_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    if (data) {
      setScanLogs(data);
      if (data.length > 0) {
        setSelectedLog(data[0]);
      }
    }
    setLoading(false);
  }

  function getFilteredDetails(details: StockScanDetail[] | null): StockScanDetail[] {
    if (!details) return [];
    switch (filter) {
      case 'match': return details.filter(d => d.result === 'match');
      case 'rejected': return details.filter(d => d.result === 'rejected');
      case 'error': return details.filter(d => d.result === 'error');
      case 'deep_scan': return details.filter(d => d.phase === 'deep_scan');
      case 'pre_filter': return details.filter(d => d.phase === 'pre_filter');
      default: return details;
    }
  }

  function formatDetail(d: StockScanDetail): string {
    const parts = [
      `${d.ticker.padEnd(8)} | ${d.name.substring(0, 30).padEnd(30)}`,
      `| Source: ${d.source.padEnd(24)}`,
      `| Price: $${d.tvPrice.toFixed(2).padStart(8)}`,
      `| Change: ${d.tvChange >= 0 ? '+' : ''}${d.tvChange.toFixed(2).padStart(8)}`,
      `| TV ATH: ${d.tvATH ? '$' + d.tvATH.toFixed(2) : 'N/A'}`.padEnd(20),
      `| TV Decline: ${d.tvDeclineFromATH !== null ? d.tvDeclineFromATH.toFixed(1) + '%' : 'N/A'}`.padEnd(20),
      `| Phase: ${d.phase.padEnd(12)}`,
      `| Result: ${d.result.padEnd(10)}`,
    ];

    if (d.result === 'rejected' && d.rejectReason) {
      parts.push(`| Reason: ${d.rejectReason}`);
    }
    if (d.result === 'error' && d.errorMessage) {
      parts.push(`| Error: ${d.errorMessage}`);
    }
    if (d.result === 'match' || d.growthEvents !== undefined) {
      parts.push(`| Yahoo History: ${d.yahooHistoryDays || 0} days`);
      parts.push(`| Yahoo ATH: ${d.yahooATH ? '$' + d.yahooATH.toFixed(2) : 'N/A'}`);
      parts.push(`| Growth Events: ${d.growthEvents ?? 0}`);
      parts.push(`| Score: ${d.growthScore ?? 0}`);
      if (d.highestGrowthPct) {
        parts.push(`| Highest Growth: ${d.highestGrowthPct.toFixed(0)}%`);
      }
    }

    return parts.join(' ');
  }

  function generateCopyText(): string {
    if (!selectedLog) return '';
    const details = getFilteredDetails(selectedLog.details);

    const lines: string[] = [];
    lines.push(`=== SCAN LOG ===`);
    lines.push(`Scan ID: ${selectedLog.id}`);
    lines.push(`Started: ${new Date(selectedLog.started_at).toLocaleString()}`);
    lines.push(`Status: ${selectedLog.status}`);
    lines.push(`Duration: ${selectedLog.duration_seconds || 0}s`);
    lines.push(`Stocks Scanned: ${selectedLog.stocks_scanned}`);
    lines.push(`Matches Found: ${selectedLog.stocks_found}`);
    lines.push(`Yahoo API Calls: ${selectedLog.api_calls_yahoo}`);
    lines.push(`Filter: ${filter}`);
    lines.push(`Showing: ${details.length} entries`);
    lines.push('');

    if (details.length > 0) {
      lines.push('--- DETAILS ---');
      for (const d of details) {
        lines.push(formatDetail(d));
      }
    }

    if (selectedLog.errors && selectedLog.errors.length > 0) {
      lines.push('');
      lines.push('--- ERRORS ---');
      for (const e of selectedLog.errors) {
        lines.push(e);
      }
    }

    return lines.join('\n');
  }

  async function handleCopy() {
    const text = generateCopyText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the pre element
      if (detailsRef.current) {
        const range = document.createRange();
        range.selectNodeContents(detailsRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  function handleSelectAll() {
    if (detailsRef.current) {
      const range = document.createRange();
      range.selectNodeContents(detailsRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  const filteredDetails = selectedLog ? getFilteredDetails(selectedLog.details) : [];
  const matchCount = selectedLog?.details?.filter(d => d.result === 'match').length || 0;
  const rejectedCount = selectedLog?.details?.filter(d => d.result === 'rejected').length || 0;
  const errorCount = selectedLog?.details?.filter(d => d.result === 'error').length || 0;
  const deepScanCount = selectedLog?.details?.filter(d => d.phase === 'deep_scan').length || 0;
  const preFilterCount = selectedLog?.details?.filter(d => d.phase === 'pre_filter').length || 0;

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Scan Log</h1>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              Select All
            </button>
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading scan logs...</div>
        ) : scanLogs.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No scan logs yet. Run a scan from the Dashboard first.</p>
          </div>
        ) : (
          <>
            {/* Scan selector */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <label className="block text-sm text-slate-400 mb-2">Select Scan</label>
              <select
                value={selectedLog?.id || ''}
                onChange={(e) => {
                  const log = scanLogs.find(l => l.id === e.target.value);
                  setSelectedLog(log || null);
                }}
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
              >
                {scanLogs.map((log) => (
                  <option key={log.id} value={log.id}>
                    {new Date(log.started_at).toLocaleString()} — {log.status} — {log.stocks_scanned} scanned, {log.stocks_found} matches
                    {log.duration_seconds ? ` (${log.duration_seconds}s)` : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedLog && (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">Status</div>
                    <div className={`text-lg font-bold ${
                      selectedLog.status === 'completed' ? 'text-green-400' :
                      selectedLog.status === 'failed' ? 'text-red-400' :
                      selectedLog.status === 'running' ? 'text-blue-400' : 'text-yellow-400'
                    }`}>
                      {selectedLog.status}
                    </div>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">Total Entries</div>
                    <div className="text-lg font-bold">{selectedLog.details?.length || 0}</div>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">Deep Scanned</div>
                    <div className="text-lg font-bold">{selectedLog.stocks_scanned}</div>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">Matches</div>
                    <div className="text-lg font-bold text-green-400">{selectedLog.stocks_found}</div>
                  </div>
                </div>

                {/* Filter buttons */}
                <div className="flex flex-wrap gap-2">
                  {([
                    ['all', `All (${selectedLog.details?.length || 0})`],
                    ['match', `Matches (${matchCount})`],
                    ['rejected', `Rejected (${rejectedCount})`],
                    ['error', `Errors (${errorCount})`],
                    ['deep_scan', `Deep Scan (${deepScanCount})`],
                    ['pre_filter', `Pre-filter (${preFilterCount})`],
                  ] as [FilterType, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`px-3 py-1.5 text-sm rounded transition-colors ${
                        filter === key
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Details table */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-900 text-slate-400 text-left">
                          <th className="px-3 py-2">Ticker</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Source</th>
                          <th className="px-3 py-2 text-right">Price</th>
                          <th className="px-3 py-2 text-right">Change</th>
                          <th className="px-3 py-2 text-right">TV ATH</th>
                          <th className="px-3 py-2 text-right">TV Decline</th>
                          <th className="px-3 py-2">Phase</th>
                          <th className="px-3 py-2">Result</th>
                          <th className="px-3 py-2">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDetails.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                              {selectedLog.details === null
                                ? 'This scan has no detailed log data. Run a new scan to see details.'
                                : 'No entries match the current filter.'}
                            </td>
                          </tr>
                        ) : (
                          filteredDetails.map((d, i) => (
                            <tr
                              key={`${d.ticker}-${i}`}
                              className={`border-t border-slate-700 ${
                                d.result === 'match' ? 'bg-green-900/20' :
                                d.result === 'error' ? 'bg-red-900/20' : ''
                              }`}
                            >
                              <td className="px-3 py-2 font-mono font-bold">
                                <a
                                  href={`https://www.google.com/search?q=${encodeURIComponent(d.ticker + ' stock')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ticker-link"
                                >
                                  {d.ticker}
                                </a>
                              </td>
                              <td className="px-3 py-2 max-w-[200px] truncate" title={d.name}>{d.name}</td>
                              <td className="px-3 py-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  d.source === 'tradingview_losers' ? 'bg-orange-900/50 text-orange-300' :
                                  d.source === 'tradingview_high_decline' ? 'bg-purple-900/50 text-purple-300' :
                                  'bg-blue-900/50 text-blue-300'
                                }`}>
                                  {d.source === 'tradingview_losers' ? 'Losers' :
                                   d.source === 'tradingview_high_decline' ? 'High Decline' : 'Both'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">${d.tvPrice.toFixed(2)}</td>
                              <td className={`px-3 py-2 text-right font-mono ${d.tvChange < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {d.tvChange >= 0 ? '+' : ''}{d.tvChange.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {d.tvATH ? `$${d.tvATH.toFixed(2)}` : <span className="text-slate-500">N/A</span>}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {d.tvDeclineFromATH !== null
                                  ? <span className={d.tvDeclineFromATH >= 95 ? 'text-yellow-400' : ''}>{d.tvDeclineFromATH.toFixed(1)}%</span>
                                  : <span className="text-slate-500">N/A</span>}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-xs ${d.phase === 'deep_scan' ? 'text-blue-300' : 'text-slate-400'}`}>
                                  {d.phase === 'deep_scan' ? 'Deep Scan' : 'Pre-filter'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                  d.result === 'match' ? 'bg-green-600 text-white' :
                                  d.result === 'error' ? 'bg-red-600 text-white' :
                                  'bg-slate-600 text-slate-200'
                                }`}>
                                  {d.result}
                                </span>
                              </td>
                              <td className="px-3 py-2 max-w-[400px]">
                                <span className="text-xs text-slate-300">
                                  {d.result === 'rejected' && d.rejectReason}
                                  {d.result === 'error' && d.errorMessage}
                                  {d.result === 'match' && `Score: ${d.growthScore}, Events: ${d.growthEvents}, Highest: ${d.highestGrowthPct?.toFixed(0)}%`}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Copy-friendly text output */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-slate-400">Plain Text (for copying)</h3>
                    <button
                      onClick={handleCopy}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre
                    ref={detailsRef}
                    className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all max-h-96 overflow-y-auto select-all cursor-text bg-slate-900 rounded p-3"
                  >
                    {generateCopyText()}
                  </pre>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AuthGuard>
  );
}
