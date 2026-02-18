import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  AppState,
  Tab,
  Stock,
  ArchivedStock,
  PurchasedStock,
  Notification,
  LimitHistory,
  ScanLogEntry,
  RangeLogEntry,
  ActionLogEntry,
  ActionType,
  UserSettings,
  ChartTimeframe,
  SortField,
  SortDirection,
  BuySignal,
} from './types';
import { scheduleAutoUpload, markLocalModified } from './services/autoSync';

const DEFAULT_SETTINGS: UserSettings = {
  updateInterval: 3600000, // 1 hour in ms
  autoScanEnabled: false,  // Smart auto-scan (off by default)
  notifications: {
    enabled: true,
    thresholds: [1, 5, 10],
    audioEnabled: false,
    pushEnabled: false,  // Browser push notifications (requires permission)
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
    },
    dailyDropAlert: null,  // Alert if stock drops X% in one day
  },
  globalChartTimeframe: null,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  apiKey: '',
  apiProvider: 'twelvedata',
  apiKeys: [], // Multiple API keys
  fontSize: 'medium',
  colorScheme: 'dark',
  rangePeriod: '1y', // Default to 52 weeks
  columnVisibility: {
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
    custom: false,  // Custom checkbox column (hidden by default)
  },
  columnStyles: {
    name: { width: 120, fontColor: '#d1d5db', fontSize: 'sm', fontWeight: 'semibold' },
    ticker: { width: 80, fontColor: 'accent', fontSize: 'sm', fontWeight: 'semibold' },
    price: { width: 85, fontColor: '#ffffff', fontSize: 'sm', fontWeight: 'normal' },
    limit: { width: 85, fontColor: '#d1d5db', fontSize: 'sm', fontWeight: 'normal' },
    distance: { width: 200, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    dayChange: { width: 70, fontColor: 'dynamic', fontSize: 'sm', fontWeight: 'normal' },
    range: { width: 180, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    rangeDelta: { width: 70, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    chart: { width: 100, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    currency: { width: 50, fontColor: '#9ca3af', fontSize: 'sm', fontWeight: 'normal' },
    lastRefresh: { width: 80, fontColor: 'dynamic', fontSize: 'xs', fontWeight: 'normal' },
  },
  viewMode: 'auto',  // auto, mobile, or desktop
  mobileColumnVisibility: {
    name: false,  // Hide name on mobile by default
    price: true,
    limit: false,  // Hide limit, show in expanded view
    distance: true,
    dayChange: true,
    range: false,  // Hide range on mobile
    rangeDelta: false,
    chart: false,  // Hide chart on mobile (show in expanded)
    currency: true,
    lastRefresh: false,  // Hide on mobile
    custom: false,  // Custom checkbox column
  },
  headerButtonVisibility: {
    search: true,
    apiStatus: true,
    debugLog: false,  // Hidden by default on mobile
    refresh: true,
    notifications: true,
    archive: true,
    settings: true,
    syncStatus: true,
  },
  buySignalDisplay: {
    showTabName: false,  // Just use color by default
    compactMode: true,   // Compact mode by default
  },
  customColumnTitle: 'Custom',  // Default title for custom checkbox column
  fixedTabColors: {
    all: 'rainbow',       // Special value for rainbow gradient
    topGainers: '#00ff88',
    topLosers: '#ff3366',
    purchased: '#00ff88',
  },
  scanPriorityWeights: {
    lastScanTime: 60,
    distanceToLimit: 50,
    volatility: 30,
    rainbowBlocks: 40,
    skipErrorStocks: true,
  },
  tileSettings: {
    showLabel: 'auto',
    showDistance: true,
    showDayChange: true,
    showFreshness: true,
    tileSize: 'medium',
    fontWeight: 'bold',
    labelColor: 'auto',
    distanceColor: 'auto',
    dayChangeColor: '#ffffff',
    dotsColor: 'auto',
    labelFontSize: 'sm',
    distanceFontSize: 'md',
    dayChangeFontSize: 'xs',
    rainbowPreset: 'classic',
  },
};

const DEFAULT_TAB: Tab = {
  id: 'default',
  name: 'Watchlist',
  accentColor: '#3b82f6',
  stocks: [],
  sortField: 'ticker',
  sortDirection: 'asc',
  createdAt: new Date().toISOString(),
};

interface StoreActions {
  // Authentication
  setAuthenticated: (value: boolean) => void;
  setEncryptionKeyHash: (hash: string | null) => void;

  // Loading
  setLoading: (value: boolean) => void;

  // Tabs
  addTab: (name: string, accentColor: string) => void;
  updateTab: (tabId: string, updates: Partial<Pick<Tab, 'name' | 'accentColor'>>) => void;
  deleteTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setSortPreference: (tabId: string, field: SortField, direction: SortDirection) => void;

  // Stocks
  addStock: (tabId: string, stock: Omit<Stock, 'id' | 'historicalData' | 'lastUpdated' | 'alertSettings'>) => void;
  updateStock: (tabId: string, stockId: string, updates: Partial<Stock>) => void;
  removeStock: (tabId: string, stockId: string) => void;
  updateStockPrice: (tabId: string, stockId: string, price: number, dayChange: number, dayChangePercent: number) => void;
  setStockHistoricalData: (tabId: string, stockId: string, data: Stock['historicalData']) => void;
  setStockChartTimeframe: (tabId: string, stockId: string, timeframe: ChartTimeframe) => void;
  setBuyLimit: (tabId: string, stockId: string, limit: number | null) => void;

  // Archive
  archiveStock: (tabId: string, stockId: string, purchasePrice: number) => void;
  removeFromArchive: (archivedId: string) => void;
  clearArchive: () => void;
  updateArchivedStockPrice: (archivedId: string, currentPrice: number, exchange?: string) => void;

  // Purchased stocks
  markAsPurchased: (tabId: string, stockId: string, purchasePrice: number) => void;
  removeFromPurchased: (purchasedId: string) => void;
  restorePurchasedToTab: (purchasedId: string) => void;
  updatePurchasedStock: (purchasedId: string, updates: Partial<PurchasedStock>) => void;

  // Notifications
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (notificationId: string) => void;
  clearNotifications: () => void;

  // Settings
  updateSettings: (settings: Partial<UserSettings>) => void;

  // Limit History
  addLimitHistory: (entry: Omit<LimitHistory, 'id' | 'timestamp'>) => void;

  // Scan Log
  addScanLogEntry: (entry: Omit<ScanLogEntry, 'id' | 'timestamp'>) => void;
  clearScanLog: () => void;

  // Range Log
  addRangeLogEntry: (entry: Omit<RangeLogEntry, 'id' | 'timestamp'>) => void;
  clearRangeLog: () => void;

  // Action Log (for undo)
  logAction: (type: ActionType, description: string, undoData: ActionLogEntry['undoData'], canUndo?: boolean) => void;
  undoAction: (actionId: string) => boolean;  // Returns true if successful
  clearActionLog: () => void;

  // Sync
  setLastSyncTime: (time: string) => void;

  // Data management
  loadState: (state: Partial<AppState>) => void;
  loadCloudData: (data: { tabs: Tab[]; archive: ArchivedStock[]; purchasedStocks?: PurchasedStock[]; settings: UserSettings; limitHistory: LimitHistory[] }) => void;
  resetState: () => void;

  // Computed
  getBuySignals: () => BuySignal[];
  getDistanceToLimit: (stock: Stock) => number | null;
}

const initialState: AppState = {
  isAuthenticated: false,
  isLoading: true,
  tabs: [DEFAULT_TAB],
  activeTabId: 'default',
  archive: [],
  purchasedStocks: [],
  notifications: [],
  limitHistory: [],
  scanLog: [],  // Log of all scans for debugging
  rangeLog: [],  // Log of range fetch attempts
  actionLog: [],  // Log of manual actions for undo
  settings: DEFAULT_SETTINGS,
  lastSyncTime: null,
  encryptionKeyHash: null,
};

export const useStore = create<AppState & StoreActions>((set, get) => ({
  ...initialState,

  // Authentication
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setEncryptionKeyHash: (hash) => set({ encryptionKeyHash: hash }),

  // Loading
  setLoading: (value) => set({ isLoading: value }),

  // Tabs
  addTab: (name, accentColor) => {
    const newTab: Tab = {
      id: uuidv4(),
      name,
      accentColor,
      stocks: [],
      sortField: 'ticker',
      sortDirection: 'asc',
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  updateTab: (tabId, updates) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, ...updates } : tab
      ),
    }));
  },

  deleteTab: (tabId) => {
    set((state) => {
      const newTabs = state.tabs.filter((tab) => tab.id !== tabId);
      const newActiveTabId =
        state.activeTabId === tabId
          ? newTabs[0]?.id ?? null
          : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveTabId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  setSortPreference: (tabId, field, direction) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, sortField: field, sortDirection: direction } : tab
      ),
    }));
  },

  // Stocks
  addStock: (tabId, stockData) => {
    const newStock: Stock = {
      ...stockData,
      id: uuidv4(),
      historicalData: [],
      lastUpdated: new Date().toISOString(),
      alertSettings: {
        customThresholds: [],
        enabled: true,
      },
    };
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, stocks: [...t.stocks, newStock] } : t
      ),
    }));
    // Log action
    get().logAction('add_stock', `${stockData.ticker} toegevoegd aan ${tab?.name || 'watchlist'}`, {
      stockId: newStock.id,
      stockData: newStock,
      tabId,
    });
  },

  updateStock: (tabId, stockId, updates) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              stocks: tab.stocks.map((stock) =>
                stock.id === stockId ? { ...stock, ...updates } : stock
              ),
            }
          : tab
      ),
    }));
  },

  removeStock: (tabId, stockId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    const stock = tab?.stocks.find((s) => s.id === stockId);
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, stocks: t.stocks.filter((s) => s.id !== stockId) }
          : t
      ),
    }));
    // Log action
    if (stock && tab) {
      get().logAction('remove_stock', `${stock.ticker} verwijderd uit ${tab.name}`, {
        stockId,
        stockData: stock,
        tabId,
      });
    }
  },

  updateStockPrice: (tabId, stockId, price, dayChange, dayChangePercent) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              stocks: tab.stocks.map((stock) =>
                stock.id === stockId
                  ? {
                      ...stock,
                      currentPrice: price,
                      dayChange,
                      dayChangePercent,
                      lastUpdated: new Date().toISOString(),
                    }
                  : stock
              ),
            }
          : tab
      ),
    }));
  },

  setStockHistoricalData: (tabId, stockId, data) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              stocks: tab.stocks.map((stock) =>
                stock.id === stockId ? { ...stock, historicalData: data } : stock
              ),
            }
          : tab
      ),
    }));
  },

  setStockChartTimeframe: (tabId, stockId, timeframe) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              stocks: tab.stocks.map((stock) =>
                stock.id === stockId ? { ...stock, chartTimeframe: timeframe } : stock
              ),
            }
          : tab
      ),
    }));
  },

  setBuyLimit: (tabId, stockId, limit) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    const stock = tab?.stocks.find((s) => s.id === stockId);
    const previousLimit = stock?.buyLimit;

    if (stock) {
      // Add to history
      get().addLimitHistory({
        stockId,
        ticker: stock.ticker,
        oldLimit: stock.buyLimit,
        newLimit: limit,
      });
    }

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              stocks: t.stocks.map((s) =>
                s.id === stockId ? { ...s, buyLimit: limit } : s
              ),
            }
          : t
      ),
    }));

    // Log action
    if (stock) {
      const limitText = limit !== null ? `€${limit.toFixed(2)}` : 'geen limiet';
      const prevLimitText = previousLimit !== null && previousLimit !== undefined ? `€${previousLimit.toFixed(2)}` : 'geen';
      get().logAction('set_buy_limit', `${stock.ticker} limiet: ${prevLimitText} → ${limitText}`, {
        stockId,
        tabId,
        previousLimit,
        newLimit: limit,
      });
    }
  },

  // Archive
  archiveStock: (tabId, stockId, purchasePrice) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    const stock = tab?.stocks.find((s) => s.id === stockId);

    if (!stock || !tab) return;

    const archivedStock: ArchivedStock = {
      id: uuidv4(),
      ticker: stock.ticker,
      name: stock.name,
      purchasePrice,
      purchaseDate: new Date().toISOString(),
      archivedAt: new Date().toISOString(),
      buyLimit: stock.buyLimit,
      currency: stock.currency,
    };

    set((state) => ({
      archive: [...state.archive, archivedStock],
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, stocks: t.stocks.filter((s) => s.id !== stockId) }
          : t
      ),
    }));

    // Log action
    get().logAction('archive_stock', `${stock.ticker} gearchiveerd van ${tab.name}`, {
      archivedStockData: archivedStock,
      stockData: stock,
      tabId,
    });
  },

  removeFromArchive: (archivedId) => {
    set((state) => ({
      archive: state.archive.filter((a) => a.id !== archivedId),
    }));
  },

  clearArchive: () => set({ archive: [] }),

  updateArchivedStockPrice: (archivedId, currentPrice, exchange) => {
    set((state) => ({
      archive: state.archive.map((item) =>
        item.id === archivedId
          ? {
              ...item,
              currentPrice,
              exchange: exchange || item.exchange,
              lastUpdated: new Date().toISOString(),
            }
          : item
      ),
    }));
  },

  // Purchased stocks
  markAsPurchased: (tabId, stockId, purchasePrice) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    const stock = tab?.stocks.find((s) => s.id === stockId);

    if (!stock || !tab) return;

    const purchasedStock: PurchasedStock = {
      ...stock,
      purchasedPrice: purchasePrice,
      purchasedDate: new Date().toISOString(),
      originalTabId: tabId,
      originalTabName: tab.name,
      originalTabColor: tab.accentColor,
    };

    set((state) => ({
      purchasedStocks: [...state.purchasedStocks, purchasedStock],
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, stocks: t.stocks.filter((s) => s.id !== stockId) }
          : t
      ),
    }));

    // Log action
    get().logAction('mark_purchased', `${stock.ticker} gemarkeerd als gekocht (€${purchasePrice.toFixed(2)})`, {
      purchasedStockData: purchasedStock,
      stockData: stock,
      tabId,
    });

    const newState = get();
    markLocalModified();
    scheduleAutoUpload({
      tabs: newState.tabs,
      archive: newState.archive,
      purchasedStocks: newState.purchasedStocks,
      settings: newState.settings,
      limitHistory: newState.limitHistory,
    });
  },

  removeFromPurchased: (purchasedId) => {
    set((state) => ({
      purchasedStocks: state.purchasedStocks.filter((p) => p.id !== purchasedId),
    }));
    const newState = get();
    markLocalModified();
    scheduleAutoUpload({
      tabs: newState.tabs,
      archive: newState.archive,
      purchasedStocks: newState.purchasedStocks,
      settings: newState.settings,
      limitHistory: newState.limitHistory,
    });
  },

  restorePurchasedToTab: (purchasedId) => {
    const state = get();
    const purchased = state.purchasedStocks.find((p) => p.id === purchasedId);
    if (!purchased) return;

    // Find the original tab or the first tab if original doesn't exist
    const targetTab = state.tabs.find((t) => t.id === purchased.originalTabId) || state.tabs[0];
    if (!targetTab) return;

    // Create a clean stock without purchased-specific fields
    const { originalTabId, originalTabName, originalTabColor, purchasedPrice, purchasedDate, ...stockData } = purchased;
    const restoredStock: Stock = {
      ...stockData,
      purchasedPrice: undefined,
      purchasedDate: undefined,
    };

    set((state) => ({
      purchasedStocks: state.purchasedStocks.filter((p) => p.id !== purchasedId),
      tabs: state.tabs.map((t) =>
        t.id === targetTab.id
          ? { ...t, stocks: [...t.stocks, restoredStock] }
          : t
      ),
    }));

    // Log action
    get().logAction('restore_from_purchased', `${purchased.ticker} teruggezet naar ${targetTab.name}`, {
      purchasedStockData: purchased,
      stockId: restoredStock.id,
      tabId: targetTab.id,
    });

    const newState = get();
    markLocalModified();
    scheduleAutoUpload({
      tabs: newState.tabs,
      archive: newState.archive,
      purchasedStocks: newState.purchasedStocks,
      settings: newState.settings,
      limitHistory: newState.limitHistory,
    });
  },

  updatePurchasedStock: (purchasedId, updates) => {
    set((state) => ({
      purchasedStocks: state.purchasedStocks.map((p) =>
        p.id === purchasedId ? { ...p, ...updates } : p
      ),
    }));
    const newState = get();
    markLocalModified();
    scheduleAutoUpload({
      tabs: newState.tabs,
      archive: newState.archive,
      purchasedStocks: newState.purchasedStocks,
      settings: newState.settings,
      limitHistory: newState.limitHistory,
    });
  },

  // Notifications
  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      read: false,
    };
    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));
  },

  markNotificationRead: (notificationId) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      ),
    }));
  },

  clearNotifications: () => set({ notifications: [] }),

  // Settings
  updateSettings: (settings) => {
    set((state) => ({
      settings: { ...state.settings, ...settings },
    }));
  },

  // Limit History
  addLimitHistory: (entry) => {
    const newEntry: LimitHistory = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      limitHistory: [...state.limitHistory, newEntry],
    }));
  },

  // Scan Log
  addScanLogEntry: (entry) => {
    const newEntry: ScanLogEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      // Keep max 500 entries to prevent memory issues
      scanLog: [...state.scanLog.slice(-499), newEntry],
    }));
  },

  clearScanLog: () => {
    set({ scanLog: [] });
  },

  // Range Log
  addRangeLogEntry: (entry) => {
    const newEntry: RangeLogEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      rangeLog: [...state.rangeLog.slice(-499), newEntry],
    }));
  },

  clearRangeLog: () => {
    set({ rangeLog: [] });
  },

  // Action Log (for undo)
  logAction: (type, description, undoData, canUndo = true) => {
    const newEntry: ActionLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type,
      description,
      undoData,
      canUndo,
    };
    set((state) => ({
      // Keep max 100 action entries
      actionLog: [...state.actionLog.slice(-99), newEntry],
    }));
  },

  undoAction: (actionId) => {
    const state = get();
    const action = state.actionLog.find((a) => a.id === actionId);
    if (!action || !action.canUndo) return false;

    try {
      switch (action.type) {
        case 'add_stock': {
          // Undo: remove the stock that was added
          if (action.undoData.tabId && action.undoData.stockId) {
            set((state) => ({
              tabs: state.tabs.map((tab) =>
                tab.id === action.undoData.tabId
                  ? { ...tab, stocks: tab.stocks.filter((s) => s.id !== action.undoData.stockId) }
                  : tab
              ),
              actionLog: state.actionLog.filter((a) => a.id !== actionId),
            }));
            return true;
          }
          break;
        }
        case 'remove_stock': {
          // Undo: restore the stock that was removed
          if (action.undoData.tabId && action.undoData.stockData) {
            const stockToRestore = action.undoData.stockData as Stock;
            set((state) => ({
              tabs: state.tabs.map((tab) =>
                tab.id === action.undoData.tabId
                  ? { ...tab, stocks: [...tab.stocks, stockToRestore] }
                  : tab
              ),
              actionLog: state.actionLog.filter((a) => a.id !== actionId),
            }));
            return true;
          }
          break;
        }
        case 'set_buy_limit': {
          // Undo: restore the previous limit
          if (action.undoData.tabId && action.undoData.stockId && action.undoData.previousLimit !== undefined) {
            set((state) => ({
              tabs: state.tabs.map((tab) =>
                tab.id === action.undoData.tabId
                  ? {
                      ...tab,
                      stocks: tab.stocks.map((s) =>
                        s.id === action.undoData.stockId
                          ? { ...s, buyLimit: action.undoData.previousLimit ?? null }
                          : s
                      ),
                    }
                  : tab
              ),
              actionLog: state.actionLog.filter((a) => a.id !== actionId),
            }));
            return true;
          }
          break;
        }
        case 'mark_purchased': {
          // Undo: move stock back from purchased to original tab
          if (action.undoData.purchasedStockData) {
            const purchased = action.undoData.purchasedStockData;
            // Convert back to regular stock
            const { purchasedPrice, purchasedDate, originalTabId, originalTabName, originalTabColor, ...stockData } = purchased;
            const stock = stockData as Stock;
            set((state) => ({
              purchasedStocks: state.purchasedStocks.filter((p) => p.id !== purchased.id),
              tabs: state.tabs.map((tab) =>
                tab.id === originalTabId
                  ? { ...tab, stocks: [...tab.stocks, stock] }
                  : tab
              ),
              actionLog: state.actionLog.filter((a) => a.id !== actionId),
            }));
            return true;
          }
          break;
        }
        case 'restore_from_purchased': {
          // Undo: move stock back to purchased
          if (action.undoData.purchasedStockData && action.undoData.tabId && action.undoData.stockId) {
            const purchasedStock = action.undoData.purchasedStockData;
            set((state) => ({
              tabs: state.tabs.map((tab) =>
                tab.id === action.undoData.tabId
                  ? { ...tab, stocks: tab.stocks.filter((s) => s.id !== action.undoData.stockId) }
                  : tab
              ),
              purchasedStocks: [...state.purchasedStocks, purchasedStock],
              actionLog: state.actionLog.filter((a) => a.id !== actionId),
            }));
            return true;
          }
          break;
        }
        case 'archive_stock': {
          // Undo: restore from archive back to tab
          if (action.undoData.archivedStockData && action.undoData.tabId && action.undoData.stockData) {
            const archived = action.undoData.archivedStockData;
            const originalStock = action.undoData.stockData as Stock;
            set((state) => ({
              archive: state.archive.filter((a) => a.id !== archived.id),
              tabs: state.tabs.map((tab) =>
                tab.id === action.undoData.tabId
                  ? { ...tab, stocks: [...tab.stocks, originalStock] }
                  : tab
              ),
              actionLog: state.actionLog.filter((a) => a.id !== actionId),
            }));
            return true;
          }
          break;
        }
        case 'restore_from_archive': {
          // Undo: move back to archive
          if (action.undoData.archivedStockData && action.undoData.tabId && action.undoData.stockId) {
            const archivedStock = action.undoData.archivedStockData;
            set((state) => ({
              tabs: state.tabs.map((tab) =>
                tab.id === action.undoData.tabId
                  ? { ...tab, stocks: tab.stocks.filter((s) => s.id !== action.undoData.stockId) }
                  : tab
              ),
              archive: [...state.archive, archivedStock],
              actionLog: state.actionLog.filter((a) => a.id !== actionId),
            }));
            return true;
          }
          break;
        }
        // Add more cases as needed
      }
    } catch (error) {
      console.error('Failed to undo action:', error);
      return false;
    }

    return false;
  },

  clearActionLog: () => {
    set({ actionLog: [] });
  },

  // Sync
  setLastSyncTime: (time) => set({ lastSyncTime: time }),

  // Data management
  loadState: (state) => {
    set((currentState) => ({
      ...currentState,
      ...state,
      isLoading: false,
    }));
  },

  // Load data from cloud sync
  loadCloudData: (data) => {
    set((currentState) => ({
      ...currentState,
      tabs: data.tabs.length > 0 ? data.tabs : currentState.tabs,
      archive: data.archive || [],
      purchasedStocks: data.purchasedStocks || [],
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
      limitHistory: data.limitHistory || [],
      activeTabId: data.tabs.length > 0 ? data.tabs[0].id : currentState.activeTabId,
    }));
  },

  resetState: () => set(initialState),

  // Computed
  getBuySignals: () => {
    const state = get();
    const signals: BuySignal[] = [];

    state.tabs.forEach((tab) => {
      tab.stocks.forEach((stock) => {
        // Require rangeFetched AND actual Yahoo Finance range data (not just scanner data)
        const hasRealRangeData = (stock.year5Low && stock.year5Low > 0) ||
          (stock.year3Low && stock.year3Low > 0) ||
          (stock.week52Low && stock.week52Low > 0);
        if (stock.rangeFetched && hasRealRangeData && stock.buyLimit !== null && stock.currentPrice > 0 && stock.currentPrice <= stock.buyLimit) {
          signals.push({
            stock,
            tabId: tab.id,
            tabName: tab.name,
            tabColor: tab.accentColor,
            reachedAt: stock.lastUpdated,
          });
        }
      });
    });

    return signals;
  },

  getDistanceToLimit: (stock) => {
    if (stock.buyLimit === null) return null;
    return ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100;
  },
}));

