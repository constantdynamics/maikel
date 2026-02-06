'use client';

import { useState, useEffect } from 'react';

export interface MarketOption {
  id: string;
  name: string;
  flag: string;
}

const AVAILABLE_MARKETS: MarketOption[] = [
  { id: 'us', name: 'United States', flag: '🇺🇸' },
  { id: 'ca', name: 'Canada', flag: '🇨🇦' },
  { id: 'uk', name: 'United Kingdom', flag: '🇬🇧' },
  { id: 'de', name: 'Germany', flag: '🇩🇪' },
  { id: 'fr', name: 'France', flag: '🇫🇷' },
  { id: 'hk', name: 'Hong Kong', flag: '🇭🇰' },
  { id: 'kr', name: 'South Korea', flag: '🇰🇷' },
  { id: 'za', name: 'South Africa', flag: '🇿🇦' },
];

const DEFAULT_MARKETS = ['us', 'ca'];
const STORAGE_KEY = 'selectedMarkets';

interface MarketSelectorProps {
  onChange: (markets: string[]) => void;
}

export default function MarketSelector({ onChange }: MarketSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          return new Set(JSON.parse(saved));
        } catch { /* ignore */ }
      }
    }
    return new Set(DEFAULT_MARKETS);
  });

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const arr = Array.from(selected);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    onChange(arr);
  }, [selected, onChange]);

  function toggleMarket(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't allow removing all markets
        if (next.size > 1) {
          next.delete(id);
        }
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(AVAILABLE_MARKETS.map((m) => m.id)));
  }

  function selectDefaults() {
    setSelected(new Set(DEFAULT_MARKETS));
  }

  const selectedMarkets = AVAILABLE_MARKETS.filter((m) => selected.has(m.id));
  const displayText = selectedMarkets.length <= 3
    ? selectedMarkets.map((m) => m.flag).join(' ')
    : `${selectedMarkets.length} markets`;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg hover:opacity-80 flex items-center gap-2 border border-[var(--border-color)]"
      >
        <span>{displayText}</span>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-xl z-20 min-w-[220px]">
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="text-xs text-[var(--text-muted)] mb-2">Select markets to scan</div>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="flex-1 px-2 py-1 text-xs bg-[var(--accent-primary)] text-white rounded hover:opacity-80"
                >
                  All
                </button>
                <button
                  onClick={selectDefaults}
                  className="flex-1 px-2 py-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded hover:opacity-80"
                >
                  Default
                </button>
              </div>
            </div>
            <div className="p-2 max-h-64 overflow-y-auto">
              {AVAILABLE_MARKETS.map((market) => (
                <label
                  key={market.id}
                  className="flex items-center gap-3 px-2 py-2 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(market.id)}
                    onChange={() => toggleMarket(market.id)}
                    className="rounded"
                  />
                  <span className="text-lg">{market.flag}</span>
                  <span className="text-sm text-[var(--text-primary)]">{market.name}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function getSelectedMarkets(): string[] {
  if (typeof window === 'undefined') return DEFAULT_MARKETS;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch { /* ignore */ }
  }
  return DEFAULT_MARKETS;
}
