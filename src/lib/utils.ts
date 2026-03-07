import { format } from 'date-fns';

export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(2)}%`;
}

export function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return format(new Date(dateStr), 'yyyy-MM-dd');
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
}

export function generateCsvFilename(prefix: string = 'StockScreener'): string {
  return `${prefix}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
}

export function generateExportFilename(prefix: string, ext: 'csv' | 'json'): string {
  return `${prefix}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.${ext}`;
}

/** Escape a value for CSV (wrap in quotes if it contains commas, quotes, or newlines). */
function csvEscape(val: unknown): string {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Generic: convert array of objects to CSV using provided column definitions. */
function objectsToCsv(
  rows: Record<string, unknown>[],
  columns: { header: string; key: string }[],
): string {
  if (rows.length === 0) return '';
  const headerLine = columns.map((c) => c.header).join(',');
  const dataLines = rows.map((row) =>
    columns.map((c) => csvEscape(row[c.key])).join(','),
  );
  return [headerLine, ...dataLines].join('\n');
}

// ── Kuifje CSV columns ──
const KUIFJE_CSV_COLUMNS = [
  { header: 'Ticker', key: 'ticker' },
  { header: 'Company Name', key: 'company_name' },
  { header: 'Sector', key: 'sector' },
  { header: 'Exchange', key: 'exchange' },
  { header: 'Current Price', key: 'current_price' },
  { header: 'ATH', key: 'all_time_high' },
  { header: 'ATH Decline %', key: 'ath_decline_pct' },
  { header: 'Score', key: 'score' },
  { header: 'Growth Events', key: 'growth_event_count' },
  { header: 'Highest Growth %', key: 'highest_growth_pct' },
  { header: 'Highest Growth Date', key: 'highest_growth_date' },
  { header: '5Y Low', key: 'five_year_low' },
  { header: '3Y Low', key: 'three_year_low' },
  { header: '12M Low', key: 'twelve_month_low' },
  { header: 'Purchase Limit', key: 'purchase_limit' },
  { header: '12M Max Decline %', key: 'twelve_month_max_decline_pct' },
  { header: '12M Max Spike %', key: 'twelve_month_max_spike_pct' },
  { header: 'Stable+Spike', key: 'is_stable_with_spikes' },
  { header: 'Market Cap', key: 'market_cap' },
  { header: 'IPO Date', key: 'ipo_date' },
  { header: 'Confidence Score', key: 'confidence_score' },
  { header: 'Detection Date', key: 'detection_date' },
  { header: 'Last Updated', key: 'last_updated' },
  { header: 'Scan Number', key: 'scan_number' },
  { header: 'Scan Date', key: 'scan_date' },
  { header: 'Favorite', key: 'is_favorite' },
  { header: 'Needs Review', key: 'needs_review' },
  { header: 'Review Reason', key: 'review_reason' },
];

// ── Zonnebloem CSV columns ──
const ZONNEBLOEM_CSV_COLUMNS = [
  { header: 'Ticker', key: 'ticker' },
  { header: 'Company Name', key: 'company_name' },
  { header: 'Sector', key: 'sector' },
  { header: 'Exchange', key: 'exchange' },
  { header: 'Market', key: 'market' },
  { header: 'Country', key: 'country' },
  { header: 'Current Price', key: 'current_price' },
  { header: 'Base Price Median', key: 'base_price_median' },
  { header: 'Spike Score', key: 'spike_score' },
  { header: 'Spike Count', key: 'spike_count' },
  { header: 'Highest Spike %', key: 'highest_spike_pct' },
  { header: 'Highest Spike Date', key: 'highest_spike_date' },
  { header: 'Price 12M Ago', key: 'price_12m_ago' },
  { header: '12M Change %', key: 'price_change_12m_pct' },
  { header: 'Avg Volume 30d', key: 'avg_volume_30d' },
  { header: 'Market Cap', key: 'market_cap' },
  { header: 'Detection Date', key: 'detection_date' },
  { header: 'Last Updated', key: 'last_updated' },
  { header: 'Favorite', key: 'is_favorite' },
  { header: 'Needs Review', key: 'needs_review' },
  { header: 'Review Reason', key: 'review_reason' },
];

// ── Sector (BioPharma/Mining) CSV columns ──
const SECTOR_CSV_COLUMNS = [
  { header: 'Ticker', key: 'ticker' },
  { header: 'Yahoo Ticker', key: 'yahoo_ticker' },
  { header: 'Company Name', key: 'company_name' },
  { header: 'Sector', key: 'sector' },
  { header: 'Exchange', key: 'exchange' },
  { header: 'Market', key: 'market' },
  { header: 'Country', key: 'country' },
  { header: 'Current Price', key: 'current_price' },
  { header: 'Match Type', key: 'match_type' },
  // Kuifje fields
  { header: 'Score', key: 'score' },
  { header: 'Growth Events', key: 'growth_event_count' },
  { header: 'Highest Growth %', key: 'highest_growth_pct' },
  { header: 'Highest Growth Date', key: 'highest_growth_date' },
  { header: 'ATH', key: 'all_time_high' },
  { header: 'ATH Decline %', key: 'ath_decline_pct' },
  { header: '5Y Low', key: 'five_year_low' },
  { header: '3Y Low', key: 'three_year_low' },
  { header: 'Purchase Limit', key: 'purchase_limit' },
  { header: 'Confidence Score', key: 'confidence_score' },
  // Zonnebloem fields
  { header: 'Spike Score', key: 'spike_score' },
  { header: 'Spike Count', key: 'spike_count' },
  { header: 'Highest Spike %', key: 'highest_spike_pct' },
  { header: 'Highest Spike Date', key: 'highest_spike_date' },
  { header: 'Base Price Median', key: 'base_price_median' },
  { header: 'Price 12M Ago', key: 'price_12m_ago' },
  { header: '12M Change %', key: 'price_change_12m_pct' },
  // Shared
  { header: 'Avg Volume 30d', key: 'avg_volume_30d' },
  { header: 'Market Cap', key: 'market_cap' },
  { header: 'Detection Date', key: 'detection_date' },
  { header: 'Last Updated', key: 'last_updated' },
  { header: 'Favorite', key: 'is_favorite' },
  { header: 'Needs Review', key: 'needs_review' },
  { header: 'Review Reason', key: 'review_reason' },
];

const MORIA_CSV_COLUMNS = [
  { header: 'Ticker', key: 'ticker' },
  { header: 'Yahoo Ticker', key: 'yahoo_ticker' },
  { header: 'Company Name', key: 'company_name' },
  { header: 'Sector', key: 'sector' },
  { header: 'Exchange', key: 'exchange' },
  { header: 'Market', key: 'market' },
  { header: 'Country', key: 'country' },
  { header: 'Current Price', key: 'current_price' },
  { header: 'ATH', key: 'all_time_high' },
  { header: 'ATH Decline %', key: 'ath_decline_pct' },
  { header: '3Y High', key: 'high_3y' },
  { header: '3Y Decline %', key: 'decline_from_3y_pct' },
  { header: '1Y High', key: 'high_1y' },
  { header: '1Y Decline %', key: 'decline_from_1y_pct' },
  { header: '6M High', key: 'high_6m' },
  { header: '6M Decline %', key: 'decline_from_6m_pct' },
  { header: 'Avg Volume 30d', key: 'avg_volume_30d' },
  { header: 'Market Cap', key: 'market_cap' },
  { header: 'Detection Date', key: 'detection_date' },
  { header: 'Last Updated', key: 'last_updated' },
  { header: 'Favorite', key: 'is_favorite' },
];

type ExportTab = 'kuifje' | 'zonnebloem' | 'biopharma' | 'mining' | 'hydrogen' | 'shipping' | 'moria' | 'bluepill';

/** Convert scanner stocks to CSV based on tab type. */
export function scannerStocksToCSV(stocks: Record<string, unknown>[], tab: ExportTab): string {
  const columns = tab === 'kuifje' ? KUIFJE_CSV_COLUMNS
    : tab === 'zonnebloem' ? ZONNEBLOEM_CSV_COLUMNS
    : tab === 'moria' ? MORIA_CSV_COLUMNS
    : tab === 'bluepill' ? MORIA_CSV_COLUMNS
    : SECTOR_CSV_COLUMNS;
  return objectsToCsv(stocks, columns);
}

/** Export scanner stocks as JSON string. */
export function scannerStocksToJSON(stocks: Record<string, unknown>[], tab: ExportTab): string {
  // Strip internal/UI fields, keep all data fields
  const cleaned = stocks.map((s) => {
    const { is_deleted, deleted_at, is_archived, archived_at, ...rest } = s;
    return rest;
  });
  return JSON.stringify({ tab, exportedAt: new Date().toISOString(), count: cleaned.length, stocks: cleaned }, null, 2);
}

/** Export all scanner tabs as a single JSON file. */
export function allScannerTabsToJSON(data: Record<ExportTab, Record<string, unknown>[]>): string {
  const result: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    tabs: {} as Record<string, unknown>,
  };
  for (const tab of ['kuifje', 'zonnebloem', 'biopharma', 'mining', 'hydrogen', 'shipping', 'moria', 'bluepill'] as ExportTab[]) {
    const stocks = (data[tab] || []).map((s) => {
      const { is_deleted, deleted_at, is_archived, archived_at, ...rest } = s;
      return rest;
    });
    (result.tabs as Record<string, unknown>)[tab] = { count: stocks.length, stocks };
  }
  return JSON.stringify(result, null, 2);
}

/** Download a file (CSV or JSON). */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;'): void {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// Legacy CSV export (kept for backward compatibility)
export function stocksToCSV(stocks: Record<string, unknown>[]): string {
  return scannerStocksToCSV(stocks, 'kuifje');
}

// Legacy download wrapper (kept for backward compatibility)
export function downloadCSV(content: string, filename: string): void {
  downloadFile(content, filename, 'text/csv;charset=utf-8;');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, i));
      }
    }
  }
  throw lastError;
}
