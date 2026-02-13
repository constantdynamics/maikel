import type { Stock, HistoricalDataPoint, ApiProvider, ApiKeyConfig, MarketStatus } from '../types';
import {
  getCachedIfValid,
  saveToCache,
  getCacheStatus,
} from './persistentCache';
import {
  canMakeRequest,
  recordRequest,
  getUsageStats,
  getAvailableRequests,
  RATE_LIMITS,
  markProviderExhausted,
} from './rateLimiter';
import {
  logApiCall,
  logApiResponse,
  logCacheHit,
  logCacheMiss,
  logRateLimit,
  logInfo,
} from './debugLogger';

interface QuoteResponse {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  high52Week: number;
  low52Week: number;
  currency: string;
  exchange: string;
}

// Error types for API failures
export type ApiErrorType = 'rate_limit' | 'pro_required' | 'not_found' | 'network' | 'unknown';

export interface ApiError {
  type: ApiErrorType;
  provider: ApiProvider;
  message: string;
}

// Result from fetching stock data with fallback
export interface FetchStockResult {
  data: Partial<Stock> | null;
  unavailableProviders?: ApiProvider[];
  unavailableReason?: string;
}

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  currency: string;
}

// Market hours in local exchange time (24h format)
interface MarketHours {
  open: [number, number];
  close: [number, number];
  timezone: string;
  weekendClosed: boolean;
}

const MARKET_HOURS: Record<string, MarketHours> = {
  // US Markets
  'NYSE': { open: [9, 30], close: [16, 0], timezone: 'America/New_York', weekendClosed: true },
  'NASDAQ': { open: [9, 30], close: [16, 0], timezone: 'America/New_York', weekendClosed: true },
  'US': { open: [9, 30], close: [16, 0], timezone: 'America/New_York', weekendClosed: true },
  'AMEX': { open: [9, 30], close: [16, 0], timezone: 'America/New_York', weekendClosed: true },

  // European Markets
  'LSE': { open: [8, 0], close: [16, 30], timezone: 'Europe/London', weekendClosed: true },
  'XETRA': { open: [9, 0], close: [17, 30], timezone: 'Europe/Berlin', weekendClosed: true },
  'FRA': { open: [9, 0], close: [17, 30], timezone: 'Europe/Berlin', weekendClosed: true },
  'EPA': { open: [9, 0], close: [17, 30], timezone: 'Europe/Paris', weekendClosed: true },
  'EURONEXT': { open: [9, 0], close: [17, 30], timezone: 'Europe/Paris', weekendClosed: true },
  'AMS': { open: [9, 0], close: [17, 30], timezone: 'Europe/Amsterdam', weekendClosed: true },
  'SWX': { open: [9, 0], close: [17, 30], timezone: 'Europe/Zurich', weekendClosed: true },
  'SIX': { open: [9, 0], close: [17, 30], timezone: 'Europe/Zurich', weekendClosed: true },
  'MIL': { open: [9, 0], close: [17, 30], timezone: 'Europe/Rome', weekendClosed: true },
  'BME': { open: [9, 0], close: [17, 30], timezone: 'Europe/Madrid', weekendClosed: true },
  'LUX': { open: [9, 0], close: [17, 35], timezone: 'Europe/Luxembourg', weekendClosed: true },

  // Asian Markets
  'TYO': { open: [9, 0], close: [15, 0], timezone: 'Asia/Tokyo', weekendClosed: true },
  'TSE': { open: [9, 30], close: [16, 0], timezone: 'America/Toronto', weekendClosed: true },
  'HKEX': { open: [9, 30], close: [16, 0], timezone: 'Asia/Hong_Kong', weekendClosed: true },
  'HKG': { open: [9, 30], close: [16, 0], timezone: 'Asia/Hong_Kong', weekendClosed: true },
  'SHA': { open: [9, 30], close: [15, 0], timezone: 'Asia/Shanghai', weekendClosed: true },
  'SHE': { open: [9, 30], close: [15, 0], timezone: 'Asia/Shanghai', weekendClosed: true },
  'SGX': { open: [9, 0], close: [17, 0], timezone: 'Asia/Singapore', weekendClosed: true },
  'KRX': { open: [9, 0], close: [15, 30], timezone: 'Asia/Seoul', weekendClosed: true },
  'NSE': { open: [9, 15], close: [15, 30], timezone: 'Asia/Kolkata', weekendClosed: true },
  'BSE': { open: [9, 15], close: [15, 30], timezone: 'Asia/Kolkata', weekendClosed: true },

  // Australia
  'ASX': { open: [10, 0], close: [16, 0], timezone: 'Australia/Sydney', weekendClosed: true },

  // Canada
  'TOR': { open: [9, 30], close: [16, 0], timezone: 'America/Toronto', weekendClosed: true },
};

// Check if a market is currently open
export function isMarketOpen(exchange: string): MarketStatus {
  const normalizedExchange = exchange.toUpperCase().replace(/[^A-Z]/g, '');

  let hours = MARKET_HOURS[normalizedExchange];

  if (!hours) {
    for (const [key, value] of Object.entries(MARKET_HOURS)) {
      if (normalizedExchange.includes(key) || key.includes(normalizedExchange)) {
        hours = value;
        break;
      }
    }
  }

  if (!hours) {
    hours = MARKET_HOURS['NYSE'];
  }

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: hours.timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    const minutePart = parts.find(p => p.type === 'minute');
    const dayPart = parts.find(p => p.type === 'weekday');

    const currentHour = parseInt(hourPart?.value || '0');
    const currentMinute = parseInt(minutePart?.value || '0');
    const dayOfWeek = dayPart?.value || '';

    const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
    if (hours.weekendClosed && isWeekend) {
      return {
        isOpen: false,
        exchange: normalizedExchange,
        timezone: hours.timezone,
      };
    }

    const currentTime = currentHour * 60 + currentMinute;
    const openTime = hours.open[0] * 60 + hours.open[1];
    const closeTime = hours.close[0] * 60 + hours.close[1];

    const isOpen = currentTime >= openTime && currentTime < closeTime;

    return {
      isOpen,
      exchange: normalizedExchange,
      timezone: hours.timezone,
    };
  } catch {
    return {
      isOpen: true,
      exchange: normalizedExchange,
      timezone: 'UTC',
    };
  }
}

