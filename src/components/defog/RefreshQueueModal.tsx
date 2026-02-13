'use client';

import { useState, useRef } from 'react';
import { XMarkIcon, Bars3Icon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, ClockIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { Stock, ScanStatus, ApiProvider } from '@/lib/defog/types';

interface QueueItem {
  tabId: string;
  tabName: string;
  tabColor: string;
  stock: Stock;
}

interface RefreshQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  queueItems: QueueItem[];
  onReorder: (reorderedItems: QueueItem[]) => void;
  onRefreshNow: (item: QueueItem) => void;
  onRefreshSelected: (items: QueueItem[], provider?: ApiProvider) => void;
  currentlyScanning?: string; // ticker of stock currently being scanned
  currentScanIndex?: number; // index of stock currently being scanned (0-based)
  avgScanTime?: number; // average scan time in milliseconds
  availableProviders: { provider: ApiProvider; name: string }[];
}

// Get icon and color for scan status
function getScanStatusDisplay(status?: ScanStatus): { icon: React.ReactNode; color: string; text: string } {
  if (!status) {
    return {
      icon: <ClockIcon className="w-4 h-4" />,
      color: 'text-gray-500',
      text: 'Nog niet gescand',
    };
  }

  switch (status.type) {
    case 'success':
      return {
        icon: <CheckCircleIcon className="w-4 h-4" />,
        color: 'text-green-400',
        text: status.message,
      };
    case 'fallback_success':
      return {
        icon: <CheckCircleIcon className="w-4 h-4" />,
        color: 'text-yellow-400',
        text: status.message,
      };
    case 'partial':
      return {
        icon: <ExclamationTriangleIcon className="w-4 h-4" />,
        color: 'text-yellow-400',
        text: status.message,
      };
    case 'failed':
      return {
        icon: <XCircleIcon className="w-4 h-4" />,
        color: 'text-red-400',
        text: status.message,
      };
    case 'unavailable':
      return {
        icon: <XCircleIcon className="w-4 h-4" />,
        color: 'text-gray-500',
        text: status.message,
      };
    case 'pending':
    default:
      return {
        icon: <ClockIcon className="w-4 h-4" />,
        color: 'text-gray-500',
        text: 'In wachtrij',
      };
  }
}

// Format timestamp for display
function formatScanTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'zojuist';
  if (diffMins < 60) return `${diffMins}m geleden`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}u geleden`;

  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

// Height of each queue item in pixels (for scroll adjustment)
const ITEM_HEIGHT = 72; // Approximate height including margin

// Calculate expected scan time for an item based on position
function calculateExpectedTime(position: number, currentIndex: number, avgScanTime: number): string {
  if (position <= currentIndex) return 'Nu';

  const remainingItems = position - currentIndex;
  const estimatedMs = remainingItems * avgScanTime;
  const estimatedTime = new Date(Date.now() + estimatedMs);

  return estimatedTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

// Format duration in a readable format
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}u ${remainingMinutes}m`;
}

