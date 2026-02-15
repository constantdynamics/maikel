'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { StockScanDetail, ZonnebloemScanDetail } from '@/lib/types';

type ScannerTab = 'kuifje' | 'zonnebloem';

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

interface ZBScanLogEntry {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  markets_scanned: string[] | null;
  candidates_found: number;
  stocks_deep_scanned: number;
  stocks_matched: number;
  new_stocks_found: number;
  errors: string[] | null;
  duration_seconds: number | null;
  api_calls_yahoo: number;
  details: ZonnebloemScanDetail[] | null;
}

type FilterType = 'all' | 'match' | 'rejected' | 'error' | 'deep_scan' | 'pre_filter';

export default function ScanLogPage() {
  const [activeTab, setActiveTab] = useState<ScannerTab>('kuifje');

  // Kuifje state
  const [scanLogs, setScanLogs] = useState<ScanLogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<ScanLogEntry | null>(null);

  // Zonnebloem state
  const [zbScanLogs, setZbScanLogs] = useState<ZBScanLogEntry[]>([]);
  const [zbSelectedLog, setZbSelectedLog] = useState<ZBScanLogEntry | null>(null);

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [copied, setCopied] = useState(false);
  const detailsRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    loadScanLogs();
  }, []);

  async function loadScanLogs() {
    setLoading(true);

    const [kuifjeRes, zbRes] = await Promise.all([
      supabase.from('scan_logs').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.from('zonnebloem_scan_logs').select('*').order('started_at', { ascending: false }).limit(20),
    ]);

    if (kuifjeRes.data) {
      setScanLogs(kuifjeRes.data);
      if (kuifjeRes.data.length > 0) setSelectedLog(kuifjeRes.data[0]);
    }

    if (zbRes.data) {
      setZbScanLogs(zbRes.data);
      if (zbRes.data.length > 0) setZbSelectedLog(zbRes.data[0]);
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

  function getZBFilteredDetails(details: ZonnebloemScanDetail[] | null): ZonnebloemScanDetail[] {
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

  function generateCopyText(): string {
    if (activeTab === 'kuifje' && selectedLog) {
      const details = getFilteredDetails(selectedLog.details);
      const lines = [
        `=== KUIFJE SCAN LOG ===`,
        `Started: ${new Date(selectedLog.started_at).toLocaleString()}`,
        `Status: ${selectedLog.status} | Duration: ${selectedLog.duration_seconds || 0}s`,
        `Scanned: ${selectedLog.stocks_scanned} | Matches: ${selectedLog.stocks_found}`,
        `Showing: ${details.length} entries (filter: ${filter})`,
        '',
      ];
      for (const d of details) {
        lines.push(`${d.ticker.padEnd(8)} | ${d.result.padEnd(10)} | ${d.rejectReason || d.errorMessage || `Score: ${d.growthScore}, Events: ${d.growthEvents}`}`);
      }
      return lines.join('\n');
    }
    if (activeTab === 'zonnebloem' && zbSelectedLog) {
      const details = getZBFilteredDetails(zbSelectedLog.details);
      const lines = [
        `=== ZONNEBLOEM SCAN LOG ===`,
        `Started: ${new Date(zbSelectedLog.started_at).toLocaleString()}`,
        `Status: ${zbSelectedLog.status} | Duration: ${zbSelectedLog.duration_seconds || 0}s`,
        `Candidates: ${zbSelectedLog.candidates_found} | Deep scanned: ${zbSelectedLog.stocks_deep_scanned} | Matched: ${zbSelectedLog.stocks_matched} | New: ${zbSelectedLog.new_stocks_found}`,
        `Showing: ${details.length} entries (filter: ${filter})`,
        '',
      ];
      for (const d of details) {
        lines.push(`${d.ticker.padEnd(8)} | ${d.result.padEnd(10)} | ${d.rejectReason || d.errorMessage || `Score: ${d.spikeScore}, Spikes: ${d.spikeCount}, Max: ${d.highestSpikePct?.toFixed(0)}%`}`);
      }
      return lines.join('\n');
    }
    return '';
  }

  async function handleCopy() {
    const text = generateCopyText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (detailsRef.current) {
        const range = document.createRange();
        range.selectNodeContents(detailsRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  // Kuifje counts
  const filteredDetails = selectedLog ? getFilteredDetails(selectedLog.details) : [];
  const matchCount = selectedLog?.details?.filter(d => d.result === 'match').length || 0;
  const rejectedCount = selectedLog?.details?.filter(d => d.result === 'rejected').length || 0;
  const errorCount = selectedLog?.details?.filter(d => d.result === 'error').length || 0;
  const deepScanCount = selectedLog?.details?.filter(d => d.phase === 'deep_scan').length || 0;
  const preFilterCount = selectedLog?.details?.filter(d => d.phase === 'pre_filter').length || 0;

  // Zonnebloem counts
  const zbFilteredDetails = zbSelectedLog ? getZBFilteredDetails(zbSelectedLog.details) : [];
  const zbMatchCount = zbSelectedLog?.details?.filter(d => d.result === 'match').length || 0;
  const zbRejectedCount = zbSelectedLog?.details?.filter(d => d.result === 'rejected').length || 0;
  const zbErrorCount = zbSelectedLog?.details?.filter(d => d.result === 'error').length || 0;
  const zbDeepScanCount = zbSelectedLog?.details?.filter(d => d.phase === 'deep_scan').length || 0;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Scan Log</h1>
          <button
            onClick={handleCopy}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              copied ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>

        {/* Scanner tabs */}
        <div className="flex items-center gap-4 border-b border-[var(--border-color)]">
          <button
            onClick={() => { setActiveTab('kuifje'); setFilter('all'); }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'kuifje'
                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Kuifje ({scanLogs.length})
          </button>
          <button
            onClick={() => { setActiveTab('zonnebloem'); setFilter('all'); }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'zonnebloem'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Prof. Zonnebloem ({zbScanLogs.length})
          </button>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading scan logs...</div>
        ) : activeTab === 'kuifje' ? (
          /* ====== KUIFJE SCAN LOG ====== */
          scanLogs.length === 0 ? (
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-8 text-center">
              <p className="text-[var(--text-muted)]">No Kuifje scan logs yet.</p>
            </div>
          ) : (
            <>
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4">
                <label className="block text-sm text-[var(--text-muted)] mb-2">Select Scan</label>
                <select
                  value={selectedLog?.id || ''}
                  onChange={(e) => setSelectedLog(scanLogs.find(l => l.id === e.target.value) || null)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-primary)] [&>option]:bg-[#1a1a2e]"
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">Status</div>
                      <div className={`text-lg font-bold ${selectedLog.status === 'completed' ? 'text-green-400' : selectedLog.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {selectedLog.status}
                      </div>
                    </div>
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">Total Entries</div>
                      <div className="text-lg font-bold">{selectedLog.details?.length || 0}</div>
                    </div>
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">Deep Scanned</div>
                      <div className="text-lg font-bold">{selectedLog.stocks_scanned}</div>
                    </div>
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">Matches</div>
                      <div className="text-lg font-bold text-green-400">{selectedLog.stocks_found}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {([
                      ['all', `All (${selectedLog.details?.length || 0})`],
                      ['match', `Matches (${matchCount})`],
                      ['rejected', `Rejected (${rejectedCount})`],
                      ['error', `Errors (${errorCount})`],
                      ['deep_scan', `Deep Scan (${deepScanCount})`],
                      ['pre_filter', `Pre-filter (${preFilterCount})`],
                    ] as [FilterType, string][]).map(([key, label]) => (
                      <button key={key} onClick={() => setFilter(key)}
                        className={`px-3 py-1.5 text-sm rounded transition-colors ${filter === key ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'}`}
                      >{label}</button>
                    ))}
                  </div>

                  <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[var(--hover-bg)] text-[var(--text-muted)] text-left">
                            <th className="px-3 py-2">Ticker</th>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2 text-right">Price</th>
                            <th className="px-3 py-2">Phase</th>
                            <th className="px-3 py-2">Result</th>
                            <th className="px-3 py-2">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDetails.length === 0 ? (
                            <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--text-muted)]">No entries match the current filter.</td></tr>
                          ) : filteredDetails.map((d, i) => (
                            <tr key={`${d.ticker}-${i}`} className={`border-t border-[var(--border-color)] ${d.result === 'match' ? 'bg-green-900/20' : d.result === 'error' ? 'bg-red-900/20' : ''}`}>
                              <td className="px-3 py-2 font-mono font-bold">
                                <a href={`https://www.google.com/search?q=${encodeURIComponent(d.ticker + ' ' + (d.name || '') + ' stock')}`} target="_blank" rel="noopener noreferrer" className="ticker-link">{d.ticker}</a>
                              </td>
                              <td className="px-3 py-2 max-w-[200px] truncate">{d.name}</td>
                              <td className="px-3 py-2 text-right font-mono">${d.tvPrice.toFixed(2)}</td>
                              <td className="px-3 py-2"><span className={`text-xs ${d.phase === 'deep_scan' ? 'text-blue-300' : 'text-[var(--text-muted)]'}`}>{d.phase === 'deep_scan' ? 'Deep Scan' : 'Pre-filter'}</span></td>
                              <td className="px-3 py-2"><span className={`text-xs font-medium px-1.5 py-0.5 rounded ${d.result === 'match' ? 'bg-green-600 text-white' : d.result === 'error' ? 'bg-red-600 text-white' : 'bg-slate-600 text-slate-200'}`}>{d.result}</span></td>
                              <td className="px-3 py-2 text-xs text-[var(--text-secondary)] max-w-[400px]">{d.rejectReason || d.errorMessage || (d.result === 'match' ? `Score: ${d.growthScore}, Events: ${d.growthEvents}` : '')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )
        ) : (
          /* ====== ZONNEBLOEM SCAN LOG ====== */
          zbScanLogs.length === 0 ? (
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-8 text-center">
              <p className="text-[var(--text-muted)]">No Zonnebloem scan logs yet. Run a scan from the Dashboard first.</p>
            </div>
          ) : (
            <>
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4">
                <label className="block text-sm text-[var(--text-muted)] mb-2">Select Scan</label>
                <select
                  value={zbSelectedLog?.id || ''}
                  onChange={(e) => setZbSelectedLog(zbScanLogs.find(l => l.id === e.target.value) || null)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-primary)] [&>option]:bg-[#1a1a2e]"
                >
                  {zbScanLogs.map((log) => (
                    <option key={log.id} value={log.id}>
                      {new Date(log.started_at).toLocaleString()} — {log.status} — {log.stocks_deep_scanned} scanned, {log.stocks_matched} matches ({log.new_stocks_found} new)
                      {log.duration_seconds ? ` (${log.duration_seconds}s)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {zbSelectedLog && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">Status</div>
                      <div className={`text-lg font-bold ${zbSelectedLog.status === 'completed' ? 'text-green-400' : zbSelectedLog.status === 'failed' ? 'text-red-400' : zbSelectedLog.status === 'partial' ? 'text-yellow-400' : 'text-blue-400'}`}>
                        {zbSelectedLog.status}
                      </div>
                    </div>
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">Candidates</div>
                      <div className="text-lg font-bold">{zbSelectedLog.candidates_found}</div>
                    </div>
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">Deep Scanned</div>
                      <div className="text-lg font-bold">{zbSelectedLog.stocks_deep_scanned}</div>
                    </div>
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">Matches</div>
                      <div className="text-lg font-bold text-green-400">{zbSelectedLog.stocks_matched}</div>
                    </div>
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-3">
                      <div className="text-sm text-[var(--text-muted)]">New</div>
                      <div className="text-lg font-bold text-purple-400">{zbSelectedLog.new_stocks_found}</div>
                    </div>
                  </div>

                  {zbSelectedLog.markets_scanned && zbSelectedLog.markets_scanned.length > 0 && (
                    <div className="text-sm text-[var(--text-muted)]">
                      Markets: {zbSelectedLog.markets_scanned.join(', ')}
                      {zbSelectedLog.duration_seconds && ` | Duration: ${zbSelectedLog.duration_seconds}s`}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {([
                      ['all', `All (${zbSelectedLog.details?.length || 0})`],
                      ['match', `Matches (${zbMatchCount})`],
                      ['rejected', `Rejected (${zbRejectedCount})`],
                      ['error', `Errors (${zbErrorCount})`],
                      ['deep_scan', `Deep Scan (${zbDeepScanCount})`],
                    ] as [FilterType, string][]).map(([key, label]) => (
                      <button key={key} onClick={() => setFilter(key)}
                        className={`px-3 py-1.5 text-sm rounded transition-colors ${filter === key ? 'bg-purple-600 text-white' : 'bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'}`}
                      >{label}</button>
                    ))}
                  </div>

                  <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[var(--hover-bg)] text-[var(--text-muted)] text-left">
                            <th className="px-3 py-2">Ticker</th>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">Market</th>
                            <th className="px-3 py-2 text-right">Price</th>
                            <th className="px-3 py-2 text-right">Range Ratio</th>
                            <th className="px-3 py-2">Phase</th>
                            <th className="px-3 py-2">Result</th>
                            <th className="px-3 py-2">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {zbFilteredDetails.length === 0 ? (
                            <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--text-muted)]">
                              {zbSelectedLog.details === null ? 'This scan has no detailed log data.' : 'No entries match the current filter.'}
                            </td></tr>
                          ) : zbFilteredDetails.map((d, i) => (
                            <tr key={`${d.ticker}-${i}`} className={`border-t border-[var(--border-color)] ${d.result === 'match' ? 'bg-green-900/20' : d.result === 'error' ? 'bg-red-900/20' : ''}`}>
                              <td className="px-3 py-2 font-mono font-bold">
                                <a href={`https://www.google.com/search?q=${encodeURIComponent(d.ticker + ' ' + (d.name || '') + ' stock')}`} target="_blank" rel="noopener noreferrer" className="ticker-link text-purple-400 hover:text-purple-300">{d.ticker}</a>
                              </td>
                              <td className="px-3 py-2 max-w-[200px] truncate" title={d.name}>{d.name}</td>
                              <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{d.market}</td>
                              <td className="px-3 py-2 text-right font-mono">${d.price.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono text-[var(--text-muted)]">{d.rangeRatio?.toFixed(1) || '-'}x</td>
                              <td className="px-3 py-2"><span className={`text-xs ${d.phase === 'deep_scan' ? 'text-blue-300' : 'text-[var(--text-muted)]'}`}>{d.phase === 'deep_scan' ? 'Deep' : d.phase}</span></td>
                              <td className="px-3 py-2"><span className={`text-xs font-medium px-1.5 py-0.5 rounded ${d.result === 'match' ? 'bg-green-600 text-white' : d.result === 'error' ? 'bg-red-600 text-white' : 'bg-slate-600 text-slate-200'}`}>{d.result}</span></td>
                              <td className="px-3 py-2 text-xs text-[var(--text-secondary)] max-w-[400px]">
                                {d.rejectReason || d.errorMessage || (d.result === 'match' ? `Score: ${d.spikeScore}, Spikes: ${d.spikeCount}, Max: ${d.highestSpikePct?.toFixed(0)}%` : '')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {zbSelectedLog.errors && zbSelectedLog.errors.length > 0 && (
                    <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-red-400 mb-2">Errors ({zbSelectedLog.errors.length})</h3>
                      <div className="text-xs text-red-300 max-h-40 overflow-y-auto space-y-1">
                        {zbSelectedLog.errors.slice(0, 20).map((err, i) => (
                          <div key={i}>{err}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )
        )}

        {/* Copy-friendly text output */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[var(--text-muted)]">Plain Text (for copying)</h3>
            <button onClick={handleCopy} className="text-xs text-blue-400 hover:text-blue-300">{copied ? 'Copied!' : 'Copy'}</button>
          </div>
          <pre ref={detailsRef} className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-all max-h-96 overflow-y-auto select-all cursor-text bg-[var(--input-bg)] rounded p-3">{generateCopyText()}</pre>
        </div>
      </div>
    </>
  );
}