// Get all stocks that should be refreshed (markets are open)
export function filterStocksForRefresh(stocks: Stock[]): { toRefresh: Stock[]; skipped: Stock[] } {
  const toRefresh: Stock[] = [];
  const skipped: Stock[] = [];

  for (const stock of stocks) {
    const status = isMarketOpen(stock.exchange);
    if (status.isOpen) {
      toRefresh.push(stock);
    } else {
      skipped.push(stock);
    }
  }

  return { toRefresh, skipped };
}

// Calculate trading hours elapsed since last refresh and return color
// Green: < 15 minutes, Red: > 8 trading hours, gradient in between
export function getRefreshAgeInfo(lastRefreshTime: string | undefined, exchange: string): {
  formattedTime: string;  // dd:hh:mm format
  color: string;          // Color based on trading hours elapsed
  tradingMinutes: number; // Trading minutes elapsed
} {
  if (!lastRefreshTime) {
    return { formattedTime: '--:--:--', color: '#6b7280', tradingMinutes: 0 };
  }

  const lastRefresh = new Date(lastRefreshTime);
  const now = new Date();
  const totalMinutesElapsed = Math.floor((now.getTime() - lastRefresh.getTime()) / 60000);

  // Format as dd:hh:mm
  const days = Math.floor(totalMinutesElapsed / (24 * 60));
  const hours = Math.floor((totalMinutesElapsed % (24 * 60)) / 60);
  const minutes = totalMinutesElapsed % 60;
  const formattedTime = `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  // Get market hours for this exchange
  const normalizedExchange = exchange.toUpperCase().replace(/[^A-Z]/g, '');
  let marketHours = MARKET_HOURS[normalizedExchange];
  if (!marketHours) {
    for (const [key, value] of Object.entries(MARKET_HOURS)) {
      if (normalizedExchange.includes(key) || key.includes(normalizedExchange)) {
        marketHours = value;
        break;
      }
    }
  }
  if (!marketHours) {
    marketHours = MARKET_HOURS['NYSE'];
  }

  // Calculate trading minutes (only count when market is open)
  const tradingDayMinutes = (marketHours.close[0] * 60 + marketHours.close[1]) -
                            (marketHours.open[0] * 60 + marketHours.open[1]);

  let tradingMinutes = 0;

  // Check if market is currently open
  const marketStatus = isMarketOpen(exchange);

  if (totalMinutesElapsed < 60 * 24) {
    // Less than a day - simplified: count actual minutes if market is open
    if (marketStatus.isOpen) {
      tradingMinutes = Math.min(totalMinutesElapsed, tradingDayMinutes);
    } else {
      // Market closed - keep color at what it was when market closed
      // Estimate: if refreshed recently, assume during market hours
      tradingMinutes = Math.min(totalMinutesElapsed, tradingDayMinutes);
    }
  } else {
    // More than a day - estimate based on trading days (5/7 of days are trading days)
    const estimatedTradingDays = Math.floor(totalMinutesElapsed / (24 * 60)) * 5 / 7;
    tradingMinutes = Math.floor(estimatedTradingDays * tradingDayMinutes);
  }

  // Color calculation:
  // Green (#00ff88): < 15 minutes
  // Yellow (#ffcc00): ~2 trading hours
  // Orange (#ff8800): ~4 trading hours
  // Red (#ff3366): > 8 trading hours (480 minutes)

  let color: string;
  if (tradingMinutes < 15) {
    color = '#00ff88'; // Green
  } else if (tradingMinutes < 60) {
    // 15-60 min: green to yellow-green
    const t = (tradingMinutes - 15) / 45;
    color = interpolateColor('#00ff88', '#aaee00', t);
  } else if (tradingMinutes < 120) {
    // 1-2 hours: yellow-green to yellow
    const t = (tradingMinutes - 60) / 60;
    color = interpolateColor('#aaee00', '#ffcc00', t);
  } else if (tradingMinutes < 240) {
    // 2-4 hours: yellow to orange
    const t = (tradingMinutes - 120) / 120;
    color = interpolateColor('#ffcc00', '#ff8800', t);
  } else if (tradingMinutes < 480) {
    // 4-8 hours: orange to red
    const t = (tradingMinutes - 240) / 240;
    color = interpolateColor('#ff8800', '#ff3366', t);
  } else {
    color = '#ff3366'; // Red
  }

  return { formattedTime, color, tradingMinutes };
}

// Helper function to interpolate between two hex colors
function interpolateColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);

  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Re-export rate limiter functions for backward compatibility
export { getUsageStats as getApiUsage, getAvailableRequests, RATE_LIMITS };

// Export cache status checkers
export function getStockCacheStatus(symbol: string, exchange?: string): {
  cached: boolean;
  stale: boolean;
  timestamp: number | null;
  ageMinutes: number | null;
  marketOpen: boolean;
} {
  const marketStatus = exchange ? isMarketOpen(exchange) : { isOpen: true };

  // Check both Twelve Data and Alpha Vantage cache keys
  const tdStatus = getCacheStatus(`td-quote-${symbol}`, 'quote', marketStatus.isOpen);
  const avStatus = getCacheStatus(`av-quote-${symbol}`, 'quote', marketStatus.isOpen);

  // Use whichever is cached and not stale
  if (tdStatus.cached && !tdStatus.stale) {
    return { ...tdStatus, marketOpen: marketStatus.isOpen };
  }
  if (avStatus.cached && !avStatus.stale) {
    return { ...avStatus, marketOpen: marketStatus.isOpen };
  }

  // Return the more recent one
  if (tdStatus.cached && avStatus.cached) {
    const better = (tdStatus.timestamp || 0) > (avStatus.timestamp || 0) ? tdStatus : avStatus;
    return { ...better, marketOpen: marketStatus.isOpen };
  }

  return {
    cached: tdStatus.cached || avStatus.cached,
    stale: true,
    timestamp: tdStatus.timestamp || avStatus.timestamp,
    ageMinutes: tdStatus.ageMinutes || avStatus.ageMinutes,
    marketOpen: marketStatus.isOpen,
  };
}

export function getHistoricalCacheStatus(symbol: string): {
  cached: boolean;
  stale: boolean;
  ageMinutes: number | null;
} {
  const tdStatus = getCacheStatus(`td-hist-${symbol}`, 'historical', true);
  const avStatus = getCacheStatus(`av-hist-${symbol}`, 'historical', true);

  if (tdStatus.cached && !tdStatus.stale) {
    return tdStatus;
  }
  if (avStatus.cached && !avStatus.stale) {
    return avStatus;
  }

  return {
    cached: tdStatus.cached || avStatus.cached,
    stale: true,
    ageMinutes: tdStatus.ageMinutes || avStatus.ageMinutes,
  };
}

// Alpha Vantage API implementation
async function alphaVantageQuote(symbol: string, apiKey: string, exchange?: string): Promise<QuoteResponse | null> {
  const cacheKey = `av-quote-${symbol}`;
  const marketOpen = exchange ? isMarketOpen(exchange).isOpen : true;

  // Check persistent cache first
  const cached = getCachedIfValid<QuoteResponse>(cacheKey, 'quote', marketOpen);
  if (cached) {
    console.log(`[AV] Cache hit for ${symbol}`);
    return cached;
  }

  // Check rate limits
  const canProceed = canMakeRequest('alphavantage');
  if (!canProceed.allowed) {
    console.warn(`[AV] Rate limited: ${canProceed.reason}`);
    return null;
  }

  try {
    console.log(`[AV] Fetching quote for ${symbol}...`);
    recordRequest('alphavantage');

    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
    );

    if (!res.ok) return null;

    const data = await res.json();

    if (data.Note || data.Information) {
      console.warn('Alpha Vantage:', data.Note || data.Information);
      return null;
    }

    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) {
      console.warn(`[AV] No quote data for ${symbol}`);
      try {
        const errorKey = `api-error-alphavantage-${symbol}`;
        localStorage.setItem(errorKey, 'Symbol not found (Alpha Vantage)');
      } catch { /* ignore */ }
      return null;
    }

    const result: QuoteResponse = {
      symbol,
      name: symbol,
      price: parseFloat(quote['05. price']),
      previousClose: parseFloat(quote['08. previous close'] || '0'),
      change: parseFloat(quote['09. change'] || '0'),
      changePercent: parseFloat(quote['10. change percent']?.replace('%', '') || '0'),
      high52Week: parseFloat(quote['03. high'] || '0'),
      low52Week: parseFloat(quote['04. low'] || '0'),
      currency: 'USD',
      exchange: exchange || '',
    };

    saveToCache(cacheKey, result, 'quote');
    return result;
  } catch (e) {
    console.error('Alpha Vantage error:', e);
    return null;
  }
}

async function alphaVantageHistorical(symbol: string, apiKey: string): Promise<HistoricalDataPoint[]> {
  const cacheKey = `av-hist-${symbol}`;

  // Check persistent cache first
  const cached = getCachedIfValid<HistoricalDataPoint[]>(cacheKey, 'historical', true);
  if (cached) {
    console.log(`[AV] Historical cache hit for ${symbol}`);
    return cached;
  }

  // Check rate limits
  const canProceed = canMakeRequest('alphavantage');
  if (!canProceed.allowed) {
    console.warn(`[AV] Rate limited for historical: ${canProceed.reason}`);
    return [];
  }

  try {
    console.log(`[AV] Fetching historical for ${symbol}...`);
    recordRequest('alphavantage');

    const res = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`
    );

    if (!res.ok) return [];

    const data = await res.json();

    if (data.Note || data.Information) {
      console.warn('Alpha Vantage:', data.Note || data.Information);
      return [];
    }

    const timeSeries = data['Time Series (Daily)'];
    if (!timeSeries) return [];

    const result = Object.entries(timeSeries)
      .map(([date, values]) => ({
        date,
        close: parseFloat((values as Record<string, string>)['4. close']),
        open: parseFloat((values as Record<string, string>)['1. open']),
        high: parseFloat((values as Record<string, string>)['2. high']),
        low: parseFloat((values as Record<string, string>)['3. low']),
        volume: parseInt((values as Record<string, string>)['5. volume']),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    saveToCache(cacheKey, result, 'historical');
    return result;
  } catch {
    return [];
  }
}

async function alphaVantageSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const cacheKey = `av-search-${query}`;

  const cached = getCachedIfValid<SearchResult[]>(cacheKey, 'search', true);
  if (cached) return cached;

  const canProceed = canMakeRequest('alphavantage');
  if (!canProceed.allowed) {
    console.warn(`[AV] Rate limited for search: ${canProceed.reason}`);
    return [];
  }

  try {
    recordRequest('alphavantage');

    const res = await fetch(
      `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${apiKey}`
    );

    if (!res.ok) return [];

    const data = await res.json();

    if (data.Note || data.Information) {
      console.warn('Alpha Vantage:', data.Note || data.Information);
      return [];
    }

    const result = (data.bestMatches || []).slice(0, 20).map((item: Record<string, string>) => ({
      symbol: item['1. symbol'],
      name: item['2. name'],
      type: item['3. type'],
      exchange: item['4. region'],
      currency: item['8. currency'],
    }));

    saveToCache(cacheKey, result, 'search');
    return result;
  } catch {
    return [];
  }
}

