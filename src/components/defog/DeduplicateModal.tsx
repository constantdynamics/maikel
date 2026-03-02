'use client';

import { useMemo, useState } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import type { Tab, Stock } from '@/lib/defog/types';

interface StockEntry {
  stock: Stock;
  tabId: string;
  tabName: string;
  tabColor: string;
}

interface DuplicateGroup {
  ticker: string;
  entries: StockEntry[];
  /** IDs of stocks to keep (pre-selected = lowest buyLimit) */
  keepIds: Set<string>;
}

interface DeduplicateModalProps {
  tabs: Tab[];
  onSave: (removals: { tabId: string; stockId: string }[]) => void;
  onClose: () => void;
}

function formatPrice(price: number, currency: string) {
  if (!price) return '–';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function buildGroups(tabs: Tab[]): DuplicateGroup[] {
  // Collect all stocks with their tab info
  const all: StockEntry[] = [];
  for (const tab of tabs) {
    for (const stock of tab.stocks) {
      all.push({ stock, tabId: tab.id, tabName: tab.name, tabColor: tab.accentColor });
    }
  }

  // Group by normalized ticker (strip exchange suffix for matching, keep original)
  const byTicker = new Map<string, StockEntry[]>();
  for (const entry of all) {
    const key = entry.stock.ticker.trim().toUpperCase();
    if (!byTicker.has(key)) byTicker.set(key, []);
    byTicker.get(key)!.push(entry);
  }

  // Only keep groups with >1 stock
  const groups: DuplicateGroup[] = [];
  for (const [ticker, entries] of byTicker) {
    if (entries.length < 2) continue;

    // Pre-select the one with the lowest buyLimit (null = Infinity)
    let bestIdx = 0;
    let bestLimit = entries[0].stock.buyLimit ?? Infinity;
    for (let i = 1; i < entries.length; i++) {
      const lim = entries[i].stock.buyLimit ?? Infinity;
      if (lim < bestLimit) { bestLimit = lim; bestIdx = i; }
    }

    groups.push({
      ticker,
      entries,
      keepIds: new Set([entries[bestIdx].stock.id]),
    });
  }

  return groups;
}

export function DeduplicateModal({ tabs, onSave, onClose }: DeduplicateModalProps) {
  const initialGroups = useMemo(() => buildGroups(tabs), [tabs]);
  const [groups, setGroups] = useState<DuplicateGroup[]>(initialGroups);

  const totalDuplicates = groups.reduce((n, g) => n + g.entries.length - 1, 0);
  const toRemove = groups.flatMap((g) =>
    g.entries.filter((e) => !g.keepIds.has(e.stock.id)).map((e) => ({ tabId: e.tabId, stockId: e.stock.id }))
  );

  function toggleKeep(groupIdx: number, stockId: string) {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIdx) return g;
        const next = new Set(g.keepIds);
        if (next.has(stockId)) next.delete(stockId);
        else next.add(stockId);
        return { ...g, keepIds: next };
      })
    );
  }

  if (initialGroups.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-[#1a1a1a] rounded-lg w-full max-w-md p-6 text-center">
          <div className="text-4xl mb-3">✓</div>
          <div className="text-white font-medium mb-1">Geen dubbele aandelen gevonden</div>
          <div className="text-gray-400 text-sm mb-4">Alle tickers in je portfolio zijn uniek.</div>
          <button onClick={onClose} className="px-4 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded-lg transition-colors">Sluiten</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1a1a] rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#3d3d3d] flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Dubbele aandelen</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {groups.length} {groups.length === 1 ? 'dubbelaar' : 'dubbelaars'} gevonden &nbsp;·&nbsp; vink aan wat je wil <strong className="text-white">bewaren</strong>
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {groups.map((group, gi) => (
            <div key={group.ticker} className="bg-[#252525] rounded-lg p-3 border border-[#3d3d3d]">
              {/* Group header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-sm font-semibold text-[#00ff88]">{group.ticker}</span>
                <span className="text-xs text-gray-500">{group.entries.length}× aanwezig</span>
                {group.keepIds.size === 0 && (
                  <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">Alles wordt verwijderd</span>
                )}
              </div>

              {/* Stock cards — 2 columns for pairs, auto-grid for 3+ */}
              <div className={`grid gap-2 ${group.entries.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {group.entries.map((entry) => {
                  const kept = group.keepIds.has(entry.stock.id);
                  return (
                    <button
                      key={entry.stock.id}
                      onClick={() => toggleKeep(gi, entry.stock.id)}
                      className={`relative text-left rounded-lg p-3 border-2 transition-all ${
                        kept
                          ? 'border-[#00ff88] bg-[#00ff88]/10'
                          : 'border-[#3d3d3d] bg-[#1a1a1a] opacity-60 hover:opacity-80 hover:border-[#555]'
                      }`}
                    >
                      {/* Checkmark badge */}
                      <div className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        kept ? 'bg-[#00ff88] text-black' : 'border border-[#555]'
                      }`}>
                        {kept && <CheckIcon className="w-3 h-3" />}
                      </div>

                      {/* Tab badge */}
                      <div className="flex items-center gap-1.5 mb-2 pr-6">
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: entry.tabColor || '#888' }}
                        />
                        <span className="text-xs text-gray-400 truncate">{entry.tabName}</span>
                      </div>

                      {/* Stock name */}
                      <div className="text-sm text-white font-medium truncate mb-2" title={entry.stock.name}>
                        {entry.stock.displayName || entry.stock.name}
                      </div>

                      {/* Price row */}
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div>
                          <div className="text-gray-500 mb-0.5">Koers</div>
                          <div className="text-gray-200 font-mono">
                            {formatPrice(entry.stock.currentPrice, entry.stock.currency)}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-0.5">Kooplimiet</div>
                          <div className={`font-mono ${entry.stock.buyLimit != null ? 'text-[#00ccff]' : 'text-gray-500'}`}>
                            {entry.stock.buyLimit != null
                              ? formatPrice(entry.stock.buyLimit, entry.stock.currency)
                              : '–'}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[#3d3d3d] flex-shrink-0 gap-3">
          <div className="text-xs text-gray-400">
            {toRemove.length > 0
              ? <><span className="text-red-400 font-medium">{toRemove.length}</span> aandelen worden verwijderd</>
              : 'Niets wordt verwijderd'}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded-lg transition-colors">
              Annuleren
            </button>
            <button
              onClick={() => { if (toRemove.length > 0) onSave(toRemove); else onClose(); }}
              disabled={toRemove.length === 0}
              className="px-4 py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-lg transition-colors"
            >
              {toRemove.length > 0 ? `Verwijder ${toRemove.length} dubbelen` : 'Alles bewaard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