// Selectors
export const selectActiveTab = (state: AppState) =>
  state.tabs.find((tab) => tab.id === state.activeTabId);

export const selectUnreadNotifications = (state: AppState) =>
  state.notifications.filter((n) => !n.read);

export const selectAllStocks = (state: AppState) =>
  state.tabs.flatMap((tab) => tab.stocks);

// Auto-sync: Subscribe to store changes and trigger cloud sync
// Only syncs tabs, archive, settings, and limitHistory (not notifications, etc.)
let autoSyncEnabled = false;

export function enableAutoSync(): void {
  if (autoSyncEnabled) return;
  autoSyncEnabled = true;

  console.log('[Store] Auto-sync enabled');

  // Subscribe to changes in syncable data
  useStore.subscribe(
    (state, prevState) => {
      // Skip if not authenticated
      if (!state.isAuthenticated) return;

      // Check if syncable data has changed
      const tabsChanged = state.tabs !== prevState.tabs;
      const archiveChanged = state.archive !== prevState.archive;
      const purchasedChanged = state.purchasedStocks !== prevState.purchasedStocks;
      const settingsChanged = state.settings !== prevState.settings;
      const limitHistoryChanged = state.limitHistory !== prevState.limitHistory;

      if (tabsChanged || archiveChanged || purchasedChanged || settingsChanged || limitHistoryChanged) {
        console.log('[Store] Data changed, scheduling auto-sync...');
        markLocalModified();
        scheduleAutoUpload({
          tabs: state.tabs,
          archive: state.archive,
          purchasedStocks: state.purchasedStocks,
          settings: state.settings,
          limitHistory: state.limitHistory,
        });
      }
    }
  );
}

export function disableAutoSync(): void {
  autoSyncEnabled = false;
  console.log('[Store] Auto-sync disabled');
}
