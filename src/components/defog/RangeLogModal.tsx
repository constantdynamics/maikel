'use client';

import { useState } from 'react';
import type { RangeLogEntry } from '@/lib/defog/types';

interface RangeLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  rangeLog: RangeLogEntry[];
  onClear: () => void;
}

function formatLogForCopy(entries: RangeLogEntry[]): string {
  const lines: string[] = [];
  lines.push('=== DEFOG RANGE UPDATE LOG ===');
  lines.push(`Geëxporteerd: ${new Date().toLocaleString('nl-NL')}`);
  lines.push(`Totaal entries: ${entries.length}`);
  lines.push('');

  for (const entry of entries) {
    const date = new Date(entry.timestamp).toLocaleString('nl-NL');
    const resultLabel = entry.result === 'success' ? 'OK' :
                        entry.result === 'no_data' ? 'Geen data' : 'Fout';

    lines.push(`[${date}] ${entry.ticker} (${entry.tabName})`);
    lines.push(`  Type: ${entry.type === 'first_fetch' ? 'Eerste keer' : 'Verversing'} | Resultaat: ${resultLabel} | Duur: ${entry.duration}ms`);

    if (entry.result === 'success') {
      if (entry.rangeLabel) {
        lines.push(`  Range: ${entry.rangeLabel}`);
      }
      const rangeParts: string[] = [];
      if (entry.year5Low != null) rangeParts.push(`5Y: ${entry.year5Low.toFixed(2)}-${entry.year5High?.toFixed(2) || '?'}`);
      if (entry.year3Low != null) rangeParts.push(`3Y: ${entry.year3Low.toFixed(2)}-${entry.year3High?.toFixed(2) || '?'}`);
      if (entry.week52Low != null) rangeParts.push(`52W: ${entry.week52Low.toFixed(2)}-${entry.week52High?.toFixed(2) || '?'}`);
      if (rangeParts.length > 0) lines.push(`  Ranges: ${rangeParts.join(' | ')}`);
      if (entry.buyLimit != null) lines.push(`  Buy Limit: ${entry.buyLimit.toFixed(2)}`);
      if (entry.currentPrice != null) lines.push(`  Prijs: ${entry.currentPrice.toFixed(2)}`);
    }

    if (entry.error) {
      lines.push(`  Fout: ${entry.error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function RangeLogModal({ isOpen, onClose, rangeLog, onClear }: RangeLogModalProps) {
  const [filter, setFilter] = useState<'all' | 'success' | 'no_data' | 'error'>('all');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredLog = rangeLog
    .filter((entry) => {
      if (filter === 'all') return true;
      return entry.result === filter;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Statistics
  const totalEntries = rangeLog.length;
  const successEntries = rangeLog.filter(e => e.result === 'success').length;
  const noDataEntries = rangeLog.filter(e => e.result === 'no_data').length;
  const errorEntries = rangeLog.filter(e => e.result === 'error').length;
  const firstFetchEntries = rangeLog.filter(e => e.type === 'first_fetch').length;
  const refreshEntries = rangeLog.filter(e => e.type === 'refresh').length;

  const handleCopy = async (type: 'all' | 'filtered' | 'errors') => {
    let entries: RangeLogEntry[];
    if (type === 'errors') {
      entries = rangeLog.filter(e => e.result === 'error' || e.result === 'no_data');
    } else if (type === 'filtered') {
      entries = filteredLog;
    } else {
      entries = rangeLog;
    }

    try {
      await navigator.clipboard.writeText(formatLogForCopy(entries));
      setCopyFeedback('Log gekopieerd!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Kopiëren mislukt');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Zojuist';
    if (diffMins < 60) return `${diffMins} min geleden`;
    if (diffHours < 24) return `${diffHours}u geleden`;

    return date.toLocaleString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1d1d1d] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-[#2d2d2d]">
        {/* Header */}
        <div className="p-4 border-b border-[#2d2d2d]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Range Update Log
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Overzicht van range fetch pogingen (5Y/3Y/1Y)
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl leading-none p-2"
            >
              &times;
            </button>
          </div>

          {/* Statistics */}
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-white">{totalEntries}</div>
              <div className="text-xs text-gray-400">Totaal</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-[#00ff88]">{successEntries}</div>
              <div className="text-xs text-gray-400">Gelukt</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-yellow-400">{noDataEntries}</div>
              <div className="text-xs text-gray-400">Geen data</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-red-400">{errorEntries}</div>
              <div className="text-xs text-gray-400">Fouten</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-blue-400">{firstFetchEntries}</div>
              <div className="text-xs text-gray-400">Nieuw</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-purple-400">{refreshEntries}</div>
              <div className="text-xs text-gray-400">Ververst</div>
            </div>
          </div>

          {/* Filter + actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {(['all', 'success', 'no_data', 'error'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === f
                    ? 'bg-[#00ff88] text-black font-medium'
                    : 'bg-[#2d2d2d] text-gray-300 hover:bg-[#3d3d3d]'
                }`}
              >
                {f === 'all' && 'Alles'}
                {f === 'success' && 'Gelukt'}
                {f === 'no_data' && 'Geen data'}
                {f === 'error' && 'Fouten'}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => handleCopy('filtered')}
              className="px-3 py-1 rounded-full text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              Kopieer
            </button>
            <button
              onClick={() => handleCopy('errors')}
              className="px-3 py-1 rounded-full text-sm bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
            >
              Fouten
            </button>
            <button
              onClick={onClear}
              className="px-3 py-1 rounded-full text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              Log wissen
            </button>
          </div>

          {copyFeedback && (
            <div className="mt-2 text-center text-sm text-[#00ff88] bg-[#00ff88]/10 rounded-lg py-1">
              {copyFeedback}
            </div>
          )}
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredLog.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">
                {rangeLog.length === 0
                  ? 'Nog geen range updates uitgevoerd'
                  : 'Geen entries gevonden met dit filter'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLog.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-[#252525] rounded-lg p-3 border border-[#2d2d2d] hover:border-[#3d3d3d] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Ticker */}
                    <div className="w-24">
                      <div className="font-mono font-bold text-white text-sm">{entry.ticker}</div>
                      <div className="text-xs text-gray-500 truncate">{entry.tabName}</div>
                    </div>

                    {/* Type badge */}
                    <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                      entry.type === 'first_fetch'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {entry.type === 'first_fetch' ? 'Nieuw' : 'Ververst'}
                    </div>

                    {/* Result badge */}
                    <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                      entry.result === 'success'
                        ? 'bg-green-500/20 text-[#00ff88]'
                        : entry.result === 'no_data'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {entry.result === 'success' ? 'OK' :
                       entry.result === 'no_data' ? 'Geen data' : 'Fout'}
                    </div>

                    {/* Range label */}
                    {entry.rangeLabel && (
                      <div className="px-2 py-0.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400">
                        {entry.rangeLabel}
                      </div>
                    )}

                    {/* Buy limit + price */}
                    <div className="flex-1 text-right">
                      {entry.result === 'success' && entry.buyLimit != null ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-gray-500 text-xs">Limit:</span>
                          <span className="text-[#00ff88] text-sm font-mono font-medium">
                            {entry.buyLimit.toFixed(2)}
                          </span>
                          {entry.currentPrice != null && entry.currentPrice > 0 && (
                            <>
                              <span className="text-gray-600">|</span>
                              <span className="text-gray-400 text-xs">Prijs:</span>
                              <span className="text-white text-sm font-mono">
                                {entry.currentPrice.toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                      ) : entry.result === 'success' ? (
                        <span className="text-gray-500 text-xs">Geen limit berekend</span>
                      ) : null}
                    </div>

                    {/* Duration + time */}
                    <div className="text-right text-xs w-28">
                      <div className="text-gray-400">{entry.duration}ms</div>
                      <div className="text-gray-500">{formatTime(entry.timestamp)}</div>
                    </div>
                  </div>

                  {/* Range details (only for success) */}
                  {entry.result === 'success' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.year5Low != null && (
                        <span className="px-2 py-0.5 bg-[#1d1d1d] rounded text-xs text-gray-400">
                          5Y: {entry.year5Low.toFixed(2)} - {entry.year5High?.toFixed(2) || '?'}
                        </span>
                      )}
                      {entry.year3Low != null && (
                        <span className="px-2 py-0.5 bg-[#1d1d1d] rounded text-xs text-gray-400">
                          3Y: {entry.year3Low.toFixed(2)} - {entry.year3High?.toFixed(2) || '?'}
                        </span>
                      )}
                      {entry.week52Low != null && (
                        <span className="px-2 py-0.5 bg-[#1d1d1d] rounded text-xs text-gray-400">
                          52W: {entry.week52Low.toFixed(2)} - {entry.week52High?.toFixed(2) || '?'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Error message */}
                  {entry.error && (
                    <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
                      {entry.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2d2d2d]">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {filteredLog.length} van {rangeLog.length} items getoond
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#2d2d2d] text-white rounded-lg hover:bg-[#3d3d3d] transition-colors"
            >
              Sluiten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
