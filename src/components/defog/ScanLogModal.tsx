'use client';

import { useState } from 'react';
import type { ScanLogEntry } from '@/lib/defog/types';

interface ScanLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  scanLog: ScanLogEntry[];
  onClear: () => void;
}

// Analyze scan log for common issues
interface ScanIssue {
  type: 'provider_failure' | 'ticker_not_found' | 'rate_limit' | 'network_error' | 'timeout' | 'unknown';
  ticker?: string;
  count: number;
  affectedTickers: string[];
  provider?: string;
  errorPattern?: string;
}

function analyzeCommonIssues(scanLog: ScanLogEntry[]): ScanIssue[] {
  const failedScans = scanLog.filter(e => e.result === 'failed' || e.result === 'unavailable');
  const issues: Map<string, ScanIssue> = new Map();

  for (const entry of failedScans) {
    const error = entry.error?.toLowerCase() || '';
    const reasons = entry.reasons.join(' ').toLowerCase();

    let issueType: ScanIssue['type'] = 'unknown';
    let issueKey = '';

    if (error.includes('rate limit') || error.includes('429') || reasons.includes('rate limit')) {
      issueType = 'rate_limit';
      issueKey = `rate_limit_${entry.provider || 'unknown'}`;
    } else if (error.includes('not found') || error.includes('404') || reasons.includes('not found') || reasons.includes('geen data')) {
      issueType = 'ticker_not_found';
      issueKey = `not_found_${entry.ticker}`;
    } else if (error.includes('timeout') || reasons.includes('timeout')) {
      issueType = 'timeout';
      issueKey = `timeout_${entry.provider || 'unknown'}`;
    } else if (error.includes('network') || error.includes('fetch') || error.includes('connection')) {
      issueType = 'network_error';
      issueKey = 'network_error';
    } else if (entry.provider) {
      issueType = 'provider_failure';
      issueKey = `provider_${entry.provider}`;
    } else {
      issueKey = `unknown_${error.substring(0, 50)}`;
    }

    const existing = issues.get(issueKey);
    if (existing) {
      existing.count++;
      if (!existing.affectedTickers.includes(entry.ticker)) {
        existing.affectedTickers.push(entry.ticker);
      }
    } else {
      issues.set(issueKey, {
        type: issueType,
        ticker: issueType === 'ticker_not_found' ? entry.ticker : undefined,
        count: 1,
        affectedTickers: [entry.ticker],
        provider: entry.provider ?? undefined,
        errorPattern: entry.error || entry.reasons.join(', ') || 'Onbekende fout',
      });
    }
  }

  // Sort by count descending
  return Array.from(issues.values()).sort((a, b) => b.count - a.count);
}

