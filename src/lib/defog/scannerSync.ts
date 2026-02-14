import { v4 as uuidv4 } from 'uuid';
import type { Stock as DefogStock, Tab } from './types';

// Color constants for auto-created scanner tabs
const KUIFJE_TAB_COLOR = '#22c55e';     // Green
const ZONNEBLOEM_TAB_COLOR = '#a855f7'; // Purple

interface MaikelKuifjeStock {
  id: string;
  ticker: string;
  company_name: string;
  current_price: number | null;
  purchase_limit: number | null;
  three_year_low: number | null;
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

/**
 * Calculate suggested buy limit: ONLY 15% above the 3-year low.
 * No fallbacks — if three_year_low is unavailable, returns null.
 * Returns null if the calculated limit would be above the current price
 * (stale 3Y-low data makes the limit meaningless).
 */
function calculateBuyLimit(threeYearLow: number | null, currentPrice?: number | null): number | null {
  if (threeYearLow && threeYearLow > 0) {
    const limit = Math.round(threeYearLow * 1.15 * 100) / 100;
    // Don't set a limit above the current price — it's meaningless
    if (currentPrice && currentPrice > 0 && limit > currentPrice) {
      return null;
    }
    return limit;
  }
  return null;
}

/**
 * Determine the best ticker for Defog (that data providers can resolve).
 * For Zonnebloem stocks, use yahoo_ticker if available (e.g., "0A91.F" or "LMND").
 * For Kuifje stocks, ticker is typically already a proper US ticker.
 */
function getDefogTicker(m: MaikelKuifjeStock | MaikelZonnebloemStock): string {
  // Zonnebloem stocks have yahoo_ticker which includes the proper exchange suffix
  if ('yahoo_ticker' in m && m.yahoo_ticker) {
    return m.yahoo_ticker;
  }
  return m.ticker;
}

/**
 * Determine the exchange for Defog based on the yahoo_ticker suffix.
 */
function getDefogExchange(m: MaikelKuifjeStock | MaikelZonnebloemStock): string {
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
function deduplicateScannerStocks<T extends { company_name: string; three_year_low: number | null; current_price: number | null }>(
  stocks: T[],
  getTickerFn: (s: T) => string,
): T[] {
  const byName = new Map<string, { stock: T; ticker: string; buyLimit: number | null }>();

  for (const stock of stocks) {
    const normalizedName = normalizeCompanyName(stock.company_name);
    const ticker = getTickerFn(stock);
    const buyLimit = calculateBuyLimit(stock.three_year_low, stock.current_price);
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
  m: MaikelKuifjeStock | MaikelZonnebloemStock,
  buyLimit: number | null,
  overrideTicker?: string,
): DefogStock {
  const ticker = overrideTicker || getDefogTicker(m);
  const exchange = getDefogExchange(m);

  return {
    id: uuidv4(),
    ticker,
    name: m.company_name || m.ticker,
    buyLimit: buyLimit,
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
 * Sync Maikel scanner results into Defog tabs.
 * Creates "Kuifje" and "Prof. Zonnebloem" tabs if they don't exist.
 * Adds new stocks (by ticker AND company name) and updates existing ones.
 *
 * Deduplication:
 *  - Within scanner results: group by company name, pick best ticker (with dot suffix)
 *  - Against existing Defog stocks: match by ticker, base ticker, or company name
 *  - When duplicates found: use lowest buy limit, upgrade to better ticker
 *
 * Buy limit = ONLY three_year_low * 1.15. No fallbacks.
 */
export async function syncScannerToDefog(
  getTabs: () => Tab[],
  setTabs: (updater: (tabs: Tab[]) => Tab[]) => void,
): Promise<{ kuifjeAdded: number; zbAdded: number }> {
  // Fetch both scanner results
  const [kuifjeRes, zbRes] = await Promise.all([
    fetch('/api/stocks'),
    fetch('/api/zonnebloem/stocks'),
  ]);

  const kuifjeStocksRaw: MaikelKuifjeStock[] = kuifjeRes.ok ? await kuifjeRes.json() : [];
  const zbJson = zbRes.ok ? await zbRes.json() : [];
  const zbStocksRaw: MaikelZonnebloemStock[] = Array.isArray(zbJson) ? zbJson : (zbJson.stocks || []);

  // Deduplicate incoming scanner results by company name
  const kuifjeStocks = deduplicateScannerStocks(kuifjeStocksRaw, getDefogTicker);
  const zbStocks = deduplicateScannerStocks(zbStocksRaw, getDefogTicker);

  const tabs = getTabs();

  // Find or prepare tabs
  let kuifjeTab = tabs.find((t) => t.name === 'Kuifje');
  let zbTab = tabs.find((t) => t.name === 'Prof. Zonnebloem');

  let kuifjeAdded = 0;
  let zbAdded = 0;

  // Create Kuifje tab if needed
  if (!kuifjeTab) {
    kuifjeTab = {
      id: uuidv4(),
      name: 'Kuifje',
      accentColor: KUIFJE_TAB_COLOR,
      stocks: [],
      sortField: 'ticker',
      sortDirection: 'asc',
      createdAt: new Date().toISOString(),
    };
  }

  // Create Zonnebloem tab if needed
  if (!zbTab) {
    zbTab = {
      id: uuidv4(),
      name: 'Prof. Zonnebloem',
      accentColor: ZONNEBLOEM_TAB_COLOR,
      stocks: [],
      sortField: 'ticker',
      sortDirection: 'asc',
      createdAt: new Date().toISOString(),
    };
  }

  // ── Kuifje: build new stocks and updates ──
  const kuifjeMaps = buildExistingStockMaps(kuifjeTab.stocks);
  const kuifjeNewStocks: DefogStock[] = [];
  // Track updates to existing stocks: stockId → { ticker?, buyLimit? }
  const kuifjeUpdates = new Map<string, { ticker?: string; buyLimit?: number | null }>();

  for (const stock of kuifjeStocks) {
    const defogTicker = getDefogTicker(stock);
    const buyLimit = calculateBuyLimit(stock.three_year_low, stock.current_price);

    const existing = findExistingStock(
      kuifjeTab.stocks, defogTicker, stock.company_name,
      kuifjeMaps.nameMap, kuifjeMaps.baseTickerMap, kuifjeMaps.tickerSet,
    );

    if (existing) {
      // Duplicate found — potentially update ticker and/or buy limit
      const updates: { ticker?: string; buyLimit?: number | null } = {};

      // Upgrade ticker if the new one is better (has exchange suffix)
      if (tickerQualityScore(defogTicker) > tickerQualityScore(existing.ticker)) {
        updates.ticker = defogTicker;
      }

      // Use the lowest non-null buy limit
      if (buyLimit != null) {
        if (existing.buyLimit == null || buyLimit < existing.buyLimit) {
          updates.buyLimit = buyLimit;
        }
      }
      // Clear existing buy limit if it's above current price (stale data)
      if (existing.buyLimit != null && stock.current_price && stock.current_price > 0 && existing.buyLimit > stock.current_price) {
        updates.buyLimit = buyLimit; // will be null if 3Y low * 1.15 > current price
      }

      if (Object.keys(updates).length > 0) {
        // Merge with any previous updates for this stock
        const prev = kuifjeUpdates.get(existing.id) || {};
        kuifjeUpdates.set(existing.id, { ...prev, ...updates });
      }
    } else {
      // New stock
      kuifjeNewStocks.push(maikelToDefogStock(stock, buyLimit));
      // Also add to maps so subsequent duplicates within this batch are caught
      kuifjeMaps.tickerSet.add(defogTicker);
      kuifjeMaps.nameMap.set(normalizeCompanyName(stock.company_name), kuifjeNewStocks[kuifjeNewStocks.length - 1]);
      kuifjeMaps.baseTickerMap.set(getBaseTicker(defogTicker), kuifjeNewStocks[kuifjeNewStocks.length - 1]);
      kuifjeAdded++;
    }
  }

  // ── Zonnebloem: build new stocks and updates ──
  const zbMaps = buildExistingStockMaps(zbTab.stocks);
  const zbNewStocks: DefogStock[] = [];
  const zbUpdates = new Map<string, { ticker?: string; buyLimit?: number | null }>();

  for (const stock of zbStocks) {
    const defogTicker = getDefogTicker(stock);
    const buyLimit = calculateBuyLimit(stock.three_year_low, stock.current_price);

    const existing = findExistingStock(
      zbTab.stocks, defogTicker, stock.company_name,
      zbMaps.nameMap, zbMaps.baseTickerMap, zbMaps.tickerSet,
    );

    if (existing) {
      const updates: { ticker?: string; buyLimit?: number | null } = {};

      if (tickerQualityScore(defogTicker) > tickerQualityScore(existing.ticker)) {
        updates.ticker = defogTicker;
      }

      if (buyLimit != null) {
        if (existing.buyLimit == null || buyLimit < existing.buyLimit) {
          updates.buyLimit = buyLimit;
        }
      }
      // Clear existing buy limit if it's above current price (stale data)
      if (existing.buyLimit != null && stock.current_price && stock.current_price > 0 && existing.buyLimit > stock.current_price) {
        updates.buyLimit = buyLimit; // will be null if 3Y low * 1.15 > current price
      }

      if (Object.keys(updates).length > 0) {
        const prev = zbUpdates.get(existing.id) || {};
        zbUpdates.set(existing.id, { ...prev, ...updates });
      }
    } else {
      zbNewStocks.push(maikelToDefogStock(stock, buyLimit));
      zbMaps.tickerSet.add(defogTicker);
      zbMaps.nameMap.set(normalizeCompanyName(stock.company_name), zbNewStocks[zbNewStocks.length - 1]);
      zbMaps.baseTickerMap.set(getBaseTicker(defogTicker), zbNewStocks[zbNewStocks.length - 1]);
      zbAdded++;
    }
  }

  // Build lookup maps for updating existing stocks' buy limits (for stocks that had null buyLimit)
  const kuifjeByTicker = new Map(kuifjeStocks.map((s) => [getDefogTicker(s), s]));
  const zbByTicker = new Map(zbStocks.map((s) => [getDefogTicker(s), s]));

  // Apply updates
  const kuifjeTabId = kuifjeTab.id;
  const zbTabId = zbTab.id;
  const needNewKuifjeTab = !tabs.find((t) => t.name === 'Kuifje');
  const needNewZbTab = !tabs.find((t) => t.name === 'Prof. Zonnebloem');

  setTabs((currentTabs) => {
    let result = [...currentTabs];

    // Add new tabs if needed
    if (needNewKuifjeTab && !result.find((t) => t.id === kuifjeTabId)) {
      result.push(kuifjeTab!);
    }
    if (needNewZbTab && !result.find((t) => t.id === zbTabId)) {
      result.push(zbTab!);
    }

    return result.map((tab) => {
      if (tab.id === kuifjeTabId) {
        const updatedStocks = tab.stocks.map((s) => {
          // Apply duplicate-merge updates (ticker upgrade, lower limit)
          const update = kuifjeUpdates.get(s.id);
          if (update) {
            return {
              ...s,
              ...(update.ticker ? { ticker: update.ticker } : {}),
              ...(update.buyLimit !== undefined ? { buyLimit: update.buyLimit } : {}),
            };
          }
          // Fill in null buyLimits from scanner data (3Y low only)
          if (s.buyLimit == null) {
            const scanner = kuifjeByTicker.get(s.ticker);
            if (scanner) {
              const newLimit = calculateBuyLimit(scanner.three_year_low, scanner.current_price);
              if (newLimit != null) return { ...s, buyLimit: newLimit };
            }
          }
          return s;
        });
        // Deduplicate: merge existing duplicates (e.g., SES + SES.SI)
        return { ...tab, stocks: deduplicateExistingTabStocks([...updatedStocks, ...kuifjeNewStocks]) };
      }
      if (tab.id === zbTabId) {
        const updatedStocks = tab.stocks.map((s) => {
          const update = zbUpdates.get(s.id);
          if (update) {
            return {
              ...s,
              ...(update.ticker ? { ticker: update.ticker } : {}),
              ...(update.buyLimit !== undefined ? { buyLimit: update.buyLimit } : {}),
            };
          }
          if (s.buyLimit == null) {
            const scanner = zbByTicker.get(s.ticker);
            if (scanner) {
              const newLimit = calculateBuyLimit(scanner.three_year_low, scanner.current_price);
              if (newLimit != null) return { ...s, buyLimit: newLimit };
            }
          }
          return s;
        });
        // Deduplicate: merge existing duplicates (e.g., 0J9J + 0J9J.L)
        return { ...tab, stocks: deduplicateExistingTabStocks([...updatedStocks, ...zbNewStocks]) };
      }
      return tab;
    });
  });

  return { kuifjeAdded, zbAdded };
}
