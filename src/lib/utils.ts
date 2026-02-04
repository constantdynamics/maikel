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

export function stocksToCSV(stocks: Record<string, unknown>[]): string {
  if (stocks.length === 0) return '';

  const headers = [
    'Ticker',
    'Company Name',
    'Sector',
    'Current Price',
    'ATH',
    '% Decline ATH',
    'Score',
    'Highest Growth %',
    '# Growth Events',
    '5Y Low',
    'Purchase Limit',
    'Detection Date',
    'Exchange',
    'Confidence Score',
  ];

  const rows = stocks.map((s) => [
    s.ticker,
    `"${(s.company_name as string || '').replace(/"/g, '""')}"`,
    s.sector || '',
    s.current_price ?? '',
    s.all_time_high ?? '',
    s.ath_decline_pct ?? '',
    s.score ?? '',
    s.highest_growth_pct ?? '',
    s.growth_event_count ?? '',
    s.five_year_low ?? '',
    s.purchase_limit ?? '',
    s.detection_date || '',
    s.exchange || '',
    s.confidence_score ?? '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
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
