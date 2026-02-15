'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Cog6ToothIcon,
  ArrowPathIcon,
  ArchiveBoxIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  AdjustmentsHorizontalIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  ArrowsRightLeftIcon,
  CommandLineIcon,
  QueueListIcon,
  PlayIcon,
  PauseIcon,
  CalendarDaysIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { useStore, selectActiveTab, enableAutoSync } from '@/lib/defog/store';
import { checkAndAutoDownload, subscribeSyncStatus, type SyncStatus } from '@/lib/defog/services/autoSync';
import { getCurrentUser, onAuthStateChange } from '@/lib/defog/services/supabase';
import { getStockAPI, configureMultiApi, getStockCacheStatus, getHistoricalCacheStatus, isStockUnavailable } from '@/lib/defog/services/stockApi';
import { getUsageStats, getAvailableRequests, RATE_LIMITS } from '@/lib/defog/services/rateLimiter';
import { shouldRunWeekendTask, runWeekendTask, canRunWeekendTaskManually, type WeekendTaskProgress } from '@/lib/defog/services/weekendTask';
import { saveToLocalStorage, getSessionPassword } from '@/lib/defog/utils/storage';
import { clearCacheForSymbol } from '@/lib/defog/services/persistentCache';
import { buildPrioritizedScanQueue, isWithinScanHours, formatScanReason, type ScanPriority } from '@/lib/defog/services/autoScanService';
import { VERSION } from '@/lib/defog/version';
import {
  sendPushNotification,
  createBuySignalNotification,
  createThresholdNotification,
  createDailyDropNotification,
  initInstallPrompt,
} from '@/lib/defog/services/notifications';
import type { Stock, SortField, ChartTimeframe, ColorScheme, FontSize, RangePeriod, ColumnVisibility, ColumnStyles, ColumnKey, ColumnStyle, ScanStatus, ApiProvider } from '@/lib/defog/types';
import { RefreshQueueModal } from './RefreshQueueModal';
import { ScanLogModal } from './ScanLogModal';
import { UndoModal } from './UndoModal';
import { startAutoBackup } from '@/lib/defog/services/backupService';
import { MiniTilesView, type TileSortMode } from './MiniTilesView';

// Color scheme configurations
const COLOR_SCHEMES: Record<ColorScheme, { bg: string; bgCard: string; border: string }> = {
  dark: { bg: '#1a1a1a', bgCard: '#2d2d2d', border: '#3d3d3d' },
  midnight: { bg: '#0f172a', bgCard: '#1e293b', border: '#334155' },
  ocean: { bg: '#0c1929', bgCard: '#162438', border: '#1e3a5f' },
  forest: { bg: '#14201a', bgCard: '#1a2f23', border: '#264032' },
};

// Font size configurations
const FONT_SIZES: Record<FontSize, string> = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
};

