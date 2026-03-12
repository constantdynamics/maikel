import { v4 as uuidv4 } from 'uuid';
import type { Stock as DefogStock, Tab } from './types';

// Color constants for auto-created scanner tabs
const KUIFJE_TAB_COLOR = '#22c55e';     // Green
const ZONNEBLOEM_TAB_COLOR = '#a855f7'; // Purple
const BIOPHARMA_TAB_COLOR = '#10b981';  // Emerald
const MINING_TAB_COLOR = '#f59e0b';     // Amber
const HYDROGEN_TAB_COLOR = '#06b6d4';   // Cyan
const SHIPPING_TAB_COLOR = '#3b82f6';   // Blue
const MORIA_TAB_COLOR = '#ef4444';      // Red
const BLUEPILL_TAB_COLOR = '#ec4899';   // Pink

// Top N stocks per tab for weekly refresh
const TOP_N_LIMIT = 250;

// Scanner tab names (used for matching)
export const SCANNER_TAB_NAMES = ['Kuifje', 'Prof. Zonnebloem', 'BioPharma', 'Mining', 'Hydrogen', 'Shipping', 'Moria', 'Blue Pill'] as const;
export type ScannerTabName = typeof SCANNER_TAB_NAMES[number];

const SCANNER_TAB_COLORS: Record<ScannerTabName, string> = {
  'Kuifje': KUIFJE_TAB_COLOR,
  'Prof. Zonnebloem': ZONNEBLOEM_TAB_COLOR,
  'BioPharma': BIOPHARMA_TAB_COLOR,
  'Mining': MINING_TAB_COLOR,
  'Hydrogen': HYDROGEN_TAB_COLOR,
  'Shipping': SHIPPING_TAB_COLOR,
  'Moria': MORIA_TAB_COLOR,
  'Blue Pill': BLUEPILL_TAB_COLOR,
};

// Weekly refresh timestamp key
const WEEKLY_REFRESH_KEY = 'defog-top250-last-refresh';
const WEEKLY_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Return the minimum of two positive numbers (null-safe).
 * If one is null/undefined/0, returns the other.
 */
function minPositive(a?: number | null, b?: number | null): number | null {
  const aValid = a != null && a > 0;
  const bValid = b != null && b > 0;
  if (aValid && bValid) return Math.min(a!, b!);
  if (aValid) return a!;
  if (bValid) return b!;
  return null;
}

interface MaikelKuifjeStock {
  id: string;
  ticker: string;
  company_name: string;
  current_price: number | null;
  purchase_limit: number | null;
  three_year_low: number | null;
  five_year_low: number | null;
  twelve_month_low: number | null;
  exchange: string | null;
  sector: string | null;
}

interface MaikelZonnebloemStock {
  id: string;
  ticker: string;
  yahoo_ticker: string | null;
  company_name: string;
  current_price: number | null;
  three_year_low: number | null;
  base_price_median: number | null;
  exchange: string | null;
  sector: string | null;
  highest_spike_pct: number | null;
}

// Sector stocks (BioPharma/Mining) share fields from both scanners
interface MaikelSectorStock {
  id: string;
  ticker: string;
  yahoo_ticker: string | null;
  company_name: string;
  current_price: number | null;
  three_year_low: number | null;
  five_year_low: number | null;
  base_price_median: number | null;
  exchange: string | null;
  market: string | null;
  sector: string | null;
  highest_spike_pct: number | null;
  score: number;
  spike_score: number;
}

// Moria stocks — ultra-cheap mining stocks with deep ATH declines
interface MaikelMoriaStock {
  id: string;
  ticker: string;
  yahoo_ticker: string | null;
  company_name: string;
  current_price: number | null;
  all_time_high: number | null;
  ath_decline_pct: number | null;
  high_3y: number | null;
  high_1y: number | null;
  high_6m: number | null;
  exchange: string | null;
  market: string | null;
  sector: string | null;
}

// BluePill stocks — ultra-cheap biopharma stocks with deep ATH declines
// Same structure as Moria
type MaikelBluePillStock = MaikelMoriaStock;

// Buy limit is set to the historical low, with cascade:
// 5-year low → 3-year low → 1-year low (no multiplier)
const BUY_LIMIT_MULTIPLIER = 1.0;

/**
 * Calculate suggested buy limit using cascade priority:
 * 5-year low → 3-year low → 1-year low.
 * Uses the first available low (no averaging, no minimum across all).
 * Returns null if no valid historical lows are available (wait for range fetch).
 */
function calculateBuyLimit(
  lows: {
    threeYearLow?: number | null;
    fiveYearLow?: number | null;
    twelveMonthLow?: number | null;
    basePriceMedian?: number | null;
  },
  _currentPrice?: number | null,
): number | null {
  // Cascade priority: 5Y → 3Y → 1Y
  if (lows.fiveYearLow != null && lows.fiveYearLow > 0) {
    return Math.round(lows.fiveYearLow * 100) / 100;
  }
  if (lows.threeYearLow != null && lows.threeYearLow > 0) {
    return Math.round(lows.threeYearLow * 100) / 100;
  }
  if (lows.twelveMonthLow != null && lows.twelveMonthLow > 0) {
    return Math.round(lows.twelveMonthLow * 100) / 100;
  }
  // No valid lows — don't guess, return null
  // The postSyncRangeFetch service will fetch ranges and set the limit
  return null;
}

/**
 * Build buy-limit input for a Kuifje stock.
 */