function formatLogForCopy(entries: ScanLogEntry[], includeSuccessful: boolean = true): string {
  const lines: string[] = [];

  lines.push('=== DEFOG SCAN LOG ===');
  lines.push(`Geëxporteerd: ${new Date().toLocaleString('nl-NL')}`);
  lines.push(`Totaal entries: ${entries.length}`);
  lines.push('');

  const filtered = includeSuccessful ? entries : entries.filter(e => e.result === 'failed' || e.result === 'unavailable');

  for (const entry of filtered) {
    const date = new Date(entry.timestamp).toLocaleString('nl-NL');
    const resultLabel = entry.result === 'success' ? '✓ OK' :
                       entry.result === 'fallback_success' ? '⚠ Fallback' :
                       entry.result === 'failed' ? '✗ Mislukt' :
                       entry.result === 'unavailable' ? '✗ N/B' : entry.result;

    lines.push(`[${date}] ${entry.ticker} (${entry.tabName})`);
    lines.push(`  Type: ${entry.type} | Resultaat: ${resultLabel} | Provider: ${entry.provider || '-'} | Duur: ${entry.duration}ms`);

    if (entry.newPrice !== null) {
      const priceStr = entry.previousPrice !== null
        ? `€${entry.previousPrice.toFixed(2)} → €${entry.newPrice.toFixed(2)}`
        : `€${entry.newPrice.toFixed(2)}`;
      if (entry.priceChange !== null && entry.priceChange !== 0) {
        lines.push(`  Prijs: ${priceStr} (${entry.priceChange >= 0 ? '+' : ''}${entry.priceChange.toFixed(2)}%)`);
      } else {
        lines.push(`  Prijs: ${priceStr}`);
      }
    }

    if (entry.reasons.length > 0) {
      lines.push(`  Redenen: ${entry.reasons.join(', ')}`);
    }

    if (entry.error) {
      lines.push(`  Fout: ${entry.error}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

function formatIssuesForCopy(issues: ScanIssue[]): string {
  if (issues.length === 0) {
    return 'Geen problemen gedetecteerd in de scan log.';
  }

  const lines: string[] = [];

  lines.push('=== DEFOG SCAN ANALYSE ===');
  lines.push(`Geanalyseerd: ${new Date().toLocaleString('nl-NL')}`);
  lines.push(`Aantal unieke problemen: ${issues.length}`);
  lines.push('');

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    lines.push(`--- Probleem ${i + 1} ---`);

    const typeLabel = {
      'provider_failure': 'Provider fout',
      'ticker_not_found': 'Ticker niet gevonden',
      'rate_limit': 'Rate limit bereikt',
      'network_error': 'Netwerkfout',
      'timeout': 'Timeout',
      'unknown': 'Onbekend probleem',
    }[issue.type];

    lines.push(`Type: ${typeLabel}`);
    lines.push(`Aantal keer: ${issue.count}x`);
    if (issue.provider) {
      lines.push(`Provider: ${issue.provider}`);
    }
    lines.push(`Betreft tickers: ${issue.affectedTickers.join(', ')}`);
    lines.push(`Foutmelding: ${issue.errorPattern}`);
    lines.push('');
  }

  lines.push('--- SUGGESTIES ---');

  const hasRateLimit = issues.some(i => i.type === 'rate_limit');
  const hasNotFound = issues.some(i => i.type === 'ticker_not_found');
  const hasTimeout = issues.some(i => i.type === 'timeout');
  const hasProviderFailure = issues.some(i => i.type === 'provider_failure');

  if (hasRateLimit) {
    lines.push('• Rate limits: Overweeg het scaninterval te verhogen of minder aandelen tegelijk te scannen.');
  }
  if (hasNotFound) {
    lines.push('• Tickers niet gevonden: Controleer of de ticker symbolen correct zijn. Sommige internationale aandelen hebben andere symbolen bij verschillende providers.');
  }
  if (hasTimeout) {
    lines.push('• Timeouts: Dit kan duiden op netwerkproblemen of overbelaste providers. Probeer het later opnieuw.');
  }
  if (hasProviderFailure) {
    lines.push('• Provider fouten: Probeer handmatig te verversen of wacht tot de provider weer beschikbaar is.');
  }

  return lines.join('\n');
}

export function ScanLogModal({ isOpen, onClose, scanLog, onClear }: ScanLogModalProps) {
  const [filter, setFilter] = useState<'all' | 'success' | 'failed' | 'auto' | 'manual'>('all');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  // Analyze common issues
  const issues = analyzeCommonIssues(scanLog);

  const toggleEntry = (id: string) => {
    setSelectedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    if (selectedEntries.size === filteredLog.length && filteredLog.every(e => selectedEntries.has(e.id))) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(filteredLog.map(e => e.id)));
    }
  };

  const handleCopy = async (type: 'all' | 'filtered' | 'failed' | 'issues' | 'selected') => {
    let text = '';

    if (type === 'selected') {
      const selected = scanLog.filter(e => selectedEntries.has(e.id));
      text = formatLogForCopy(selected, true);
    } else if (type === 'issues') {
      text = formatIssuesForCopy(issues);
    } else if (type === 'failed') {
      const failedEntries = scanLog.filter(e => e.result === 'failed' || e.result === 'unavailable');
      text = formatLogForCopy(failedEntries, true);
    } else if (type === 'filtered') {
      const filtered = scanLog.filter((entry) => {
        if (filter === 'all') return true;
        if (filter === 'success') return entry.result === 'success' || entry.result === 'fallback_success';
        if (filter === 'failed') return entry.result === 'failed' || entry.result === 'unavailable';
        if (filter === 'auto') return entry.type === 'auto';
        if (filter === 'manual') return entry.type === 'manual' || entry.type === 'single';
        return true;
      });
      text = formatLogForCopy(filtered, true);
    } else {
      text = formatLogForCopy(scanLog, true);
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(type === 'issues' ? 'Analyse gekopieerd!' : 'Log gekopieerd!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Kopiëren mislukt');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  // Filter and sort log entries (newest first)
  const filteredLog = scanLog
    .filter((entry) => {
      if (filter === 'all') return true;
      if (filter === 'success') return entry.result === 'success' || entry.result === 'fallback_success';
      if (filter === 'failed') return entry.result === 'failed' || entry.result === 'unavailable';
      if (filter === 'auto') return entry.type === 'auto';
      if (filter === 'manual') return entry.type === 'manual' || entry.type === 'single';
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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

  const getResultColor = (result: ScanLogEntry['result']) => {
    switch (result) {
      case 'success':
        return 'text-[#00ff88]';
      case 'fallback_success':
        return 'text-yellow-400';
      case 'partial':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-400';
      case 'unavailable':
        return 'text-red-500';
      case 'pending':
        return 'text-gray-400';
      default:
        return 'text-gray-300';
    }
  };

  const getResultLabel = (result: ScanLogEntry['result']) => {
    switch (result) {
      case 'success':
        return 'OK';
      case 'fallback_success':
        return 'Fallback';
      case 'partial':
        return 'Deels';
      case 'failed':
        return 'Mislukt';
      case 'unavailable':
        return 'N/B';
      case 'pending':
        return 'Wachtend';
      default:
        return result;
    }
  };

  const getTypeLabel = (type: ScanLogEntry['type']) => {
    switch (type) {
      case 'auto':
        return 'Auto';
      case 'manual':
        return 'Handm.';
      case 'batch':
        return 'Batch';
      case 'single':
        return 'Enkel';
      default:
        return type;
    }
  };

  // Statistics
  const totalScans = scanLog.length;
  const successScans = scanLog.filter(e => e.result === 'success' || e.result === 'fallback_success').length;
  const failedScans = scanLog.filter(e => e.result === 'failed' || e.result === 'unavailable').length;
  const autoScans = scanLog.filter(e => e.type === 'auto').length;
  const manualScans = scanLog.filter(e => e.type === 'manual' || e.type === 'single').length;

  // Last scan time
  const lastScan = scanLog.length > 0
    ? scanLog.reduce((latest, entry) =>
        new Date(entry.timestamp) > new Date(latest.timestamp) ? entry : latest
      )
    : null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1d1d1d] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-[#2d2d2d]">
        {/* Header */}
        <div className="p-4 border-b border-[#2d2d2d]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">🔍</span>
                Scan Log
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Overzicht van alle uitgevoerde scans
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
              <div className="text-lg font-bold text-white">{totalScans}</div>
              <div className="text-xs text-gray-400">Totaal</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-[#00ff88]">{successScans}</div>
              <div className="text-xs text-gray-400">Gelukt</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-red-400">{failedScans}</div>
              <div className="text-xs text-gray-400">Mislukt</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-blue-400">{autoScans}</div>
              <div className="text-xs text-gray-400">Auto</div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-purple-400">{manualScans}</div>
              <div className="text-xs text-gray-400">Handmatig</div>
            </div>
            {lastScan && (
              <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-center flex-1">
                <div className="text-sm font-bold text-white truncate">{lastScan.ticker}</div>
                <div className="text-xs text-gray-400">{formatTime(lastScan.timestamp)}</div>
              </div>
            )}
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            {(['all', 'success', 'failed', 'auto', 'manual'] as const).map((f) => (
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
                {f === 'failed' && 'Mislukt'}
                {f === 'auto' && 'Auto'}
                {f === 'manual' && 'Handmatig'}
              </button>
            ))}
            <div className="flex-1" />

            {/* Copy buttons */}
            {selectedEntries.size > 0 && (
              <button
                onClick={() => handleCopy('selected')}
                className="px-3 py-1 rounded-full text-sm bg-[#00ff88]/20 text-[#00ff88] hover:bg-[#00ff88]/30 transition-colors flex items-center gap-1"
                title="Kopieer geselecteerde regels"
              >
                ✓ Kopieer {selectedEntries.size} geselecteerd
              </button>
            )}
            <button
              onClick={() => handleCopy('filtered')}
              className="px-3 py-1 rounded-full text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors flex items-center gap-1"
              title="Kopieer huidige weergave"
            >
              📋 Kopieer
            </button>
            <button
              onClick={() => handleCopy('failed')}
              className="px-3 py-1 rounded-full text-sm bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors flex items-center gap-1"
              title="Kopieer alleen mislukte scans"
            >
              ⚠ Fouten
            </button>
            <button
              onClick={() => setShowAnalysis(!showAnalysis)}
              className={`px-3 py-1 rounded-full text-sm transition-colors flex items-center gap-1 ${
                showAnalysis
                  ? 'bg-purple-500 text-white'
                  : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              }`}
              title="Toon probleemanalyse"
            >
              🔬 Analyse {issues.length > 0 && `(${issues.length})`}
            </button>
            <button
              onClick={onClear}
              className="px-3 py-1 rounded-full text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              Log wissen
            </button>
          </div>

          {/* Copy feedback */}
          {copyFeedback && (
            <div className="mt-2 text-center text-sm text-[#00ff88] bg-[#00ff88]/10 rounded-lg py-1">
              {copyFeedback}
            </div>
          )}
        </div>

        {/* Analysis panel */}
        {showAnalysis && (
          <div className="border-b border-[#2d2d2d] p-4 bg-purple-500/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                🔬 Probleemanalyse
              </h3>
              <button
                onClick={() => handleCopy('issues')}
                className="px-3 py-1 rounded-full text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1"
              >
                📋 Kopieer analyse
              </button>
            </div>

            {issues.length === 0 ? (
              <p className="text-gray-400 text-sm">Geen terugkerende problemen gedetecteerd.</p>
            ) : (
              <div className="space-y-2">
                {issues.slice(0, 5).map((issue, idx) => {
                  const typeInfo = {
                    'provider_failure': { label: 'Provider fout', color: 'text-red-400', bg: 'bg-red-500/20' },
                    'ticker_not_found': { label: 'Niet gevonden', color: 'text-orange-400', bg: 'bg-orange-500/20' },
                    'rate_limit': { label: 'Rate limit', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
                    'network_error': { label: 'Netwerk', color: 'text-blue-400', bg: 'bg-blue-500/20' },
                    'timeout': { label: 'Timeout', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
                    'unknown': { label: 'Onbekend', color: 'text-gray-400', bg: 'bg-gray-500/20' },
                  }[issue.type];

                  return (
                    <div key={idx} className="bg-[#252525] rounded-lg p-3 border border-[#2d2d2d]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeInfo.bg} ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        <span className="text-white font-medium text-sm">{issue.count}x</span>
                        {issue.provider && (
                          <span className="text-gray-500 text-xs">via {issue.provider}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mb-1">
                        Tickers: {issue.affectedTickers.slice(0, 5).join(', ')}
                        {issue.affectedTickers.length > 5 && ` +${issue.affectedTickers.length - 5} meer`}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {issue.errorPattern}
                      </div>
                    </div>
                  );
                })}

                {issues.length > 5 && (
                  <p className="text-xs text-gray-500 text-center">
                    +{issues.length - 5} meer problemen - kopieer de analyse voor details
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredLog.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🔇</div>
              <p className="text-gray-400">
                {scanLog.length === 0
                  ? 'Nog geen scans uitgevoerd'
                  : 'Geen scans gevonden met dit filter'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Select all checkbox */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <input
                  type="checkbox"
                  checked={filteredLog.length > 0 && filteredLog.every(e => selectedEntries.has(e.id))}
                  onChange={toggleAllFiltered}
                  className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs text-gray-500">Alles selecteren ({filteredLog.length})</span>
              </div>
              {filteredLog.map((entry) => (
                <div
                  key={entry.id}
                  className={`bg-[#252525] rounded-lg p-3 border transition-colors ${
                    selectedEntries.has(entry.id) ? 'border-[#00ff88]/40' : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedEntries.has(entry.id)}
                      onChange={() => toggleEntry(entry.id)}
                      className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer flex-shrink-0"
                    />
                    {/* Ticker */}
                    <div className="w-20">
                      <div className="font-mono font-bold text-white text-sm">{entry.ticker}</div>
                      <div className="text-xs text-gray-500 truncate">{entry.tabName}</div>
                    </div>

                    {/* Type badge */}
                    <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                      entry.type === 'auto' ? 'bg-blue-500/20 text-blue-400' :
                      entry.type === 'manual' || entry.type === 'single' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {getTypeLabel(entry.type)}
                    </div>

                    {/* Result badge */}
                    <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                      entry.result === 'success' ? 'bg-green-500/20' :
                      entry.result === 'fallback_success' ? 'bg-yellow-500/20' :
                      entry.result === 'failed' || entry.result === 'unavailable' ? 'bg-red-500/20' :
                      'bg-gray-500/20'
                    } ${getResultColor(entry.result)}`}>
                      {getResultLabel(entry.result)}
                    </div>

                    {/* Price change */}
                    <div className="flex-1 text-right">
                      {entry.newPrice !== null && entry.previousPrice !== null ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-gray-500 text-xs">
                            €{entry.previousPrice.toFixed(2)}
                          </span>
                          <span className="text-gray-500">→</span>
                          <span className="text-white text-sm font-mono">
                            €{entry.newPrice.toFixed(2)}
                          </span>
                          {entry.priceChange !== null && entry.priceChange !== 0 && (
                            <span className={`text-xs ${entry.priceChange >= 0 ? 'text-[#00ff88]' : 'text-red-400'}`}>
                              ({entry.priceChange >= 0 ? '+' : ''}{entry.priceChange.toFixed(2)}%)
                            </span>
                          )}
                        </div>
                      ) : entry.newPrice !== null ? (
                        <span className="text-white text-sm font-mono">€{entry.newPrice.toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-500 text-xs">Geen prijs</span>
                      )}
                    </div>

                    {/* Provider & duration */}
                    <div className="text-right text-xs w-20">
                      {entry.provider && (
                        <div className="text-gray-400">{entry.provider}</div>
                      )}
                      <div className="text-gray-500">{entry.duration}ms</div>
                    </div>

                    {/* Time */}
                    <div className="text-right text-xs text-gray-500 w-24">
                      {formatTime(entry.timestamp)}
                    </div>
                  </div>

                  {/* Reasons */}
                  {entry.reasons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.reasons.map((reason, i) => (
                        <span key={i} className="px-2 py-0.5 bg-[#1d1d1d] rounded text-xs text-gray-400">
                          {reason}
                        </span>
                      ))}
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
              {filteredLog.length} van {scanLog.length} items getoond • Max 500 entries bewaard
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