// Range period options
const RANGE_PERIODS: { value: RangePeriod; label: string }[] = [
  { value: '1y', label: '52W' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
];

import { TabBar } from './TabBar';
import { StockCard } from './StockCard';
import { MobileStockCard } from './MobileStockCard';
import { BuySignals } from './BuySignals';
import { AddStockModal } from './AddStockModal';
import { EditStockModal } from './EditStockModal';
import { SearchBar } from './SearchBar';
import { Notifications } from './Notifications';
import { Settings } from './Settings';
import { DefogLogo } from './DefogLogo';
import { Archive } from './Archive';
import { DebugPanel } from './DebugPanel';
import { TopMovers } from './TopMovers';
import { PurchasedStocks } from './PurchasedStocks';
import { useViewMode } from '@/lib/defog/useViewMode';

export function Dashboard() {
  const store = useStore();
  const activeTab = useStore(selectActiveTab);

  const [showAddStock, setShowAddStock] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showScanLogModal, setShowScanLogModal] = useState(false);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [currentlyScanning, setCurrentlyScanning] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [isRefreshingArchive, setIsRefreshingArchive] = useState(false);
  const [weekendTaskProgress, setWeekendTaskProgress] = useState<WeekendTaskProgress | null>(null);
  const [autoScanCountdown, setAutoScanCountdown] = useState<number>(0);
  const autoScanTimerRef = useRef<number | null>(null);
  const [isManualWeekendTaskRunning, setIsManualWeekendTaskRunning] = useState(false);

  // Dashboard view: list or tiles (separate from mobile/desktop view mode)
  const [dashboardView, setDashboardView] = useState<'list' | 'tiles'>(() => {
    try { return (localStorage.getItem('defog-dashboard-view') as 'list' | 'tiles') || 'list'; } catch { return 'list'; }
  });
  const [tileSortMode, setTileSortMode] = useState<TileSortMode>('default');

  const handleDashboardViewChange = useCallback((view: 'list' | 'tiles') => {
    setDashboardView(view);
    try { localStorage.setItem('defog-dashboard-view', view); } catch { /* ignore */ }
  }, []);

  // View mode hook for mobile/desktop switching
  const { isMobileView, viewMode, setViewMode } = useViewMode(
    store.settings.viewMode || 'auto'
  );

  // Save view mode to store when changed
  const handleViewModeChange = useCallback((mode: typeof viewMode) => {
    setViewMode(mode);
    store.updateSettings({ viewMode: mode });
  }, [setViewMode, store]);

  // Get buy signals
  const buySignals = store.getBuySignals();

  // Initialize PWA install prompt listener
  useEffect(() => {
    initInstallPrompt();
  }, []);

  // Initialize auto-sync
  useEffect(() => {
    // Subscribe to sync status changes
    const unsubscribe = subscribeSyncStatus(setSyncStatus);

    // Check if user is logged in and enable auto-sync
    const initAutoSync = async () => {
      const user = await getCurrentUser();
      if (user) {
        console.log('[Dashboard] User logged in, enabling auto-sync');
        enableAutoSync();

        // Check if we should auto-download newer cloud data
        const { shouldDownload, cloudData, message } = await checkAndAutoDownload();
        console.log('[Dashboard] Auto-download check:', message);

        if (shouldDownload && cloudData) {
          console.log('[Dashboard] Downloading newer cloud data...');
          store.loadCloudData(cloudData);
        }
      }
    };

    initAutoSync();

    // Also listen for auth state changes
    const unsubscribeAuth = onAuthStateChange((user) => {
      if (user) {
        console.log('[Dashboard] Auth state changed - user logged in');
        enableAutoSync();
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeAuth) unsubscribeAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Weekend background task for 5-year range data
  useEffect(() => {
    if (!store.settings.apiKey || store.tabs.length === 0) return;

    // Check if we should run the weekend task
    if (!shouldRunWeekendTask()) return;

    // Collect all stocks
    const allStocks: Array<{ tabId: string; stock: Stock }> = [];
    for (const tab of store.tabs) {
      for (const stock of tab.stocks) {
        allStocks.push({ tabId: tab.id, stock });
      }
    }

    if (allStocks.length === 0) return;

    console.log('[Dashboard] Starting weekend background task...');

    // Run the weekend task
    runWeekendTask(
      allStocks,
      store.settings.apiKey,
      store.settings.apiProvider,
      store.settings.apiKeys || [],
      (progress) => setWeekendTaskProgress(progress),
      (update) => {
        // Update the stock with new range data
        store.updateStock(update.tabId, update.stockId, {
          year3High: update.year3High,
          year3Low: update.year3Low,
          year5High: update.year5High,
          year5Low: update.year5Low,
        });
      }
    ).then(() => {
      // Clear progress after a delay
      setTimeout(() => setWeekendTaskProgress(null), 3000);
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.settings.apiKey, store.tabs.length]);

  // Manual weekend task trigger handler
  const handleManualWeekendTask = useCallback(async () => {
    if (!store.settings.apiKey || isManualWeekendTaskRunning) return;

    // Collect all stocks
    const allStocks: Array<{ tabId: string; stock: Stock }> = [];
    for (const tab of store.tabs) {
      for (const stock of tab.stocks) {
        allStocks.push({ tabId: tab.id, stock });
      }
    }

    if (allStocks.length === 0) return;

    setIsManualWeekendTaskRunning(true);
    console.log('[Dashboard] Starting manual 5-year data fetch...');

    try {
      await runWeekendTask(
        allStocks,
        store.settings.apiKey,
        store.settings.apiProvider,
        store.settings.apiKeys || [],
        (progress) => setWeekendTaskProgress(progress),
        (update) => {
          store.updateStock(update.tabId, update.stockId, {
            year3High: update.year3High,
            year3Low: update.year3Low,
            year5High: update.year5High,
            year5Low: update.year5Low,
          });
        }
      );

      // Clear progress after a delay
      setTimeout(() => setWeekendTaskProgress(null), 3000);
    } finally {
      setIsManualWeekendTaskRunning(false);
    }
  }, [store, isManualWeekendTaskRunning]);

  // Get range period from settings
  const rangePeriod = store.settings.rangePeriod || '1y';

  // Get column visibility from settings - use mobile or desktop settings based on view
  // IMPORTANT: Merge with defaults so new columns (like lastRefresh) get default values
  const defaultDesktopVisibility: ColumnVisibility = {
    name: true,
    price: true,
    limit: true,
    distance: true,
    dayChange: true,
    range: true,
    rangeDelta: true,
    chart: true,
    currency: true,
    lastRefresh: true,
    custom: false,
  };
  const desktopColumnVisibility: ColumnVisibility = {
    ...defaultDesktopVisibility,
    ...store.settings.columnVisibility,
  };

  const defaultMobileVisibility: ColumnVisibility = {
    name: false,
    price: true,
    limit: false,
    distance: true,
    dayChange: true,
    range: false,
    rangeDelta: false,
    chart: false,
    currency: true,
    lastRefresh: false,
    custom: false,
  };
  const mobileColumnVisibility: ColumnVisibility = {
    ...defaultMobileVisibility,
    ...store.settings.mobileColumnVisibility,
  };

  // Select visibility based on current view mode
  const columnVisibility = isMobileView ? mobileColumnVisibility : desktopColumnVisibility;

  // Default column styles
  const defaultColumnStyles: ColumnStyles = {
    name: { width: 120, fontColor: 'accent', fontSize: 'sm', fontWeight: 'semibold' },
    ticker: { width: 80, fontColor: 'accent', fontSize: 'sm', fontWeight: 'semibold' },
    price: { width: 85, fontColor: '#ffffff', fontSize: 'sm', fontWeight: 'normal' },
    limit: { width: 85, fontColor: '#d1d5db', fontSize: 'sm', fontWeight: 'normal' },
    distance: { width: 200, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    dayChange: { width: 70, fontColor: 'dynamic', fontSize: 'sm', fontWeight: 'bold' },
    range: { width: 180, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'bold' },
    rangeDelta: { width: 70, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    chart: { width: 100, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    currency: { width: 50, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    lastRefresh: { width: 80, fontColor: 'dynamic', fontSize: 'xs', fontWeight: 'normal' },
  };

  // Get column styles from settings (merge with defaults so new properties are always present)
  const columnStyles: ColumnStyles = store.settings.columnStyles
    ? Object.fromEntries(
        Object.entries(defaultColumnStyles).map(([k, def]) => [
          k,
          { ...def, ...(store.settings.columnStyles as ColumnStyles)?.[k as ColumnKey] },
        ])
      ) as ColumnStyles
    : defaultColumnStyles;

  // Toggle column visibility
  const toggleColumn = (column: keyof ColumnVisibility) => {
    store.updateSettings({
      columnVisibility: {
        ...columnVisibility,
        [column]: !columnVisibility[column],
      },
    });
  };

  // Update column style
  const updateColumnStyle = (column: ColumnKey, updates: Partial<ColumnStyle>) => {
    store.updateSettings({
      columnStyles: {
        ...columnStyles,
        [column]: { ...columnStyles[column], ...updates },
      },
    });
  };

  // Auto-save on state changes
  useEffect(() => {
    const password = getSessionPassword();
    if (password && store.isAuthenticated) {
      const saveState = async () => {
        await saveToLocalStorage(
          {
            tabs: store.tabs,
            archive: store.archive,
            notifications: store.notifications,
            limitHistory: store.limitHistory,
            settings: store.settings,
            lastSyncTime: new Date().toISOString(),
            encryptionKeyHash: store.encryptionKeyHash,
          },
          password
        );
      };

      const debounce = setTimeout(saveState, 1000);
      return () => clearTimeout(debounce);
    }
  }, [
    store.tabs,
    store.archive,
    store.notifications,
    store.limitHistory,
    store.settings,
    store.isAuthenticated,
    store.encryptionKeyHash,
  ]);

  // Ref to prevent concurrent refreshes and track if refresh is running
  const isRefreshingRef = useRef(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; ticker: string } | null>(null);
  const [apiStatus, setApiStatus] = useState<{ used: number; limit: number; available: number } | null>(null);

  // Update API status periodically
  useEffect(() => {
    const updateStatus = () => {
      const provider = store.settings.apiProvider || 'twelvedata';
      const stats = getUsageStats(provider);
      const available = getAvailableRequests(provider);
      setApiStatus({
        used: stats.dayUsed,
        limit: stats.dayLimit,
        available,
      });
    };
    updateStatus();
    const interval = setInterval(updateStatus, 5000);
    return () => clearInterval(interval);
  }, [store.settings.apiProvider]);

  // Queue management for manual refresh order
  const QUEUE_ORDER_KEY = 'defog-refresh-queue-order';

  // Build queue items from all stocks across all tabs with smart priority
  const buildQueueItems = useCallback(() => {
    const items: Array<{ tabId: string; tabName: string; tabColor: string; stock: Stock; priority?: number; priorityReasons?: string[] }> = [];

    // Get prioritized queue from auto-scan service
    const prioritizedQueue = buildPrioritizedScanQueue(store.tabs, { onlyOpenMarkets: false, weights: store.settings.scanPriorityWeights });
    const priorityMap = new Map<string, ScanPriority>();
    for (const item of prioritizedQueue) {
      priorityMap.set(item.stock.id, item);
    }

    for (const tab of store.tabs) {
      for (const stock of tab.stocks) {
        const scanPriority = priorityMap.get(stock.id);
        items.push({
          tabId: tab.id,
          tabName: tab.name,
          tabColor: tab.accentColor,
          stock,
          priority: scanPriority?.score,
          priorityReasons: scanPriority?.reasons,
        });
      }
    }

    // First, check if there's a stored order override
    try {
      const storedOrder = localStorage.getItem(QUEUE_ORDER_KEY);
      if (storedOrder) {
        const orderMap = JSON.parse(storedOrder) as Record<string, number>;
        // Use stored order if it exists
        items.sort((a, b) => {
          const posA = orderMap[a.stock.id] ?? 9999;
          const posB = orderMap[b.stock.id] ?? 9999;
          return posA - posB;
        });
      } else {
        // Default sort by smart priority
        items.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
      }
    } catch {
      // On error, sort by priority
      items.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    }

    return items;
  }, [store.tabs]);

  // Save queue order to localStorage
  const saveQueueOrder = useCallback((items: Array<{ tabId: string; stock: Stock }>) => {
    const orderMap: Record<string, number> = {};
    items.forEach((item, index) => {
      orderMap[item.stock.id] = index;
    });
    try {
      localStorage.setItem(QUEUE_ORDER_KEY, JSON.stringify(orderMap));
    } catch { /* ignore */ }
  }, []);

  // Handle queue reorder from modal
  const handleQueueReorder = useCallback((items: Array<{ tabId: string; tabName: string; tabColor: string; stock: Stock }>) => {
    saveQueueOrder(items);
  }, [saveQueueOrder]);

  // Refresh a single stock immediately
  const refreshSingleStock = useCallback(async (
    item: { tabId: string; stock: Stock },
    specificProvider?: ApiProvider,
    scanType: 'auto' | 'manual' | 'batch' | 'single' = 'single',
    scanReasons: string[] = []
  ) => {
    if (!store.settings.apiKey) return;

    const api = getStockAPI(store.settings.apiKey, store.settings.apiProvider);
    configureMultiApi(store.settings.apiKeys || []);

    setCurrentlyScanning(item.stock.ticker);
    const previousPrice = item.stock.currentPrice;
    const scanStartTime = Date.now();

    // Use stock's preferred provider if set, or the specified provider
    const providerToUse = specificProvider ||
      (item.stock.preferredProvider && item.stock.preferredProvider !== 'auto'
        ? item.stock.preferredProvider
        : undefined);

    // Get tab name for logging
    const tab = store.tabs.find(t => t.id === item.tabId);
    const tabName = tab?.name || 'Unknown';

    try {
      console.log(`[Dashboard] Refreshing ${item.stock.ticker}${providerToUse ? ` with provider: ${providerToUse}` : ' (auto)'}`);
      const result = await api.fetchStockWithFallback(item.stock.ticker, item.stock.exchange, {
        needsHistorical: !item.stock.historicalData || item.stock.historicalData.length === 0,
        forceProvider: providerToUse,
      });

      const scanDuration = Date.now() - scanStartTime;

      if (result.data && result.data.currentPrice && result.data.currentPrice > 0) {
        // Success!
        const data = result.data;
        const newPrice = data.currentPrice!; // Guaranteed by the condition above
        const priceChange = previousPrice && previousPrice > 0
          ? ((newPrice - previousPrice) / previousPrice) * 100
          : null;

        store.updateStock(item.tabId, item.stock.id, {
          currentPrice: data.currentPrice,
          previousClose: data.previousClose,
          dayChange: data.dayChange,
          dayChangePercent: data.dayChangePercent,
          week52High: data.week52High,
          week52Low: data.week52Low,
          unavailableProviders: undefined,
          unavailableReason: undefined,
          lastScanStatus: {
            type: 'success',
            timestamp: new Date().toISOString(),
            message: previousPrice !== data.currentPrice
              ? `Prijs: ${previousPrice?.toFixed(2)} → ${data.currentPrice?.toFixed(2)}`
              : 'Geen prijswijziging',
            previousPrice,
            newPrice: data.currentPrice,
            provider: providerToUse || store.settings.apiProvider,
          },
        });

        if (result.data.historicalData && result.data.historicalData.length > 0) {
          store.setStockHistoricalData(item.tabId, item.stock.id, result.data.historicalData);
        }

        // Log successful scan
        store.addScanLogEntry({
          ticker: item.stock.ticker,
          stockId: item.stock.id,
          tabName,
          type: scanType,
          result: 'success',
          previousPrice: previousPrice || null,
          newPrice,
          priceChange,
          provider: providerToUse || store.settings.apiProvider,
          duration: scanDuration,
          reasons: scanReasons,
        });
      } else if (result.unavailableProviders && result.unavailableProviders.length > 0) {
        // Failed on all providers
        store.updateStock(item.tabId, item.stock.id, {
          unavailableProviders: result.unavailableProviders,
          unavailableReason: result.unavailableReason,
          lastScanStatus: {
            type: 'failed',
            timestamp: new Date().toISOString(),
            message: result.unavailableReason || 'Scan mislukt',
            failedProviders: result.unavailableProviders,
          },
        });

        // Log failed scan
        store.addScanLogEntry({
          ticker: item.stock.ticker,
          stockId: item.stock.id,
          tabName,
          type: scanType,
          result: 'failed',
          previousPrice: previousPrice || null,
          newPrice: null,
          priceChange: null,
          provider: null,
          duration: scanDuration,
          reasons: scanReasons,
          error: result.unavailableReason || 'Alle providers mislukt',
        });
      }

      // Move this stock to bottom of queue
      const currentItems = buildQueueItems();
      const itemIndex = currentItems.findIndex(i => i.stock.id === item.stock.id);
      if (itemIndex !== -1 && itemIndex !== currentItems.length - 1) {
        const [scannedItem] = currentItems.splice(itemIndex, 1);
        currentItems.push(scannedItem);
        saveQueueOrder(currentItems);
      }
    } catch (error) {
      const scanDuration = Date.now() - scanStartTime;
      console.error(`Failed to refresh ${item.stock.ticker}:`, error);
      store.updateStock(item.tabId, item.stock.id, {
        lastScanStatus: {
          type: 'failed',
          timestamp: new Date().toISOString(),
          message: 'Netwerkfout',
        },
      });

      // Log error scan
      store.addScanLogEntry({
        ticker: item.stock.ticker,
        stockId: item.stock.id,
        tabName,
        type: scanType,
        result: 'failed',
        previousPrice: previousPrice || null,
        newPrice: null,
        priceChange: null,
        provider: null,
        duration: scanDuration,
        reasons: scanReasons,
        error: error instanceof Error ? error.message : 'Netwerkfout',
      });
    } finally {
      setCurrentlyScanning(null);
    }
  }, [store, buildQueueItems, saveQueueOrder]);

  // Refresh multiple selected stocks
  const refreshSelectedStocks = useCallback(async (
    items: Array<{ tabId: string; stock: Stock }>,
    specificProvider?: ApiProvider
  ) => {
    if (!store.settings.apiKey || items.length === 0) return;

    configureMultiApi(store.settings.apiKeys || []);
    const limits = RATE_LIMITS[specificProvider || store.settings.apiProvider || 'twelvedata'];

    console.log(`[Dashboard] Refreshing ${items.length} stocks${specificProvider ? ` with provider: ${specificProvider}` : ' (auto)'}`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await refreshSingleStock(item, specificProvider, 'batch', [`Batch ${i + 1}/${items.length}`]);

      // Wait between requests
      if (i < items.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, limits.minDelayMs));
      }
    }
  }, [store.settings.apiKey, store.settings.apiProvider, store.settings.apiKeys, refreshSingleStock]);

  // Refresh archived stock prices
  const refreshArchivedPrices = useCallback(async () => {
    if (!store.settings.apiKey || store.archive.length === 0) return;

    setIsRefreshingArchive(true);
    const api = getStockAPI(store.settings.apiKey, store.settings.apiProvider);
    configureMultiApi(store.settings.apiKeys || []);
    const limits = RATE_LIMITS[store.settings.apiProvider || 'twelvedata'];

    console.log(`[Dashboard] Refreshing ${store.archive.length} archived stock prices...`);

    for (let i = 0; i < store.archive.length; i++) {
      const archivedStock = store.archive[i];

      try {
        console.log(`[Dashboard] Fetching price for archived stock: ${archivedStock.ticker}`);
        const result = await api.fetchStockWithFallback(archivedStock.ticker, archivedStock.exchange, {
          needsHistorical: false,
        });

        if (result.data && result.data.currentPrice && result.data.currentPrice > 0) {
          store.updateArchivedStockPrice(
            archivedStock.id,
            result.data.currentPrice,
            archivedStock.exchange
          );
          console.log(`[Dashboard] Updated ${archivedStock.ticker}: ${result.data.currentPrice}`);
        }
      } catch (error) {
        console.error(`[Dashboard] Failed to refresh ${archivedStock.ticker}:`, error);
      }

      // Rate limit between requests
      if (i < store.archive.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, limits.minDelayMs));
      }
    }

    setIsRefreshingArchive(false);
    console.log('[Dashboard] Finished refreshing archived stock prices');
  }, [store.settings.apiKey, store.settings.apiProvider, store.settings.apiKeys, store.archive]);

  // Build available providers list for the queue modal
  const availableProviders = useMemo(() => {
    const providers: Array<{ provider: ApiProvider; name: string }> = [];

    // Add primary provider
    if (store.settings.apiKey) {
      const providerNames: Record<ApiProvider, string> = {
        twelvedata: 'Twelve Data',
        alphavantage: 'Alpha Vantage',
        fmp: 'FMP',
        yahoo: 'Yahoo Finance',
      };
      providers.push({
        provider: store.settings.apiProvider,
        name: providerNames[store.settings.apiProvider] || store.settings.apiProvider,
      });
    }

    // Add additional providers
    for (const config of store.settings.apiKeys || []) {
      if (config.enabled && config.apiKey && config.provider !== store.settings.apiProvider) {
        const providerNames: Record<ApiProvider, string> = {
          twelvedata: 'Twelve Data',
          alphavantage: 'Alpha Vantage',
          fmp: 'FMP',
          yahoo: 'Yahoo Finance',
        };
        providers.push({
          provider: config.provider,
          name: providerNames[config.provider] || config.provider,
        });
      }
    }

    return providers;
  }, [store.settings.apiKey, store.settings.apiProvider, store.settings.apiKeys]);

  // Smart refresh - VERY conservative with API calls
  // Twelve Data free tier: 8 calls per MINUTE, 800 per DAY
  const refreshStocks = useCallback(async () => {
    // Prevent concurrent refreshes
    if (isRefreshingRef.current) {
      console.log('Refresh already in progress, skipping...');
      return;
    }

    if (!store.settings.apiKey) return;

    // Check rate limits FIRST
    const provider = store.settings.apiProvider || 'twelvedata';
    const available = getAvailableRequests(provider);
    const limits = RATE_LIMITS[provider];

    if (available <= 0) {
      const stats = getUsageStats(provider);
      console.warn(`API rate limit reached! ${stats.dayUsed}/${stats.dayLimit} daily calls used.`);
      console.warn(`Minute limit: ${stats.minuteUsed}/${stats.minuteLimit}. Wait ${Math.ceil(stats.minuteResetIn / 1000)}s.`);
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      const api = getStockAPI(store.settings.apiKey, store.settings.apiProvider);
      // Configure multi-API for fallback support
      configureMultiApi(store.settings.apiKeys || []);

      // Collect all stocks using queue order (manual priority)
      const queueItems = buildQueueItems();
      const allStocks: { tabId: string; stock: Stock }[] = queueItems.map(item => ({
        tabId: item.tabId,
        stock: item.stock,
      }));

      // Filter based on market status and cache freshness
      const stocksToRefresh: { tabId: string; stock: Stock; needsHistorical: boolean; priority: number }[] = [];
      let skippedCount = 0;
      let unavailableCount = 0;

      // Get list of configured providers
      const configuredProviders = [store.settings.apiProvider];
      for (const config of store.settings.apiKeys || []) {
        if (config.enabled && config.apiKey && !configuredProviders.includes(config.provider)) {
          configuredProviders.push(config.provider);
        }
      }
      console.log(`[Dashboard] Configured providers: ${configuredProviders.join(', ')}`);

      for (const { tabId, stock } of allStocks) {
        // Check if stock is marked as unavailable on all providers
        const unavailabilityCheck = isStockUnavailable(stock.ticker, configuredProviders);
        if (unavailabilityCheck.unavailable) {
          console.log(`[Dashboard] Skipping ${stock.ticker} - unavailable: ${unavailabilityCheck.reason}`);
          unavailableCount++;
          // Update stock with unavailability info if not already set
          if (!stock.unavailableReason) {
            store.updateStock(tabId, stock.id, {
              unavailableProviders: configuredProviders,
              unavailableReason: unavailabilityCheck.reason,
            });
          }
          continue;  // Skip this stock
        }

        const quoteCacheStatus = getStockCacheStatus(stock.ticker, stock.exchange);
        const histCacheStatus = getHistoricalCacheStatus(stock.ticker);

        // NEVER skip stocks with price 0 - they ALWAYS need refresh
        const hasNoPrice = !stock.currentPrice || stock.currentPrice === 0;

        // Skip quote refresh if cache is fresh
        const skipQuote = !hasNoPrice && (
          (quoteCacheStatus.cached && !quoteCacheStatus.stale) ||
          (!quoteCacheStatus.marketOpen && quoteCacheStatus.cached &&
           quoteCacheStatus.ageMinutes !== null && quoteCacheStatus.ageMinutes < 240)
        );

        if (skipQuote) {
          skippedCount++;
          continue;
        }

        // Historical data: only refresh if completely missing or > 24 hours old
        // This is a COSTLY call, so be very conservative
        const needsHistorical = !histCacheStatus.cached ||
          (histCacheStatus.ageMinutes !== null && histCacheStatus.ageMinutes > 24 * 60);

        // Calculate priority: lower number = higher priority
        // Priority based on rainbow bar fill level (closer to limit = more blocks = higher priority)
        // 0 = Critical - stock has no price!
        // 1 = Buy Signal stocks (at or below buy limit) - most urgent
        // 2 = Close to limit (9-12 blocks, ≤16% distance) - high priority
        // 3 = Medium distance (6-8 blocks, 16-64%) - medium priority
        // 4 = Charts won't show (no historical data)
        // 5 = Far from limit (1-5 blocks, 64-2048%) - lower priority
        // 6 = No limit set (buyLimit null or 0) - lowest priority, needs user action
        let priority = 6;

        if (hasNoPrice) {
          priority = 0; // Critical - stock has no price!
        } else if (stock.buyLimit === null || stock.buyLimit === 0) {
          priority = 6; // No limit set - user needs to configure this
        } else {
          // Calculate distance to buy limit
          const distancePercent = ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100;

          if (distancePercent <= 0) {
            priority = 1; // Buy Signal - at or below limit
          } else if (distancePercent <= 16) {
            priority = 2; // Close to limit (9-12 rainbow blocks) - high priority
          } else if (distancePercent <= 64) {
            priority = 3; // Medium distance (6-8 blocks) - medium priority
          } else if (!stock.historicalData || stock.historicalData.length === 0) {
            priority = 4; // Charts won't show
          } else {
            priority = 5; // Far from limit - lower priority
          }
        }

        stocksToRefresh.push({ tabId, stock, needsHistorical, priority });
      }

      // Sort by priority
      stocksToRefresh.sort((a, b) => a.priority - b.priority);

      // CRITICAL: Limit how many stocks we refresh per batch
      // With 8 calls/minute limit, we can only do ~4 stocks per minute (quote + historical)
      // But we want to be even more conservative to leave room for search, etc.
      const MAX_STOCKS_PER_BATCH = Math.min(
        limits.perMinute - 1,  // Leave 1 call for search/other
        Math.floor(available / 2),  // Each stock may need 2 calls
        stocksToRefresh.length
      );

      const batchToRefresh = stocksToRefresh.slice(0, MAX_STOCKS_PER_BATCH);

      const quoteCallsNeeded = batchToRefresh.length;
      const historicalCallsNeeded = batchToRefresh.filter(s => s.needsHistorical).length;
      const totalCallsNeeded = quoteCallsNeeded + historicalCallsNeeded;

      console.log(`Smart refresh: ${batchToRefresh.length}/${stocksToRefresh.length} stocks this batch`);
      console.log(`  - Total needing refresh: ${stocksToRefresh.length}/${allStocks.length}`);
      console.log(`  - Skipped (cache fresh): ${skippedCount}`);
      console.log(`  - Skipped (unavailable): ${unavailableCount}`);
      console.log(`  - API calls this batch: ~${totalCallsNeeded}`);
      console.log(`  - Available: ${available}/${limits.perDay}`);

      if (batchToRefresh.length === 0) {
        console.log('All stocks have fresh cache. No API calls needed!');
        setLastRefresh(new Date());
        return;
      }

      setRefreshProgress({ current: 0, total: batchToRefresh.length, ticker: '' });

      // Refresh only the stocks in this batch
      for (let i = 0; i < batchToRefresh.length; i++) {
        const { tabId, stock, needsHistorical, priority } = batchToRefresh[i];
        const previousPrice = stock.currentPrice;
        const scanStartTime = Date.now();

        // Get tab name for logging
        const tab = store.tabs.find(t => t.id === tabId);
        const tabName = tab?.name || 'Unknown';

        setRefreshProgress({ current: i + 1, total: batchToRefresh.length, ticker: stock.ticker });
        setCurrentlyScanning(stock.ticker);

        try {
          // Use stock's preferred provider if set, otherwise try all
          const stockProvider = stock.preferredProvider && stock.preferredProvider !== 'auto'
            ? stock.preferredProvider
            : undefined;

          // Use fetchStockWithFallback to try multiple providers
          console.log(`[Dashboard] Fetching ${stock.ticker}${stockProvider ? ` with provider: ${stockProvider}` : ' with fallback...'}`);
          const result = await api.fetchStockWithFallback(stock.ticker, stock.exchange, {
            needsHistorical,
            skipProviders: stock.unavailableProviders, // Skip known unavailable providers
            forceProvider: stockProvider,
          });
          console.log(`[Dashboard] Result for ${stock.ticker}:`, result.data ? 'success' : `failed (${result.unavailableReason})`);

          if (result.data) {
            const data = result.data;
            const currentPrice = data.currentPrice ?? 0; // Ensure we have a number
            const scanStatus: ScanStatus = {
              type: 'success',
              timestamp: new Date().toISOString(),
              message: previousPrice !== currentPrice
                ? `Prijs: ${previousPrice?.toFixed(2)} → ${currentPrice.toFixed(2)}`
                : 'Geen prijswijziging',
              previousPrice,
              newPrice: currentPrice,
              provider: store.settings.apiProvider,
            };

            store.updateStock(tabId, stock.id, {
              currentPrice,
              previousClose: data.previousClose,
              dayChange: data.dayChange,
              dayChangePercent: data.dayChangePercent,
              week52High: data.week52High,
              week52Low: data.week52Low,
              // Clear unavailability if fetch succeeded
              unavailableProviders: undefined,
              unavailableReason: undefined,
              lastScanStatus: scanStatus,
            });

            // Only update historical data if we fetched it
            if (needsHistorical && data.historicalData && data.historicalData.length > 0) {
              store.setStockHistoricalData(tabId, stock.id, data.historicalData);
            }

            // Log successful scan
            const scanDuration = Date.now() - scanStartTime;
            const priceChange = previousPrice && previousPrice > 0
              ? ((currentPrice - previousPrice) / previousPrice) * 100
              : null;
            store.addScanLogEntry({
              ticker: stock.ticker,
              stockId: stock.id,
              tabName,
              type: 'manual',
              result: 'success',
              previousPrice: previousPrice || null,
              newPrice: currentPrice,
              priceChange,
              provider: store.settings.apiProvider,
              duration: scanDuration,
              reasons: [`Priority ${priority}`, `Batch ${i + 1}/${batchToRefresh.length}`],
            });

            // Check for notifications
            if (store.settings.notifications.enabled && currentPrice) {
              const quietHours = store.settings.notifications.quietHours;
              const pushEnabled = store.settings.notifications.pushEnabled;
              const now = new Date();
              const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

              // Helper to check if a similar notification was created in last 24h
              const hasRecentNotification = (stockId: string, type: string, threshold?: number) => {
                return store.notifications.some((n) => {
                  if (n.stockId !== stockId) return false;
                  if (n.type !== type) return false;
                  if (threshold !== undefined && n.threshold !== threshold) return false;
                  const createdAt = new Date(n.createdAt);
                  return createdAt > hours24Ago;
                });
              };

              // Check daily drop alert
              if (store.settings.notifications.dailyDropAlert && data.dayChangePercent) {
                const dropThreshold = store.settings.notifications.dailyDropAlert;
                if (data.dayChangePercent <= -dropThreshold) {
                  // Check if we already sent a drop alert today
                  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const dropNotifExists = store.notifications.some(
                    (n) =>
                      n.stockId === stock.id &&
                      n.type === 'loss_alert' &&
                      new Date(n.createdAt) > todayStart
                  );

                  if (!dropNotifExists) {
                    store.addNotification({
                      stockId: stock.id,
                      ticker: stock.ticker,
                      message: `${stock.ticker} is ${Math.abs(data.dayChangePercent).toFixed(1)}% gedaald vandaag`,
                      threshold: dropThreshold,
                      type: 'loss_alert',
                    });

                    if (pushEnabled) {
                      sendPushNotification(
                        createDailyDropNotification(
                          stock.ticker,
                          data.dayChangePercent,
                          currentPrice,
                          stock.currency
                        ),
                        quietHours
                      );
                    }
                  }
                }
              }

              // Check buy limit alerts
              if (stock.buyLimit !== null) {
                const distance =
                  ((currentPrice - stock.buyLimit) / stock.buyLimit) * 100;

                for (const threshold of store.settings.notifications.thresholds) {
                  if (distance <= threshold && distance > 0) {
                    // Check if we sent this threshold notification in last 24h
                    if (!hasRecentNotification(stock.id, 'threshold_alert', threshold)) {
                      store.addNotification({
                        stockId: stock.id,
                        ticker: stock.ticker,
                        message: `${stock.ticker} is binnen ${threshold}% van je kooplimiet`,
                        threshold,
                        type: 'threshold_alert',
                      });

                      if (pushEnabled) {
                        sendPushNotification(
                          createThresholdNotification(
                            stock.ticker,
                            threshold,
                            currentPrice,
                            stock.buyLimit,
                            stock.currency
                          ),
                          quietHours
                        );
                      }
                    }
                  }
                }

                if (distance <= 0) {
                  // Check if we sent buy signal in last 24h
                  if (!hasRecentNotification(stock.id, 'buy_signal')) {
                    store.addNotification({
                      stockId: stock.id,
                      ticker: stock.ticker,
                      message: `${stock.ticker} heeft je kooplimiet bereikt!`,
                      threshold: 0,
                      type: 'buy_signal',
                    });

                    if (pushEnabled) {
                      sendPushNotification(
                        createBuySignalNotification(
                          stock.ticker,
                          currentPrice,
                          stock.buyLimit,
                          stock.currency
                        ),
                        quietHours
                      );
                    }
                  }
                }
              }
            }
          } else if (result.unavailableProviders && result.unavailableProviders.length > 0) {
            // All providers failed - mark stock as unavailable
            console.warn(`[Dashboard] Stock ${stock.ticker} unavailable: ${result.unavailableReason}`);
            store.updateStock(tabId, stock.id, {
              unavailableProviders: result.unavailableProviders,
              unavailableReason: result.unavailableReason,
              lastScanStatus: {
                type: 'failed',
                timestamp: new Date().toISOString(),
                message: result.unavailableReason || 'Scan mislukt bij alle providers',
                failedProviders: result.unavailableProviders,
              },
            });

            // Log failed scan
            const scanDuration = Date.now() - scanStartTime;
            store.addScanLogEntry({
              ticker: stock.ticker,
              stockId: stock.id,
              tabName,
              type: 'manual',
              result: 'failed',
              previousPrice: previousPrice || null,
              newPrice: null,
              priceChange: null,
              provider: null,
              duration: scanDuration,
              reasons: [`Priority ${priority}`, `Batch ${i + 1}/${batchToRefresh.length}`],
              error: result.unavailableReason || 'Alle providers mislukt',
            });
          }
        } catch (error) {
          console.error(`Failed to refresh ${stock.ticker}:`, error);
          store.updateStock(tabId, stock.id, {
            lastScanStatus: {
              type: 'failed',
              timestamp: new Date().toISOString(),
              message: 'Netwerkfout',
            },
          });

          // Log error scan
          const scanDuration = Date.now() - scanStartTime;
          store.addScanLogEntry({
            ticker: stock.ticker,
            stockId: stock.id,
            tabName,
            type: 'manual',
            result: 'failed',
            previousPrice: previousPrice || null,
            newPrice: null,
            priceChange: null,
            provider: null,
            duration: scanDuration,
            reasons: [`Priority ${priority}`, `Batch ${i + 1}/${batchToRefresh.length}`],
            error: error instanceof Error ? error.message : 'Netwerkfout',
          });
        }

        // Move scanned stock to bottom of queue
        const currentItems = buildQueueItems();
        const itemIndex = currentItems.findIndex(item => item.stock.id === stock.id);
        if (itemIndex !== -1 && itemIndex !== currentItems.length - 1) {
          const [scannedItem] = currentItems.splice(itemIndex, 1);
          currentItems.push(scannedItem);
          saveQueueOrder(currentItems);
        }

        setCurrentlyScanning(null);

        // CRITICAL: Wait minimum delay between requests (8 seconds for Twelve Data)
        // This is enforced by the rate limiter, but we add extra safety
        if (i < batchToRefresh.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, limits.minDelayMs));
        }
      }

      setLastRefresh(new Date());
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.settings.apiKey, store.settings.apiProvider]);

  // Smart auto-refresh - scans during market hours with smart priority
  // EU stocks: 9:00 - 18:30 CET, US stocks: 15:30 - 22:00 CET
  // Priority for:
  //   1. Stocks not scanned recently
  //   2. Stocks with high volatility
  //   3. Stocks close to buy limit (<15%)
  useEffect(() => {
    if (!store.settings.apiKey) return;
    if (!store.settings.autoScanEnabled) {
      console.log('[AutoScan] Auto-scan disabled');
      setAutoScanCountdown(0);
      return;
    }

    // Scan every 5 minutes to stay within free tier limits
    const AUTO_SCAN_INTERVAL = 5 * 60 * 1000; // 5 minutes

    const autoScan = async () => {
      // Reset countdown timer
      autoScanTimerRef.current = Date.now() + AUTO_SCAN_INTERVAL;
      setAutoScanCountdown(AUTO_SCAN_INTERVAL / 1000);

      // Check if any stocks should be scanned based on market hours
      const hasStocksToScan = store.tabs.some(tab =>
        tab.stocks.some(stock => isWithinScanHours(stock.exchange || ''))
      );

      if (!hasStocksToScan) {
        console.log('[AutoScan] No stocks within scan hours, skipping...');
        return;
      }

      // Build prioritized queue
      const queue = buildPrioritizedScanQueue(store.tabs, {
        onlyOpenMarkets: true,
        maxStocks: 1, // Only scan 1 stock at a time for rate limiting
      });

      if (queue.length === 0) {
        console.log('[AutoScan] No stocks to scan (all up to date or outside market hours)');
        return;
      }

      const topPriority = queue[0];
      console.log(`[AutoScan] Scanning ${topPriority.stock.ticker} (priority: ${topPriority.score}, reasons: ${formatScanReason(topPriority.reasons)})`);

      // Scan the highest priority stock with auto scan type and reasons
      await refreshSingleStock(
        { tabId: topPriority.tabId, stock: topPriority.stock },
        undefined,
        'auto',
        topPriority.reasons
      );
    };

    // Set initial countdown
    autoScanTimerRef.current = Date.now() + AUTO_SCAN_INTERVAL;
    setAutoScanCountdown(AUTO_SCAN_INTERVAL / 1000);

    // Run immediately when enabled
    autoScan();

    // Set up interval for auto-scanning
    const interval = setInterval(autoScan, AUTO_SCAN_INTERVAL);

    // Also allow manual refresh at the user's configured interval (but using smart queue)
    const manualInterval = setInterval(refreshStocks, store.settings.updateInterval);

    return () => {
      clearInterval(interval);
      clearInterval(manualInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.settings.apiKey, store.settings.updateInterval, store.settings.autoScanEnabled, store.tabs]);

  // Start auto backup service
  useEffect(() => {
    startAutoBackup(() => ({
      tabs: store.tabs,
      archive: store.archive,
      purchasedStocks: store.purchasedStocks,
      settings: store.settings,
      limitHistory: store.limitHistory || [],
    }));
    // Only start once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update countdown timer every second
  useEffect(() => {
    if (!store.settings.autoScanEnabled || !autoScanTimerRef.current) {
      return;
    }

    const updateCountdown = () => {
      if (autoScanTimerRef.current) {
        const remaining = Math.max(0, Math.floor((autoScanTimerRef.current - Date.now()) / 1000));
        setAutoScanCountdown(remaining);
      }
    };

    const countdownInterval = setInterval(updateCountdown, 1000);
    return () => clearInterval(countdownInterval);
  }, [store.settings.autoScanEnabled]);

  // Check if we're in "All" view, "Top Movers" view, or "Purchased" view
  const isAllView = store.activeTabId === '__all__';
  const isTopMoversView = store.activeTabId === '__topmovers__';
  const isPurchasedView = store.activeTabId === '__purchased__';

  // Get all stocks from all tabs (for "All" view), deduplicated cross-tab AND within-tab
  const allStocksWithTabs = useMemo(() => {
    const result: Array<{ stock: Stock; tabId: string; tabName: string; tabColor: string }> = [];
    // Multiple keys to catch duplicates: normalized name, base ticker, AND full ticker
    const seenKeys = new Set<string>();

    const addKey = (key: string) => seenKeys.add(key.trim().toUpperCase());
    const hasKey = (key: string) => seenKeys.has(key.trim().toUpperCase());

    for (const tab of store.tabs) {
      for (const stock of tab.stocks) {
        // Base ticker: strip exchange suffix (SES.SI → SES, 0J9J.L → 0J9J)
        const ticker = stock.ticker.trim();
        const dotIdx = ticker.indexOf('.');
        const baseTicker = dotIdx > 0 ? ticker.substring(0, dotIdx) : ticker;

        // Normalized company name: strip common suffixes
        const normName = stock.name
          .toLowerCase()
          .replace(/[.,]/g, '')
          .replace(/\b(inc|corp|corporation|ltd|limited|plc|ag|sa|nv|se|co|company|group|holdings|international)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Skip if ANY key matches a previously seen stock
        if (hasKey(`T:${ticker}`) || hasKey(`B:${baseTicker}`) || (normName && hasKey(`N:${normName}`))) {
          continue;
        }

        // Register all keys for this stock
        addKey(`T:${ticker}`);
        addKey(`B:${baseTicker}`);
        if (normName) addKey(`N:${normName}`);

        result.push({ stock, tabId: tab.id, tabName: tab.name, tabColor: tab.accentColor });
      }
    }
    return result;
  }, [store.tabs]);

  // Top movers: top 10 gainers and top 10 losers
  const topMovers = useMemo(() => {
    const sorted = [...allStocksWithTabs].sort((a, b) => b.stock.dayChangePercent - a.stock.dayChangePercent);
    const gainers = sorted.filter(s => s.stock.dayChangePercent > 0).slice(0, 10);
    const losers = sorted.filter(s => s.stock.dayChangePercent < 0).slice(-10).reverse();
    return { gainers, losers };
  }, [allStocksWithTabs]);

  // Purchased stocks: from the separate purchasedStocks array
  // Sorted by profit percentage (highest profit first)
  const purchasedStocksWithProfit = useMemo(() => {
    return store.purchasedStocks
      .map(stock => ({
        stock,
        tabId: stock.originalTabId,
        tabName: stock.originalTabName,
        tabColor: stock.originalTabColor,
        profitPercent: stock.purchasedPrice && stock.currentPrice
          ? ((stock.currentPrice - stock.purchasedPrice) / stock.purchasedPrice) * 100
          : 0,
      }))
      .sort((a, b) => b.profitPercent - a.profitPercent); // Highest profit first
  }, [store.purchasedStocks]);

  // Sort stocks
  const sortedStocks = useMemo(() => {
    // Helper: stocks with price 0 (not yet scanned) always sort to bottom
    const priceZeroSort = (a: Stock, b: Stock, normalCompare: () => number) => {
      const aZero = a.currentPrice <= 0;
      const bZero = b.currentPrice <= 0;
      if (aZero && !bZero) return 1;  // a to bottom
      if (!aZero && bZero) return -1; // b to bottom
      if (aZero && bZero) return a.ticker.localeCompare(b.ticker); // both zero: alphabetical
      return normalCompare();
    };

    // For "All" view, combine all stocks and sort by distance to limit
    if (isAllView) {
      const stocks = allStocksWithTabs.map(s => s.stock);
      return stocks.sort((a, b) => priceZeroSort(a, b, () => {
        const distA = a.buyLimit !== null ? ((a.currentPrice - a.buyLimit) / a.buyLimit) * 100 : Infinity;
        const distB = b.buyLimit !== null ? ((b.currentPrice - b.buyLimit) / b.buyLimit) * 100 : Infinity;
        return distA - distB;
      }));
    }

    if (!activeTab) return [];

    const stocks = [...activeTab.stocks];

    stocks.sort((a, b) => priceZeroSort(a, b, () => {
      let comparison = 0;

      switch (activeTab.sortField) {
        case 'ticker':
          comparison = a.ticker.localeCompare(b.ticker);
          break;
        case 'currentPrice':
          comparison = a.currentPrice - b.currentPrice;
          break;
        case 'distanceToLimit':
          const distA =
            a.buyLimit !== null
              ? ((a.currentPrice - a.buyLimit) / a.buyLimit) * 100
              : Infinity;
          const distB =
            b.buyLimit !== null
              ? ((b.currentPrice - b.buyLimit) / b.buyLimit) * 100
              : Infinity;
          comparison = distA - distB;
          break;
        case 'dayChangePercent':
          comparison = a.dayChangePercent - b.dayChangePercent;
          break;
      }

      return activeTab.sortDirection === 'asc' ? comparison : -comparison;
    }));

    return stocks;
  }, [activeTab, isAllView, allStocksWithTabs]);

  const handleSort = (field: SortField) => {
    if (!activeTab) return;

    const newDirection =
      activeTab.sortField === field && activeTab.sortDirection === 'asc'
        ? 'desc'
        : 'asc';

    store.setSortPreference(activeTab.id, field, newDirection);
  };

  const handleLogout = () => {
    store.setAuthenticated(false);
    sessionStorage.clear();
    window.location.reload();
  };

  const handleStockSelect = (tabId: string, stock: Stock) => {
    store.setActiveTab(tabId);
    setEditingStock(stock);
  };

  const handleTimeframeChange = (
    stockId: string,
    timeframe: ChartTimeframe
  ) => {
    if (activeTab) {
      store.setStockChartTimeframe(activeTab.id, stockId, timeframe);
    }
  };

  const handleRangePeriodChange = (period: RangePeriod) => {
    store.updateSettings({ rangePeriod: period });
  };

  // Stock selection handlers
  const handleStockToggle = (stockId: string, selected: boolean) => {
    setSelectedStocks((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(stockId);
      } else {
        next.delete(stockId);
      }
      return next;
    });
  };

  const handleSelectAll = (selectAll: boolean) => {
    if (selectAll && activeTab) {
      setSelectedStocks(new Set(activeTab.stocks.map((s) => s.id)));
    } else {
      setSelectedStocks(new Set());
    }
  };

  const handleMoveStocks = (targetTabId: string) => {
    if (!activeTab || selectedStocks.size === 0) return;

    // Get stocks to move
    const stocksToMove = activeTab.stocks.filter((s) => selectedStocks.has(s.id));

    // Add to target tab
    for (const stock of stocksToMove) {
      store.addStock(targetTabId, {
        ticker: stock.ticker,
        name: stock.name,
        buyLimit: stock.buyLimit,
        currentPrice: stock.currentPrice,
        previousClose: stock.previousClose,
        dayChange: stock.dayChange,
        dayChangePercent: stock.dayChangePercent,
        week52High: stock.week52High,
        week52Low: stock.week52Low,
        chartTimeframe: stock.chartTimeframe,
        currency: stock.currency,
        exchange: stock.exchange,
      });

      // Remove from current tab
      store.removeStock(activeTab.id, stock.id);
    }

    // Clear selection
    setSelectedStocks(new Set());
    setShowMoveMenu(false);
  };

  // Clear selection when tab changes
  useEffect(() => {
    setSelectedStocks(new Set());
  }, [store.activeTabId]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (activeTab?.sortField !== field) return null;
    return activeTab.sortDirection === 'asc' ? (
      <ChevronUpIcon className="w-4 h-4" />
    ) : (
      <ChevronDownIcon className="w-4 h-4" />
    );
  };

  // Get current color scheme and font size
  const colorScheme = store.settings.colorScheme || 'dark';
  const fontSize = store.settings.fontSize || 'medium';
  const colors = COLOR_SCHEMES[colorScheme];
  const fontClass = FONT_SIZES[fontSize];

  // Configure multi-API when settings change
  useEffect(() => {
    if (store.settings.apiKeys && store.settings.apiKeys.length > 0) {
      configureMultiApi(store.settings.apiKeys);
    }
  }, [store.settings.apiKeys]);

  if (showArchive) {
    return (
      <div className={`min-h-screen ${fontClass}`} style={{ backgroundColor: colors.bg }}>
        <header style={{ backgroundColor: colors.bgCard, borderBottom: `1px solid ${colors.border}` }}>
          <div className="px-6 py-3 flex items-center justify-between">
            <button
              onClick={() => setShowArchive(false)}
              className="text-gray-400 hover:text-white"
            >
              Back to Watchlist
            </button>
          </div>
        </header>

        <main className="px-6 py-6">
          <Archive
            archive={store.archive}
            onRemove={store.removeFromArchive}
            onClearAll={store.clearArchive}
            onRefresh={refreshArchivedPrices}
            isRefreshing={isRefreshingArchive}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${fontClass}`} style={{ backgroundColor: colors.bg, overflowX: 'clip' }}>
      {/* Header - floating bar with backdrop blur */}
      <header className="backdrop-blur-md shadow-lg shadow-black/30 mx-2 sm:mx-4 mt-2 rounded-xl" style={{ backgroundColor: `${colors.bgCard}dd`, border: `1px solid ${colors.border}` }}>
        <div className="px-4 sm:px-6 py-2 sm:py-3 flex items-center justify-between">
          <button
            onClick={() => {
              // Navigate to first tab (home)
              const firstTab = store.tabs[0];
              if (firstTab) {
                store.setActiveTab(firstTab.id);
              }
            }}
            className="text-lg sm:text-xl font-bold hover:opacity-80 transition-opacity cursor-pointer"
            title="Home"
          >
            <DefogLogo size="md" />
          </button>

          <div className="flex items-center gap-2">
            {/* Get header button visibility settings */}
            {(() => {
              const headerButtons = store.settings.headerButtonVisibility || {
                search: true, apiStatus: true, debugLog: false, refresh: true,
                notifications: true, archive: true, settings: true, syncStatus: true,
              };

              return (
                <>
                  {headerButtons.search && (
                    <SearchBar
                      tabs={store.tabs}
                      onStockSelect={handleStockSelect}
                      onAddNew={() => setShowAddStock(true)}
                    />
                  )}

                  <div className="flex items-center gap-1">
                    {/* Sync Status indicator */}
                    {headerButtons.syncStatus && syncStatus !== 'idle' && (
                      <div
                        className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                          syncStatus === 'uploading' || syncStatus === 'downloading'
                            ? 'bg-blue-500/20 text-blue-400'
                            : syncStatus === 'success'
                            ? 'bg-green-500/20 text-green-400'
                            : syncStatus === 'error'
                            ? 'bg-red-500/20 text-red-400'
                            : ''
                        }`}
                        title={
                          syncStatus === 'uploading' ? 'Uploading to cloud...' :
                          syncStatus === 'downloading' ? 'Downloading from cloud...' :
                          syncStatus === 'success' ? 'Sync complete' :
                          syncStatus === 'error' ? 'Sync error' : ''
                        }
                      >
                        {(syncStatus === 'uploading' || syncStatus === 'downloading') && (
                          <span className="animate-spin">↻</span>
                        )}
                        {syncStatus === 'uploading' ? 'Syncing...' :
                         syncStatus === 'downloading' ? 'Loading...' :
                         syncStatus === 'success' ? 'Synced' :
                         syncStatus === 'error' ? 'Sync Error' : ''}
                      </div>
                    )}
                    {/* API Usage indicator */}
                    {headerButtons.apiStatus && apiStatus && (
                      <div
                        className={`text-xs px-2 py-1 rounded ${
                          apiStatus.available <= 0
                            ? 'bg-red-500/20 text-red-400'
                            : apiStatus.available < 10
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                        title={`API: ${apiStatus.used}/${apiStatus.limit} calls used today. ${apiStatus.available} available now.`}
                      >
                        {apiStatus.available <= 0 ? 'API Limit' : `${apiStatus.available}`}
                      </div>
                    )}
                    {headerButtons.debugLog && (
                      <button
                        onClick={() => setShowDebugPanel(true)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="Debug Log - See API activity"
                      >
                        <CommandLineIcon className="w-5 h-5 text-white" />
                      </button>
                    )}
                    {headerButtons.refresh && (
                      <>
                        {/* Auto-scan toggle with countdown */}
                        <div className="relative flex items-center">
                          <button
                            onClick={() => store.updateSettings({ autoScanEnabled: !store.settings.autoScanEnabled })}
                            className={`p-2 rounded-lg transition-colors ${
                              store.settings.autoScanEnabled
                                ? 'bg-green-500/20 hover:bg-green-500/30'
                                : 'hover:bg-white/10'
                            }`}
                            title={store.settings.autoScanEnabled
                              ? 'Auto-scan actief (elke 5 min) - klik om te stoppen'
                              : 'Auto-scan uit - klik om te starten'
                            }
                          >
                            {store.settings.autoScanEnabled ? (
                              <PauseIcon className="w-5 h-5 text-green-400" />
                            ) : (
                              <PlayIcon className="w-5 h-5 text-white" />
                            )}
                          </button>
                          {/* Countdown indicator */}
                          {store.settings.autoScanEnabled && autoScanCountdown > 0 && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-green-400 font-mono whitespace-nowrap">
                              {Math.floor(autoScanCountdown / 60)}:{(autoScanCountdown % 60).toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setShowQueueModal(true)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          title="Ververs wachtrij beheren"
                        >
                          <QueueListIcon className="w-5 h-5 text-white" />
                        </button>
                        {/* Scan log button */}
                        <button
                          onClick={() => setShowScanLogModal(true)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors relative"
                          title="Scan log bekijken"
                        >
                          <span className="text-lg">🔍</span>
                          {store.scanLog.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-[#00ff88] text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                              {store.scanLog.length > 99 ? '99+' : store.scanLog.length}
                            </span>
                          )}
                        </button>
                        {/* Undo button */}
                        <button
                          onClick={() => setShowUndoModal(true)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors relative"
                          title="Acties ongedaan maken"
                        >
                          <span className="text-lg">↩</span>
                          {store.actionLog.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                              {store.actionLog.length > 99 ? '99+' : store.actionLog.length}
                            </span>
                          )}
                        </button>
                        {/* Manual 5-year data fetch button */}
                        <button
                          onClick={handleManualWeekendTask}
                          disabled={isManualWeekendTaskRunning || !canRunWeekendTaskManually() || (weekendTaskProgress?.status === 'running')}
                          className={`p-2 rounded-lg transition-colors ${
                            weekendTaskProgress?.status === 'running'
                              ? 'bg-purple-500/20'
                              : 'hover:bg-white/10'
                          } ${isManualWeekendTaskRunning || !canRunWeekendTaskManually() ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={
                            weekendTaskProgress?.status === 'running'
                              ? `5Y data ophalen: ${weekendTaskProgress.current}/${weekendTaskProgress.total}`
                              : !canRunWeekendTaskManually()
                              ? '5Y data recent opgehaald (wacht 12u)'
                              : 'Handmatig 5-jaar data ophalen voor alle aandelen'
                          }
                        >
                          <CalendarDaysIcon className={`w-5 h-5 ${
                            weekendTaskProgress?.status === 'running'
                              ? 'text-purple-400'
                              : 'text-white'
                          }`} />
                        </button>
                        <button
                          onClick={refreshStocks}
                          disabled={isRefreshing || (apiStatus !== null && apiStatus.available <= 0)}
                          className={`p-2 hover:bg-white/10 rounded-lg transition-colors ${
                            isRefreshing ? 'animate-spin' : ''
                          } ${apiStatus !== null && apiStatus.available <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={
                            apiStatus && apiStatus.available <= 0
                              ? 'API limit reached - wait for reset'
                              : lastRefresh
                              ? `Last refresh: ${lastRefresh.toLocaleTimeString()}`
                              : 'Refresh stocks'
                          }
                        >
                          <ArrowPathIcon className="w-5 h-5 text-white" />
                        </button>
                      </>
                    )}
                  </div>

                  {headerButtons.notifications && (
                    <Notifications
                      notifications={store.notifications}
                      onMarkRead={store.markNotificationRead}
                      onClearAll={store.clearNotifications}
                    />
                  )}

                  {headerButtons.archive && (
                    <button
                      onClick={() => setShowArchive(true)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Archive"
                    >
                      <ArchiveBoxIcon className="w-5 h-5 text-white" />
                    </button>
                  )}

                  {/* Tiles / List Toggle */}
                  <button
                    onClick={() => handleDashboardViewChange(dashboardView === 'list' ? 'tiles' : 'list')}
                    className={`p-2 hover:bg-white/10 rounded-lg transition-colors ${
                      dashboardView === 'tiles' ? 'bg-white/5' : ''
                    }`}
                    title={dashboardView === 'list' ? 'Switch to mini tiles view' : 'Switch to list view'}
                  >
                    {dashboardView === 'tiles' ? (
                      <QueueListIcon className="w-5 h-5 text-[#00ff88]" />
                    ) : (
                      <Squares2X2Icon className="w-5 h-5 text-white" />
                    )}
                  </button>

                  {/* View Mode Toggle - always visible */}
                  <div className="relative flex items-center">
                    <button
                      onClick={() => {
                        // Cycle through: auto -> mobile -> desktop -> auto
                        const nextMode = viewMode === 'auto' ? 'mobile' : viewMode === 'mobile' ? 'desktop' : 'auto';
                        handleViewModeChange(nextMode);
                      }}
                      className={`p-2 hover:bg-white/10 rounded-lg transition-colors ${
                        viewMode !== 'auto' ? 'bg-white/5' : ''
                      }`}
                      title={`View: ${viewMode === 'auto' ? 'Auto' : viewMode === 'mobile' ? 'Mobile' : 'Desktop'} (click to change)`}
                    >
                      {viewMode === 'auto' ? (
                        <ArrowsRightLeftIcon className="w-5 h-5 text-white" />
                      ) : viewMode === 'mobile' ? (
                        <DevicePhoneMobileIcon className="w-5 h-5 text-[#00ff88]" />
                      ) : (
                        <ComputerDesktopIcon className="w-5 h-5 text-[#00ff88]" />
                      )}
                    </button>
                    {/* Small indicator showing current effective view */}
                    {viewMode !== 'auto' && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-[#00ff88] font-medium">
                        {viewMode === 'mobile' ? 'M' : 'D'}
                      </span>
                    )}
                  </div>

                  {headerButtons.settings && (
                    <button
                      onClick={() => setShowSettings(true)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <Cog6ToothIcon className="w-5 h-5 text-white" />
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </header>

      {/* Refresh Progress */}
      {refreshProgress && (
        <div className="mx-4 sm:mx-6 my-2 bg-blue-500/20 border border-blue-500/30 rounded-lg p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-400">
              Refreshing: {refreshProgress.ticker} ({refreshProgress.current}/{refreshProgress.total})
            </span>
            <span className="text-blue-300 text-xs">
              {Math.round((refreshProgress.current / refreshProgress.total) * 100)}%
            </span>
          </div>
          <div className="mt-2 h-1 bg-blue-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(refreshProgress.current / refreshProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Weekend Task Progress */}
      {weekendTaskProgress && weekendTaskProgress.status === 'running' && (
        <div className="mx-4 sm:mx-6 my-2 bg-purple-500/20 border border-purple-500/30 rounded-lg p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-purple-400">
              Background: Fetching 5Y data for {weekendTaskProgress.ticker} ({weekendTaskProgress.current}/{weekendTaskProgress.total})
            </span>
            <span className="text-purple-300 text-xs">
              {Math.round((weekendTaskProgress.current / weekendTaskProgress.total) * 100)}%
            </span>
          </div>
          <div className="mt-2 h-1 bg-purple-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${(weekendTaskProgress.current / weekendTaskProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Weekend Task Complete */}
      {weekendTaskProgress && weekendTaskProgress.status === 'completed' && (
        <div className="mx-4 sm:mx-6 my-2 bg-green-500/20 border border-green-500/30 rounded-lg p-3">
          <span className="text-green-400 text-sm">
            Background task complete: 5-year range data updated for {weekendTaskProgress.total} stocks
          </span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 pb-24 w-full overflow-x-hidden">
        {/* API Key Warning */}
        {!store.settings.apiKey && (
          <div className="mb-6 bg-[#ffaa00]/20 border border-[#ffaa00]/30 rounded-lg p-4 text-[#ffaa00]">
            <p className="font-medium">API Key Required</p>
            <p className="text-sm mt-1">
              Please configure your API key in settings to fetch stock data.
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="mt-2 px-3 py-1 bg-[#ffaa00] text-black text-sm font-medium rounded"
            >
              Open Settings
            </button>
          </div>
        )}

        {/* Tabs + Columns row */}
        <div className="flex items-center justify-between mb-4 mt-4">
          <TabBar
            tabs={store.tabs}
            activeTabId={store.activeTabId}
            onTabSelect={store.setActiveTab}
            onAddTab={store.addTab}
            onEditTab={(tabId, name, color) => store.updateTab(tabId, { name, accentColor: color })}
            onDeleteTab={store.deleteTab}
            fixedTabColors={store.settings.fixedTabColors}
            allStockCount={allStocksWithTabs.length}
            purchasedStockCount={store.purchasedStocks.length}
          />

          {/* Column Settings Toggle - only show on desktop view */}
          {!isMobileView && (
            <div className="relative">
              <button
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                className="flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-white text-xs rounded hover:bg-white/10 transition-colors"
              >
                <AdjustmentsHorizontalIcon className="w-4 h-4" />
                Columns
              </button>
              {showColumnMenu && (
                <div className="absolute top-full right-0 mt-1 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg shadow-lg z-30 p-3 min-w-[320px] max-h-[70vh] overflow-y-auto">
                  <div className="text-xs text-gray-500 mb-2 pb-2 border-b border-[#3d3d3d]">
                    Column Settings
                  </div>
                  {[
                    { key: 'name', label: 'Name', hasVisibility: true },
                    { key: 'ticker', label: 'Ticker', hasVisibility: false },
                    { key: 'price', label: 'Price', hasVisibility: true },
                    { key: 'limit', label: 'Limit', hasVisibility: true },
                    { key: 'distance', label: 'Distance', hasVisibility: true },
                    { key: 'dayChange', label: 'Day Change', hasVisibility: true },
                    { key: 'range', label: 'Range', hasVisibility: true },
                    { key: 'rangeDelta', label: 'Range Δ', hasVisibility: true },
                    { key: 'chart', label: 'Chart', hasVisibility: true },
                    { key: 'currency', label: 'Currency', hasVisibility: true },
                    { key: 'lastRefresh', label: 'Last Refresh', hasVisibility: true },
                    { key: 'custom', label: store.settings.customColumnTitle || 'Custom', hasVisibility: true, isCustom: true },
                  ].map(({ key, label, hasVisibility, isCustom }) => {
                    const colStyle = !isCustom ? columnStyles[key as ColumnKey] : null;
                    return (
                    <div key={key} className="py-2 border-b border-[#3d3d3d]/50 last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        {isCustom ? (
                          <input
                            type="text"
                            value={store.settings.customColumnTitle || 'Custom'}
                            onChange={(e) => store.updateSettings({ customColumnTitle: e.target.value })}
                            placeholder="Column title..."
                            className="text-sm text-gray-300 font-medium bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-0.5 w-24"
                          />
                        ) : (
                          <span className="text-sm text-gray-300 font-medium">{label}</span>
                        )}
                        {hasVisibility && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={columnVisibility[key as keyof ColumnVisibility]}
                              onChange={() => toggleColumn(key as keyof ColumnVisibility)}
                              className="w-3 h-3 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0"
                            />
                            <span className="text-xs text-gray-500">Show</span>
                          </label>
                        )}
                      </div>
                      {colStyle && (
                      <div className="grid grid-cols-4 gap-2 mt-1">
                        {/* Width */}
                        <div>
                          <label className="text-[10px] text-gray-500 block">Width</label>
                          <input
                            type="number"
                            value={colStyle.width}
                            onChange={(e) => updateColumnStyle(key as ColumnKey, { width: parseInt(e.target.value) || 50 })}
                            className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-1 py-0.5 text-xs text-white"
                            min={30}
                            max={300}
                          />
                        </div>
                        {/* Font Size */}
                        <div>
                          <label className="text-[10px] text-gray-500 block">Size</label>
                          <select
                            value={colStyle.fontSize}
                            onChange={(e) => updateColumnStyle(key as ColumnKey, { fontSize: e.target.value as ColumnStyle['fontSize'] })}
                            className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-1 py-0.5 text-xs text-white"
                          >
                            <option value="xs">XS</option>
                            <option value="sm">SM</option>
                            <option value="base">M</option>
                            <option value="lg">LG</option>
                          </select>
                        </div>
                        {/* Font Weight */}
                        <div>
                          <label className="text-[10px] text-gray-500 block">Weight</label>
                          <select
                            value={colStyle.fontWeight}
                            onChange={(e) => updateColumnStyle(key as ColumnKey, { fontWeight: e.target.value as ColumnStyle['fontWeight'] })}
                            className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-1 py-0.5 text-xs text-white"
                          >
                            <option value="normal">Normal</option>
                            <option value="medium">Medium</option>
                            <option value="semibold">Semi</option>
                            <option value="bold">Bold</option>
                          </select>
                        </div>
                        {/* Font Color */}
                        <div>
                          <label className="text-[10px] text-gray-500 block">Color</label>
                          {key === 'ticker' || key === 'name' ? (
                            <select
                              value={colStyle.fontColor}
                              onChange={(e) => updateColumnStyle(key as ColumnKey, { fontColor: e.target.value })}
                              className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-1 py-0.5 text-xs text-white"
                            >
                              <option value="accent">Tab Color</option>
                              <option value="#ffffff">White</option>
                              <option value="#d1d5db">Gray</option>
                              <option value="#00ff88">Green</option>
                            </select>
                          ) : key === 'dayChange' || key === 'lastRefresh' ? (
                            <select
                              value={colStyle.fontColor}
                              onChange={(e) => updateColumnStyle(key as ColumnKey, { fontColor: e.target.value })}
                              className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-1 py-0.5 text-xs text-white"
                            >
                              <option value="dynamic">Dynamic</option>
                              <option value="#ffffff">White</option>
                              <option value="#d1d5db">Gray</option>
                            </select>
                          ) : (
                            <input
                              type="color"
                              value={colStyle.fontColor.startsWith('#') ? colStyle.fontColor : '#9ca3af'}
                              onChange={(e) => updateColumnStyle(key as ColumnKey, { fontColor: e.target.value })}
                              className="w-full h-6 bg-[#1a1a1a] border border-[#3d3d3d] rounded cursor-pointer"
                            />
                          )}
                        </div>
                      </div>
                      )}
                    </div>
                  );})}
                  <button
                    onClick={() => store.updateSettings({ columnStyles: defaultColumnStyles })}
                    className="mt-2 w-full py-1 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                  >
                    Reset to Defaults
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top Movers View */}
        {isTopMoversView && (
          <TopMovers
            gainers={topMovers.gainers}
            losers={topMovers.losers}
            onStockClick={(tabId, stock) => {
              store.setActiveTab(tabId);
              setEditingStock(stock);
            }}
          />
        )}

        {/* Purchased Stocks View */}
        {isPurchasedView && (
          <PurchasedStocks
            stocks={purchasedStocksWithProfit}
            onSelectStock={(stockId) => {
              const purchased = store.purchasedStocks.find(s => s.id === stockId);
              if (purchased) {
                setEditingStock(purchased);
              }
            }}
            onRemovePurchased={(stockId) => {
              store.removeFromPurchased(stockId);
            }}
            onRestoreToTab={(stockId) => {
              store.restorePurchasedToTab(stockId);
            }}
          />
        )}

        {/* Floating Selection Action Bar - Fixed at BOTTOM when stocks selected */}
        {selectedStocks.size > 0 && !isAllView && activeTab && (
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#1a1a1a]/95 backdrop-blur-sm border-t border-[#00ff88]/30 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <span className="text-sm text-[#00ff88] font-medium">
                  {selectedStocks.size} stock{selectedStocks.size > 1 ? 's' : ''} geselecteerd
                </span>
                <div className="flex items-center gap-2">
                  {/* Scan Selected Button */}
                  <button
                    onClick={() => {
                      const selectedItems = activeTab.stocks
                        .filter(s => selectedStocks.has(s.id))
                        .map(stock => ({ tabId: activeTab.id, stock }));
                      refreshSelectedStocks(selectedItems);
                    }}
                    disabled={!!currentlyScanning}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${currentlyScanning ? 'animate-spin' : ''}`} />
                    Scan
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowMoveMenu(!showMoveMenu)}
                      className="px-3 py-1.5 bg-[#00ff88] hover:bg-[#00dd77] text-black text-sm font-medium rounded transition-colors"
                    >
                      Verplaats
                    </button>
                    {showMoveMenu && (
                      <div className="absolute bottom-full left-0 mb-1 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg shadow-lg z-30 min-w-[150px]">
                        {store.tabs
                          .filter((tab) => tab.id !== activeTab.id)
                          .map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => handleMoveStocks(tab.id)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-[#3d3d3d] transition-colors first:rounded-t-lg last:rounded-b-lg"
                              style={{ color: tab.accentColor }}
                            >
                              {tab.name}
                            </button>
                          ))}
                        {store.tabs.filter((tab) => tab.id !== activeTab.id).length === 0 && (
                          <div className="px-4 py-2 text-sm text-gray-500">Geen andere tabs</div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Delete Selected Button */}
                  <button
                    onClick={() => {
                      if (window.confirm(`${selectedStocks.size} aandeel/aandelen verwijderen?`)) {
                        selectedStocks.forEach(stockId => {
                          store.removeStock(activeTab.id, stockId);
                        });
                        setSelectedStocks(new Set());
                      }
                    }}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white text-sm font-medium rounded transition-colors"
                  >
                    Verwijder
                  </button>
                  <button
                    onClick={() => setSelectedStocks(new Set())}
                    className="px-3 py-1.5 text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stock List - show for regular tabs and "All" view */}
        {(activeTab || isAllView) && !isTopMoversView && !isPurchasedView && (
          <div className="space-y-2">

            {/* Desktop Header - only show when not in mobile view */}
            <div className={`${isMobileView ? 'hidden' : 'grid'} gap-3 px-3 py-2 text-sm text-gray-400`}
              style={{
                gridTemplateColumns: [
                  '32px', // checkbox
                  columnVisibility.name ? `${columnStyles.name.width}px` : '',
                  `${columnStyles.ticker.width}px`, // ticker
                  columnVisibility.price ? `${columnStyles.price.width}px` : '',
                  columnVisibility.limit ? `${columnStyles.limit.width}px` : '',
                  columnVisibility.distance ? `${columnStyles.distance.width}px` : '',
                  columnVisibility.dayChange ? `${columnStyles.dayChange.width}px` : '',
                  columnVisibility.range ? `${columnStyles.range.width}px` : '',
                  columnVisibility.rangeDelta ? `${columnStyles.rangeDelta.width}px` : '',
                  columnVisibility.chart ? `${columnStyles.chart.width}px` : '',
                  columnVisibility.currency ? `${columnStyles.currency.width}px` : '',
                  columnVisibility.lastRefresh ? `${columnStyles.lastRefresh?.width || 80}px` : '',
                  columnVisibility.custom ? '60px' : '', // custom checkbox column
                  '40px', // edit
                ].filter(Boolean).join(' ')
              }}
            >
              {/* Select All Checkbox */}
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={activeTab && activeTab.stocks.length > 0 && selectedStocks.size === activeTab.stocks.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
                />
              </div>
              {/* Name Header */}
              {columnVisibility.name && (
                <div className="text-left">Name</div>
              )}
              <button
                onClick={() => handleSort('ticker')}
                className="flex items-center gap-1 hover:text-white text-left"
              >
                Ticker <SortIcon field="ticker" />
              </button>
              {columnVisibility.price && (
                <button
                  onClick={() => handleSort('currentPrice')}
                  className="flex items-center gap-1 hover:text-white justify-end"
                >
                  Price <SortIcon field="currentPrice" />
                </button>
              )}
              {columnVisibility.limit && (
                <div className="text-right">Limit</div>
              )}
              {columnVisibility.distance && (
                <button
                  onClick={() => handleSort('distanceToLimit')}
                  className="flex items-center gap-1 hover:text-white"
                >
                  Distance <SortIcon field="distanceToLimit" />
                </button>
              )}
              {columnVisibility.dayChange && (
                <button
                  onClick={() => handleSort('dayChangePercent')}
                  className="flex items-center gap-1 hover:text-white justify-end"
                >
                  Day <SortIcon field="dayChangePercent" />
                </button>
              )}
              {/* Range dropdown */}
              {columnVisibility.range && (
                <div className="flex items-center justify-center gap-1">
                  <select
                    value={rangePeriod}
                    onChange={(e) => handleRangePeriodChange(e.target.value as RangePeriod)}
                    className="bg-transparent text-gray-400 hover:text-white text-sm cursor-pointer focus:outline-none"
                  >
                    {RANGE_PERIODS.map((p) => (
                      <option key={p.value} value={p.value} className="bg-[#2d2d2d]">
                        {p.label} Range
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Range diff dropdown */}
              {columnVisibility.rangeDelta && (
                <div className="flex items-center justify-end">
                  <select
                    value={rangePeriod}
                    onChange={(e) => handleRangePeriodChange(e.target.value as RangePeriod)}
                    className="bg-transparent text-gray-400 hover:text-white text-sm cursor-pointer focus:outline-none text-right"
                  >
                    {RANGE_PERIODS.map((p) => (
                      <option key={p.value} value={p.value} className="bg-[#2d2d2d]">
                        {p.label} Δ
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {columnVisibility.chart && (
                <div className="text-center">Chart</div>
              )}
              {columnVisibility.currency && (
                <div className="text-center">Ccy</div>
              )}
              {columnVisibility.lastRefresh && (
                <div className="text-center">Refresh</div>
              )}
              {columnVisibility.custom && (
                <div className="text-center truncate" title={store.settings.customColumnTitle || 'Custom'}>
                  {store.settings.customColumnTitle || 'Custom'}
                </div>
              )}
              <div></div>
            </div>

            {/* Stocks */}
            {sortedStocks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 mb-4">No stocks in this tab</p>
                <button
                  onClick={() => setShowAddStock(true)}
                  className="px-4 py-2 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium rounded-lg"
                >
                  Add Stock
                </button>
              </div>
            ) : dashboardView === 'tiles' ? (
              // Mini tiles view - compact colored grid
              <div>
                {/* Tile sort controls */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-gray-500 mr-1">Sorteer:</span>
                  {([
                    ['default', 'Standaard'],
                    ['dayChange', 'Dag %  (rood→groen)'],
                    ['distance', 'Afstand (dichtbij eerst)'],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setTileSortMode(mode as TileSortMode)}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        tileSortMode === mode
                          ? 'bg-[#00ff88] text-black font-medium'
                          : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <MiniTilesView
                  stocks={sortedStocks}
                  tileSettings={store.settings.tileSettings}
                  sortMode={tileSortMode}
                  onRefreshStocks={(selectedStocksList) => {
                    for (const stock of selectedStocksList) {
                      const stockTabInfo = isAllView
                        ? allStocksWithTabs.find(s => s.stock.id === stock.id)
                        : null;
                      const tabId = stockTabInfo?.tabId || activeTab?.id;
                      if (tabId) {
                        refreshSingleStock({ tabId, stock });
                      }
                    }
                  }}
                />
              </div>
            ) : isMobileView ? (
              // Mobile view - use MobileStockCard
              <div className="space-y-2">
                {sortedStocks.map((stock) => {
                  // Find tab info for "All" view
                  const stockTabInfo = isAllView
                    ? allStocksWithTabs.find(s => s.stock.id === stock.id)
                    : null;
                  const accentColor = stockTabInfo?.tabColor || activeTab?.accentColor || '#00ff88';

                  return (
                    <MobileStockCard
                      key={stock.id}
                      stock={stock}
                      accentColor={accentColor}
                      rangePeriod={rangePeriod}
                      isSelected={selectedStocks.has(stock.id)}
                      columnVisibility={columnVisibility}
                      onSelect={(selected) => handleStockToggle(stock.id, selected)}
                      onEdit={() => {
                        if (isAllView && stockTabInfo) {
                          store.setActiveTab(stockTabInfo.tabId);
                        }
                        setEditingStock(stock);
                      }}
                      onTimeframeChange={(tf) => handleTimeframeChange(stock.id, tf)}
                      tabName={isAllView ? stockTabInfo?.tabName : undefined}
                      onCustomToggle={(checked) => {
                        const tabId = stockTabInfo?.tabId || activeTab?.id;
                        if (tabId) {
                          store.updateStock(tabId, stock.id, { customChecked: checked });
                        }
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              // Desktop view - use StockCard
              sortedStocks.map((stock) => {
                // Find tab info for "All" view
                const stockTabInfo = isAllView
                  ? allStocksWithTabs.find(s => s.stock.id === stock.id)
                  : null;
                const accentColor = stockTabInfo?.tabColor || activeTab?.accentColor || '#00ff88';

                return (
                  <StockCard
                    key={stock.id}
                    stock={stock}
                    accentColor={accentColor}
                    rangePeriod={rangePeriod}
                    isSelected={selectedStocks.has(stock.id)}
                    columnVisibility={columnVisibility}
                    columnStyles={columnStyles}
                    onSelect={(selected) => handleStockToggle(stock.id, selected)}
                    onEdit={() => {
                      if (isAllView && stockTabInfo) {
                        store.setActiveTab(stockTabInfo.tabId);
                      }
                      setEditingStock(stock);
                    }}
                    onTimeframeChange={(tf) => handleTimeframeChange(stock.id, tf)}
                    tabName={isAllView ? stockTabInfo?.tabName : undefined}
                    onCustomToggle={(checked) => {
                      const tabId = stockTabInfo?.tabId || activeTab?.id;
                      if (tabId) {
                        store.updateStock(tabId, stock.id, { customChecked: checked });
                      }
                    }}
                  />
                );
              })
            )}
          </div>
        )}

        {/* Buy Signals - at bottom of page */}
        <BuySignals
          signals={buySignals}
          onMarkAsPurchased={store.archiveStock}
          displayOptions={store.settings.buySignalDisplay}
        />

      </main>

      {/* Modals */}
      <AddStockModal
        isOpen={showAddStock}
        onClose={() => setShowAddStock(false)}
        tabs={store.tabs}
        currentTabId={store.activeTabId || store.tabs[0]?.id || ''}
      />

      {/* Editing a regular stock from a tab */}
      {editingStock && activeTab && !isPurchasedView && (
        <EditStockModal
          stock={editingStock}
          isOpen={!!editingStock}
          onClose={() => setEditingStock(null)}
          onSave={async (updates) => {
            const exchangeChanged = updates.exchange && updates.exchange !== editingStock.exchange;
            const tickerChanged = updates.ticker && updates.ticker !== editingStock.ticker;

            // Update the stock first
            store.updateStock(activeTab.id, editingStock.id, updates);
            if (updates.buyLimit !== undefined) {
              store.setBuyLimit(activeTab.id, editingStock.id, updates.buyLimit);
            }

            // If exchange or ticker changed, trigger a refresh to fetch data with new settings
            if (exchangeChanged || tickerChanged) {
              console.log(`[Dashboard] Exchange/ticker changed for ${editingStock.ticker}, triggering refresh...`);
              // Get the updated stock from the store
              const updatedTab = store.tabs.find(t => t.id === activeTab.id);
              const updatedStock = updatedTab?.stocks.find(s => s.id === editingStock.id);
              if (updatedStock) {
                // Clear any cached data for this stock to force fresh fetch
                const oldTicker = editingStock.ticker;
                const newTicker = updates.ticker || oldTicker;
                clearCacheForSymbol(oldTicker);
                if (newTicker !== oldTicker) {
                  clearCacheForSymbol(newTicker);
                }

                // Refresh with the new exchange
                await refreshSingleStock({ tabId: activeTab.id, stock: updatedStock });
              }
            }
          }}
          onDelete={() => store.removeStock(activeTab.id, editingStock.id)}
          onMarkAsPurchased={(purchasePrice) => {
            // Move stock from tab to purchasedStocks
            store.markAsPurchased(activeTab.id, editingStock.id, purchasePrice);
          }}
          onReportIssue={async (issueType, description) => {
            const log: string[] = [];
            log.push(`[${new Date().toISOString()}] Issue report started`);
            log.push(`Issue type: ${issueType}`);
            log.push(`Stock: ${editingStock.ticker} (${editingStock.exchange})`);
            log.push(`Description: ${description || 'None'}`);
            log.push('');

            // Test different providers
            const providers: ApiProvider[] = ['yahoo', 'twelvedata', 'alphavantage'];
            const api = getStockAPI(store.settings.apiKey, store.settings.apiProvider);

            for (const provider of providers) {
              log.push(`Testing provider: ${provider}...`);
              try {
                const result = await api.fetchStockWithFallback(
                  editingStock.ticker,
                  editingStock.exchange,
                  { needsHistorical: false, forceProvider: provider as ApiProvider }
                );

                if (result.data && result.data.currentPrice && result.data.currentPrice > 0) {
                  log.push(`  ✓ ${provider}: Success - Price: ${result.data.currentPrice}`);
                } else {
                  log.push(`  ✗ ${provider}: Failed - ${result.unavailableReason || 'No data'}`);
                }
              } catch (error) {
                log.push(`  ✗ ${provider}: Error - ${String(error)}`);
              }
            }

            log.push('');
            log.push(`Current stock data:`);
            log.push(`  - Current Price: ${editingStock.currentPrice}`);
            log.push(`  - Previous Close: ${editingStock.previousClose}`);
            log.push(`  - 52W High: ${editingStock.week52High}`);
            log.push(`  - 52W Low: ${editingStock.week52Low}`);
            log.push(`  - Last Updated: ${editingStock.lastUpdated}`);
            log.push(`  - Preferred Provider: ${editingStock.preferredProvider || 'auto'}`);
            log.push(`  - Unavailable Providers: ${editingStock.unavailableProviders?.join(', ') || 'none'}`);

            log.push('');
            log.push(`Diagnose compleet. Kopieer deze log voor support.`);

            return log;
          }}
        />
      )}

      {/* Editing a purchased stock */}
      {editingStock && isPurchasedView && (
        <EditStockModal
          stock={editingStock}
          isOpen={!!editingStock}
          onClose={() => setEditingStock(null)}
          isPurchasedStock={true}
          onSave={(updates) => {
            // Update the purchased stock
            store.updatePurchasedStock(editingStock.id, updates);
          }}
          onDelete={() => {
            // Remove from purchased (restore to original tab)
            store.restorePurchasedToTab(editingStock.id);
            setEditingStock(null);
          }}
        />
      )}

      <Settings
        settings={store.settings}
        tabs={store.tabs}
        archive={store.archive}
        purchasedStocks={store.purchasedStocks}
        limitHistory={store.limitHistory}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={store.updateSettings}
        onCloudDataLoaded={(data) => {
          // Load data from cloud - replace local data
          store.loadCloudData(data);
        }}
        onLogout={handleLogout}
      />

      <DebugPanel
        isOpen={showDebugPanel}
        onClose={() => setShowDebugPanel(false)}
      />

      <RefreshQueueModal
        isOpen={showQueueModal}
        onClose={() => setShowQueueModal(false)}
        queueItems={buildQueueItems()}
        onReorder={handleQueueReorder}
        onRefreshNow={refreshSingleStock}
        onRefreshSelected={refreshSelectedStocks}
        currentlyScanning={currentlyScanning || undefined}
        availableProviders={availableProviders}
      />

      <ScanLogModal
        isOpen={showScanLogModal}
        onClose={() => setShowScanLogModal(false)}
        scanLog={store.scanLog}
        onClear={store.clearScanLog}
      />

      <UndoModal
        isOpen={showUndoModal}
        onClose={() => setShowUndoModal(false)}
        actionLog={store.actionLog}
        onUndo={store.undoAction}
        onClear={store.clearActionLog}
      />

      {/* Floating buttons bottom-right: scroll-to-top, add stock, version */}
      {!(selectedStocks.size > 0 && !isAllView && activeTab) && (
        <div className="fixed bottom-4 right-4 flex flex-col items-center gap-2 z-20">
          {/* Scroll to top button */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="w-10 h-10 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            title="Scroll naar boven"
          >
            <ChevronUpIcon className="w-5 h-5" />
          </button>

          {/* Add Stock Button */}
          <button
            onClick={() => setShowAddStock(true)}
            className="w-14 h-14 bg-[#00ff88] hover:bg-[#00dd77] text-black rounded-full shadow-lg flex items-center justify-center text-3xl font-bold transition-transform hover:scale-110"
            title="Aandeel toevoegen"
          >
            +
          </button>

          {/* Version number */}
          <div className="text-[10px] text-gray-500 bg-black/60 px-2 py-0.5 rounded">
            v{VERSION}
          </div>
        </div>
      )}
    </div>
  );
}
