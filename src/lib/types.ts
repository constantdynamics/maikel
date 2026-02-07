export interface Stock {
  id: string;
  ticker: string;
  company_name: string;
  sector: string | null;
  current_price: number | null;
  all_time_high: number | null;
  ath_decline_pct: number | null;
  five_year_low: number | null;
  purchase_limit: number | null;
  score: number;
  growth_event_count: number;
  highest_growth_pct: number | null;
  highest_growth_date: string | null;
  detection_date: string;
  last_updated: string;
  is_favorite: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  is_archived: boolean;
  archived_at: string | null;
  is_delisted: boolean;
  is_acquired: boolean;
  confidence_score: number;
  needs_review: boolean;
  review_reason: string | null;
  exchange: string | null;
  ipo_date: string | null;
  market_cap: number | null;
  created_at: string;
  scan_number: number | null;  // Which scan of the day found this stock (1, 2, 3, etc.)
  scan_date: string | null;    // Date of the scan that found/updated this stock
  // NovaBay-type analysis fields
  twelve_month_low: number | null;
  twelve_month_max_decline_pct: number | null;
  twelve_month_max_spike_pct: number | null;
  is_stable_with_spikes: boolean;
}

export interface PriceHistory {
  id: string;
  ticker: string;
  trade_date: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
}

export interface GrowthEvent {
  id: string;
  ticker: string;
  start_date: string;
  end_date: string;
  start_price: number;
  peak_price: number;
  growth_pct: number;
  consecutive_days_above: number;
  is_valid: boolean;
  created_at: string;
}

export interface StockScanDetail {
  ticker: string;
  name: string;
  source: 'tradingview_losers' | 'tradingview_high_decline' | 'both';
  tvPrice: number;
  tvChange: number;
  tvATH: number | null;
  tvDeclineFromATH: number | null;
  sector: string | null;
  phase: 'pre_filter' | 'deep_scan';
  result: 'match' | 'rejected' | 'error';
  rejectReason?: string;
  errorMessage?: string;
  yahooHistoryDays?: number;
  yahooATH?: number;
  yahooDeclineFromATH?: number;
  growthEvents?: number;
  growthScore?: number;
  highestGrowthPct?: number;
}

export interface ScanLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'partial';
  stocks_scanned: number;
  stocks_found: number;
  errors: string[];
  duration_seconds: number | null;
  api_calls_yahoo: number;
  api_calls_alphavantage: number;
  details: StockScanDetail[] | null;
  created_at: string;
}

export interface ErrorLog {
  id: string;
  source: string;
  message: string;
  details: Record<string, unknown> | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  created_at: string;
}

export interface HealthCheck {
  id: string;
  yahoo_finance_status: string;
  alpha_vantage_status: string;
  database_status: string;
  last_scan_status: string | null;
  last_scan_time: string | null;
  checked_at: string;
}

export interface Archive {
  id: string;
  filename: string;
  month: string;
  stock_count: number;
  file_size_bytes: number | null;
  csv_data: string | null;
  created_at: string;
}

export interface Settings {
  ath_decline_min: number;
  ath_decline_max: number;
  growth_threshold_pct: number;
  min_growth_events: number;
  min_consecutive_days: number;
  growth_lookback_years: number;
  purchase_limit_multiplier: number;
  scan_times: string[];
  excluded_sectors: string[];
  included_volatile_sectors: string[];  // Changed: sectors to INCLUDE (empty = scan all non-volatile)
  market_cap_categories: string[];      // Changed: array of selected categories ['micro', 'small', 'mid', 'large']
  auto_scan_interval_minutes: number;
  // NovaBay-type filter: stable stocks with upward spikes
  enable_stable_spike_filter: boolean;
  stable_max_decline_pct: number;       // Max decline allowed in last 12 months (e.g., 10%)
  stable_min_spike_pct: number;         // Min spike required above base (e.g., 100%)
  stable_lookback_months: number;       // How far back to look (default: 12)
  // Scanner variety settings
  skip_recently_scanned_hours: number;  // Skip stocks scanned within X hours (0 = don't skip)
}

// Default volatile sectors list
export const DEFAULT_VOLATILE_SECTORS = [
  'Biotechnology',
  'Pharmaceuticals',
  'Drug Manufacturers',
  'Cannabis',
  'Cryptocurrency',
  'SPACs',
  'Shell Companies',
  'Junior Mining',
  'Penny Stocks',
  'Gambling',
  'Adult Entertainment',
];

// Market cap categories with ranges
export const MARKET_CAP_CATEGORIES = {
  micro: { label: 'Micro (<$300M)', min: 0, max: 300_000_000 },
  small: { label: 'Small ($300M-$2B)', min: 300_000_000, max: 2_000_000_000 },
  mid: { label: 'Mid ($2B-$10B)', min: 2_000_000_000, max: 10_000_000_000 },
  large: { label: 'Large ($10B+)', min: 10_000_000_000, max: Infinity },
} as const;

export type MarketCapCategory = keyof typeof MARKET_CAP_CATEGORIES;

export interface StockQuote {
  ticker: string;
  name: string;
  price: number;
  exchange: string;
  sector?: string;
  marketCap?: number;
  allTimeHigh?: number;
  fiftyTwoWeekLow?: number;
  ipoDate?: string;
}

export interface OHLCData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  column: keyof Stock;
  direction: SortDirection;
}

export interface FilterConfig {
  search: string;
  sectorFilter: string;
  scoreMin: number | null;
  scoreMax: number | null;
  athDeclineMin: number | null;
  athDeclineMax: number | null;
  showFavorites: boolean;
  showArchived: boolean;
  hideVolatileSectors: boolean;
  marketCapMin: number | null;
  marketCapMax: number | null;
  showStableWithSpikes: boolean;  // Filter for NovaBay-type stocks
}

// Sectors known to be extremely volatile
export const VOLATILE_SECTORS = [
  'Biotechnology',
  'Pharmaceuticals',
  'Cannabis',
  'Cryptocurrency',
  'SPACs',
  'Junior Mining',
  'Penny Stocks',
];

export type ScoreColor = 'green' | 'orange' | 'red';

export function getScoreColor(score: number): ScoreColor {
  if (score >= 6) return 'green';
  if (score >= 3) return 'orange';
  return 'red';
}

export function calculateExponentialScore(eventCount: number): number {
  if (eventCount <= 0) return 0;
  // 1x = 1pt, 2x = 3pts, 3x = 6pts, 4x = 10pts (triangular numbers)
  return (eventCount * (eventCount + 1)) / 2;
}