function kuifjeBuyLimitInput(stock: MaikelKuifjeStock): [Parameters<typeof calculateBuyLimit>[0], number | null] {
  return [{
    threeYearLow: stock.three_year_low,
    fiveYearLow: stock.five_year_low,
    twelveMonthLow: stock.twelve_month_low,
  }, stock.current_price];
}

/**
 * Build buy-limit input for a Zonnebloem stock.
 */
function zbBuyLimitInput(stock: MaikelZonnebloemStock): [Parameters<typeof calculateBuyLimit>[0], number | null] {
  return [{
    threeYearLow: stock.three_year_low,
    basePriceMedian: stock.base_price_median,
  }, stock.current_price];
}

/**
 * Build buy-limit input for a sector stock.
 */
function sectorBuyLimitInput(stock: MaikelSectorStock): [Parameters<typeof calculateBuyLimit>[0], number | null] {
  return [{
    threeYearLow: stock.three_year_low,
    fiveYearLow: stock.five_year_low,
    basePriceMedian: stock.base_price_median,
  }, stock.current_price];
}

/**
 * Build buy-limit input for a Moria stock.
 * Moria stocks have high_3y and high_1y but no five_year_low — use ATH decline to estimate.
 */
function moriaBuyLimitInput(stock: MaikelMoriaStock): [Parameters<typeof calculateBuyLimit>[0], number | null] {
  return [{
    threeYearLow: stock.high_3y ? stock.current_price : null, // Moria stocks ARE at lows
    twelveMonthLow: stock.high_1y ? stock.current_price : null,
  }, stock.current_price];
}

/**
 * Build buy-limit input for a BluePill stock (same logic as Moria).
 */
function bluepillBuyLimitInput(stock: MaikelBluePillStock): [Parameters<typeof calculateBuyLimit>[0], number | null] {
  return moriaBuyLimitInput(stock);
}

/**
 * Determine the best ticker for Defog (that data providers can resolve).
 * For Zonnebloem stocks, use yahoo_ticker if available (e.g., "0A91.F" or "LMND").
 * For Kuifje stocks, ticker is typically already a proper US ticker.
 */
function getDefogTicker(m: MaikelKuifjeStock | MaikelZonnebloemStock | MaikelSectorStock | MaikelMoriaStock | MaikelBluePillStock): string {
  // Zonnebloem stocks have yahoo_ticker which includes the proper exchange suffix
  if ('yahoo_ticker' in m && m.yahoo_ticker) {
    return m.yahoo_ticker;
  }
  return m.ticker;
}

/**
 * Determine the exchange for Defog based on the yahoo_ticker suffix.
 */
function getDefogExchange(m: MaikelKuifjeStock | MaikelZonnebloemStock | MaikelSectorStock | MaikelMoriaStock | MaikelBluePillStock): string {
  const ticker = getDefogTicker(m);
  // Extract exchange from Yahoo suffix
  if (ticker.includes('.')) {
    const suffix = ticker.split('.').pop()?.toUpperCase();
    const suffixToExchange: Record<string, string> = {
      'L': 'LSE', 'DE': 'XETRA', 'F': 'FRA', 'PA': 'EPA', 'MC': 'BME',
      'MI': 'MIL', 'ST': 'STO', 'OL': 'OSL', 'CO': 'CSE', 'HE': 'HEL',
      'SW': 'SIX', 'AS': 'AMS', 'BR': 'BRU', 'WA': 'WSE', 'VI': 'VIE',
      'LS': 'ELI', 'AT': 'ATHEX', 'IS': 'BIST', 'TA': 'TASE',
      'HK': 'HKEX', 'T': 'TSE', 'NS': 'NSE', 'BO': 'BSE',
      'KS': 'KRX', 'KQ': 'KOSDAQ', 'TW': 'TWSE', 'SI': 'SGX',
      'AX': 'ASX', 'NZ': 'NZX', 'JK': 'IDX', 'KL': 'MYX',
      'BK': 'SET', 'SS': 'SSE', 'SZ': 'SZSE',
      'TO': 'TSX', 'V': 'TSXV', 'SA': 'BVMF', 'MX': 'BMV',
      'JO': 'JSE', 'SR': 'TADAWUL',
    };
    if (suffix && suffixToExchange[suffix]) {
      return suffixToExchange[suffix];
    }
  }
  return m.exchange || 'US';
}

/**
 * Normalize a company name for duplicate detection.
 * Strips common suffixes, lowercases, and removes punctuation.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(inc|corp|corporation|ltd|limited|plc|ag|sa|nv|se|co|company|group|holdings|international)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determine the "base" ticker (without exchange suffix).
 * E.g., "SES.SI" → "SES", "0J9J.L" → "0J9J", "LMND" → "LMND"
 */
function getBaseTicker(ticker: string): string {
  const dotIndex = ticker.indexOf('.');
  return dotIndex > 0 ? ticker.substring(0, dotIndex) : ticker;
}

/**
 * Score a ticker — higher is better. Tickers with a dot suffix (exchange code)
 * are preferred because they are more specific and resolve better in data providers.
 */
function tickerQualityScore(ticker: string): number {
  // Prefer tickers with exchange suffix (e.g., "SES.SI" > "SES")
  return ticker.includes('.') ? 1 : 0;
}

/**
 * Deduplicate a list of scanner stocks by company name.
 * When duplicates are found:
 *  - Picks the ticker with exchange suffix (dot notation) as the "correct" one
 *  - Uses the lowest buy limit among duplicates
 */
