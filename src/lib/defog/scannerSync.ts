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
  company_name: string;
  current_price: number | null;
  three_year_low: number | null;
  exchange: string | null;
  sector: string | null;
  highest_spike_pct: number | null;
}

/**
 * Calculate suggested buy limit: 15% above the 3-year low.
 * Falls back to existing purchase_limit if three_year_low is unavailable.
 */
function calculateBuyLimit(threeYearLow: number | null, fallbackLimit: number | null): number | null {
  if (threeYearLow && threeYearLow > 0) {
    return Math.round(threeYearLow * 1.15 * 100) / 100; // 15% above 3-year low, rounded to 2 decimals
  }
  return fallbackLimit;
}

function maikelToDefogStock(
  m: MaikelKuifjeStock | MaikelZonnebloemStock,
  buyLimit: number | null,
): DefogStock {
  return {
    id: uuidv4(),
    ticker: m.ticker,
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
    exchange: m.exchange || 'UNKNOWN',
    alertSettings: { customThresholds: [], enabled: true },
  };
}

/**
 * Sync Maikel scanner results into Defog tabs.
 * Creates "Kuifje" and "Prof. Zonnebloem" tabs if they don't exist.
 * Adds new stocks (by ticker) and updates existing ones.
 */
export async function syncScannerToDefog(
  getTabs: () => Tab[],
  setTabs: (updater: (tabs: Tab[]) => Tab[]) => void,
): Promise<{ kuifjeAdded: number; zbAdded: number }> {
  // Fetch both scanner results
  const [kuifjeRes, zbRes] = await Promise.all([
    fetch('/api/stocks?showDeleted=true&showArchived=true'),
    fetch('/api/zonnebloem/stocks'),
  ]);

  const kuifjeStocks: MaikelKuifjeStock[] = kuifjeRes.ok ? await kuifjeRes.json() : [];
  // Zonnebloem API returns array directly (not wrapped in { stocks: [...] })
  const zbJson = zbRes.ok ? await zbRes.json() : [];
  const zbStocks: MaikelZonnebloemStock[] = Array.isArray(zbJson) ? zbJson : (zbJson.stocks || []);

  const tabs = getTabs();

  // Find or prepare tabs
  let kuifjeTab = tabs.find((t) => t.name === 'Kuifje');
  let zbTab = tabs.find((t) => t.name === 'Prof. Zonnebloem');

  let newTabs = [...tabs];
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
    newTabs = [...newTabs, kuifjeTab];
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
    newTabs = [...newTabs, zbTab];
  }

  // Sync Kuifje stocks — only add new, never remove
  // Buy limit = 15% above 3-year low (falls back to scanner's purchase_limit)
  const kuifjeExistingTickers = new Set(kuifjeTab.stocks.map((s) => s.ticker));
  const kuifjeNewStocks: DefogStock[] = [];
  for (const stock of kuifjeStocks) {
    if (!kuifjeExistingTickers.has(stock.ticker)) {
      const buyLimit = calculateBuyLimit(stock.three_year_low, stock.purchase_limit);
      kuifjeNewStocks.push(maikelToDefogStock(stock, buyLimit));
      kuifjeAdded++;
    }
  }

  // Sync Zonnebloem stocks — only add new, never remove
  // Buy limit = 15% above 3-year low
  const zbExistingTickers = new Set(zbTab.stocks.map((s) => s.ticker));
  const zbNewStocks: DefogStock[] = [];
  for (const stock of zbStocks) {
    if (!zbExistingTickers.has(stock.ticker)) {
      const buyLimit = calculateBuyLimit(stock.three_year_low, null);
      zbNewStocks.push(maikelToDefogStock(stock, buyLimit));
      zbAdded++;
    }
  }

  // Build lookup maps for updating existing stocks' buy limits
  const kuifjeByTicker = new Map(kuifjeStocks.map((s) => [s.ticker, s]));
  const zbByTicker = new Map(zbStocks.map((s) => [s.ticker, s]));

  // Apply updates — ensure tabs exist, append new stocks, update buyLimits
  const kuifjeTabId = kuifjeTab.id;
  const zbTabId = zbTab.id;
  const newKuifjeTab = !tabs.find((t) => t.name === 'Kuifje') ? kuifjeTab : null;
  const newZbTab = !tabs.find((t) => t.name === 'Prof. Zonnebloem') ? zbTab : null;

  setTabs((currentTabs) => {
    // First: ensure new tabs exist in the array
    let result = [...currentTabs];
    if (newKuifjeTab && !result.find((t) => t.id === kuifjeTabId)) {
      result.push(newKuifjeTab);
    }
    if (newZbTab && !result.find((t) => t.id === zbTabId)) {
      result.push(newZbTab);
    }

    // Then: map to add stocks and update buy limits
    return result.map((tab) => {
      if (tab.id === kuifjeTabId) {
        const updatedStocks = tab.stocks.map((s) => {
          if (s.buyLimit == null) {
            const scanner = kuifjeByTicker.get(s.ticker);
            if (scanner) {
              const newLimit = calculateBuyLimit(scanner.three_year_low, scanner.purchase_limit);
              if (newLimit != null) return { ...s, buyLimit: newLimit };
            }
          }
          return s;
        });
        return {
          ...tab,
          stocks: [...updatedStocks, ...kuifjeNewStocks],
        };
      }
      if (tab.id === zbTabId) {
        const updatedStocks = tab.stocks.map((s) => {
          if (s.buyLimit == null) {
            const scanner = zbByTicker.get(s.ticker);
            if (scanner) {
              const newLimit = calculateBuyLimit(scanner.three_year_low, null);
              if (newLimit != null) return { ...s, buyLimit: newLimit };
            }
          }
          return s;
        });
        return {
          ...tab,
          stocks: [...updatedStocks, ...zbNewStocks],
        };
      }
      return tab;
    });
  });

  return { kuifjeAdded, zbAdded };
}