// Map exchange codes to Yahoo Finance suffixes
function getYahooSymbol(symbol: string, exchange?: string): string {
  console.log(`[Yahoo] getYahooSymbol called with symbol="${symbol}", exchange="${exchange}"`);

  if (!exchange) {
    console.log(`[Yahoo] No exchange provided, returning symbol as-is: ${symbol}`);
    return symbol;
  }

  // Already has a suffix
  if (symbol.includes('.')) {
    console.log(`[Yahoo] Symbol already has suffix, returning as-is: ${symbol}`);
    return symbol;
  }

  // Helper function to pad Hong Kong numeric tickers to 4 digits
  // Yahoo Finance expects HK stocks like 0001.HK, 2382.HK, etc.
  const formatHKTicker = (ticker: string): string => {
    // Check if it's a pure numeric ticker
    if (/^\d+$/.test(ticker)) {
      // Pad to 4 digits if less than 4
      return ticker.padStart(4, '0') + '.HK';
    }
    return ticker + '.HK';
  };

  // Helper function for Shanghai stocks (6xxxxx.SS)
  const formatSSTicker = (ticker: string): string => {
    if (/^\d+$/.test(ticker)) {
      return ticker.padStart(6, '0') + '.SS';
    }
    return ticker + '.SS';
  };

  // Helper function for Shenzhen stocks (0xxxxx.SZ or 3xxxxx.SZ)
  const formatSZTicker = (ticker: string): string => {
    if (/^\d+$/.test(ticker)) {
      return ticker.padStart(6, '0') + '.SZ';
    }
    return ticker + '.SZ';
  };

  const exchangeToSuffix: Record<string, string> = {
    // European
    'AMS': '.AS',      // Amsterdam (Euronext Amsterdam)
    'XAMS': '.AS',
    'EURONEXT': '.AS', // Euronext default to Amsterdam
    'EPA': '.PA',      // Paris (Euronext Paris)
    'XPAR': '.PA',
    'ETR': '.DE',      // Frankfurt (Xetra)
    'XETR': '.DE',
    'FRA': '.F',       // Frankfurt
    'LON': '.L',       // London
    'XLON': '.L',
    'LSE': '.L',
    'SWX': '.SW',      // Swiss Exchange
    'SIX': '.SW',      // Swiss Exchange
    'BRU': '.BR',      // Brussels
    'MIL': '.MI',      // Milan
    'MCE': '.MC',      // Madrid
    'BME': '.MC',      // Madrid
    'LIS': '.LS',      // Lisbon
    // Asian
    'HKG': '.HK',      // Hong Kong
    'HKEX': '.HK',
    'SEHK': '.HK',
    'HKSE': '.HK',
    'TYO': '.T',       // Tokyo
    'JPX': '.T',       // Japan Exchange Group
    'SHA': '.SS',      // Shanghai
    'SSE': '.SS',      // Shanghai Stock Exchange
    'SHE': '.SZ',      // Shenzhen
    'SZSE': '.SZ',     // Shenzhen Stock Exchange
    'SGX': '.SI',      // Singapore
    'KRX': '.KS',      // Korea
    'KOSPI': '.KS',    // Korea
    'KOSDAQ': '.KQ',   // Korea secondary
    'TPE': '.TW',      // Taiwan
    'TWSE': '.TW',     // Taiwan Stock Exchange
    'ASX': '.AX',      // Australia
    // North America
    'TSX': '.TO',      // Toronto
    'TOR': '.TO',      // Toronto
    'CVE': '.V',       // TSX Venture
    'NASDAQ': '',      // US - no suffix
    'NYSE': '',
    'NYSEARCA': '',
    'AMEX': '',
    'US': '',
    'BATS': '',
    'NMS': '',         // NASDAQ Global Market
    'NGM': '',         // NASDAQ Global Market
  };

  const exchangeUpper = exchange.toUpperCase().trim();

  // Special handling for Asian markets with numeric tickers
  const isHongKongExchange = ['HKG', 'HKEX', 'SEHK', 'HKSE'].includes(exchangeUpper) ||
    exchangeUpper.includes('HONG KONG') || exchangeUpper.includes('HONGKONG') || exchangeUpper === 'HK';
  const isShanghaiExchange = ['SHA', 'SSE'].includes(exchangeUpper) ||
    exchangeUpper.includes('SHANGHAI');
  const isShenzhenExchange = ['SHE', 'SZSE'].includes(exchangeUpper) ||
    exchangeUpper.includes('SHENZHEN');

  if (isHongKongExchange) {
    const result = formatHKTicker(symbol);
    console.log(`[Yahoo] Hong Kong exchange detected, formatted: ${result}`);
    return result;
  }

  if (isShanghaiExchange) {
    const result = formatSSTicker(symbol);
    console.log(`[Yahoo] Shanghai exchange detected, formatted: ${result}`);
    return result;
  }

  if (isShenzhenExchange) {
    const result = formatSZTicker(symbol);
    console.log(`[Yahoo] Shenzhen exchange detected, formatted: ${result}`);
    return result;
  }

  const suffix = exchangeToSuffix[exchangeUpper];
  if (suffix !== undefined) {
    const result = `${symbol}${suffix}`;
    console.log(`[Yahoo] Found direct match for exchange "${exchangeUpper}", returning: ${result}`);
    return result;
  }

  // Try to detect from exchange name patterns (fallback for other cases)
  if (exchangeUpper.includes('HONG KONG') || exchangeUpper.includes('HONGKONG') || exchangeUpper === 'HK') {
    const result = formatHKTicker(symbol);
    console.log(`[Yahoo] Detected Hong Kong from pattern, returning: ${result}`);
    return result;
  }
  if (exchangeUpper.includes('AMSTERDAM') || exchangeUpper.includes('AMS') || exchangeUpper.includes('EURONEXT A')) {
    const result = `${symbol}.AS`;
    console.log(`[Yahoo] Detected Amsterdam from pattern, returning: ${result}`);
    return result;
  }
  if (exchangeUpper.includes('LONDON') || exchangeUpper.includes('LSE')) {
    const result = `${symbol}.L`;
    console.log(`[Yahoo] Detected London from pattern, returning: ${result}`);
    return result;
  }
  if (exchangeUpper.includes('FRANKFURT') || exchangeUpper.includes('XETRA') || exchangeUpper.includes('DEUTSCHE')) {
    const result = `${symbol}.DE`;
    console.log(`[Yahoo] Detected Frankfurt from pattern, returning: ${result}`);
    return result;
  }
  if (exchangeUpper.includes('PARIS') || exchangeUpper.includes('EURONEXT P')) {
    const result = `${symbol}.PA`;
    console.log(`[Yahoo] Detected Paris from pattern, returning: ${result}`);
    return result;
  }
  if (exchangeUpper.includes('TOKYO') || exchangeUpper.includes('JAPAN')) {
    const result = `${symbol}.T`;
    console.log(`[Yahoo] Detected Tokyo from pattern, returning: ${result}`);
    return result;
  }
  if (exchangeUpper.includes('BRUSSELS') || exchangeUpper.includes('EURONEXT B')) {
    const result = `${symbol}.BR`;
    console.log(`[Yahoo] Detected Brussels from pattern, returning: ${result}`);
    return result;
  }

  console.log(`[Yahoo] No exchange mapping found for "${exchange}", returning symbol as-is: ${symbol}`);
  return symbol;
}

