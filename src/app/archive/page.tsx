'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabase';
import { downloadCSV, formatDate } from '@/lib/utils';
import type { Archive } from '@/lib/types';

export default function ArchivePage() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('archives')
      .select('*')
      .order('month', { ascending: false });

    if (data) setArchives(data as Archive[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  function handleDownload(archive: Archive) {
    if (archive.csv_data) {
      downloadCSV(archive.csv_data, archive.filename);
    }
  }

  async function handleDownloadAll() {
    const { data: stocks } = await supabase
      .from('stocks')
      .select('*')
      .order('score', { ascending: false });

    if (stocks && stocks.length > 0) {
      const headers = Object.keys(stocks[0]).join(',');
      const rows = stocks.map((s) =>
        Object.values(s)
          .map((v) => {
            if (v === null) return '';
            if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
            return String(v);
          })
          .join(','),
      );
      const csv = [headers, ...rows].join('\n');
      downloadCSV(csv, `StockScreener_Full_Export_${new Date().toISOString().split('T')[0]}.csv`);
    }
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Archives</h1>
          <button
            onClick={handleDownloadAll}
            className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            Download Complete Database
          </button>
        </div>

        <p className="text-slate-400 text-sm">
          Monthly CSV archives are automatically generated on the 1st of each month.
          You can also download the complete database at any time.
        </p>

        {loading ? (
          <div className="text-slate-400 py-8 text-center">Loading...</div>
        ) : archives.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
            <div className="text-slate-400">No archives yet</div>
            <p className="text-slate-500 text-sm mt-1">
              Archives are created automatically on the first of each month.
            </p>
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Filename</th>
                  <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Month</th>
                  <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Stocks</th>
                  <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Size</th>
                  <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Created</th>
                  <th className="px-4 py-3 text-center text-xs uppercase text-slate-300">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {archives.map((archive) => (
                  <tr key={archive.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3 font-mono text-blue-400">{archive.filename}</td>
                    <td className="px-4 py-3">{archive.month.substring(0, 7)}</td>
                    <td className="px-4 py-3 text-right">{archive.stock_count}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {archive.file_size_bytes
                        ? `${(archive.file_size_bytes / 1024).toFixed(1)} KB`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(archive.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDownload(archive)}
                        className="text-xs px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded transition-colors"
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
