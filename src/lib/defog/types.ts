export interface Stock {
  id: string;
  ticker: string;
  name: string;
  displayName?: string;  // Custom editable display name
  isin?: string;  // International Securities Identification Number
  buyLimit: number | null;
  currentPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  week52High: number;
  week52Low: number;
  year3High?: number;
  year3Low?: number;
  year5High?: number;
  year5Low?: number;
  chartTimeframe: ChartTimeframe;
  historicalData: HistoricalDataPoint[];
  lastUpdated: string;
  currency: string;
  exchange: string;
  alertSettings: AlertSettings;
  // Unavailability tracking
  unavailableProviders?: ApiProvider[];  // Providers that don't support this stock
  unavailableReason?: string;  // User-facing reason (e.g., "Requires Pro plan")
  // Scan status tracking
  lastScanStatus?: ScanStatus;
  lastScanError?: boolean;  // True if last scan resulted in an error
  queuePosition?: number;  // Manual queue position (lower = scanned first)
  // Per-stock API preference
  preferredProvider?: ApiProvider | 'auto';  // Preferred API provider for this stock
  // Custom checkbox column
  customChecked?: boolean;  // Custom user-defined checkbox column
  // Purchased tracking (manual)
  purchasedPrice?: number;  // Manually set purchase price
  purchasedDate?: string;   // Date when marked as purchased
  // Sync tracking
  addedAt?: string;  // ISO timestamp when stock was added to Defog via scanner sync
  rangeFetched?: boolean;  // True if 5Y/3Y/1Y range has been fetched from API
  rangeFetchedAt?: string;  // ISO timestamp of last successful range fetch
  rangeFetchError?: boolean;  // True if last range fetch failed (skip in smart updater)
}

export interface ColumnVisibility {
  name: boolean;
  price: boolean;
  limit: boolean;
  distance: boolean;
  dayChange: boolean;
  range: boolean;
  rangeDelta: boolean;
  chart: boolean;
  currency: boolean;
  lastRefresh: boolean;  // Last refresh time with color coding
  custom: boolean;  // Custom checkbox column
}

// Header button visibility (for mobile to reduce clutter)
export interface HeaderButtonVisibility {
  search: boolean;
  apiStatus: boolean;
  debugLog: boolean;
  refresh: boolean;
  notifications: boolean;
  archive: boolean;
  settings: boolean;
  syncStatus: boolean;
}

// Buy signal display options
export interface BuySignalDisplayOptions {
  showTabName: boolean;  // Show "Watchlist" text or just use color
  compactMode: boolean;  // More compact cards
}

// Fixed tab color customization
export interface FixedTabColors {
  all: string;            // "Alles" tab color (default: rainbow)
  topGainers: string;     // "Top" gainers color (default: #00ff88)
  topLosers: string;      // "Top" losers color (default: #ff3366)
  purchased: string;      // "Gekocht" tab color (default: #00ff88)
}

// View mode for responsive layout
export type ViewMode = 'auto' | 'mobile' | 'desktop';

// Device-specific display settings
export interface DeviceDisplaySettings {
  desktop: {
    columnVisibility: ColumnVisibility;
    columnStyles: ColumnStyles;
  };
  mobile: {
    columnVisibility: ColumnVisibility;
    // Mobile uses simplified layout, no custom column styles
  };
}

export type ColumnFontSize = 'xs' | 'sm' | 'base' | 'lg';
export type ColumnFontWeight = 'normal' | 'medium' | 'semibold' | 'bold';

export interface ColumnStyle {
  width: number;  // Width in pixels
  fontColor: string;  // Hex color
  fontSize: ColumnFontSize;
  fontWeight: ColumnFontWeight;
}

export type ColumnKey = 'name' | 'ticker' | 'price' | 'limit' | 'distance' | 'dayChange' | 'range' | 'rangeDelta' | 'chart' | 'currency' | 'lastRefresh';

export type ColumnStyles = Record<ColumnKey, ColumnStyle>;