// Yahoo Finance API implementation (free, no API key required)
async function yahooFinanceQuote(symbol: string, exchange?: string): Promise<QuoteResponse | null> {
  const yahooSymbol = getYahooSymbol(symbol, exchange);
  const cacheKey = `yf-quote-${yahooSymbol}`;
  const marketOpen = exchange ? isMarketOpen(exchange).isOpen : true;

  // Check persistent cache first
  const cached = getCachedIfValid<QuoteResponse>(cacheKey, 'quote', marketOpen);
  if (cached) {
    console.log(`[Yahoo] Cache hit for ${yahooSymbol}`);
    return cached;
  }

  try {
    console.log(`[Yahoo] Fetching quote for ${yahooSymbol} (original: ${symbol}, exchange: ${exchange})...`);

    // Yahoo Finance API endpoint (free, no key needed)
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!res.ok) {
      console.warn(`[Yahoo] HTTP error ${res.status} for ${yahooSymbol}`);
      return null;
    }

    const data = await res.json();

    if (!data.chart?.result?.[0]) {
      console.warn(`[Yahoo] No data for ${symbol}`);
      try {
        const errorKey = `api-error-yahoo-${symbol}`;
        localStorage.setItem(errorKey, 'Symbol not found (Yahoo Finance)');
      } catch { /* ignore */ }
      return null;
    }

    const chartData = data.chart.result[0];
    const meta = chartData.meta;

    if (!meta?.regularMarketPrice) {
      console.warn(`[Yahoo] No price data for ${symbol}`);
      return null;
    }

    const result: QuoteResponse = {
      symbol: meta.symbol || symbol,
      name: meta.shortName || meta.longName || symbol,
      price: meta.regularMarketPrice,
      previousClose: meta.previousClose || meta.chartPreviousClose || 0,
      change: (meta.regularMarketPrice || 0) - (meta.previousClose || 0),
      changePercent: meta.previousClose
        ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100
        : 0,
      high52Week: meta.fiftyTwoWeekHigh || 0,
      low52Week: meta.fiftyTwoWeekLow || 0,
      currency: meta.currency || 'USD',
      exchange: meta.exchangeName || exchange || '',
    };

    saveToCache(cacheKey, result, 'quote');
    console.log(`[Yahoo] Successfully fetched ${symbol}: ${result.price} ${result.currency}`);
    return result;
  } catch (e) {
    console.error('[Yahoo] Error:', e);
    return null;
  }
}