function deduplicateScannerStocks<T extends { company_name: string }>(
  stocks: T[],
  getTickerFn: (s: T) => string,
  getBuyLimitFn: (s: T) => number | null,
): T[] {
  const byName = new Map<string, { stock: T; ticker: string; buyLimit: number | null }>();

  for (const stock of stocks) {
    const normalizedName = normalizeCompanyName(stock.company_name);
    const ticker = getTickerFn(stock);
    const buyLimit = getBuyLimitFn(stock);
    const existing = byName.get(normalizedName);

    if (!existing) {
      byName.set(normalizedName, { stock, ticker, buyLimit });
      continue;
    }

    // Duplicate found — pick best ticker and lowest limit
    const existingScore = tickerQualityScore(existing.ticker);
    const newScore = tickerQualityScore(ticker);
    const bestStock = newScore > existingScore ? stock : existing.stock;

    // Take the lowest non-null buy limit
    let bestLimit = existing.buyLimit;
    if (buyLimit != null && (bestLimit == null || buyLimit < bestLimit)) {
      bestLimit = buyLimit;
    }

    byName.set(normalizedName, {
      stock: bestStock,
      ticker: getTickerFn(bestStock),
      buyLimit: bestLimit,
    });
  }

  return Array.from(byName.values()).map((v) => v.stock);
}

function maikelToDefogStock(
  m: MaikelKuifjeStock | MaikelZonnebloemStock | MaikelSectorStock | MaikelMoriaStock | MaikelBluePillStock,
  buyLimit: number | null,
  overrideTicker?: string,
): DefogStock {
  const ticker = overrideTicker || getDefogTicker(m);
  const exchange = getDefogExchange(m);

  return {
    id: uuidv4(),
    ticker,
    name: m.company_name || m.ticker,
    buyLimit, // Use calculated limit from scanner data; will be refined by postSyncRangeFetch
    currentPrice: m.current_price || 0,
    previousClose: 0,
    dayChange: 0,
    dayChangePercent: 0,
    week52High: 0,
    week52Low: 0,
    chartTimeframe: '1y',
    historicalData: [],
    lastUpdated: new Date().toISOString(),
    currency: 'USD',
    exchange,
    alertSettings: { customThresholds: [], enabled: true },
    addedAt: new Date().toISOString(),
    rangeFetched: false,
  };
}

/**
 * Check if a stock already exists in a tab, matching by:
 *  1. Exact ticker match
 *  2. Same base ticker (e.g., "SES" matches "SES.SI")
 *  3. Same normalized company name
 * Returns the matched existing stock if found.
 */
function findExistingStock(
  existingStocks: DefogStock[],
  newTicker: string,
  newName: string,
  existingNameMap: Map<string, DefogStock>,
  existingBaseTickerMap: Map<string, DefogStock>,
  existingTickerSet: Set<string>,
): DefogStock | null {
  // 1. Exact ticker match
  if (existingTickerSet.has(newTicker)) {
    return existingStocks.find((s) => s.ticker === newTicker) || null;
  }

  // 2. Base ticker match (e.g., incoming "SES.SI" matches existing "SES")
  const newBase = getBaseTicker(newTicker);
  const baseMatch = existingBaseTickerMap.get(newBase);
  if (baseMatch) return baseMatch;

  // 3. Company name match
  const normalizedNew = normalizeCompanyName(newName);
  const nameMatch = existingNameMap.get(normalizedNew);
  if (nameMatch) return nameMatch;

  return null;
}

/**
 * Remove duplicate stocks already existing within a Defog tab.
 * Groups by normalized company name AND base ticker. Keeps the entry
 * with the best ticker (exchange suffix preferred) and lowest buy limit.
 */
function deduplicateExistingTabStocks(stocks: DefogStock[]): DefogStock[] {
  // Key = normalized company name OR base ticker (whichever matches first)
  const seen = new Map<string, DefogStock>();
  const baseTickerToKey = new Map<string, string>();

  for (const stock of stocks) {
    const normName = normalizeCompanyName(stock.name);
    const baseTicker = getBaseTicker(stock.ticker);

    // Check if we've seen this company name or base ticker before
    const existingKeyByName = seen.has(normName) ? normName : null;
    const existingKeyByTicker = baseTickerToKey.get(baseTicker) || null;
    const existingKey = existingKeyByName || existingKeyByTicker;

    if (!existingKey) {
      // New stock — track it
      seen.set(normName, stock);
      baseTickerToKey.set(baseTicker, normName);
      continue;
    }

    const existing = seen.get(existingKey)!;

    // Merge: keep the better ticker and lower buy limit
    const keepNew = tickerQualityScore(stock.ticker) > tickerQualityScore(existing.ticker);
    const merged: DefogStock = {
      ...(keepNew ? stock : existing),
      // Take the lowest non-null buy limit
      buyLimit:
        stock.buyLimit != null && existing.buyLimit != null
          ? Math.min(stock.buyLimit, existing.buyLimit)
          : stock.buyLimit ?? existing.buyLimit,
    };

    seen.set(existingKey, merged);
    // Also map the base ticker of the discarded entry
    baseTickerToKey.set(getBaseTicker(stock.ticker), existingKey);
    baseTickerToKey.set(getBaseTicker(existing.ticker), existingKey);
  }

  return Array.from(seen.values());
}

/**
 * Build lookup maps for efficient duplicate detection from existing Defog stocks.
 */
function buildExistingStockMaps(stocks: DefogStock[]) {
  const tickerSet = new Set<string>();
  const nameMap = new Map<string, DefogStock>();
  const baseTickerMap = new Map<string, DefogStock>();

  for (const stock of stocks) {
    tickerSet.add(stock.ticker);
    nameMap.set(normalizeCompanyName(stock.name), stock);
    baseTickerMap.set(getBaseTicker(stock.ticker), stock);
  }

  return { tickerSet, nameMap, baseTickerMap };
}

