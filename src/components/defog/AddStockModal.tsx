'use client';

import { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlassIcon, PlusIcon, DocumentTextIcon, CheckIcon, XMarkIcon, PencilIcon } from '@heroicons/react/24/outline';
import Fuse from 'fuse.js';
import { Modal } from './Modal';
import { getStockAPI } from '@/lib/defog/services/stockApi';
import { useStore } from '@/lib/defog/store';
import type { Tab } from '@/lib/defog/types';

// Bulk import entry type
interface BulkEntry {
  ticker: string;
  limit: number | null;
  name?: string;
  isValid: boolean;
  error?: string;
}

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  currency: string;
}

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: Tab[];
  currentTabId: string;
}

// Map exchange/region codes to country flags
const getCountryFlag = (exchange: string, currency: string): string => {
  const exchangeUpper = exchange.toUpperCase();
  const currencyUpper = currency.toUpperCase();

  // Exchange-based mapping
  const exchangeFlags: Record<string, string> = {
    // US
    'NYSE': '🇺🇸', 'NASDAQ': '🇺🇸', 'AMEX': '🇺🇸', 'US': '🇺🇸', 'UNITED STATES': '🇺🇸',
    // Canada
    'TSX': '🇨🇦', 'TSE': '🇨🇦', 'TO': '🇨🇦', 'TORONTO': '🇨🇦', 'V': '🇨🇦', 'CANADA': '🇨🇦', 'NEO': '🇨🇦',
    // UK
    'LSE': '🇬🇧', 'LON': '🇬🇧', 'LONDON': '🇬🇧', 'L': '🇬🇧', 'UNITED KINGDOM': '🇬🇧',
    // Germany
    'FRA': '🇩🇪', 'XETRA': '🇩🇪', 'ETR': '🇩🇪', 'DE': '🇩🇪', 'GERMANY': '🇩🇪', 'FRANKFURT': '🇩🇪',
    // France
    'EPA': '🇫🇷', 'PAR': '🇫🇷', 'EURONEXT PARIS': '🇫🇷', 'PA': '🇫🇷', 'FRANCE': '🇫🇷',
    // Netherlands
    'AMS': '🇳🇱', 'EURONEXT AMSTERDAM': '🇳🇱', 'AS': '🇳🇱', 'NETHERLANDS': '🇳🇱',
    // Belgium
    'EBR': '🇧🇪', 'EURONEXT BRUSSELS': '🇧🇪', 'BR': '🇧🇪', 'BELGIUM': '🇧🇪',
    // Luxembourg
    'LUX': '🇱🇺', 'LUXEMBOURG': '🇱🇺',
    // Switzerland
    'SWX': '🇨🇭', 'SIX': '🇨🇭', 'SW': '🇨🇭', 'SWITZERLAND': '🇨🇭',
    // Japan
    'TYO': '🇯🇵', 'T': '🇯🇵', 'JAPAN': '🇯🇵', 'TOKYO': '🇯🇵',
    // Hong Kong
    'HKG': '🇭🇰', 'HKEX': '🇭🇰', 'HK': '🇭🇰', 'HONG KONG': '🇭🇰',
    // China
    'SHA': '🇨🇳', 'SHE': '🇨🇳', 'SS': '🇨🇳', 'SZ': '🇨🇳', 'CHINA': '🇨🇳', 'SHANGHAI': '🇨🇳', 'SHENZHEN': '🇨🇳',
    // Australia
    'ASX': '🇦🇺', 'AX': '🇦🇺', 'AUSTRALIA': '🇦🇺',
    // India
    'NSE': '🇮🇳', 'BSE': '🇮🇳', 'NS': '🇮🇳', 'BO': '🇮🇳', 'INDIA': '🇮🇳',
    // South Korea
    'KRX': '🇰🇷', 'KS': '🇰🇷', 'KQ': '🇰🇷', 'KOREA': '🇰🇷', 'SOUTH KOREA': '🇰🇷',
    // Singapore
    'SGX': '🇸🇬', 'SI': '🇸🇬', 'SINGAPORE': '🇸🇬',
    // Brazil
    'BVMF': '🇧🇷', 'SA': '🇧🇷', 'BRAZIL': '🇧🇷',
    // Mexico
    'BMV': '🇲🇽', 'MX': '🇲🇽', 'MEXICO': '🇲🇽',
    // Spain
    'BME': '🇪🇸', 'MC': '🇪🇸', 'SPAIN': '🇪🇸',
    // Italy
    'BIT': '🇮🇹', 'MI': '🇮🇹', 'ITALY': '🇮🇹',
    // Sweden
    'STO': '🇸🇪', 'ST': '🇸🇪', 'SWEDEN': '🇸🇪',
    // Norway
    'OSL': '🇳🇴', 'OL': '🇳🇴', 'NORWAY': '🇳🇴',
    // Denmark
    'CPH': '🇩🇰', 'CO': '🇩🇰', 'DENMARK': '🇩🇰',
    // Finland
    'HEL': '🇫🇮', 'HE': '🇫🇮', 'FINLAND': '🇫🇮',
    // Ireland
    'ISE': '🇮🇪', 'IR': '🇮🇪', 'IRELAND': '🇮🇪',
    // Austria
    'VIE': '🇦🇹', 'VI': '🇦🇹', 'AUSTRIA': '🇦🇹',
    // Poland
    'WSE': '🇵🇱', 'WA': '🇵🇱', 'POLAND': '🇵🇱',
    // Russia
    'MCX': '🇷🇺', 'ME': '🇷🇺', 'RUSSIA': '🇷🇺',
    // South Africa
    'JSE': '🇿🇦', 'JO': '🇿🇦', 'SOUTH AFRICA': '🇿🇦',
    // Israel
    'TASE': '🇮🇱', 'TA': '🇮🇱', 'ISRAEL': '🇮🇱',
    // Taiwan
    'TWSE': '🇹🇼', 'TW': '🇹🇼', 'TWO': '🇹🇼', 'TAIWAN': '🇹🇼',
    // New Zealand
    'NZX': '🇳🇿', 'NZ': '🇳🇿', 'NEW ZEALAND': '🇳🇿',
  };

  // Check exchange first
  for (const [key, flag] of Object.entries(exchangeFlags)) {
    if (exchangeUpper.includes(key)) {
      return flag;
    }
  }

  // Currency-based fallback
  const currencyFlags: Record<string, string> = {
    'USD': '🇺🇸', 'CAD': '🇨🇦', 'GBP': '🇬🇧', 'GBX': '🇬🇧', 'EUR': '🇪🇺',
    'JPY': '🇯🇵', 'CNY': '🇨🇳', 'CNH': '🇨🇳', 'HKD': '🇭🇰', 'AUD': '🇦🇺',
    'INR': '🇮🇳', 'KRW': '🇰🇷', 'SGD': '🇸🇬', 'BRL': '🇧🇷', 'MXN': '🇲🇽',
    'CHF': '🇨🇭', 'SEK': '🇸🇪', 'NOK': '🇳🇴', 'DKK': '🇩🇰', 'PLN': '🇵🇱',
    'RUB': '🇷🇺', 'ZAR': '🇿🇦', 'ILS': '🇮🇱', 'TWD': '🇹🇼', 'NZD': '🇳🇿',
  };

  return currencyFlags[currencyUpper] || '🌐';
};

