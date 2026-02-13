'use client';

import { useState } from 'react';
import type { ActionLogEntry } from '@/lib/defog/types';

interface UndoModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionLog: ActionLogEntry[];
  onUndo: (actionId: string) => boolean;
  onClear: () => void;
}

export function UndoModal({ isOpen, onClose, actionLog, onUndo, onClear }: UndoModalProps) {
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [undoingId, setUndoingId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Sort by timestamp (newest first)
  const sortedLog = [...actionLog].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

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

  const getActionIcon = (type: ActionLogEntry['type']) => {
    switch (type) {
      case 'add_stock':
        return '+';
      case 'remove_stock':
        return '-';
      case 'update_stock':
        return '~';
      case 'set_buy_limit':
        return '$';
      case 'mark_purchased':
        return '~';
      case 'restore_from_purchased':
        return '~';
      case 'archive_stock':
        return '~';
      case 'restore_from_archive':
        return '~';
      case 'add_tab':
        return '+';
      case 'remove_tab':
        return '-';
      case 'update_tab':
        return '~';
      case 'move_stock':
        return '~';
      default:
        return '?';
    }
  };

  const getActionColor = (type: ActionLogEntry['type']) => {
    switch (type) {
      case 'add_stock':
      case 'add_tab':
        return 'bg-green-500/20 text-green-400';
      case 'remove_stock':
      case 'remove_tab':
        return 'bg-red-500/20 text-red-400';
      case 'set_buy_limit':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'mark_purchased':
        return 'bg-blue-500/20 text-blue-400';
      case 'archive_stock':
        return 'bg-purple-500/20 text-purple-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const handleToggleSelect = (actionId: string) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedActions.size === sortedLog.filter((a) => a.canUndo).length) {
      setSelectedActions(new Set());
    } else {
      setSelectedActions(new Set(sortedLog.filter((a) => a.canUndo).map((a) => a.id)));
    }
  };

  const handleUndoSingle = async (actionId: string) => {
    setUndoingId(actionId);
    try {
      const success = onUndo(actionId);
      if (!success) {
        console.error('Failed to undo action');
      }
    } finally {
      setUndoingId(null);
    }
  };

  const handleUndoSelected = async () => {
    // Undo in order (newest first)
    const actionsToUndo = sortedLog.filter((a) => selectedActions.has(a.id) && a.canUndo);
    for (const action of actionsToUndo) {
      setUndoingId(action.id);
      const success = onUndo(action.id);
      if (!success) {
        console.error('Failed to undo action:', action.id);
      }
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay for UI
    }
    setUndoingId(null);
    setSelectedActions(new Set());
  };

  const undoableCount = sortedLog.filter((a) => a.canUndo).length;
  const selectedUndoableCount = Array.from(selectedActions).filter(
    (id) => sortedLog.find((a) => a.id === id)?.canUndo
  ).length;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1d1d1d] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-[#2d2d2d]">
        {/* Header */}
        <div className="p-4 border-b border-[#2d2d2d]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">~</span>
                Acties ongedaan maken
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Selecteer acties om ongedaan te maken
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl leading-none p-2"
            >
              &times;
            </button>
          </div>

          {/* Stats & actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                {actionLog.length} acties • {undoableCount} ongedaan te maken
              </span>
            </div>
            <div className="flex gap-2">
              {undoableCount > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1 rounded-full text-sm bg-[#2d2d2d] text-gray-300 hover:bg-[#3d3d3d] transition-colors"
                >
                  {selectedActions.size === undoableCount ? 'Deselecteer alles' : 'Selecteer alles'}
                </button>
              )}
              {selectedUndoableCount > 0 && (
                <button
                  onClick={handleUndoSelected}
                  disabled={undoingId !== null}
                  className="px-3 py-1 rounded-full text-sm bg-[#00ff88] text-black font-medium hover:bg-[#00dd77] transition-colors disabled:opacity-50"
                >
                  {selectedUndoableCount} ongedaan maken
                </button>
              )}
              <button
                onClick={onClear}
                className="px-3 py-1 rounded-full text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                Log wissen
              </button>
            </div>
          </div>
        </div>

        {/* Action list */}
        <div className="flex-1 overflow-y-auto p-4">
          {sortedLog.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">~</div>
              <p className="text-gray-400">Nog geen acties geregistreerd</p>
              <p className="text-sm text-gray-500 mt-2">
                Acties worden automatisch gelogd wanneer je wijzigingen maakt
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedLog.map((action) => (
                <div
                  key={action.id}
                  className={`bg-[#252525] rounded-lg p-3 border transition-colors ${
                    selectedActions.has(action.id)
                      ? 'border-[#00ff88]'
                      : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
                  } ${undoingId === action.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => action.canUndo && handleToggleSelect(action.id)}
                      disabled={!action.canUndo}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        !action.canUndo
                          ? 'bg-[#2d2d2d] cursor-not-allowed'
                          : selectedActions.has(action.id)
                          ? 'bg-[#00ff88] text-black'
                          : 'bg-[#2d2d2d] hover:bg-[#3d3d3d]'
                      }`}
                    >
                      {selectedActions.has(action.id) && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Action icon */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono ${getActionColor(action.type)}`}>
                      {getActionIcon(action.type)}
                    </div>

                    {/* Description */}
                    <div className="flex-1">
                      <div className="text-white text-sm">{action.description}</div>
                      <div className="text-xs text-gray-500">{formatTime(action.timestamp)}</div>
                    </div>

                    {/* Undo button */}
                    {action.canUndo && (
                      <button
                        onClick={() => handleUndoSingle(action.id)}
                        disabled={undoingId !== null}
                        className="px-3 py-1 rounded text-sm bg-[#2d2d2d] text-gray-300 hover:bg-[#3d3d3d] transition-colors disabled:opacity-50"
                      >
                        Ongedaan maken
                      </button>
                    )}
                    {!action.canUndo && (
                      <span className="px-3 py-1 text-xs text-gray-500">
                        Niet ongedaan te maken
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2d2d2d]">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Max 100 acties worden bewaard
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
