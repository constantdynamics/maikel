'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Fuse from 'fuse.js';
import type { Stock, Tab } from '@/lib/defog/types';

interface SearchBarProps {
  tabs: Tab[];
  onStockSelect: (tabId: string, stock: Stock) => void;
  onAddNew: () => void;
}

interface SearchableStock extends Stock {
  tabId: string;
  tabName: string;
  tabColor: string;
}

export function SearchBar({ tabs, onStockSelect, onAddNew }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableStock[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Flatten all stocks from all tabs for searching
  const allStocks: SearchableStock[] = tabs.flatMap((tab) =>
    tab.stocks.map((stock) => ({
      ...stock,
      tabId: tab.id,
      tabName: tab.name,
      tabColor: tab.accentColor,
    }))
  );

  const fuse = new Fuse(allStocks, {
    keys: ['ticker', 'name'],
    threshold: 0.4,
    includeScore: true,
  });

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      const searchResults = fuse.search(searchQuery).map((r) => r.item);
      setResults(searchResults.slice(0, 10));
    },
    [allStocks]
  );

  useEffect(() => {
    handleSearch(query);
  }, [query, handleSearch]);

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (stock: SearchableStock) => {
    onStockSelect(stock.tabId, stock);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-lg transition-colors"
      >
        <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
        <span className="text-gray-400 text-sm hidden sm:inline">Search</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 w-80 sm:w-96 bg-[#2d2d2d] rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-[#3d3d3d]">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stocks in watchlist..."
              className="flex-1 bg-transparent text-white focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 hover:bg-white/10 rounded"
              >
                <XMarkIcon className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {results.length > 0 ? (
              results.map((stock) => {
                const currencySymbol = stock.currency === 'EUR' ? '€' : '$';

                return (
                  <button
                    key={`${stock.tabId}-${stock.id}`}
                    onClick={() => handleSelect(stock)}
                    className="w-full text-left p-3 hover:bg-[#3d3d3d] transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="font-medium"
                            style={{ color: stock.tabColor }}
                          >
                            {stock.ticker}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[#1a1a1a] text-gray-400">
                            {stock.tabName}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 truncate">
                          {stock.name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white">
                          {currencySymbol}
                          {stock.currentPrice.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : query ? (
              <div className="p-4 text-center">
                <p className="text-gray-400 mb-2">No stocks found</p>
                <button
                  onClick={() => {
                    onAddNew();
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className="text-sm text-[#00ff88] hover:underline"
                >
                  Add new stock
                </button>
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500">
                Type to search your watchlist
              </div>
            )}
          </div>

          <div className="p-2 border-t border-[#3d3d3d] flex justify-between text-xs text-gray-500">
            <span>
              {allStocks.length} stocks in {tabs.length} tabs
            </span>
            <button
              onClick={() => {
                onAddNew();
                setIsOpen(false);
              }}
              className="text-[#00ff88] hover:underline"
            >
              + Add new
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