// Get currency symbol
const getCurrencySymbol = (currency: string): string => {
  const symbols: Record<string, string> = {
    'USD': '$', 'CAD': 'C$', 'GBP': '£', 'GBX': 'p', 'EUR': '€',
    'JPY': '¥', 'CNY': '¥', 'CNH': '¥', 'HKD': 'HK$', 'AUD': 'A$',
    'INR': '₹', 'KRW': '₩', 'SGD': 'S$', 'BRL': 'R$', 'MXN': 'MX$',
    'CHF': 'CHF', 'SEK': 'kr', 'NOK': 'kr', 'DKK': 'kr', 'PLN': 'zł',
    'RUB': '₽', 'ZAR': 'R', 'ILS': '₪', 'TWD': 'NT$', 'NZD': 'NZ$',
  };
  return symbols[currency.toUpperCase()] || currency;
};

export function AddStockModal({
  isOpen,
  onClose,
  tabs,
  currentTabId,
}: AddStockModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<SearchResult | null>(null);
  const [buyLimit, setBuyLimit] = useState('');
  const [selectedTabs, setSelectedTabs] = useState<string[]>([currentTabId]);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [activeMode, setActiveMode] = useState<'search' | 'manual' | 'bulk'>('search');

  // Manual entry fields
  const [manualTicker, setManualTicker] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualExchange, setManualExchange] = useState('');
  const [manualCurrency, setManualCurrency] = useState('USD');
  const [manualIsin, setManualIsin] = useState('');

  // Bulk import fields
  const [bulkInput, setBulkInput] = useState('');
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([]);
  const [bulkStep, setBulkStep] = useState<'input' | 'review'>('input');
  const [editingBulkIndex, setEditingBulkIndex] = useState<number | null>(null);

  // Purchased tracking (add as purchased directly)
  const [markAsPurchased, setMarkAsPurchased] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState('');

  // Duplicate check
  const [duplicateWarning, setDuplicateWarning] = useState<{ ticker: string; tabNames: string[] } | null>(null);

  const { settings, addStock, setStockHistoricalData, markAsPurchased: storeMakAsPurchased } = useStore();

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedSymbol(null);
      setBuyLimit('');
      setSelectedTabs([currentTabId]);
      setError('');
      setActiveMode('search');
      setManualTicker('');
      setManualName('');
      setManualExchange('');
      setManualCurrency('USD');
      setManualIsin('');
      setBulkInput('');
      setBulkEntries([]);
      setBulkStep('input');
      setEditingBulkIndex(null);
      setMarkAsPurchased(false);
      setPurchasePrice('');
      setDuplicateWarning(null);
    }
  }, [isOpen, currentTabId]);

  // Parse bulk input into entries
  const parseBulkInput = (input: string): BulkEntry[] => {
    const entries: BulkEntry[] = [];
    // Split by semicolon or newline
    const parts = input.split(/[;\n]/).map(p => p.trim()).filter(p => p);

    for (const part of parts) {
      // Format: TICKER-LIMIT or just TICKER
      const match = part.match(/^([A-Z0-9.]+)(?:\s*[-:]\s*(\d+(?:\.\d+)?))?$/i);
      if (match) {
        const ticker = match[1].toUpperCase();
        const limit = match[2] ? parseFloat(match[2]) : null;
        entries.push({
          ticker,
          limit,
          isValid: true,
        });
      } else if (part) {
        // Invalid format
        entries.push({
          ticker: part,
          limit: null,
          isValid: false,
          error: 'Invalid format (use TICKER-LIMIT)',
        });
      }
    }
    return entries;
  };

  const handleParseBulk = () => {
    const entries = parseBulkInput(bulkInput);
    if (entries.length === 0) {
      setError('No valid entries found. Use format: TICKER-LIMIT;TICKER-LIMIT');
      return;
    }
    setBulkEntries(entries);
    setBulkStep('review');
    setError('');
  };

  const handleUpdateBulkEntry = (index: number, field: 'ticker' | 'limit', value: string) => {
    setBulkEntries(prev => {
      const updated = [...prev];
      if (field === 'ticker') {
        updated[index] = { ...updated[index], ticker: value.toUpperCase(), isValid: !!value.trim() };
      } else {
        const numValue = value === '' ? null : parseFloat(value);
        updated[index] = { ...updated[index], limit: isNaN(numValue as number) ? null : numValue };
      }
      return updated;
    });
  };

  const handleRemoveBulkEntry = (index: number) => {
    setBulkEntries(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddBulkStocks = async () => {
    if (selectedTabs.length === 0) {
      setError('Please select at least one tab');
      return;
    }

    const validEntries = bulkEntries.filter(e => e.isValid && e.ticker.trim());
    if (validEntries.length === 0) {
      setError('No valid stocks to add');
      return;
    }

    setIsAdding(true);
    setError('');

    const api = getStockAPI(settings.apiKey, settings.apiProvider);

    for (const entry of validEntries) {
      try {
        // Try to fetch stock data
        const stockData = await api.fetchStockData(entry.ticker);
        const finalData = stockData || {
          ticker: entry.ticker,
          name: entry.ticker,
          currentPrice: 0,
          previousClose: 0,
          dayChange: 0,
          dayChangePercent: 0,
          week52High: 0,
          week52Low: 0,
          currency: 'USD',
          exchange: '',
          historicalData: [],
        };

        for (const tabId of selectedTabs) {
          addStock(tabId, {
            ticker: finalData.ticker!,
            name: finalData.name!,
            buyLimit: entry.limit,
            currentPrice: finalData.currentPrice!,
            previousClose: finalData.previousClose!,
            dayChange: finalData.dayChange!,
            dayChangePercent: finalData.dayChangePercent!,
            week52High: finalData.week52High!,
            week52Low: finalData.week52Low!,
            chartTimeframe: '30d',
            currency: finalData.currency!,
            exchange: finalData.exchange!,
          });

          if (finalData.historicalData && finalData.historicalData.length > 0) {
            const tab = tabs.find((t) => t.id === tabId);
            const addedStock = tab?.stocks.find((s) => s.ticker === finalData.ticker);
            if (addedStock) {
              setStockHistoricalData(tabId, addedStock.id, finalData.historicalData);
            }
          }
        }

        // Small delay between API calls
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        // Add with placeholder data on error
        for (const tabId of selectedTabs) {
          addStock(tabId, {
            ticker: entry.ticker,
            name: entry.ticker,
            buyLimit: entry.limit,
            currentPrice: 0,
            previousClose: 0,
            dayChange: 0,
            dayChangePercent: 0,
            week52High: 0,
            week52Low: 0,
            chartTimeframe: '30d',
            currency: 'USD',
            exchange: '',
          });
        }
      }
    }

    setIsAdding(false);
    onClose();
  };

  // Debounced search
  const searchStocks = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      const api = getStockAPI(settings.apiKey, settings.apiProvider);
      const results = await api.searchSymbols(query);
      setSearchResults(results);
    } catch {
      setError('Failed to search stocks. Check your API key.');
    } finally {
      setIsSearching(false);
    }
  }, [settings.apiKey, settings.apiProvider]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      searchStocks(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchStocks]);

  // Fuzzy search in current results (also search by ISIN-like patterns)
  const fuse = new Fuse(searchResults, {
    keys: ['symbol', 'name'],
    threshold: 0.4,
  });

  const filteredResults = searchQuery
    ? fuse.search(searchQuery).map((r) => r.item)
    : searchResults;

  const handleSelectSymbol = (result: SearchResult) => {
    setSelectedSymbol(result);
  };

  const checkDuplicate = (ticker: string): { ticker: string; tabNames: string[] } | null => {
    const currentTabs = useStore.getState().tabs;
    const purchased = useStore.getState().purchasedStocks;
    const foundInTabs: string[] = [];
    const tickerUpper = ticker.toUpperCase();

    for (const tab of currentTabs) {
      if (tab.stocks.some(s => s.ticker.toUpperCase() === tickerUpper)) {
        foundInTabs.push(tab.name);
      }
    }
    if (purchased.some(s => s.ticker.toUpperCase() === tickerUpper)) {
      foundInTabs.push('Gekocht');
    }

    return foundInTabs.length > 0 ? { ticker: tickerUpper, tabNames: foundInTabs } : null;
  };

  const handleAddStock = async () => {
    if (!selectedSymbol) return;
    if (selectedTabs.length === 0) {
      setError('Please select at least one tab');
      return;
    }

    // Duplicate check (if not already confirmed)
    if (!duplicateWarning) {
      const dup = checkDuplicate(selectedSymbol.symbol);
      if (dup) {
        setDuplicateWarning(dup);
        return;
      }
    }
    setDuplicateWarning(null);

    setIsAdding(true);
    setError('');

    const limitValue = buyLimit.trim() === '' ? null : parseFloat(buyLimit);
    if (limitValue !== null && (isNaN(limitValue) || limitValue <= 0)) {
      setError('Buy limit must be a positive number');
      setIsAdding(false);
      return;
    }

    try {
      const api = getStockAPI(settings.apiKey, settings.apiProvider);
      const stockData = await api.fetchStockData(selectedSymbol.symbol);

      // Use fetched data or fallback to placeholder
      const finalData = stockData || {
        ticker: selectedSymbol.symbol,
        name: selectedSymbol.name,
        currentPrice: 0,
        previousClose: 0,
        dayChange: 0,
        dayChangePercent: 0,
        week52High: 0,
        week52Low: 0,
        currency: selectedSymbol.currency || 'USD',
        exchange: selectedSymbol.exchange || '',
        historicalData: [],
      };

      // Add to selected tabs
      const purchasePriceValue = markAsPurchased
        ? (parseFloat(purchasePrice) || finalData.currentPrice || 0)
        : null;

      for (const tabId of selectedTabs) {
        addStock(tabId, {
          ticker: finalData.ticker!,
          name: finalData.name!,
          buyLimit: limitValue,
          currentPrice: finalData.currentPrice!,
          previousClose: finalData.previousClose!,
          dayChange: finalData.dayChange!,
          dayChangePercent: finalData.dayChangePercent!,
          week52High: finalData.week52High!,
          week52Low: finalData.week52Low!,
          chartTimeframe: '30d',
          currency: finalData.currency!,
          exchange: finalData.exchange!,
        });

        // Set historical data separately (read fresh state after addStock)
        const currentState = useStore.getState();
        const updatedTab = currentState.tabs.find((t) => t.id === tabId);
        if (updatedTab && finalData.historicalData && finalData.historicalData.length > 0) {
          const addedStock = updatedTab.stocks.find((s) => s.ticker === finalData.ticker);
          if (addedStock) {
            setStockHistoricalData(tabId, addedStock.id, finalData.historicalData);
          }
        }

        // If marking as purchased, move to purchasedStocks immediately
        if (markAsPurchased && purchasePriceValue && purchasePriceValue > 0) {
          const freshState = useStore.getState();
          const freshTab = freshState.tabs.find((t) => t.id === tabId);
          const addedStock = freshTab?.stocks.find((s) => s.ticker === finalData.ticker);
          if (addedStock) {
            storeMakAsPurchased(tabId, addedStock.id, purchasePriceValue);
          }
          break; // Only add to first tab if marking as purchased
        }
      }

      onClose();
    } catch {
      // Even on error, add with placeholder data
      for (const tabId of selectedTabs) {
        addStock(tabId, {
          ticker: selectedSymbol.symbol,
          name: selectedSymbol.name,
          buyLimit: limitValue,
          currentPrice: 0,
          previousClose: 0,
          dayChange: 0,
          dayChangePercent: 0,
          week52High: 0,
          week52Low: 0,
          chartTimeframe: '30d',
          currency: selectedSymbol.currency || 'USD',
          exchange: selectedSymbol.exchange || '',
        });
      }
      onClose();
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddManualStock = async () => {
    if (!manualTicker.trim()) {
      setError('Ticker is required');
      return;
    }
    if (selectedTabs.length === 0) {
      setError('Please select at least one tab');
      return;
    }

    // Duplicate check (if not already confirmed)
    if (!duplicateWarning) {
      const dup = checkDuplicate(manualTicker.trim());
      if (dup) {
        setDuplicateWarning(dup);
        return;
      }
    }
    setDuplicateWarning(null);

    setIsAdding(true);
    setError('');

    const limitValue = buyLimit.trim() === '' ? null : parseFloat(buyLimit);
    if (limitValue !== null && (isNaN(limitValue) || limitValue <= 0)) {
      setError('Buy limit must be a positive number');
      setIsAdding(false);
      return;
    }

    // Try to fetch data for the manual ticker
    try {
      const api = getStockAPI(settings.apiKey, settings.apiProvider);
      const stockData = await api.fetchStockData(manualTicker.trim());

      const finalData = stockData || {
        ticker: manualTicker.trim().toUpperCase(),
        name: manualName.trim() || manualTicker.trim().toUpperCase(),
        currentPrice: 0,
        previousClose: 0,
        dayChange: 0,
        dayChangePercent: 0,
        week52High: 0,
        week52Low: 0,
        currency: manualCurrency || 'USD',
        exchange: manualExchange || '',
        historicalData: [],
      };

      const purchasePriceValue = markAsPurchased
        ? (parseFloat(purchasePrice) || finalData.currentPrice || 0)
        : null;

      for (const tabId of selectedTabs) {
        addStock(tabId, {
          ticker: finalData.ticker!,
          name: manualName.trim() || finalData.name!,
          buyLimit: limitValue,
          currentPrice: finalData.currentPrice!,
          previousClose: finalData.previousClose!,
          dayChange: finalData.dayChange!,
          dayChangePercent: finalData.dayChangePercent!,
          week52High: finalData.week52High!,
          week52Low: finalData.week52Low!,
          chartTimeframe: '30d',
          currency: manualCurrency || finalData.currency!,
          exchange: manualExchange || finalData.exchange!,
          isin: manualIsin.trim() || undefined,
        });

        // Set historical data (read fresh state after addStock)
        const currentState = useStore.getState();
        const updatedTab = currentState.tabs.find((t) => t.id === tabId);
        if (updatedTab && finalData.historicalData && finalData.historicalData.length > 0) {
          const addedStock = updatedTab.stocks.find((s) => s.ticker === finalData.ticker);
          if (addedStock) {
            setStockHistoricalData(tabId, addedStock.id, finalData.historicalData);
          }
        }

        // If marking as purchased, move to purchasedStocks immediately
        if (markAsPurchased && purchasePriceValue && purchasePriceValue > 0) {
          const freshState = useStore.getState();
          const freshTab = freshState.tabs.find((t) => t.id === tabId);
          const addedStock = freshTab?.stocks.find((s) => s.ticker === finalData.ticker);
          if (addedStock) {
            storeMakAsPurchased(tabId, addedStock.id, purchasePriceValue);
          }
          break; // Only add to first tab if marking as purchased
        }
      }

      onClose();
    } catch {
      // Add with placeholder data
      const purchasePriceValue = markAsPurchased
        ? (parseFloat(purchasePrice) || 0)
        : null;

      for (const tabId of selectedTabs) {
        addStock(tabId, {
          ticker: manualTicker.trim().toUpperCase(),
          name: manualName.trim() || manualTicker.trim().toUpperCase(),
          buyLimit: limitValue,
          currentPrice: 0,
          previousClose: 0,
          dayChange: 0,
          dayChangePercent: 0,
          week52High: 0,
          week52Low: 0,
          chartTimeframe: '30d',
          currency: manualCurrency || 'USD',
          exchange: manualExchange || '',
          isin: manualIsin.trim() || undefined,
        });

        // If marking as purchased, move to purchasedStocks immediately
        if (markAsPurchased && purchasePriceValue && purchasePriceValue > 0) {
          const freshState = useStore.getState();
          const freshTab = freshState.tabs.find((t) => t.id === tabId);
          const addedStock = freshTab?.stocks.find((s) => s.ticker === manualTicker.trim().toUpperCase());
          if (addedStock) {
            storeMakAsPurchased(tabId, addedStock.id, purchasePriceValue);
          }
          break;
        }
      }
      onClose();
    } finally {
      setIsAdding(false);
    }
  };

  const toggleTab = (tabId: string) => {
    setSelectedTabs((prev) =>
      prev.includes(tabId)
        ? prev.filter((id) => id !== tabId)
        : [...prev, tabId]
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Stock" size="xl">
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveMode('search')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeMode === 'search'
                ? 'bg-[#00ff88] text-black'
                : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => {
              setActiveMode('manual');
              setSelectedSymbol(null);
              if (searchQuery.trim()) {
                setManualTicker(searchQuery.toUpperCase());
              }
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
              activeMode === 'manual'
                ? 'bg-[#00ff88] text-black'
                : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
            }`}
          >
            <PlusIcon className="w-4 h-4" />
            Manual
          </button>
          <button
            onClick={() => {
              setActiveMode('bulk');
              setSelectedSymbol(null);
              setBulkStep('input');
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
              activeMode === 'bulk'
                ? 'bg-[#00ff88] text-black'
                : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
            }`}
          >
            <DocumentTextIcon className="w-4 h-4" />
            Bulk
          </button>
        </div>

        {activeMode === 'search' && (
          <>
            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ticker, company name, or ISIN..."
                className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-white/30"
                autoFocus
              />
            </div>

            {/* Search Results */}
            {!selectedSymbol && (
              <div className="max-h-80 overflow-y-auto">
                {isSearching ? (
                  <div className="text-center text-gray-400 py-4">Searching...</div>
                ) : filteredResults.length > 0 ? (
                  <div className="space-y-1">
                    {filteredResults.map((result) => (
                      <button
                        key={`${result.symbol}-${result.exchange}`}
                        onClick={() => handleSelectSymbol(result)}
                        className="w-full text-left p-3 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-lg transition-colors"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getCountryFlag(result.exchange, result.currency)}</span>
                            <span className="font-medium text-white font-mono">
                              {result.symbol}
                            </span>
                            <span className="text-xs text-gray-500">
                              {result.exchange}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono px-2 py-0.5 bg-[#3d3d3d] rounded text-gray-300">
                              {result.currency}
                            </span>
                            <span className="text-xs text-gray-500">{result.type}</span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-400 truncate mt-1">
                          {result.name}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : searchQuery.length > 0 ? (
                  <div className="text-center py-4">
                    <p className="text-gray-400 mb-2">No results found</p>
                    <button
                      onClick={() => {
                        setActiveMode('manual');
                        setManualTicker(searchQuery.toUpperCase());
                      }}
                      className="text-[#00ff88] hover:underline text-sm"
                    >
                      Add "{searchQuery.toUpperCase()}" manually
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    Type to search for stocks by ticker, name, or ISIN
                  </div>
                )}
              </div>
            )}

            {/* Selected Stock */}
            {selectedSymbol && (
              <>
                <div className="bg-[#2d2d2d] rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getCountryFlag(selectedSymbol.exchange, selectedSymbol.currency)}</span>
                      <span className="font-medium text-white font-mono">
                        {selectedSymbol.symbol}
                      </span>
                      <span className="text-xs text-gray-500">
                        {selectedSymbol.exchange}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 bg-[#3d3d3d] rounded text-gray-300">
                        {selectedSymbol.currency}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedSymbol(null)}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Change
                    </button>
                  </div>
                  <div className="text-sm text-gray-400 mt-1">{selectedSymbol.name}</div>
                </div>

                {/* Buy Limit */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Buy Limit (optional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {getCurrencySymbol(selectedSymbol.currency)}
                    </span>
                    <input
                      type="number"
                      value={buyLimit}
                      onChange={(e) => setBuyLimit(e.target.value)}
                      placeholder="Enter buy limit"
                      className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-white/30"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>

                {/* Mark as Purchased Toggle */}
                <div className="border border-[#3d3d3d] rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm text-white font-medium">💰 Direct als gekocht markeren</label>
                      <p className="text-xs text-gray-500">
                        Voeg toe aan Gekocht tab ipv watchlist
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setMarkAsPurchased(!markAsPurchased);
                        if (!markAsPurchased && !purchasePrice) {
                          setPurchasePrice(buyLimit || '');
                        }
                      }}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        markAsPurchased ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        markAsPurchased ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  {markAsPurchased && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Aankoopprijs</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          {getCurrencySymbol(selectedSymbol.currency)}
                        </span>
                        <input
                          type="number"
                          value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                          placeholder="Aankoopprijs"
                          className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-white/30"
                          step="0.01"
                          min="0"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Tab Selection */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Add to tabs
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => toggleTab(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          selectedTabs.includes(tab.id)
                            ? 'text-white'
                            : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
                        }`}
                        style={{
                          backgroundColor: selectedTabs.includes(tab.id)
                            ? tab.accentColor
                            : undefined,
                        }}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && <p className="text-sm text-[#ff3366]">{error}</p>}

                {/* Duplicate Warning */}
                {duplicateWarning && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-sm text-yellow-400 font-medium mb-2">
                      ⚠ {duplicateWarning.ticker} bestaat al in: {duplicateWarning.tabNames.join(', ')}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          handleAddStock();
                        }}
                        className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-black text-sm font-medium rounded transition-colors"
                      >
                        Toch toevoegen
                      </button>
                      <button
                        onClick={() => setDuplicateWarning(null)}
                        className="px-3 py-1 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded transition-colors"
                      >
                        Annuleer
                      </button>
                    </div>
                  </div>
                )}

                {/* Add Button */}
                <button
                  onClick={handleAddStock}
                  disabled={isAdding}
                  className="w-full py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:bg-[#3d3d3d] disabled:text-gray-500 text-black font-medium rounded-lg transition-colors"
                >
                  {isAdding ? 'Adding...' : 'Add Stock'}
                </button>
              </>
            )}
          </>
        )}

        {activeMode === 'manual' && (
          /* Manual Entry Form */
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Ticker <span className="text-[#ff3366]">*</span>
                </label>
                <input
                  type="text"
                  value={manualTicker}
                  onChange={(e) => setManualTicker(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL"
                  className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white font-mono focus:outline-none focus:border-white/30"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  ISIN (optional)
                </label>
                <input
                  type="text"
                  value={manualIsin}
                  onChange={(e) => setManualIsin(e.target.value.toUpperCase())}
                  placeholder="e.g., US0378331005"
                  className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white font-mono focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g., Apple Inc."
                className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Exchange
                </label>
                <input
                  type="text"
                  value={manualExchange}
                  onChange={(e) => setManualExchange(e.target.value.toUpperCase())}
                  placeholder="e.g., NASDAQ, LUX"
                  className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Currency
                </label>
                <select
                  value={manualCurrency}
                  onChange={(e) => setManualCurrency(e.target.value)}
                  className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="GBX">GBX (p)</option>
                  <option value="CAD">CAD (C$)</option>
                  <option value="CHF">CHF</option>
                  <option value="JPY">JPY (¥)</option>
                  <option value="CNY">CNY (¥)</option>
                  <option value="HKD">HKD (HK$)</option>
                  <option value="AUD">AUD (A$)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="KRW">KRW (₩)</option>
                  <option value="SGD">SGD (S$)</option>
                  <option value="BRL">BRL (R$)</option>
                  <option value="SEK">SEK (kr)</option>
                  <option value="NOK">NOK (kr)</option>
                  <option value="DKK">DKK (kr)</option>
                  <option value="PLN">PLN (zł)</option>
                  <option value="TWD">TWD (NT$)</option>
                  <option value="NZD">NZD (NZ$)</option>
                </select>
              </div>
            </div>

            {/* Buy Limit */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Buy Limit (optional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {getCurrencySymbol(manualCurrency)}
                </span>
                <input
                  type="number"
                  value={buyLimit}
                  onChange={(e) => setBuyLimit(e.target.value)}
                  placeholder="Enter buy limit"
                  className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-white/30"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            {/* Mark as Purchased Toggle */}
            <div className="border border-[#3d3d3d] rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-white font-medium">💰 Direct als gekocht markeren</label>
                  <p className="text-xs text-gray-500">
                    Voeg toe aan Gekocht tab ipv watchlist
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMarkAsPurchased(!markAsPurchased);
                    if (!markAsPurchased && !purchasePrice) {
                      setPurchasePrice(buyLimit || '');
                    }
                  }}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    markAsPurchased ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    markAsPurchased ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
              {markAsPurchased && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Aankoopprijs</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {getCurrencySymbol(manualCurrency)}
                    </span>
                    <input
                      type="number"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="Aankoopprijs"
                      className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-white/30"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Tab Selection */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Add to tabs
              </label>
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => toggleTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedTabs.includes(tab.id)
                        ? 'text-white'
                        : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
                    }`}
                    style={{
                      backgroundColor: selectedTabs.includes(tab.id)
                        ? tab.accentColor
                        : undefined,
                    }}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Stock data will sync automatically when API resources are available.
              Use this for stocks not found in search (e.g., Luxembourg exchange).
            </p>

            {/* Error */}
            {error && <p className="text-sm text-[#ff3366]">{error}</p>}

            {/* Duplicate Warning */}
            {duplicateWarning && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <p className="text-sm text-yellow-400 font-medium mb-2">
                  ⚠ {duplicateWarning.ticker} bestaat al in: {duplicateWarning.tabNames.join(', ')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleAddManualStock();
                    }}
                    className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-black text-sm font-medium rounded transition-colors"
                  >
                    Toch toevoegen
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="px-3 py-1 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded transition-colors"
                  >
                    Annuleer
                  </button>
                </div>
              </div>
            )}

            {/* Add Button */}
            <button
              onClick={handleAddManualStock}
              disabled={isAdding || !manualTicker.trim()}
              className="w-full py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:bg-[#3d3d3d] disabled:text-gray-500 text-black font-medium rounded-lg transition-colors"
            >
              {isAdding ? 'Adding...' : 'Add Stock'}
            </button>
          </>
        )}

        {activeMode === 'bulk' && (
          /* Bulk Import Form */
          <>
            {bulkStep === 'input' ? (
              <>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Paste stocks (format: TICKER-LIMIT;TICKER-LIMIT or one per line)
                  </label>
                  <textarea
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value.toUpperCase())}
                    placeholder="AAPL-150;MSFT-400;GOOGL-140&#10;or one per line:&#10;AAPL-150&#10;MSFT-400&#10;GOOGL-140"
                    className="w-full h-40 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white font-mono text-sm focus:outline-none focus:border-white/30 resize-none"
                    autoFocus
                  />
                </div>

                <p className="text-xs text-gray-500">
                  Format: TICKER-LIMIT (e.g., AAPL-150) or just TICKER (e.g., AAPL).
                  Separate multiple stocks with ; or new lines.
                </p>

                {/* Error */}
                {error && <p className="text-sm text-[#ff3366]">{error}</p>}

                {/* Parse Button */}
                <button
                  onClick={handleParseBulk}
                  disabled={!bulkInput.trim()}
                  className="w-full py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:bg-[#3d3d3d] disabled:text-gray-500 text-black font-medium rounded-lg transition-colors"
                >
                  Preview Stocks
                </button>
              </>
            ) : (
              <>
                {/* Review list */}
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {bulkEntries.map((entry, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 p-2 rounded-lg ${
                        entry.isValid ? 'bg-[#2d2d2d]' : 'bg-red-500/20 border border-red-500/50'
                      }`}
                    >
                      {editingBulkIndex === index ? (
                        <>
                          <input
                            type="text"
                            value={entry.ticker}
                            onChange={(e) => handleUpdateBulkEntry(index, 'ticker', e.target.value)}
                            className="flex-1 bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-white font-mono text-sm"
                            placeholder="TICKER"
                          />
                          <input
                            type="number"
                            value={entry.limit ?? ''}
                            onChange={(e) => handleUpdateBulkEntry(index, 'limit', e.target.value)}
                            className="w-24 bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-white text-sm"
                            placeholder="Limit"
                          />
                          <button
                            onClick={() => setEditingBulkIndex(null)}
                            className="p-1 text-[#00ff88] hover:bg-[#00ff88]/20 rounded"
                          >
                            <CheckIcon className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 font-mono text-white">{entry.ticker}</span>
                          <span className="text-gray-400 text-sm">
                            {entry.limit !== null ? `$${entry.limit}` : 'No limit'}
                          </span>
                          <button
                            onClick={() => setEditingBulkIndex(index)}
                            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveBulkEntry(index)}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-sm text-gray-400">
                  {bulkEntries.filter(e => e.isValid).length} valid stock(s) ready to add
                </p>

                {/* Tab Selection */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Add to tabs
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => toggleTab(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          selectedTabs.includes(tab.id)
                            ? 'text-white'
                            : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
                        }`}
                        style={{
                          backgroundColor: selectedTabs.includes(tab.id)
                            ? tab.accentColor
                            : undefined,
                        }}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && <p className="text-sm text-[#ff3366]">{error}</p>}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setBulkStep('input')}
                    className="flex-1 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-300 font-medium rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAddBulkStocks}
                    disabled={isAdding || bulkEntries.filter(e => e.isValid).length === 0}
                    className="flex-1 py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:bg-[#3d3d3d] disabled:text-gray-500 text-black font-medium rounded-lg transition-colors"
                  >
                    {isAdding ? 'Adding...' : `Add ${bulkEntries.filter(e => e.isValid).length} Stocks`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
