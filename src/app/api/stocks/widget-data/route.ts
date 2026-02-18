import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface WidgetStock {
  ticker: string;
  name: string;
  currentPrice: number;
  buyLimit: number;
  distancePercent: number;
  dayChangePercent: number;
  currency: string;
  lastUpdated: string;
  tabName: string;
  tabColor: string;
}

interface DefogStock {
  ticker: string;
  name?: string;
  displayName?: string;
  currentPrice: number;
  buyLimit: number | null;
  dayChangePercent: number;
  currency: string;
  lastUpdated: string;
  rangeFetched?: boolean;
}

interface DefogTab {
  id: string;
  name: string;
  accentColor: string;
  stocks: DefogStock[];
}

/**
 * GET /api/stocks/widget-data
 *
 * Reads the Defog app state from the cloud backup (settings table)
 * and returns the top N stocks closest to their buy limit,
 * sorted by distance percentage (ascending).
 *
 * Query params:
 *   - limit: number of stocks to return (default 24, max 48)
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10) || 24, 48);

  // Load Defog state from cloud backup
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'defog_state')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.value) {
    return NextResponse.json({ stocks: [], total: 0, updatedAt: new Date().toISOString() });
  }

  let parsed: { tabs?: DefogTab[]; lastSyncTime?: string };
  try {
    parsed = JSON.parse(data.value);
  } catch {
    return NextResponse.json({ error: 'Invalid cloud data' }, { status: 500 });
  }

  const tabs = parsed.tabs || [];

  // Collect all stocks with valid buy limits across all tabs
  const allStocks: WidgetStock[] = [];

  for (const tab of tabs) {
    for (const stock of tab.stocks) {
      if (
        stock.buyLimit != null &&
        stock.buyLimit > 0 &&
        stock.currentPrice > 0 &&
        stock.rangeFetched
      ) {
        const distancePercent = ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100;
        allStocks.push({
          ticker: stock.ticker,
          name: stock.displayName || stock.name || stock.ticker,
          currentPrice: stock.currentPrice,
          buyLimit: stock.buyLimit,
          distancePercent,
          dayChangePercent: stock.dayChangePercent || 0,
          currency: stock.currency || 'EUR',
          lastUpdated: stock.lastUpdated || '',
          tabName: tab.name,
          tabColor: tab.accentColor,
        });
      }
    }
  }

  // Sort by distance (closest to buy limit first) and take top N
  allStocks.sort((a, b) => a.distancePercent - b.distancePercent);
  const topStocks = allStocks.slice(0, limit);

  return NextResponse.json({
    stocks: topStocks,
    total: allStocks.length,
    updatedAt: parsed.lastSyncTime || new Date().toISOString(),
  });
}
