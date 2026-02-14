'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { downloadCSV, formatDate } from '@/lib/utils';
import type { Archive } from '@/lib/types';

export default function ArchivePage() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportRange, setExportRange] = useState<'6months' | '1year' | 'all'>('all');
  const [exporting, setExporting] = useState(false);

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

  async function handleExport() {
    setExporting(true);
    try {
      const response = await fetch(`/api/export?range=${exportRange}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const disposition = response.headers.get('Content-Disposition');
        const filename = disposition?.match(/filename="(.+)"/)?.[1]
          || `StockScreener_Export_${new Date().toISOString().split('T')[0]}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Archives</h1>
          <div className="flex items-center gap-2">
            <select
              value={exportRange}
              onChange={(e) => setExportRange(e.target.value as '6months' | '1year' | 'all')}
              className="px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded text-white"
            >
              <option value="6months">Last 6 months</option>
              <option value="1year">Last 1 year</option>
              <option value="all">All time</option>
            </select>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded transition-colors"
            >
              {exporting ? 'Exporting...' : 'Download Database'}
            </button>
          </div>
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
    </>
  );
}
