'use client';

import { useMemo, useState } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import type { Tab, Stock } from '@/lib/defog/types';

// ── Types ──────────────────────────────────────────────────────────────────

interface StockEntry {
  stock: Stock;
  tabId: string;
  tabName: string;
  tabColor: string;
}

interface DuplicateGroup {
  ticker: string;
  entries: StockEntry[];
  keepIds: Set<string>;
}

interface DeduplicateModalProps {
  tabs: Tab[];
  onSave: (removals: { tabId: string; stockId: string }[]) => void;
  onClose: () => void;
}

type Mode = 'dubbelen' | 'handmatig';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(price: number | null | undefined, currency: string) {
  if (price == null || price === 0) return '–';
  try {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${price.toFixed(2)}`;
  }
}

function buildGroups(tabs: Tab[]): DuplicateGroup[] {
  const all: StockEntry[] = [];
  for (const tab of tabs) {
    for (const stock of tab.stocks) {
      all.push({ stock, tabId: tab.id, tabName: tab.name, tabColor: tab.accentColor });
    }
  }

  const byTicker = new Map<string, StockEntry[]>();
  for (const entry of all) {
    const key = entry.stock.ticker.trim().toUpperCase();
    if (!byTicker.has(key)) byTicker.set(key, []);
    byTicker.get(key)!.push(entry);
  }

  const groups: DuplicateGroup[] = [];
  for (const [ticker, entries] of byTicker) {
    if (entries.length < 2) continue;
    let bestIdx = 0;
    let bestLimit = entries[0].stock.buyLimit ?? Infinity;
    for (let i = 1; i < entries.length; i++) {
      const lim = entries[i].stock.buyLimit ?? Infinity;
      if (lim < bestLimit) { bestLimit = lim; bestIdx = i; }
    }
    groups.push({ ticker, entries, keepIds: new Set([entries[bestIdx].stock.id]) });
  }
  return groups;
}

// ── Stock card (shared) ────────────────────────────────────────────────────

function StockSelectionCard({
  entry,
  kept,
  onToggle,
}: {
  entry: StockEntry;
  kept: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative text-left rounded-lg p-3 border-2 transition-all w-full ${
        kept
          ? 'border-[#00ff88] bg-[#00ff88]/10'
          : 'border-[#3d3d3d] bg-[#1a1a1a] opacity-55 hover:opacity-80 hover:border-[#555]'
      }`}
    >
      {/* Checkmark */}
      <div className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
        kept ? 'bg-[#00ff88] text-black' : 'border border-[#555]'
      }`}>
        {kept && <CheckIcon className="w-3 h-3" />}
      </div>

      {/* Tab badge */}
      <div className="flex items-center gap-1.5 mb-1.5 pr-6">
        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.tabColor || '#888' }} />
        <span className="text-xs text-gray-400 truncate">{entry.tabName}</span>
      </div>

      {/* Name */}
      <div className="text-sm text-white font-medium truncate mb-2" title={entry.stock.name}>
        {entry.stock.displayName || entry.stock.name}
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-1 text-xs">
        <div>
          <div className="text-gray-500 mb-0.5">Koers</div>
          <div className="text-gray-200 font-mono">{fmt(entry.stock.currentPrice, entry.stock.currency)}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-0.5">Kooplimiet</div>
          <div className={`font-mono ${entry.stock.buyLimit != null ? 'text-[#00ccff]' : 'text-gray-500'}`}>
            {fmt(entry.stock.buyLimit, entry.stock.currency)}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Tab filter pills ───────────────────────────────────────────────────────

function TabFilterBar({
  tabs,
  selectedTabId,
  getCount,
  onSelect,
}: {
  tabs: Tab[];
  selectedTabId: string | null;
  getCount: (tabId: string) => number;
  onSelect: (tabId: string | null) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
          selectedTabId === null ? 'bg-[#3d3d3d] text-white' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        Alle tabs
      </button>
      {tabs.map((tab) => {
        const count = getCount(tab.id);
        if (count === 0) return null;
        const active = selectedTabId === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(active ? null : tab.id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              active ? 'text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
            style={active ? { backgroundColor: tab.accentColor + '33', border: `1px solid ${tab.accentColor}66` } : { border: '1px solid #3d3d3d' }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tab.accentColor || '#888' }} />
            {tab.name}
            <span className={`${active ? 'text-white' : 'text-gray-500'}`}>({count})</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function DeduplicateModal({ tabs, onSave, onClose }: DeduplicateModalProps) {
  const [mode, setMode] = useState<Mode>('dubbelen');

  // ── Dubbelen mode state ──
  const initialGroups = useMemo(() => buildGroups(tabs), [tabs]);
  const [groups, setGroups] = useState<DuplicateGroup[]>(initialGroups);
  const [filterTabId, setFilterTabId] = useState<string | null>(null);

  // ── Handmatig mode state ──
  const [manualTabId, setManualTabId] = useState<string>(tabs[0]?.id ?? '');
  // keepSet: stock IDs to keep (default = all in tab)
  const [manualKeep, setManualKeep] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const tab of tabs) init[tab.id] = new Set(tab.stocks.map((s) => s.id));
    return init;
  });

  // ── Dubbelen helpers ──
  function dupCountForTab(tabId: string) {
    return groups.filter((g) => g.entries.some((e) => e.tabId === tabId)).length;
  }

  const visibleGroups = filterTabId
    ? groups.filter((g) => g.entries.some((e) => e.tabId === filterTabId))
    : groups;

  function toggleDupKeep(groupIdx: number, stockId: string) {
    // groupIdx is index in visibleGroups, not groups — need to map back
    const targetTicker = visibleGroups[groupIdx].ticker;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.ticker !== targetTicker) return g;
        const next = new Set(g.keepIds);
        if (next.has(stockId)) next.delete(stockId); else next.add(stockId);
        return { ...g, keepIds: next };
      })
    );
  }

  const dupRemovals = groups.flatMap((g) =>
    g.entries.filter((e) => !g.keepIds.has(e.stock.id)).map((e) => ({ tabId: e.tabId, stockId: e.stock.id }))
  );

  // ── Handmatig helpers ──
  const manualTab = tabs.find((t) => t.id === manualTabId);
  const keepSet = manualKeep[manualTabId] ?? new Set<string>();

  function toggleManualKeep(stockId: string) {
    setManualKeep((prev) => {
      const next = new Set(prev[manualTabId]);
      if (next.has(stockId)) next.delete(stockId); else next.add(stockId);
      return { ...prev, [manualTabId]: next };
    });
  }

  function selectAll() {
    setManualKeep((prev) => ({ ...prev, [manualTabId]: new Set(manualTab?.stocks.map((s) => s.id) ?? []) }));
  }

  function deselectAll() {
    setManualKeep((prev) => ({ ...prev, [manualTabId]: new Set() }));
  }

  const manualRemovals = manualTab
    ? manualTab.stocks
        .filter((s) => !keepSet.has(s.id))
        .map((s) => ({ tabId: manualTabId, stockId: s.id }))
    : [];

  // ── Render ──
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1a1a] rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#3d3d3d] flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">Aandelen opruimen</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-3 border-b border-[#3d3d3d] flex-shrink-0">
          <button
            onClick={() => setMode('dubbelen')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'dubbelen' ? 'bg-[#3d3d3d] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Dubbelen
            {initialGroups.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${mode === 'dubbelen' ? 'bg-[#00ff88] text-black' : 'bg-[#3d3d3d] text-gray-400'}`}>
                {initialGroups.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setMode('handmatig')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'handmatig' ? 'bg-[#3d3d3d] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Handmatig per tab
          </button>
        </div>

        {/* ── DUBBELEN mode ── */}
        {mode === 'dubbelen' && (
          <>
            {initialGroups.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="text-4xl mb-3">✓</div>
                <div className="text-white font-medium mb-1">Geen dubbele aandelen</div>
                <div className="text-gray-400 text-sm">Alle tickers in je portfolio zijn uniek.</div>
              </div>
            ) : (
              <>
                {/* Tab filter */}
                <div className="p-3 border-b border-[#2d2d2d] flex-shrink-0">
                  <div className="text-xs text-gray-500 mb-2">Filter op tabblad:</div>
                  <TabFilterBar
                    tabs={tabs}
                    selectedTabId={filterTabId}
                    getCount={dupCountForTab}
                    onSelect={setFilterTabId}
                  />
                </div>

                {/* Groups */}
                <div className="overflow-y-auto flex-1 p-4 space-y-4">
                  {visibleGroups.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm py-8">
                      Geen dubbelen in dit tabblad.
                    </div>
                  ) : (
                    visibleGroups.map((group, gi) => (
                      <div key={group.ticker} className="bg-[#252525] rounded-lg p-3 border border-[#3d3d3d]">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-mono text-sm font-semibold text-[#00ff88]">{group.ticker}</span>
                          <span className="text-xs text-gray-500">{group.entries.length}× aanwezig</span>
                          {group.keepIds.size === 0 && (
                            <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">Alles wordt verwijderd</span>
                          )}
                        </div>
                        <div className={`grid gap-2 ${group.entries.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                          {group.entries.map((entry) => (
                            <StockSelectionCard
                              key={entry.stock.id}
                              entry={entry}
                              kept={group.keepIds.has(entry.stock.id)}
                              onToggle={() => toggleDupKeep(gi, entry.stock.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Dup footer */}
                <div className="flex items-center justify-between p-4 border-t border-[#3d3d3d] flex-shrink-0 gap-3">
                  <div className="text-xs text-gray-400">
                    {dupRemovals.length > 0
                      ? <><span className="text-red-400 font-medium">{dupRemovals.length}</span> {dupRemovals.length === 1 ? 'aandeel' : 'aandelen'} worden verwijderd</>
                      : 'Niets wordt verwijderd'}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded-lg transition-colors">
                      Annuleren
                    </button>
                    <button
                      onClick={() => { if (dupRemovals.length > 0) onSave(dupRemovals); else onClose(); }}
                      disabled={dupRemovals.length === 0}
                      className="px-4 py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-lg transition-colors"
                    >
                      {dupRemovals.length > 0 ? `Verwijder ${dupRemovals.length} dubbelen` : 'Alles bewaard'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── HANDMATIG mode ── */}
        {mode === 'handmatig' && (
          <>
            {/* Tab picker */}
            <div className="p-3 border-b border-[#2d2d2d] flex-shrink-0">
              <div className="text-xs text-gray-500 mb-2">Kies tabblad:</div>
              <div className="flex gap-1.5 flex-wrap">
                {tabs.map((tab) => {
                  const active = tab.id === manualTabId;
                  const removedCount = (manualKeep[tab.id]
                    ? tab.stocks.filter((s) => !manualKeep[tab.id].has(s.id)).length
                    : 0);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setManualTabId(tab.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        active ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                      }`}
                      style={active
                        ? { backgroundColor: tab.accentColor + '33', border: `1px solid ${tab.accentColor}88` }
                        : { border: '1px solid #3d3d3d' }
                      }
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tab.accentColor || '#888' }} />
                      {tab.name}
                      <span className="text-gray-500">({tab.stocks.length})</span>
                      {removedCount > 0 && (
                        <span className="text-red-400 font-semibold">−{removedCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Controls row */}
            {manualTab && (
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#2d2d2d] flex-shrink-0">
                <span className="text-xs text-gray-400">
                  <span className="text-white font-medium">{keepSet.size}</span> van {manualTab.stocks.length} bewaard
                  {manualRemovals.length > 0 && (
                    <> · <span className="text-red-400 font-medium">{manualRemovals.length}</span> worden verwijderd</>
                  )}
                </span>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5">
                    Alles aan
                  </button>
                  <button onClick={deselectAll} className="text-xs text-gray-400 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-white/5">
                    Alles uit
                  </button>
                </div>
              </div>
            )}

            {/* Stock list */}
            <div className="overflow-y-auto flex-1 p-4">
              {!manualTab || manualTab.stocks.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-8">Geen aandelen in dit tabblad.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {manualTab.stocks.map((stock) => {
                    const entry: StockEntry = { stock, tabId: manualTab.id, tabName: manualTab.name, tabColor: manualTab.accentColor };
                    return (
                      <StockSelectionCard
                        key={stock.id}
                        entry={entry}
                        kept={keepSet.has(stock.id)}
                        onToggle={() => toggleManualKeep(stock.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Manual footer */}
            <div className="flex items-center justify-between p-4 border-t border-[#3d3d3d] flex-shrink-0 gap-3">
              <div className="text-xs text-gray-400">
                {manualRemovals.length > 0
                  ? <><span className="text-red-400 font-medium">{manualRemovals.length}</span> {manualRemovals.length === 1 ? 'aandeel' : 'aandelen'} worden verwijderd uit <span className="text-white">{manualTab?.name}</span></>
                  : manualTab ? `Alle ${manualTab.stocks.length} aandelen blijven bewaard` : ''}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded-lg transition-colors">
                  Annuleren
                </button>
                <button
                  onClick={() => { if (manualRemovals.length > 0) onSave(manualRemovals); else onClose(); }}
                  disabled={manualRemovals.length === 0}
                  className="px-4 py-2 bg-[#ff3366] hover:bg-[#dd2255] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {manualRemovals.length > 0 ? `Verwijder ${manualRemovals.length} uit ${manualTab?.name ?? ''}` : 'Niets geselecteerd'}
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
