'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabase';

interface KZStock {
  ticker: string;
  buyLimit: number | null;
  name: string;
  source: string;
}

interface KZReport {
  generated_at: string;
  stock_count: number;
  stocks: KZStock[];
  report_text: string;
}

interface ArchivedReport {
  report_date: string;
  generated_at: string;
  stock_count: number;
  stocks: KZStock[];
  report_text: string;
}

type Tab = 'current' | 'archive';

export default function KZReportPage() {
  const [activeTab, setActiveTab] = useState<Tab>('current');
  const [report, setReport] = useState<KZReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [archive, setArchive] = useState<ArchivedReport[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/kz-report', {
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    const { data } = await supabase
      .from('kz_reports')
      .select('report_date, generated_at, stock_count, stocks, report_text')
      .order('report_date', { ascending: false })
      .limit(30);

    if (data) {
      setArchive(data as ArchivedReport[]);
    }
    setArchiveLoading(false);
  }, []);

  useEffect(() => {
    generateReport();
  }, [generateReport]);

  useEffect(() => {
    if (activeTab === 'archive') {
      loadArchive();
    }
  }, [activeTab, loadArchive]);

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload(text: string, filename: string) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedArchiveReport = selectedDate
    ? archive.find(r => r.report_date === selectedDate)
    : null;

  const currentStocks = activeTab === 'current'
    ? report?.stocks || []
    : selectedArchiveReport?.stocks || [];

  const currentText = activeTab === 'current'
    ? report?.report_text || ''
    : selectedArchiveReport?.report_text || '';

  const currentDate = activeTab === 'current'
    ? report?.generated_at
    : selectedArchiveReport?.generated_at;

  return (
    <AuthGuard>
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">K&Z Report</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopy(currentText)}
              disabled={!currentText}
              className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded font-medium transition-colors"
            >
              {copied ? 'Copied!' : 'Copy All'}
            </button>
            <button
              onClick={() => handleDownload(
                currentText,
                `kz-report-${new Date().toISOString().split('T')[0]}.txt`
              )}
              disabled={!currentText}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium transition-colors"
            >
              Download .txt
            </button>
            {activeTab === 'current' && (
              <button
                onClick={generateReport}
                disabled={loading}
                className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded font-medium transition-colors"
              >
                {loading ? 'Generating...' : 'Regenerate'}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[var(--border-color)]">
          <button
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'current'
                ? 'border-green-500 text-green-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Current Report
            {report && <span className="ml-2 text-xs text-[var(--text-muted)]">({report.stock_count})</span>}
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'archive'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Archive
            {archive.length > 0 && <span className="ml-2 text-xs text-[var(--text-muted)]">({archive.length} days)</span>}
          </button>
        </div>

        {/* Current Report */}
        {activeTab === 'current' && (
          <>
            {loading ? (
              <div className="text-slate-400 py-8 text-center">Generating report...</div>
            ) : report ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span>Generated: {new Date(report.generated_at).toLocaleString()}</span>
                  <span>{report.stock_count} stocks</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-700/50">
                    Kuifje
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-700/50">
                    Zonnebloem
                  </span>
                </div>
                <ReportTable stocks={currentStocks} />
              </div>
            ) : (
              <div className="text-slate-400 py-8 text-center">No report available. Click Regenerate.</div>
            )}
          </>
        )}

        {/* Archive */}
        {activeTab === 'archive' && (
          <div className="space-y-4">
            {archiveLoading ? (
              <div className="text-slate-400 py-8 text-center">Loading archive...</div>
            ) : archive.length === 0 ? (
              <div className="text-slate-400 py-8 text-center">No archived reports yet. Reports are saved automatically when generated.</div>
            ) : (
              <div className="grid grid-cols-[200px_1fr] gap-6">
                {/* Date list */}
                <div className="space-y-1">
                  {archive.map(r => (
                    <button
                      key={r.report_date}
                      onClick={() => setSelectedDate(r.report_date)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        selectedDate === r.report_date
                          ? 'bg-amber-900/30 text-amber-300 border border-amber-700/50'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-medium">{r.report_date}</div>
                      <div className="text-xs text-slate-500">{r.stock_count} stocks</div>
                    </button>
                  ))}
                </div>

                {/* Selected report */}
                <div>
                  {selectedArchiveReport ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span>{selectedArchiveReport.report_date}</span>
                        <span>{selectedArchiveReport.stock_count} stocks</span>
                        <span>Generated: {new Date(selectedArchiveReport.generated_at).toLocaleTimeString()}</span>
                      </div>
                      <ReportTable stocks={selectedArchiveReport.stocks} />
                    </div>
                  ) : (
                    <div className="text-slate-500 py-8 text-center">Select a date to view the report</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raw text preview */}
        {currentText && (
          <details className="bg-slate-800 border border-slate-700 rounded-lg">
            <summary className="px-4 py-3 text-sm text-slate-400 cursor-pointer hover:text-white">
              Raw TICKER-LIMIET text ({currentStocks.length} lines)
            </summary>
            <pre className="px-4 pb-4 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-96 overflow-auto">
              {currentText}
            </pre>
          </details>
        )}
      </div>
    </AuthGuard>
  );
}

function ReportTable({ stocks }: { stocks: KZStock[] }) {
  if (stocks.length === 0) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-900/50 text-slate-400 text-xs">
            <th className="text-left px-4 py-2 font-medium">#</th>
            <th className="text-left px-4 py-2 font-medium">Ticker</th>
            <th className="text-left px-4 py-2 font-medium">Name</th>
            <th className="text-right px-4 py-2 font-medium">Buy Limit</th>
            <th className="text-center px-4 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s, i) => (
            <tr
              key={s.ticker}
              className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            >
              <td className="px-4 py-1.5 text-slate-500 text-xs">{i + 1}</td>
              <td className="px-4 py-1.5 font-mono font-medium text-slate-200">{s.ticker}</td>
              <td className="px-4 py-1.5 text-slate-400 truncate max-w-[200px]">{s.name}</td>
              <td className="px-4 py-1.5 text-right font-mono text-slate-300">
                {s.buyLimit !== null ? s.buyLimit.toFixed(3) : '-'}
              </td>
              <td className="px-4 py-1.5 text-center">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  s.source === 'kuifje'
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-purple-900/30 text-purple-400'
                }`}>
                  {s.source === 'kuifje' ? 'K' : 'Z'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