export function RefreshQueueModal({
  isOpen,
  onClose,
  queueItems,
  onReorder,
  onRefreshNow,
  onRefreshSelected,
  currentlyScanning,
  currentScanIndex = 0,
  avgScanTime = 2000, // Default 2 seconds per stock
  availableProviders,
}: RefreshQueueModalProps) {
  const [items, setItems] = useState<QueueItem[]>(queueItems);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProvider, setSelectedProvider] = useState<ApiProvider | 'auto'>('auto');
  const dragNodeRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Update local items when props change
  if (JSON.stringify(items.map(i => i.stock.id)) !== JSON.stringify(queueItems.map(i => i.stock.id))) {
    setItems(queueItems);
  }

  if (!isOpen) return null;

  // Selection handlers
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(items.map(i => i.stock.id)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const handleRefreshSelected = () => {
    const selectedItems = items.filter(i => selectedIds.has(i.stock.id));
    if (selectedItems.length > 0) {
      onRefreshSelected(selectedItems, selectedProvider === 'auto' ? undefined : selectedProvider);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    // Make drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      dragNodeRef.current = e.currentTarget as HTMLDivElement;
      setTimeout(() => {
        if (dragNodeRef.current) {
          dragNodeRef.current.style.opacity = '0.5';
        }
      }, 0);
    }
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && index !== draggedIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragOverIndex(null);
      return;
    }

    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(dropIndex, 0, draggedItem);

    setItems(newItems);
    onReorder(newItems);
    setDragOverIndex(null);
  };

  // Move item up in the list
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setItems(newItems);
    onReorder(newItems);
  };

  // Move item down in the list
  const moveDown = (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    setItems(newItems);
    onReorder(newItems);
  };

  // Move item to top - keep visual position stable
  const moveToTop = (index: number) => {
    if (index === 0) return;

    // Save current scroll position
    const scrollBefore = scrollContainerRef.current?.scrollTop || 0;

    const newItems = [...items];
    const [item] = newItems.splice(index, 1);
    newItems.unshift(item);

    setItems(newItems);
    onReorder(newItems);

    // Adjust scroll AFTER state update to keep view stable
    // Item moved from index to 0, so items 0..index-1 moved down by 1
    // We need to scroll up by index * ITEM_HEIGHT to compensate
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = Math.max(0, scrollBefore - (index * ITEM_HEIGHT));
      }
    });
  };

  // Move item to bottom - keep visual position stable
  const moveToBottom = (index: number) => {
    if (index === items.length - 1) return;

    // Save current scroll position
    const scrollBefore = scrollContainerRef.current?.scrollTop || 0;

    const newItems = [...items];
    const [item] = newItems.splice(index, 1);
    newItems.push(item);

    setItems(newItems);
    onReorder(newItems);

    // Adjust scroll AFTER state update
    // Item removed from index, items below moved up by 1
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = Math.max(0, scrollBefore - ITEM_HEIGHT);
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[#3d3d3d]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Ververs Wachtrij</h2>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-gray-400">
                  Vink aan welke aandelen je wilt scannen
                </p>
                {items.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-[#2d2d2d] px-2 py-1 rounded">
                    <ClockIcon className="w-3 h-3" />
                    <span>Totaal: ~{formatDuration(items.length * avgScanTime)}</span>
                    <span className="text-gray-600">|</span>
                    <span>Gemiddeld: {(avgScanTime / 1000).toFixed(1)}s/aandeel</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Selection toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="text-xs px-2 py-1 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-300 rounded transition-colors"
              >
                Alles
              </button>
              <button
                onClick={selectNone}
                className="text-xs px-2 py-1 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-300 rounded transition-colors"
              >
                Geen
              </button>
              <span className="text-xs text-gray-500">
                {selectedIds.size} geselecteerd
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {/* Provider selector */}
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as ApiProvider | 'auto')}
                className="text-xs bg-[#2d2d2d] border border-[#3d3d3d] text-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-[#00ff88]"
              >
                <option value="auto">Auto (probeer alle)</option>
                {availableProviders.map(p => (
                  <option key={p.provider} value={p.provider}>{p.name}</option>
                ))}
              </select>

              {/* Scan selected button */}
              <button
                onClick={handleRefreshSelected}
                disabled={selectedIds.size === 0 || !!currentlyScanning}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowPathIcon className={`w-4 h-4 ${currentlyScanning ? 'animate-spin' : ''}`} />
                Scan ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>

        {/* Queue list */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              Geen aandelen in de wachtrij
            </div>
          ) : (
            items.map((item, index) => {
              const statusDisplay = getScanStatusDisplay(item.stock.lastScanStatus);
              const isScanning = currentlyScanning === item.stock.ticker;
              const isDragOver = dragOverIndex === index;
              const isDragging = draggedIndex === index;
              const isSelected = selectedIds.has(item.stock.id);

              return (
                <div
                  key={item.stock.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg cursor-grab active:cursor-grabbing
                    transition-all duration-150
                    ${isDragOver ? 'bg-[#00ff88]/20 border-2 border-[#00ff88]/50' : 'bg-[#2d2d2d] border-2 border-transparent'}
                    ${isDragging ? 'opacity-50' : ''}
                    ${isScanning ? 'ring-2 ring-[#00ff88] ring-opacity-50' : ''}
                    ${isSelected ? 'bg-[#00ff88]/10' : ''}
                  `}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.stock.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer flex-shrink-0"
                  />

                  {/* Drag handle */}
                  <div className="text-gray-500 hover:text-gray-300 flex-shrink-0">
                    <Bars3Icon className="w-5 h-5" />
                  </div>

                  {/* Position number */}
                  <div className="w-6 text-center text-sm font-mono text-gray-500 flex-shrink-0">
                    {index + 1}
                  </div>

                  {/* Stock info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-semibold text-sm"
                        style={{ color: item.tabColor }}
                      >
                        {item.stock.ticker}
                      </span>
                      <span className="text-xs text-gray-500 truncate">
                        {item.stock.displayName || item.stock.name}
                      </span>
                      {isScanning && (
                        <ArrowPathIcon className="w-4 h-4 text-[#00ff88] animate-spin" />
                      )}
                    </div>

                    {/* Scan status and expected time */}
                    <div className="flex items-center gap-3 mt-1">
                      <div className={`flex items-center gap-1.5 text-xs ${statusDisplay.color}`}>
                        {statusDisplay.icon}
                        <span className="truncate">{statusDisplay.text}</span>
                        {item.stock.lastScanStatus?.timestamp && (
                          <span className="text-gray-600 ml-1">
                            ({formatScanTime(item.stock.lastScanStatus.timestamp)})
                          </span>
                        )}
                      </div>
                      {/* Expected scan time */}
                      {!isScanning && currentlyScanning && (
                        <div className="flex items-center gap-1 text-xs text-blue-400">
                          <ClockIcon className="w-3 h-3" />
                          <span>~{calculateExpectedTime(index, currentScanIndex, avgScanTime)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tab indicator */}
                  <div
                    className="px-2 py-0.5 rounded text-xs flex-shrink-0"
                    style={{ backgroundColor: item.tabColor + '30', color: item.tabColor }}
                  >
                    {item.tabName}
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveToTop(index)}
                      disabled={index === 0}
                      className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Naar boven"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Eentje omhoog"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      disabled={index === items.length - 1}
                      className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Eentje omlaag"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveToBottom(index)}
                      disabled={index === items.length - 1}
                      className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Naar beneden"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7M19 5l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onRefreshNow(item)}
                      disabled={isScanning}
                      className="p-1 hover:bg-[#00ff88]/20 rounded text-[#00ff88] disabled:opacity-30"
                      title="Nu scannen"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#3d3d3d] flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {items.length} aandelen in wachtrij
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#00ff88] text-black rounded-lg font-medium hover:bg-[#00ff88]/90 transition-colors"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