/**
 * Recalculate buy limit for an existing stock using its real range data.
 * Returns the updated stock or original if no update needed.
 */
function recalcExistingBuyLimit(s: DefogStock): DefogStock {
  if (s.buyLimit == null && s.rangeFetched) {
    const hasRealRangeData = (s.year5Low && s.year5Low > 0) ||
      (s.year3Low && s.year3Low > 0) ||
      (s.week52Low && s.week52Low > 0);
    if (hasRealRangeData) {
      const newLimit = calculateBuyLimit({
        fiveYearLow: s.year5Low,
        threeYearLow: s.year3Low,
        twelveMonthLow: s.week52Low > 0 ? s.week52Low : null,
      });
      if (newLimit != null) return { ...s, buyLimit: newLimit };
    }
  }
  return s;
}

/**
 * Apply updates and add new stocks to an existing tab.
 * Used by both the regular sync and weekly refresh.
 */
function applyTabSync(
  tab: Tab,
  updates: Map<string, { ticker?: string; buyLimit?: number | null }>,
  newStocks: DefogStock[],
): Tab {
  const updatedStocks = tab.stocks.map((s) => {
    const update = updates.get(s.id);
    if (update) {
      return {
        ...s,
        ...(update.ticker ? { ticker: update.ticker } : {}),
        ...(update.buyLimit !== undefined ? { buyLimit: update.buyLimit } : {}),
      };
    }
    return recalcExistingBuyLimit(s);
  });

  const finalStocks = deduplicateExistingTabStocks([...updatedStocks, ...newStocks]);

  // SAFETY: Don't allow sync to remove more than 20% of stocks
  if (tab.stocks.length > 5 && finalStocks.length < tab.stocks.length * 0.8) {
    console.warn(`[ScannerSync] SAFETY: ${tab.name} would lose ${tab.stocks.length - finalStocks.length} stocks (${tab.stocks.length} → ${finalStocks.length}). Keeping original.`);
    return { ...tab, stocks: [...tab.stocks, ...newStocks] };
  }

  return { ...tab, stocks: finalStocks };
}

/**
 * Process a list of scanner stocks against an existing tab.
 * Returns new stocks to add and updates to apply.
 */
function processStocksForTab<T extends { company_name: string }>(
  scannerStocks: T[],
  existingTab: Tab,
  getTickerFn: (s: T) => string,
  getBuyLimitInputFn: (s: T) => [Parameters<typeof calculateBuyLimit>[0], number | null],
): { newStocks: DefogStock[]; updates: Map<string, { ticker?: string; buyLimit?: number | null }>; added: number } {
  const maps = buildExistingStockMaps(existingTab.stocks);
  const newStocks: DefogStock[] = [];
  const updates = new Map<string, { ticker?: string; buyLimit?: number | null }>();
  let added = 0;

  for (const stock of scannerStocks) {
    const defogTicker = getTickerFn(stock);

    const existing = findExistingStock(
      existingTab.stocks, defogTicker, stock.company_name,
      maps.nameMap, maps.baseTickerMap, maps.tickerSet,
    );

    if (existing) {
      const upd: { ticker?: string; buyLimit?: number | null } = {};

      if (tickerQualityScore(defogTicker) > tickerQualityScore(existing.ticker)) {
        upd.ticker = defogTicker;
      }

      if (existing.rangeFetched) {
        const hasRealRangeData = (existing.year5Low && existing.year5Low > 0) ||
          (existing.year3Low && existing.year3Low > 0) ||
          (existing.week52Low && existing.week52Low > 0);
        if (hasRealRangeData) {
          const recalcLimit = calculateBuyLimit({
            fiveYearLow: existing.year5Low,
            threeYearLow: existing.year3Low,
            twelveMonthLow: existing.week52Low > 0 ? existing.week52Low : null,
          });
          if (recalcLimit != null) {
            upd.buyLimit = recalcLimit;
          }
        }
      }

      if (Object.keys(upd).length > 0) {
        const prev = updates.get(existing.id) || {};
        updates.set(existing.id, { ...prev, ...upd });
      }
    } else {
      const [limitInput, currentPrice] = getBuyLimitInputFn(stock);
      const buyLimit = calculateBuyLimit(limitInput, currentPrice);
      const defogStock = maikelToDefogStock(stock as unknown as MaikelKuifjeStock | MaikelZonnebloemStock | MaikelSectorStock, buyLimit);
      newStocks.push(defogStock);
      maps.tickerSet.add(defogTicker);
      maps.nameMap.set(normalizeCompanyName(stock.company_name), defogStock);
      maps.baseTickerMap.set(getBaseTicker(defogTicker), defogStock);
      added++;
    }
  }

  return { newStocks, updates, added };
}

/**
 * Find or create a scanner tab.
 */
function findOrCreateTab(tabs: Tab[], name: ScannerTabName): { tab: Tab; isNew: boolean } {
  const existing = tabs.find((t) => t.name === name);
  if (existing) return { tab: existing, isNew: false };

  return {
    tab: {
      id: uuidv4(),
      name,
      accentColor: SCANNER_TAB_COLORS[name],
      stocks: [],
      sortField: 'distanceToLimit',
      sortDirection: 'asc',
      createdAt: new Date().toISOString(),
    },
    isNew: true,
  };
}

/**
 * Fetch scanner stocks from API with optional limit.
 */
