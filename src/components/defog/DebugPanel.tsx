'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import { subscribeLogs, clearLogs, type LogEntry } from '@/lib/defog/services/debugLogger';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DebugPanel({ isOpen, onClose }: DebugPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  const copyLogsToClipboard = async () => {
    const logText = logs
      .map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const details = log.details ? `\n  Details: ${JSON.stringify(log.details)}` : '';
        return `[${time}] [${log.type}] ${log.message}${details}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs:', err);
      // Fallback: create a text area and select it
      const textArea = document.createElement('textarea');
      textArea.value = logText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeLogs(setLogs);
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    return log.type === filter;
  });

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  const getTypeColor = (type: LogEntry['type']): string => {
    switch (type) {
      case 'api_call':
        return 'text-blue-400';
      case 'api_response':
        return 'text-green-400';
      case 'api_error':
        return 'text-red-400';
      case 'cache_hit':
        return 'text-purple-400';
      case 'cache_miss':
        return 'text-orange-400';
      case 'rate_limit':
        return 'text-yellow-400';
      case 'warning':
        return 'text-amber-400';
      default:
        return 'text-gray-400';
    }
  };

  const getTypeBadge = (type: LogEntry['type']): string => {
    switch (type) {
      case 'api_call':
        return 'bg-blue-500/20 text-blue-400';
      case 'api_response':
        return 'bg-green-500/20 text-green-400';
      case 'api_error':
        return 'bg-red-500/20 text-red-400';
      case 'cache_hit':
        return 'bg-purple-500/20 text-purple-400';
      case 'cache_miss':
        return 'bg-orange-500/20 text-orange-400';
      case 'rate_limit':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'warning':
        return 'bg-amber-500/20 text-amber-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-[#1a1a2e] rounded-t-xl sm:rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Debug Log</h2>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-[#252542] border border-gray-600 rounded px-2 py-1 text-sm text-gray-300"
            >
              <option value="all">All</option>
              <option value="api_call">API Calls</option>
              <option value="api_response">API Responses</option>
              <option value="api_error">API Errors</option>
              <option value="cache_hit">Cache Hits</option>
              <option value="cache_miss">Cache Misses</option>
              <option value="rate_limit">Rate Limits</option>
            </select>
            <button
              onClick={copyLogsToClipboard}
              className={`p-2 rounded transition-colors ${
                copied
                  ? 'bg-green-500/20 text-green-400'
                  : 'hover:bg-white/10 text-gray-400 hover:text-white'
              }`}
              title={copied ? 'Copied!' : 'Copy all logs'}
            >
              {copied ? (
                <CheckIcon className="w-5 h-5" />
              ) : (
                <ClipboardDocumentIcon className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => clearLogs()}
              className="p-2 hover:bg-white/10 rounded text-gray-400 hover:text-white"
              title="Clear logs"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded text-gray-400 hover:text-white"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm">
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              No logs yet. Refresh stocks to see API activity.
            </div>
          ) : (
            [...filteredLogs].reverse().map((log) => (
              <div
                key={log.id}
                className="bg-[#252542] rounded p-2 hover:bg-[#2a2a4a]"
              >
                <div
                  className="flex items-start gap-2 cursor-pointer"
                  onClick={() => log.details && toggleExpand(log.id)}
                >
                  <span className="text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${getTypeBadge(log.type)}`}>
                    {log.type.replace('_', ' ')}
                  </span>
                  <span className={`flex-1 ${getTypeColor(log.type)}`}>
                    {log.message}
                  </span>
                  {log.details !== undefined && (
                    <span className="text-gray-500">
                      {expanded.has(log.id) ? (
                        <ChevronUpIcon className="w-4 h-4" />
                      ) : (
                        <ChevronDownIcon className="w-4 h-4" />
                      )}
                    </span>
                  )}
                </div>

                {/* Expanded details */}
                {log.details !== undefined && expanded.has(log.id) && (
                  <div className="mt-2 p-2 bg-black/30 rounded text-xs text-gray-400 overflow-x-auto">
                    <pre>{JSON.stringify(log.details, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer with stats */}
        <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
          {filteredLogs.length} log entries
          {filter !== 'all' && ` (filtered from ${logs.length} total)`}
        </div>
      </div>
    </div>
  );
}