export interface HistoricalDataPoint {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export type ChartTimeframe = '7d' | '30d' | '90d' | '1y' | '3y' | '5y';
export type RangePeriod = '1y' | '3y' | '5y';  // For 52W range dropdown

export interface AlertSettings {
  customThresholds: number[];
  enabled: boolean;
}

export interface Tab {
  id: string;
  name: string;
  accentColor: string;
  stocks: Stock[];
  sortField: SortField;
  sortDirection: SortDirection;
  createdAt: string;
}

// Purchased stock - separate from tabs
export interface PurchasedStock extends Stock {
  purchasedPrice: number;  // Required for purchased stocks
  purchasedDate: string;   // Required for purchased stocks
  originalTabId: string;   // Tab it came from (for potential restore)
  originalTabName: string; // Tab name for display
  originalTabColor: string; // Tab color for display
}

export type SortField = 'ticker' | 'currentPrice' | 'distanceToLimit' | 'dayChangePercent';
export type SortDirection = 'asc' | 'desc';

export interface ArchivedStock {
  id: string;
  ticker: string;
  name: string;
  purchasePrice: number;
  purchaseDate: string;
  archivedAt: string;
  buyLimit: number | null;
  currency: string;
  // For profit tracking
  currentPrice?: number;
  exchange?: string;
  lastUpdated?: string;
}

export interface Notification {
  id: string;
  stockId: string;
  ticker: string;
  message: string;
  threshold: number;
  createdAt: string;
  read: boolean;
  type: 'buy_signal' | 'threshold_alert' | 'profit_milestone' | 'loss_alert';
}

export interface LimitHistory {
  id: string;
  stockId: string;
  ticker: string;
  oldLimit: number | null;
  newLimit: number | null;
  timestamp: string;
}

export interface ApiKeyConfig {
  provider: ApiProvider;
  apiKey: string;
  enabled: boolean;
}

export interface UserSettings {
  updateInterval: number;
  autoScanEnabled: boolean;  // Smart auto-scan during market hours
  notifications: {
    enabled: boolean;
    thresholds: number[];
    audioEnabled: boolean;
    pushEnabled: boolean;  // Browser push notifications
    quietHours: {
      enabled: boolean;
      start: string;  // HH:MM format
      end: string;    // HH:MM format
    };
    dailyDropAlert: number | null;  // Alert if stock drops X% in one day (null = disabled)
  };
  globalChartTimeframe: ChartTimeframe | null;
  sessionTimeout: number;
  apiKey: string;
  apiProvider: ApiProvider;
  apiKeys: ApiKeyConfig[];  // Multiple API keys support
  fontSize: FontSize;
  colorScheme: ColorScheme;
  rangePeriod: RangePeriod;  // Period for high/low range (1y, 3y, 5y)
  columnVisibility: ColumnVisibility;  // Desktop columns on/off
  columnStyles: ColumnStyles;  // Desktop per-column styling (width, font)
  viewMode: ViewMode;  // auto, mobile, or desktop
  mobileColumnVisibility: ColumnVisibility;  // Mobile-specific column visibility
  headerButtonVisibility: HeaderButtonVisibility;  // Which buttons to show in header
  buySignalDisplay: BuySignalDisplayOptions;  // Buy signal card display options
  customColumnTitle: string;  // Title for the custom checkbox column
  fixedTabColors: FixedTabColors;  // Color customization for fixed tabs (All, Top, Purchased)
  scanPriorityWeights: ScanPriorityWeights;  // Configurable scan priority weights
  tileSettings: TileSettings;  // Mini tiles view customization
}

export interface TileSettings {
  showLabel: 'ticker' | 'name' | 'auto';  // auto = name when ticker has >2 digits
  showDistance: boolean;       // Show distance to limit percentage
  showDayChange: boolean;     // Show today's price change
  showFreshness: boolean;     // Show freshness dots
  tileSize: 'small' | 'medium' | 'large';  // Tile min-width: 65/80/110px
  fontWeight: 'normal' | 'bold';  // Label font weight
  labelColor: string;         // Color for ticker/name ('auto' = WCAG contrast)
  distanceColor: string;      // Color for distance % ('auto' = WCAG contrast)
  dayChangeColor: string;     // Color for day change text
  dotsColor: string;          // Color for freshness dots ('auto' = WCAG contrast)
  labelFontSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  distanceFontSize: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  dayChangeFontSize: 'xs' | 'sm' | 'md' | 'lg';
  rainbowPreset: string;      // Preset ID for rainbow colors
}

export interface ScanPriorityWeights {
  lastScanTime: number;     // 0-100: Priority for stocks not scanned recently
  distanceToLimit: number;  // 0-100: Priority for stocks close to buy limit
  volatility: number;       // 0-100: Priority for high-volatility stocks
  rainbowBlocks: number;    // 0-100: Priority for stocks with most rainbow blocks (closest to limit)
  skipErrorStocks: boolean; // Skip stocks that errored last scan
}

export type FontSize = 'small' | 'medium' | 'large';
export type ColorScheme = 'dark' | 'midnight' | 'ocean' | 'forest';

export type ApiProvider = 'alphavantage' | 'twelvedata' | 'fmp' | 'yahoo';

// Scan status for refresh queue
export type ScanResultType =
  | 'success'           // Fully successful
  | 'partial'           // Some data retrieved
  | 'fallback_success'  // Primary failed, fallback succeeded
  | 'failed'            // All providers failed
  | 'unavailable'       // Stock not available on any provider
  | 'pending';          // Not yet scanned

export interface ScanStatus {
  type: ScanResultType;
  timestamp: string;
  message: string;
  previousPrice?: number;
  newPrice?: number;
  provider?: ApiProvider;      // Which provider succeeded
  failedProviders?: ApiProvider[]; // Which providers failed
}

// Market status for smart refresh
export interface MarketStatus {
  isOpen: boolean;
  exchange: string;
  timezone: string;
  nextOpen?: Date;
  nextClose?: Date;
}

export interface AppState {
  isAuthenticated: boolean;
  isLoading: boolean;
  tabs: Tab[];
  activeTabId: string | null;
  archive: ArchivedStock[];
  purchasedStocks: PurchasedStock[];  // Stocks marked as purchased (separate from tabs)
  notifications: Notification[];
  limitHistory: LimitHistory[];
  scanLog: ScanLogEntry[];  // Log of all scans for debugging
  rangeLog: RangeLogEntry[];  // Log of range fetch attempts
  actionLog: ActionLogEntry[];  // Log of manual actions for undo
  settings: UserSettings;
  lastSyncTime: string | null;
  encryptionKeyHash: string | null;
}

// Stock issue types for troubleshooting
export type StockIssueType =
  | 'price_not_loading'    // Actuele koers wordt niet geladen
  | 'price_incorrect'      // Actuele koers klopt niet
  | 'range_incorrect'      // De range klopt niet
  | 'not_refreshing'       // Wordt niet meegenomen tijdens verversen
  | 'wrong_exchange';      // Niet gekoppeld aan juiste exchange

export interface StockIssue {
  id: string;
  stockId: string;
  ticker: string;
  type: StockIssueType;
  description: string;
  createdAt: string;
  resolvedAt?: string;
  resolved: boolean;
  resolution?: string;  // User notes about resolution
  diagnosticLog: string[];  // Log of what was tried
}

export interface BuySignal {
  stock: Stock;
  tabId: string;
  tabName: string;
  tabColor: string;
  reachedAt: string;
}

// Scan log entry - records each scan for debugging/verification
export interface ScanLogEntry {
  id: string;
  timestamp: string;
  ticker: string;
  stockId: string;
  tabName: string;
  type: 'auto' | 'manual' | 'batch' | 'single';  // Type of scan
  result: ScanResultType;
  previousPrice: number | null;
  newPrice: number | null;
  priceChange: number | null;  // Percentage change
  provider: ApiProvider | null;
  duration: number;  // Milliseconds
  reasons: string[];  // Why this stock was scanned (from priority system)
  error?: string;  // Error message if failed
}

// Range log entry - records each range fetch attempt
export interface RangeLogEntry {
  id: string;
  timestamp: string;
  ticker: string;
  stockId: string;
  tabName: string;
  type: 'first_fetch' | 'refresh';  // First time or refresh of existing data
  result: 'success' | 'no_data' | 'error';
  // Range values found (only on success)
  year5Low?: number;
  year5High?: number;
  year3Low?: number;
  year3High?: number;
  week52Low?: number;
  week52High?: number;
  rangeLabel?: string;  // Which range was used: '5Y', '3Y', '1Y'
  buyLimit?: number | null;  // Calculated buy limit
  currentPrice?: number;
  duration: number;  // Milliseconds
  error?: string;  // Error message if failed
}

// Action log entry - records manual user actions for undo functionality
export type ActionType =
  | 'add_stock'
  | 'remove_stock'
  | 'update_stock'
  | 'set_buy_limit'
  | 'mark_purchased'
  | 'restore_from_purchased'
  | 'archive_stock'
  | 'restore_from_archive'
  | 'add_tab'
  | 'remove_tab'
  | 'update_tab'
  | 'move_stock';

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  type: ActionType;
  description: string;  // Human-readable description
  // Data needed to undo the action
  undoData: {
    // For stock actions
    stockId?: string;
    stockData?: Partial<Stock>;  // The previous state
    tabId?: string;
    tabData?: Partial<Tab>;  // The previous state
    // For purchased/archive
    purchasedStockData?: PurchasedStock;
    archivedStockData?: ArchivedStock;
    // For limit changes
    previousLimit?: number | null;
    newLimit?: number | null;
    // For move operations
    fromTabId?: string;
    toTabId?: string;
  };
  canUndo: boolean;  // Some actions may not be undoable
}