async function fetchScannerStocks(url: string): Promise<unknown[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json.stocks || []);
  } catch {
    return [];
  }
}

/**
 * Sync Maikel scanner results into Defog tabs.
 * Creates "Kuifje", "Prof. Zonnebloem", "BioPharma", and "Mining" tabs if they don't exist.
 * Adds new stocks (by ticker AND company name) and updates existing ones.
 * Limits each tab to the top 250 stocks by score.
 *
 * Deduplication:
 *  - Within scanner results: group by company name, pick best ticker (with dot suffix)
 *  - Against existing Defog stocks: match by ticker, base ticker, or company name
 *  - When duplicates found: use lowest buy limit, upgrade to better ticker
 */
export async function syncScannerToDefog(
  getTabs: () => Tab[],
  setTabs: (updater: (tabs: Tab[]) => Tab[]) => void,
): Promise<{ kuifjeAdded: number; zbAdded: number; biopharmaAdded: number; miningAdded: number; hydrogenAdded: number; shippingAdded: number; moriaAdded: number; bluepillAdded: number }> {
  // Fetch all scanner results (top 250 each)
  const [kuifjeRaw, zbRaw, biopharmaRaw, miningRaw, hydrogenRaw, shippingRaw, moriaRaw, bluepillRaw] = await Promise.all([
    fetchScannerStocks(`/api/stocks?limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/zonnebloem/stocks?limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/sector/stocks?type=biopharma&limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/sector/stocks?type=mining&limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/sector/stocks?type=hydrogen&limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/sector/stocks?type=shipping&limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/moria/stocks`),
    fetchScannerStocks(`/api/bluepill/stocks`),
  ]);

  const kuifjeStocksRaw = kuifjeRaw as MaikelKuifjeStock[];
  const zbStocksRaw = zbRaw as MaikelZonnebloemStock[];
  const biopharmaStocksRaw = biopharmaRaw as MaikelSectorStock[];
  const miningStocksRaw = miningRaw as MaikelSectorStock[];
  const hydrogenStocksRaw = hydrogenRaw as MaikelSectorStock[];
  const shippingStocksRaw = shippingRaw as MaikelSectorStock[];
  const moriaStocksRaw = moriaRaw as MaikelMoriaStock[];
  const bluepillStocksRaw = bluepillRaw as MaikelBluePillStock[];

  // SAFETY: If ALL scanner APIs returned zero stocks, skip sync entirely
  const totalStocks = kuifjeStocksRaw.length + zbStocksRaw.length + biopharmaStocksRaw.length + miningStocksRaw.length + hydrogenStocksRaw.length + shippingStocksRaw.length + moriaStocksRaw.length + bluepillStocksRaw.length;
  if (totalStocks === 0) {
    console.log('[ScannerSync] All APIs returned 0 stocks — skipping sync to prevent data loss');
    return { kuifjeAdded: 0, zbAdded: 0, biopharmaAdded: 0, miningAdded: 0, hydrogenAdded: 0, shippingAdded: 0, moriaAdded: 0, bluepillAdded: 0 };
  }

  // Deduplicate incoming scanner results by company name
  const kuifjeStocks = deduplicateScannerStocks(kuifjeStocksRaw, getDefogTicker, (s) => calculateBuyLimit(...kuifjeBuyLimitInput(s)));
  const zbStocks = deduplicateScannerStocks(zbStocksRaw, getDefogTicker, (s) => calculateBuyLimit(...zbBuyLimitInput(s)));
  const biopharmaStocks = deduplicateScannerStocks(biopharmaStocksRaw, getDefogTicker, (s) => calculateBuyLimit(...sectorBuyLimitInput(s)));
  const miningStocks = deduplicateScannerStocks(miningStocksRaw, getDefogTicker, (s) => calculateBuyLimit(...sectorBuyLimitInput(s)));
  const hydrogenStocks = deduplicateScannerStocks(hydrogenStocksRaw, getDefogTicker, (s) => calculateBuyLimit(...sectorBuyLimitInput(s)));
  const shippingStocks = deduplicateScannerStocks(shippingStocksRaw, getDefogTicker, (s) => calculateBuyLimit(...sectorBuyLimitInput(s)));
  const moriaStocks = deduplicateScannerStocks(moriaStocksRaw, getDefogTicker, (s) => calculateBuyLimit(...moriaBuyLimitInput(s)));
  const bluepillStocks = deduplicateScannerStocks(bluepillStocksRaw, getDefogTicker, (s) => calculateBuyLimit(...bluepillBuyLimitInput(s)));

  const tabs = getTabs();

  // Find or create all tabs
  const kuifjeResult = findOrCreateTab(tabs, 'Kuifje');
  const zbResult = findOrCreateTab(tabs, 'Prof. Zonnebloem');
  const biopharmaResult = findOrCreateTab(tabs, 'BioPharma');
  const miningResult = findOrCreateTab(tabs, 'Mining');
  const hydrogenResult = findOrCreateTab(tabs, 'Hydrogen');
  const shippingResult = findOrCreateTab(tabs, 'Shipping');
  const moriaResult = findOrCreateTab(tabs, 'Moria');
  const bluepillResult = findOrCreateTab(tabs, 'Blue Pill');

  // Process each scanner's stocks
  const kuifjeProcessed = kuifjeStocksRaw.length > 0
    ? processStocksForTab(kuifjeStocks, kuifjeResult.tab, getDefogTicker, kuifjeBuyLimitInput)
    : { newStocks: [], updates: new Map(), added: 0 };

  const zbProcessed = zbStocksRaw.length > 0
    ? processStocksForTab(zbStocks, zbResult.tab, getDefogTicker, zbBuyLimitInput)
    : { newStocks: [], updates: new Map(), added: 0 };

  const biopharmaProcessed = biopharmaStocksRaw.length > 0
    ? processStocksForTab(biopharmaStocks, biopharmaResult.tab, getDefogTicker, sectorBuyLimitInput)
    : { newStocks: [], updates: new Map(), added: 0 };

  const miningProcessed = miningStocksRaw.length > 0
    ? processStocksForTab(miningStocks, miningResult.tab, getDefogTicker, sectorBuyLimitInput)
    : { newStocks: [], updates: new Map(), added: 0 };

  const hydrogenProcessed = hydrogenStocksRaw.length > 0
    ? processStocksForTab(hydrogenStocks, hydrogenResult.tab, getDefogTicker, sectorBuyLimitInput)
    : { newStocks: [], updates: new Map(), added: 0 };

  const shippingProcessed = shippingStocksRaw.length > 0
    ? processStocksForTab(shippingStocks, shippingResult.tab, getDefogTicker, sectorBuyLimitInput)
    : { newStocks: [], updates: new Map(), added: 0 };

  const moriaProcessed = moriaStocksRaw.length > 0
    ? processStocksForTab(moriaStocks, moriaResult.tab, getDefogTicker, moriaBuyLimitInput)
    : { newStocks: [], updates: new Map(), added: 0 };

  const bluepillProcessed = bluepillStocksRaw.length > 0
    ? processStocksForTab(bluepillStocks, bluepillResult.tab, getDefogTicker, bluepillBuyLimitInput)
    : { newStocks: [], updates: new Map(), added: 0 };

  // Build a combined lookup of ALL scanner stocks (for cross-referencing NBY tab)
  const allScannerStocks = new Map<string, { ticker: string; buyLimit: number | null }>();
  const addToLookup = <T extends { company_name: string }>(
    stocks: T[], getTickerFn: (s: T) => string,
    getBuyLimitFn: (s: T) => [Parameters<typeof calculateBuyLimit>[0], number | null],
  ) => {
    for (const s of stocks) {
      const ticker = getTickerFn(s);
      const baseTicker = getBaseTicker(ticker);
      const normName = normalizeCompanyName(s.company_name);
      const [limitInput, currentPrice] = getBuyLimitFn(s);
      const buyLimit = calculateBuyLimit(limitInput, currentPrice);
      allScannerStocks.set(baseTicker, { ticker, buyLimit });
      if (normName) allScannerStocks.set(`name:${normName}`, { ticker, buyLimit });
    }
  };
  addToLookup(kuifjeStocks, getDefogTicker, kuifjeBuyLimitInput);
  addToLookup(zbStocks, getDefogTicker, zbBuyLimitInput);
  addToLookup(biopharmaStocks, getDefogTicker, sectorBuyLimitInput);
  addToLookup(miningStocks, getDefogTicker, sectorBuyLimitInput);
  addToLookup(hydrogenStocks, getDefogTicker, sectorBuyLimitInput);
  addToLookup(shippingStocks, getDefogTicker, sectorBuyLimitInput);
  addToLookup(moriaStocks, getDefogTicker, moriaBuyLimitInput);
  addToLookup(bluepillStocks, getDefogTicker, bluepillBuyLimitInput);

  // Apply all updates in a single setTabs call
  const tabConfigs = [
    { tab: kuifjeResult, processed: kuifjeProcessed },
    { tab: zbResult, processed: zbProcessed },
    { tab: biopharmaResult, processed: biopharmaProcessed },
    { tab: miningResult, processed: miningProcessed },
    { tab: hydrogenResult, processed: hydrogenProcessed },
    { tab: shippingResult, processed: shippingProcessed },
    { tab: moriaResult, processed: moriaProcessed },
    { tab: bluepillResult, processed: bluepillProcessed },
  ];

  setTabs((currentTabs) => {
    let result = [...currentTabs];

    // Add new tabs if needed
    for (const { tab: { tab, isNew } } of tabConfigs) {
      if (isNew && !result.find((t) => t.id === tab.id)) {
        result.push(tab);
      }
    }

    return result.map((t) => {
      // Scanner tabs: full sync with new stocks + updates
      for (const { tab: { tab }, processed } of tabConfigs) {
        if (t.id === tab.id) {
          return applyTabSync(t, processed.updates, processed.newStocks);
        }
      }

      // NBY tab (and other custom tabs): cross-reference with scanner data
      // to update buy limits from scanner results — but never add/remove stocks
      if (!SCANNER_TAB_NAMES.includes(t.name as ScannerTabName) && t.name !== 'Watchlist') {
        let changed = false;
        const updatedStocks = t.stocks.map((stock) => {
          const baseTicker = getBaseTicker(stock.ticker);
          const normName = normalizeCompanyName(stock.name);
          const match = allScannerStocks.get(baseTicker) ||
            (normName ? allScannerStocks.get(`name:${normName}`) : undefined);

          if (match) {
            const upd: Partial<typeof stock> = {};
            // Update buy limit if stock doesn't have one yet, or if scanner has a better (lower) one
            if (match.buyLimit != null && (stock.buyLimit == null || (match.buyLimit < stock.buyLimit && !stock.rangeFetched))) {
              upd.buyLimit = match.buyLimit;
            }
            // Upgrade ticker quality
            if (tickerQualityScore(match.ticker) > tickerQualityScore(stock.ticker)) {
              upd.ticker = match.ticker;
            }
            if (Object.keys(upd).length > 0) {
              changed = true;
              return { ...stock, ...upd };
            }
          }
          return stock;
        });
        if (changed) {
          return { ...t, stocks: updatedStocks };
        }
      }

      return t;
    });
  });

  return {
    kuifjeAdded: kuifjeProcessed.added,
    zbAdded: zbProcessed.added,
    biopharmaAdded: biopharmaProcessed.added,
    miningAdded: miningProcessed.added,
    hydrogenAdded: hydrogenProcessed.added,
    shippingAdded: shippingProcessed.added,
    moriaAdded: moriaProcessed.added,
    bluepillAdded: bluepillProcessed.added,
  };
}

