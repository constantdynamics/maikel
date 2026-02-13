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
  exchange: string | null;
  sector: string | null;
}

interface MaikelZonnebloemStock {
  id: string;
  ticker: string;
  company_name: string;
  current_price: number | null;
  exchange: string | null;
  sector: string | null;
  highest_spike_pct: number | null;
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
  const zbStocks: MaikelZonnebloemStock[] = zbRes.ok
    ? (await zbRes.json()).stocks || []
    : [];

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
  const kuifjeExistingTickers = new Set(kuifjeTab.stocks.map((s) => s.ticker));
  const kuifjeNewStocks: DefogStock[] = [];
  for (const stock of kuifjeStocks) {
    if (!kuifjeExistingTickers.has(stock.ticker)) {
      kuifjeNewStocks.push(maikelToDefogStock(stock, stock.purchase_limit));
      kuifjeAdded++;
    }
  }

  // Sync Zonnebloem stocks — only add new, never remove
  const zbExistingTickers = new Set(zbTab.stocks.map((s) => s.ticker));
  const zbNewStocks: DefogStock[] = [];
  for (const stock of zbStocks) {
    if (!zbExistingTickers.has(stock.ticker)) {
      zbNewStocks.push(maikelToDefogStock(stock, null));
      zbAdded++;
    }
  }

  // Apply updates — append new stocks, keep all existing
  const kuifjeTabId = kuifjeTab.id;
  const zbTabId = zbTab.id;

  setTabs((currentTabs) =>
    currentTabs.map((tab) => {
      if (tab.id === kuifjeTabId) {
        return {
          ...tab,
          stocks: [...tab.stocks, ...kuifjeNewStocks],
        };
      }
      if (tab.id === zbTabId) {
        return {
          ...tab,
          stocks: [...tab.stocks, ...zbNewStocks],
        };
      }
      return tab;
    })
  );

  return { kuifjeAdded, zbAdded };
}