async function yahooFinanceHistorical(symbol: string, exchange?: string): Promise<HistoricalDataPoint[]> {
  const yahooSymbol = getYahooSymbol(symbol, exchange);
  const cacheKey = `yf-hist-${yahooSymbol}`;

  // Check persistent cache first
  const cached = getCachedIfValid<HistoricalDataPoint[]>(cacheKey, 'historical', true);
  if (cached) {
    console.log(`[Yahoo] Historical cache hit for ${yahooSymbol}`);
    return cached;
  }

  try {
    console.log(`[Yahoo] Fetching historical data for ${yahooSymbol} (original: ${symbol}, exchange: ${exchange})...`);

    // Get 5 years of daily data
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5y`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!res.ok) return [];

    const data = await res.json();

    if (!data.chart?.result?.[0]) {
      return [];
    }

    const chartData = data.chart.result[0];
    const timestamps = chartData.timestamp || [];
    const quote = chartData.indicators?.quote?.[0] || {};

    const result: HistoricalDataPoint[] = timestamps
      .map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        close: quote.close?.[i] || 0,
        open: quote.open?.[i] || 0,
        high: quote.high?.[i] || 0,
        low: quote.low?.[i] || 0,
        volume: quote.volume?.[i] || 0,
      }))
      .filter((d: HistoricalDataPoint) => d.close > 0)
      .sort((a: HistoricalDataPoint, b: HistoricalDataPoint) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

    saveToCache(cacheKey, result, 'historical');
    console.log(`[Yahoo] Got ${result.length} historical points for ${symbol}`);
    return result;
  } catch (e) {
    console.error('[Yahoo] Historical error:', e);
    return [];
  }
}

// Twelve Data API implementation
async function twelveDataQuote(symbol: string, apiKey: string, exchange?: string): Promise<QuoteResponse | null> {
  const cacheKey = `td-quote-${symbol}`;
  const marketOpen = exchange ? isMarketOpen(exchange).isOpen : true;

  // Check persistent cache first
  const cached = getCachedIfValid<QuoteResponse>(cacheKey, 'quote', marketOpen);
  if (cached) {
    logCacheHit('twelvedata', symbol, 'quote');
    return cached;
  }

  logCacheMiss('twelvedata', symbol, 'quote');

  // Check rate limits
  const canProceed = canMakeRequest('twelvedata');
  if (!canProceed.allowed) {
    logRateLimit('twelvedata', canProceed.reason || 'Rate limited');
    return null;
  }

  try {
    logApiCall('twelvedata', symbol, 'quote');
    recordRequest('twelvedata');

    const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`;
    logInfo(`Fetching: ${url.replace(apiKey, '***')}`);

    const res = await fetch(url);

    if (!res.ok) {
      logApiResponse('twelvedata', symbol, false, { status: res.status, statusText: res.statusText });
      return null;
    }

    const data = await res.json();

    if (data.status === 'error') {
      const errorMsg = data.message || 'Unknown error';
      logApiResponse('twelvedata', symbol, false, { error: errorMsg });

      // Check if this is a rate limit error and mark provider as exhausted
      if (errorMsg.includes('run out of API credits') || errorMsg.includes('API credits were used')) {
        // Try to extract the actual usage count from the error message
        // Example: "1279 API credits were used"
        const match = errorMsg.match(/(\d+)\s*API credits were used/);
        const serverCount = match ? parseInt(match[1], 10) : undefined;
        markProviderExhausted('twelvedata', serverCount);
        logRateLimit('twelvedata', `Server says: ${errorMsg}`);
      }

      // Check if this symbol requires a Pro plan
      if (errorMsg.includes('Pro plan') || errorMsg.includes('available starting with')) {
        console.warn(`[API] Symbol ${symbol} requires Twelve Data Pro plan - not available on free tier`);
        // Store error in localStorage so we can report it
        try {
          const errorKey = `api-error-twelvedata-${symbol}`;
          localStorage.setItem(errorKey, 'Requires Pro plan (Twelve Data)');
        } catch { /* ignore */ }
      }

      // Check for symbol not found
      if (errorMsg.includes('not found') || errorMsg.includes('Unknown symbol')) {
        try {
          const errorKey = `api-error-twelvedata-${symbol}`;
          localStorage.setItem(errorKey, 'Symbol not found (Twelve Data)');
        } catch { /* ignore */ }
      }

      return null;
    }

    const result: QuoteResponse = {
      symbol,
      name: data.name || symbol,
      price: parseFloat(data.close),
      previousClose: parseFloat(data.previous_close),
      change: parseFloat(data.change || '0'),
      changePercent: parseFloat(data.percent_change || '0'),
      high52Week: parseFloat(data.fifty_two_week?.high) || 0,
      low52Week: parseFloat(data.fifty_two_week?.low) || 0,
      currency: data.currency || 'USD',
      exchange: data.exchange || exchange || '',
    };

    logApiResponse('twelvedata', symbol, true, {
      price: result.price,
      change: result.changePercent.toFixed(2) + '%',
    });

    saveToCache(cacheKey, result, 'quote');
    return result;
  } catch (err) {
    logApiResponse('twelvedata', symbol, false, { error: String(err) });
    return null;
  }
}