/**
 * Check if a weekly top-250 refresh is due.
 */
export function shouldRunWeeklyRefresh(): boolean {
  try {
    const lastRefresh = localStorage.getItem(WEEKLY_REFRESH_KEY);
    if (!lastRefresh) return true;
    const elapsed = Date.now() - new Date(lastRefresh).getTime();
    return elapsed >= WEEKLY_REFRESH_INTERVAL_MS;
  } catch {
    return true;
  }
}

/**
 * Mark that the weekly refresh has been completed.
 */
export function markWeeklyRefreshDone(): void {
  try {
    localStorage.setItem(WEEKLY_REFRESH_KEY, new Date().toISOString());
  } catch {
    // localStorage unavailable
  }
}

/**
 * Weekly full refresh of scanner tabs in Defog.
 * Replaces each scanner tab with the current top 250 stocks.
 * Preserves existing stock data (range, buy limit, etc.) for stocks that are still in the top 250.
 * Removes stocks that dropped out of the top 250.
 */
export async function refreshDefogTop250(
  getTabs: () => Tab[],
  setTabs: (updater: (tabs: Tab[]) => Tab[]) => void,
): Promise<{ kuifje: number; zonnebloem: number; biopharma: number; mining: number; hydrogen: number; shipping: number; moria: number; bluepill: number }> {
  console.log('[ScannerSync] Starting weekly top-250 refresh...');

  // Fetch top 250 from each scanner
  const [kuifjeRaw, zbRaw, biopharmaRaw, miningRaw, hydrogenRaw, shippingRaw, moriaRaw, bluepillRaw] = await Promise.all([
    fetchScannerStocks(`/api/stocks?limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/zonnebloem/stocks?limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/sector/stocks?type=biopharma&limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/sector/stocks?type=mining&limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/sector/stocks?type=hydrogen&limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/sector/stocks?type=shipping&limit=${TOP_N_LIMIT}`),
    fetchScannerStocks(`/api/moria/stocks`),
    fetchScannerStocks(`/api/bluepill/stocks`),
  ]);

  const kuifjeStocks = deduplicateScannerStocks(
    kuifjeRaw as MaikelKuifjeStock[], getDefogTicker,
    (s) => calculateBuyLimit(...kuifjeBuyLimitInput(s)),
  );
  const zbStocks = deduplicateScannerStocks(
    zbRaw as MaikelZonnebloemStock[], getDefogTicker,
    (s) => calculateBuyLimit(...zbBuyLimitInput(s)),
  );
  const biopharmaStocks = deduplicateScannerStocks(
    biopharmaRaw as MaikelSectorStock[], getDefogTicker,
    (s) => calculateBuyLimit(...sectorBuyLimitInput(s)),
  );
  const miningStocks = deduplicateScannerStocks(
    miningRaw as MaikelSectorStock[], getDefogTicker,
    (s) => calculateBuyLimit(...sectorBuyLimitInput(s)),
  );
  const hydrogenStocks = deduplicateScannerStocks(
    hydrogenRaw as MaikelSectorStock[], getDefogTicker,
    (s) => calculateBuyLimit(...sectorBuyLimitInput(s)),
  );
  const shippingStocks = deduplicateScannerStocks(
    shippingRaw as MaikelSectorStock[], getDefogTicker,
    (s) => calculateBuyLimit(...sectorBuyLimitInput(s)),
  );
  const moriaStocks = deduplicateScannerStocks(
    moriaRaw as MaikelMoriaStock[], getDefogTicker,
    (s) => calculateBuyLimit(...moriaBuyLimitInput(s)),
  );
  const bluepillStocks = deduplicateScannerStocks(
    bluepillRaw as MaikelBluePillStock[], getDefogTicker,
    (s) => calculateBuyLimit(...bluepillBuyLimitInput(s)),
  );

  // SAFETY: if all APIs return 0, skip
  if (kuifjeStocks.length + zbStocks.length + biopharmaStocks.length + miningStocks.length + hydrogenStocks.length + shippingStocks.length + moriaStocks.length + bluepillStocks.length === 0) {
    console.log('[ScannerSync] Weekly refresh: All APIs returned 0 stocks — skipping');
    return { kuifje: 0, zonnebloem: 0, biopharma: 0, mining: 0, hydrogen: 0, shipping: 0, moria: 0, bluepill: 0 };
  }

  const tabs = getTabs();

  /**
   * Replace a tab's stocks with the new top 250, preserving existing data
   * for stocks that are still in the list.
   */
  function replaceTabStocks<T extends { company_name: string }>(
    tabName: ScannerTabName,
    scannerStocks: T[],
    getTickerFn: (s: T) => string,
    getBuyLimitInputFn: (s: T) => [Parameters<typeof calculateBuyLimit>[0], number | null],
  ): { tabId: string; newStocks: DefogStock[]; isNewTab: boolean } {
    const { tab, isNew } = findOrCreateTab(tabs, tabName);

    // Build a map of existing defog stocks by ticker and name for fast lookup
    const existingByTicker = new Map<string, DefogStock>();
    const existingByBaseTicker = new Map<string, DefogStock>();
    const existingByName = new Map<string, DefogStock>();
    for (const s of tab.stocks) {
      existingByTicker.set(s.ticker, s);
      existingByBaseTicker.set(getBaseTicker(s.ticker), s);
      existingByName.set(normalizeCompanyName(s.name), s);
    }

    // Build the new stock list: for each scanner stock, reuse existing defog data if possible
    const newStockList: DefogStock[] = [];
    const seenTickers = new Set<string>();

    for (const stock of scannerStocks) {
      const ticker = getTickerFn(stock);
      const baseTicker = getBaseTicker(ticker);
      const normName = normalizeCompanyName(stock.company_name);

      // Skip duplicates within this batch
      if (seenTickers.has(ticker) || seenTickers.has(baseTicker)) continue;
      seenTickers.add(ticker);
      seenTickers.add(baseTicker);

      // Try to find existing defog stock to preserve its data
      const existing = existingByTicker.get(ticker)
        || existingByBaseTicker.get(baseTicker)
        || existingByName.get(normName);

      if (existing) {
        // Update price from scanner but keep all defog data (range, buyLimit, etc.)
        const scannerStock = stock as unknown as MaikelKuifjeStock | MaikelZonnebloemStock | MaikelSectorStock | MaikelMoriaStock | MaikelBluePillStock;
        newStockList.push({
          ...existing,
          currentPrice: scannerStock.current_price || existing.currentPrice,
          lastUpdated: new Date().toISOString(),
          // Upgrade ticker if better
          ticker: tickerQualityScore(ticker) > tickerQualityScore(existing.ticker) ? ticker : existing.ticker,
        });
      } else {
        // Brand new stock — calculate buy limit from scanner data
        const [limitInput, currentPrice] = getBuyLimitInputFn(stock);
        const buyLimit = calculateBuyLimit(limitInput, currentPrice);
        newStockList.push(maikelToDefogStock(
          stock as unknown as MaikelKuifjeStock | MaikelZonnebloemStock | MaikelSectorStock | MaikelMoriaStock | MaikelBluePillStock,
          buyLimit,
        ));
      }
    }

    return { tabId: tab.id, newStocks: newStockList, isNewTab: isNew };
  }

  // Process each tab
  const kuifjeResult = replaceTabStocks('Kuifje', kuifjeStocks, getDefogTicker, kuifjeBuyLimitInput);
  const zbResult = replaceTabStocks('Prof. Zonnebloem', zbStocks, getDefogTicker, zbBuyLimitInput);
  const biopharmaResult = replaceTabStocks('BioPharma', biopharmaStocks, getDefogTicker, sectorBuyLimitInput);
  const miningResult = replaceTabStocks('Mining', miningStocks, getDefogTicker, sectorBuyLimitInput);
  const hydrogenResult = replaceTabStocks('Hydrogen', hydrogenStocks, getDefogTicker, sectorBuyLimitInput);
  const shippingResult = replaceTabStocks('Shipping', shippingStocks, getDefogTicker, sectorBuyLimitInput);
  const moriaResult = replaceTabStocks('Moria', moriaStocks, getDefogTicker, moriaBuyLimitInput);
  const bluepillResult = replaceTabStocks('Blue Pill', bluepillStocks, getDefogTicker, bluepillBuyLimitInput);

  const allResults = [kuifjeResult, zbResult, biopharmaResult, miningResult, hydrogenResult, shippingResult, moriaResult, bluepillResult];

  setTabs((currentTabs) => {
    let result = [...currentTabs];

    // Add new tabs if needed
    for (const r of allResults) {
      if (r.isNewTab) {
        const tabName = r === kuifjeResult ? 'Kuifje'
          : r === zbResult ? 'Prof. Zonnebloem'
          : r === biopharmaResult ? 'BioPharma'
          : r === miningResult ? 'Mining'
          : r === hydrogenResult ? 'Hydrogen'
          : r === shippingResult ? 'Shipping'
          : r === moriaResult ? 'Moria' : 'Blue Pill';
        const { tab } = findOrCreateTab([], tabName);
        tab.id = r.tabId;
        if (!result.find((t) => t.id === r.tabId)) {
          result.push(tab);
        }
      }
    }

    return result.map((tab) => {
      for (const r of allResults) {
        if (tab.id === r.tabId && r.newStocks.length > 0) {
          return { ...tab, stocks: r.newStocks };
        }
      }
      return tab;
    });
  });

  // Mark refresh as done
  markWeeklyRefreshDone();

  const counts = {
    kuifje: kuifjeResult.newStocks.length,
    zonnebloem: zbResult.newStocks.length,
    biopharma: biopharmaResult.newStocks.length,
    mining: miningResult.newStocks.length,
    hydrogen: hydrogenResult.newStocks.length,
    shipping: shippingResult.newStocks.length,
    moria: moriaResult.newStocks.length,
    bluepill: bluepillResult.newStocks.length,
  };

  console.log(`[ScannerSync] Weekly refresh complete: K=${counts.kuifje}, Z=${counts.zonnebloem}, BP=${counts.biopharma}, M=${counts.mining}, H2=${counts.hydrogen}, SH=${counts.shipping}, MO=${counts.moria}, BL=${counts.bluepill}`);

  return counts;
}