async function twelveDataHistorical(symbol: string, apiKey: string): Promise<HistoricalDataPoint[]> {
  const cacheKey = `td-hist-${symbol}`;

  // Check persistent cache first
  const cached = getCachedIfValid<HistoricalDataPoint[]>(cacheKey, 'historical', true);
  if (cached) {
    logCacheHit('twelvedata', symbol, 'historical');
    return cached;
  }

  logCacheMiss('twelvedata', symbol, 'historical');

  // Check rate limits
  const canProceed = canMakeRequest('twelvedata');
  if (!canProceed.allowed) {
    logRateLimit('twelvedata', canProceed.reason || 'Rate limited for historical');
    return [];
  }

  try {
    logApiCall('twelvedata', symbol, 'historical (time_series)');
    recordRequest('twelvedata');

    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=365&apikey=${apiKey}`;
    logInfo(`Fetching: ${url.replace(apiKey, '***')}`);

    const res = await fetch(url);

    if (!res.ok) {
      logApiResponse('twelvedata', symbol, false, { status: res.status, statusText: res.statusText });
      return [];
    }

    const data = await res.json();

    if (data.status === 'error' || !data.values) {
      const errorMsg = data.message || 'No values in response';
      logApiResponse('twelvedata', symbol, false, { error: errorMsg });

      // Check if this is a rate limit error and mark provider as exhausted
      if (errorMsg.includes('run out of API credits') || errorMsg.includes('API credits were used')) {
        const match = errorMsg.match(/(\d+)\s*API credits were used/);
        const serverCount = match ? parseInt(match[1], 10) : undefined;
        markProviderExhausted('twelvedata', serverCount);
        logRateLimit('twelvedata', `Server says: ${errorMsg}`);
      }

      // Check if this symbol requires a Pro plan
      if (errorMsg.includes('Pro plan') || errorMsg.includes('available starting with')) {
        console.warn(`[API] Symbol ${symbol} requires Twelve Data Pro plan - not available on free tier`);
      }

      return [];
    }

    const result = data.values
      .map((item: Record<string, string>) => ({
        date: item.datetime,
        close: parseFloat(item.close),
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        volume: parseInt(item.volume),
      }))
      .reverse();

    logApiResponse('twelvedata', symbol, true, { dataPoints: result.length });
    saveToCache(cacheKey, result, 'historical');
    return result;
  } catch (err) {
    logApiResponse('twelvedata', symbol, false, { error: String(err) });
    return [];
  }
}

async function twelveDataSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const cacheKey = `td-search-${query}`;

  const cached = getCachedIfValid<SearchResult[]>(cacheKey, 'search', true);
  if (cached) return cached;

  const canProceed = canMakeRequest('twelvedata');
  if (!canProceed.allowed) {
    console.warn(`[TD] Rate limited for search: ${canProceed.reason}`);
    return [];
  }

  try {
    recordRequest('twelvedata');

    const res = await fetch(
      `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey}`
    );

    if (!res.ok) return [];

    const data = await res.json();
    const result = (data.data || []).slice(0, 20).map((item: Record<string, string>) => ({
      symbol: item.symbol,
      name: item.instrument_name,
      type: item.instrument_type,
      exchange: item.exchange,
      currency: item.currency,
    }));

    saveToCache(cacheKey, result, 'search');
    return result;
  } catch {
    return [];
  }
}

// Main API class with multi-provider support
export class StockAPI {
  private apiKey: string;
  private provider: ApiProvider;
  private apiConfigs: ApiKeyConfig[] = [];

  constructor(apiKey: string, provider: ApiProvider = 'twelvedata') {
    this.apiKey = apiKey;
    this.provider = provider;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setProvider(provider: ApiProvider): void {
    this.provider = provider;
  }

  setApiConfigs(configs: ApiKeyConfig[]): void {
    this.apiConfigs = configs.filter(c => c.enabled && c.apiKey);
  }

  getProvider(): ApiProvider {
    return this.provider;
  }

  // Get best available provider based on rate limits
  private getBestProvider(): { provider: ApiProvider; apiKey: string } | null {
    // Check multi-API providers first
    for (const config of this.apiConfigs) {
      if (config.enabled && config.apiKey && config.provider !== 'finnhub' as ApiProvider) {
        const available = getAvailableRequests(config.provider);
        if (available > 0) {
          return { provider: config.provider, apiKey: config.apiKey };
        }
      }
    }

    // Fall back to primary provider
    if (this.apiKey) {
      const available = getAvailableRequests(this.provider);
      if (available > 0) {
        return { provider: this.provider, apiKey: this.apiKey };
      }
    }

    return null;
  }

  async getQuote(symbol: string, exchange?: string): Promise<QuoteResponse | null> {
    // Try to get from any cached source first (regardless of provider)
    const marketOpen = exchange ? isMarketOpen(exchange).isOpen : true;

    const tdCached = getCachedIfValid<QuoteResponse>(`td-quote-${symbol}`, 'quote', marketOpen);
    if (tdCached) return tdCached;

    const avCached = getCachedIfValid<QuoteResponse>(`av-quote-${symbol}`, 'quote', marketOpen);
    if (avCached) return avCached;

    // No cache, need to make API call
    const provider = this.getBestProvider();
    if (!provider) {
      console.warn('No API provider available (all rate limited)');
      return null;
    }

    switch (provider.provider) {
      case 'alphavantage':
        return alphaVantageQuote(symbol, provider.apiKey, exchange);
      case 'twelvedata':
        return twelveDataQuote(symbol, provider.apiKey, exchange);
      default:
        return null;
    }
  }

  async getHistoricalData(symbol: string, _days: number = 365): Promise<HistoricalDataPoint[]> {
    // Try to get from any cached source first
    const tdCached = getCachedIfValid<HistoricalDataPoint[]>(`td-hist-${symbol}`, 'historical', true);
    if (tdCached) return tdCached;

    const avCached = getCachedIfValid<HistoricalDataPoint[]>(`av-hist-${symbol}`, 'historical', true);
    if (avCached) return avCached;

    // No cache, need to make API call
    const provider = this.getBestProvider();
    if (!provider) {
      console.warn('No API provider available for historical data (all rate limited)');
      return [];
    }

    switch (provider.provider) {
      case 'alphavantage':
        return alphaVantageHistorical(symbol, provider.apiKey);
      case 'twelvedata':
        return twelveDataHistorical(symbol, provider.apiKey);
      default:
        return [];
    }
  }

  async searchSymbols(query: string): Promise<SearchResult[]> {
    if (query.length < 1) return [];

    // Try cached results first
    const tdCached = getCachedIfValid<SearchResult[]>(`td-search-${query}`, 'search', true);
    if (tdCached) return tdCached;

    const avCached = getCachedIfValid<SearchResult[]>(`av-search-${query}`, 'search', true);
    if (avCached) return avCached;

    const provider = this.getBestProvider();
    if (!provider) {
      console.warn('No API provider available for search (all rate limited)');
      return [];
    }

    switch (provider.provider) {
      case 'alphavantage':
        return alphaVantageSearch(query, provider.apiKey);
      case 'twelvedata':
        return twelveDataSearch(query, provider.apiKey);
      default:
        return [];
    }
  }

  // Fetch quote only (1 API call) - use when you only need price updates
  async fetchQuoteOnly(symbol: string, exchange?: string): Promise<Partial<Stock> | null> {
    const quote = await this.getQuote(symbol, exchange);
    if (!quote) return null;

    return {
      ticker: quote.symbol,
      name: quote.name,
      currentPrice: quote.price,
      previousClose: quote.previousClose,
      dayChange: quote.change,
      dayChangePercent: quote.changePercent,
      week52High: quote.high52Week,
      week52Low: quote.low52Week,
      currency: quote.currency,
      exchange: quote.exchange || exchange || '',
    };
  }

  // Fetch full stock data (quote + historical) - 2 API calls
  async fetchStockData(symbol: string, exchange?: string): Promise<Partial<Stock> | null> {
    const quote = await this.getQuote(symbol, exchange);
    if (!quote) return null;

    const historical = await this.getHistoricalData(symbol);

    return {
      ticker: quote.symbol,
      name: quote.name,
      currentPrice: quote.price,
      previousClose: quote.previousClose,
      dayChange: quote.change,
      dayChangePercent: quote.changePercent,
      week52High: quote.high52Week,
      week52Low: quote.low52Week,
      currency: quote.currency,
      exchange: quote.exchange || exchange || '',
      historicalData: historical,
      chartTimeframe: '30d',
    };
  }

  // Smart fetch - only fetches what's needed based on cache status
  async fetchStockDataSmart(symbol: string, exchange?: string, options?: {
    needsHistorical?: boolean;
  }): Promise<Partial<Stock> | null> {
    const quote = await this.getQuote(symbol, exchange);
    if (!quote) return null;

    const result: Partial<Stock> = {
      ticker: quote.symbol,
      name: quote.name,
      currentPrice: quote.price,
      previousClose: quote.previousClose,
      dayChange: quote.change,
      dayChangePercent: quote.changePercent,
      week52High: quote.high52Week,
      week52Low: quote.low52Week,
      currency: quote.currency,
      exchange: quote.exchange || exchange || '',
    };

    // Only fetch historical data if explicitly requested
    if (options?.needsHistorical) {
      const historical = await this.getHistoricalData(symbol);
      result.historicalData = historical;
      result.chartTimeframe = '30d';
    }

    return result;
  }

  // Fetch with fallback - tries multiple providers and reports unavailability
  async fetchStockWithFallback(symbol: string, exchange?: string, options?: {
    needsHistorical?: boolean;
    skipProviders?: ApiProvider[];  // Providers known to not support this stock
    forceProvider?: ApiProvider;    // Force using only this specific provider
  }): Promise<FetchStockResult> {
    const skipProviders = new Set(options?.skipProviders || []);
    const triedProviders: ApiProvider[] = [];
    const failedProviders: ApiProvider[] = [];
    let lastErrorReason = '';

    // Get providers to try
    let providers = this.getAvailableProviders();

    // If forceProvider is set, only try that provider
    if (options?.forceProvider) {
      const forcedProvider = providers.find(p => p.provider === options.forceProvider);
      if (forcedProvider) {
        providers = [forcedProvider];
        console.log(`[API Fallback] Forcing provider ${options.forceProvider} for ${symbol}`);
      } else {
        console.log(`[API Fallback] Forced provider ${options.forceProvider} not configured, using all providers`);
      }
    }

    console.log(`[API Fallback] Trying providers for ${symbol}: ${providers.map(p => p.provider).join(', ')}`);

    for (const providerConfig of providers) {
      if (skipProviders.has(providerConfig.provider)) {
        console.log(`[API Fallback] Skipping ${providerConfig.provider} for ${symbol} (marked as unavailable)`);
        continue;
      }

      triedProviders.push(providerConfig.provider);
      console.log(`[API Fallback] Trying ${providerConfig.provider} for ${symbol}...`);

      try {
        // Directly call provider-specific quote function
        let quote: QuoteResponse | null = null;

        switch (providerConfig.provider) {
          case 'twelvedata':
            quote = await twelveDataQuote(symbol, providerConfig.apiKey, exchange);
            break;
          case 'alphavantage':
            quote = await alphaVantageQuote(symbol, providerConfig.apiKey, exchange);
            break;
          case 'yahoo':
            // Yahoo doesn't need an API key
            quote = await yahooFinanceQuote(symbol, exchange);
            break;
          default:
            console.log(`[API Fallback] Unknown provider: ${providerConfig.provider}`);
            continue;
        }

        if (quote && quote.price > 0) {
          console.log(`[API Fallback] Successfully fetched ${symbol} using ${providerConfig.provider}`);

          const result: Partial<Stock> = {
            ticker: quote.symbol,
            name: quote.name,
            currentPrice: quote.price,
            previousClose: quote.previousClose,
            dayChange: quote.change,
            dayChangePercent: quote.changePercent,
            week52High: quote.high52Week,
            week52Low: quote.low52Week,
            currency: quote.currency,
            exchange: quote.exchange || exchange || '',
          };

          // Fetch historical data if needed
          if (options?.needsHistorical) {
            // Try to get historical from same provider
            if (providerConfig.provider === 'twelvedata') {
              const historical = await twelveDataHistorical(symbol, providerConfig.apiKey);
              result.historicalData = historical;
            } else if (providerConfig.provider === 'alphavantage') {
              const historical = await alphaVantageHistorical(symbol, providerConfig.apiKey);
              result.historicalData = historical;
            } else if (providerConfig.provider === 'yahoo') {
              const historical = await yahooFinanceHistorical(symbol, exchange);
              result.historicalData = historical;
            }
            result.chartTimeframe = '30d';
          }

          return { data: result };
        }

        // Provider returned null or invalid data - check why
        let errorReason: string | undefined;
        try {
          const errorKey = `api-error-${providerConfig.provider}-${symbol}`;
          errorReason = localStorage.getItem(errorKey) || undefined;
        } catch { /* ignore */ }

        if (errorReason) {
          console.log(`[API Fallback] ${providerConfig.provider} failed for ${symbol}: ${errorReason}`);
          lastErrorReason = errorReason;
          failedProviders.push(providerConfig.provider);
        } else {
          // Provider returned null without a specific error
          console.log(`[API Fallback] ${providerConfig.provider} returned null for ${symbol}`);
          failedProviders.push(providerConfig.provider);
        }
      } catch (err) {
        console.warn(`[API Fallback] Error fetching ${symbol} with ${providerConfig.provider}:`, err);
        failedProviders.push(providerConfig.provider);
      }
    }

    // All configured providers failed - try Yahoo Finance as last resort (free, no key needed)
    if (!skipProviders.has('yahoo') && options?.forceProvider !== 'yahoo') {
      console.log(`[API Fallback] All configured providers failed, trying Yahoo Finance for ${symbol}...`);
      triedProviders.push('yahoo');

      try {
        const yahooQuote = await yahooFinanceQuote(symbol, exchange);
        if (yahooQuote && yahooQuote.price > 0) {
          console.log(`[API Fallback] Successfully fetched ${symbol} using Yahoo Finance`);

          const result: Partial<Stock> = {
            ticker: yahooQuote.symbol,
            name: yahooQuote.name,
            currentPrice: yahooQuote.price,
            previousClose: yahooQuote.previousClose,
            dayChange: yahooQuote.change,
            dayChangePercent: yahooQuote.changePercent,
            week52High: yahooQuote.high52Week,
            week52Low: yahooQuote.low52Week,
            currency: yahooQuote.currency,
            exchange: yahooQuote.exchange || exchange || '',
          };

          // Fetch historical data if needed
          if (options?.needsHistorical) {
            const historical = await yahooFinanceHistorical(symbol, exchange);
            result.historicalData = historical;
            result.chartTimeframe = '30d';
          }

          return { data: result };
        }
        failedProviders.push('yahoo');
      } catch (err) {
        console.warn(`[API Fallback] Yahoo Finance error for ${symbol}:`, err);
        failedProviders.push('yahoo');
      }
    }

    // All providers failed (including Yahoo fallback)
    if (failedProviders.length > 0) {
      console.warn(`[API] All providers failed for ${symbol}. Tried: ${triedProviders.join(', ')}`);
      return {
        data: null,
        unavailableProviders: failedProviders,
        unavailableReason: lastErrorReason || 'Not available',
      };
    }

    // No providers tried (all skipped or rate limited)
    return {
      data: null,
      unavailableReason: 'No API available',
    };
  }

  // Get available providers sorted by priority
  private getAvailableProviders(): Array<{ provider: ApiProvider; apiKey: string }> {
    const providers: Array<{ provider: ApiProvider; apiKey: string }> = [];

    // Add primary provider first
    if (this.apiKey) {
      providers.push({ provider: this.provider, apiKey: this.apiKey });
    }

    // Add additional configured providers
    for (const config of this.apiConfigs) {
      // Yahoo doesn't need an API key, so allow it without one
      const hasValidConfig = config.enabled && (config.apiKey || config.provider === 'yahoo');
      if (hasValidConfig && config.provider !== this.provider) {
        providers.push({ provider: config.provider, apiKey: config.apiKey || '' });
      }
    }

    // Always include Yahoo as an available option (it's free and doesn't need a key)
    const hasYahoo = providers.some(p => p.provider === 'yahoo');
    if (!hasYahoo) {
      providers.push({ provider: 'yahoo', apiKey: '' });
    }

    return providers;
  }

  // Track last error per provider/symbol (in memory, not persisted)
  private lastErrors: Map<string, string> = new Map();

  setLastError(provider: ApiProvider, symbol: string, reason: string): void {
    this.lastErrors.set(`${provider}-${symbol}`, reason);
  }

  getLastErrorReason(provider: ApiProvider, symbol: string): string | undefined {
    return this.lastErrors.get(`${provider}-${symbol}`);
  }
}

// Helper to get stored API error for a symbol
export function getStoredApiError(symbol: string): { provider: ApiProvider; reason: string } | null {
  const providers: ApiProvider[] = ['twelvedata', 'alphavantage', 'fmp'];

  for (const provider of providers) {
    try {
      const errorKey = `api-error-${provider}-${symbol}`;
      const reason = localStorage.getItem(errorKey);
      if (reason) {
        return { provider, reason };
      }
    } catch { /* ignore */ }
  }

  return null;
}

// Helper to check if a stock is unavailable on all configured providers
export function isStockUnavailable(symbol: string, configuredProviders: ApiProvider[]): { unavailable: boolean; reason?: string } {
  const errors: string[] = [];

  for (const provider of configuredProviders) {
    try {
      const errorKey = `api-error-${provider}-${symbol}`;
      const reason = localStorage.getItem(errorKey);
      if (reason) {
        errors.push(reason);
      }
    } catch { /* ignore */ }
  }

  // If we have errors for all configured providers, stock is unavailable
  if (errors.length >= configuredProviders.length && configuredProviders.length > 0) {
    return { unavailable: true, reason: errors.join(', ') };
  }

  return { unavailable: false };
}

// Clear stored API error (e.g., when user wants to retry)
export function clearStoredApiError(symbol: string): void {
  const providers: ApiProvider[] = ['twelvedata', 'alphavantage', 'fmp'];
  for (const provider of providers) {
    try {
      localStorage.removeItem(`api-error-${provider}-${symbol}`);
    } catch { /* ignore */ }
  }
}

// Singleton instance
let apiInstance: StockAPI | null = null;

export function getStockAPI(apiKey?: string, provider?: ApiProvider): StockAPI {
  if (!apiInstance) {
    apiInstance = new StockAPI(apiKey || '', provider || 'twelvedata');
  } else if (apiKey) {
    apiInstance.setApiKey(apiKey);
  }
  if (provider) {
    apiInstance.setProvider(provider);
  }
  return apiInstance;
}

export function configureMultiApi(configs: ApiKeyConfig[]): void {
  const api = getStockAPI();
  api.setApiConfigs(configs);
}
