/**
 * Professor Zonnebloem - Multi-market TradingView scanner
 *
 * Scans 30+ global markets for stocks with high 52-week range ratios,
 * which indicates potential explosive spikes from a stable base.
 *
 * Uses pagination to fetch ALL qualifying stocks per market, not just a top slice.
 */

import { retryWithBackoff } from '../utils';

interface TradingViewResult {
  s: string;
  d: (string | number | null)[];
}

interface TradingViewResponse {
  totalCount: number;
  data: TradingViewResult[];
}

export interface ZBCandidate {
  ticker: string;
  yahooTicker: string;
  fullSymbol: string;
  exchange: string;
  name: string;
  close: number;
  change: number;
  volume: number;
  avgVolume30d: number | null;
  marketCap: number | null;
  sector: string | null;
  high52w: number | null;
  low52w: number | null;
  rangeRatio: number | null;
  market: string;
  country: string | null;
}

// TradingView exchange prefix → Yahoo Finance suffix mapping
// Yahoo needs suffixed tickers for non-US markets (e.g., "7504.T" for Tokyo)
const EXCHANGE_TO_YAHOO_SUFFIX: Record<string, string> = {
  // Americas
  NYSE: '', NASDAQ: '', AMEX: '', ARCA: '', OTC: '',
  TSX: '.TO', TSXV: '.V', NEO: '.NEO',
  BMFBOVESPA: '.SA', BVMF: '.SA',
  BMV: '.MX',
  BCBA: '.BA',
  BVC: '.CL',
  BVL: '.LM',
  BCS: '.SN',
  // Europe
  LSE: '.L', LSIN: '.L',
  XETR: '.DE', FWB: '.F',
  EURONEXT: '.PA', EPA: '.PA',
  BME: '.MC',
  MIL: '.MI',
  STO: '.ST', NGM: '.ST',
  OSL: '.OL', OSE: '.OL',
  CSE: '.CO', OMXCOP: '.CO',
  HEL: '.HE', OMXHEX: '.HE',
  SIX: '.SW', SWX: '.SW',
  AMS: '.AS', ENXTAM: '.AS',
  BRU: '.BR', ENXTBR: '.BR',
  WSE: '.WA', GPW: '.WA',
  VIE: '.VI', WBAG: '.VI',
  ENXTLS: '.LS', ELI: '.LS',
  ATHEX: '.AT', ASE: '.AT',
  BIST: '.IS',
  TASE: '.TA',
  // Asia-Pacific
  HKEX: '.HK', HKSE: '.HK',
  TSE: '.T', JPX: '.T',
  NSE: '.NS', BSE: '.BO',
  KRX: '.KS', KOSDAQ: '.KQ', KOSE: '.KS',
  TWSE: '.TW', TPEX: '.TWO',
  SGX: '.SI',
  ASX: '.AX',
  NZX: '.NZ', NZE: '.NZ',
  IDX: '.JK',
  MYX: '.KL', KLSE: '.KL',
  SET: '.BK',
  PSE: '.PS',
  HOSE: '.VN', HNX: '.VN',
  KSE: '.KA', PSX: '.KA',
  SSE: '.SS', SZSE: '.SZ', SHH: '.SS', SHZ: '.SZ',
  // Africa & Middle East
  JSE: '.JO',
  EGX: '.CA',
  TADAWUL: '.SR', SAU: '.SR',
  DFM: '.AE', ADX: '.AE',
  QSE: '.QA', DSM: '.QA',
  BK: '.KW', KSE_KW: '.KW',
  BAX: '.BH',
  NGX: '.LG', NGSE: '.LG',
  NSE_KE: '.NR',
  GSE: '.GH',
};

// Patterns that indicate ETFs, funds, warrants, or depositary receipts — skip these
const SKIP_NAME_PATTERNS = /\b(ETF|ETN|Fund|Trust|Index|Warrant|Rights|Dep\.?\s*Rec|BDR|GDR|ADR|Cert|Tracker|SPDR|iShares|Vanguard|Lyxor|Amundi|Xtrackers|WisdomTree)\b/i;
const SKIP_TICKER_PATTERNS = /^(.*-ETF.*|.*-WNT.*|.*-WT.*|.*-UN$|.*-PR$|.*34$)$/i;

/**
 * Convert a TradingView exchange:ticker into a Yahoo Finance ticker.
 */
function toYahooTicker(exchangePrefix: string, ticker: string): string {
  // US stocks don't need a suffix
  const suffix = EXCHANGE_TO_YAHOO_SUFFIX[exchangePrefix];
  if (suffix !== undefined) {
    return ticker + suffix;
  }
  // Fallback: try the raw ticker (works for many US stocks)
  return ticker;
}

// TradingView market endpoints - all available global markets
const MARKET_URLS: Record<string, string> = {
  // Americas
  america: 'https://scanner.tradingview.com/america/scan',
  canada: 'https://scanner.tradingview.com/canada/scan',
  brazil: 'https://scanner.tradingview.com/brazil/scan',
  mexico: 'https://scanner.tradingview.com/mexico/scan',
  argentina: 'https://scanner.tradingview.com/argentina/scan',
  colombia: 'https://scanner.tradingview.com/colombia/scan',
  chile: 'https://scanner.tradingview.com/chile/scan',
  peru: 'https://scanner.tradingview.com/peru/scan',
  // Europe
  europe: 'https://scanner.tradingview.com/europe/scan',
  uk: 'https://scanner.tradingview.com/uk/scan',
  germany: 'https://scanner.tradingview.com/germany/scan',
  france: 'https://scanner.tradingview.com/france/scan',
  spain: 'https://scanner.tradingview.com/spain/scan',
  italy: 'https://scanner.tradingview.com/italy/scan',
  sweden: 'https://scanner.tradingview.com/sweden/scan',
  norway: 'https://scanner.tradingview.com/norway/scan',
  denmark: 'https://scanner.tradingview.com/denmark/scan',
  finland: 'https://scanner.tradingview.com/finland/scan',
  switzerland: 'https://scanner.tradingview.com/switzerland/scan',
  netherlands: 'https://scanner.tradingview.com/netherlands/scan',
  belgium: 'https://scanner.tradingview.com/belgium/scan',
  poland: 'https://scanner.tradingview.com/poland/scan',
  austria: 'https://scanner.tradingview.com/austria/scan',
  portugal: 'https://scanner.tradingview.com/portugal/scan',
  greece: 'https://scanner.tradingview.com/greece/scan',
  turkey: 'https://scanner.tradingview.com/turkey/scan',
  israel: 'https://scanner.tradingview.com/israel/scan',
  // Asia-Pacific
  hongkong: 'https://scanner.tradingview.com/hongkong/scan',
  japan: 'https://scanner.tradingview.com/japan/scan',
  india: 'https://scanner.tradingview.com/india/scan',
  korea: 'https://scanner.tradingview.com/korea/scan',
  taiwan: 'https://scanner.tradingview.com/taiwan/scan',
  singapore: 'https://scanner.tradingview.com/singapore/scan',
  australia: 'https://scanner.tradingview.com/australia/scan',
  newzealand: 'https://scanner.tradingview.com/newzealand/scan',
  indonesia: 'https://scanner.tradingview.com/indonesia/scan',
  malaysia: 'https://scanner.tradingview.com/malaysia/scan',
  thailand: 'https://scanner.tradingview.com/thailand/scan',
  philippines: 'https://scanner.tradingview.com/philippines/scan',
  vietnam: 'https://scanner.tradingview.com/vietnam/scan',
  pakistan: 'https://scanner.tradingview.com/pakistan/scan',
  china: 'https://scanner.tradingview.com/china/scan',
  // Africa & Middle East
  southafrica: 'https://scanner.tradingview.com/southafrica/scan',
  egypt: 'https://scanner.tradingview.com/egypt/scan',
  saudi: 'https://scanner.tradingview.com/saudi/scan',
  uae: 'https://scanner.tradingview.com/uae/scan',
  qatar: 'https://scanner.tradingview.com/qatar/scan',
  kuwait: 'https://scanner.tradingview.com/kuwait/scan',
  bahrain: 'https://scanner.tradingview.com/bahrain/scan',
  nigeria: 'https://scanner.tradingview.com/nigeria/scan',
  kenya: 'https://scanner.tradingview.com/kenya/scan',
  ghana: 'https://scanner.tradingview.com/ghana/scan',
};

// Country labels per market
const MARKET_COUNTRIES: Record<string, string> = {
  america: 'United States', canada: 'Canada', brazil: 'Brazil', mexico: 'Mexico',
  argentina: 'Argentina', colombia: 'Colombia', chile: 'Chile', peru: 'Peru',
  europe: 'Europe', uk: 'United Kingdom', germany: 'Germany', france: 'France',
  spain: 'Spain', italy: 'Italy', sweden: 'Sweden', norway: 'Norway',
  denmark: 'Denmark', finland: 'Finland', switzerland: 'Switzerland',
  netherlands: 'Netherlands', belgium: 'Belgium', poland: 'Poland',
  austria: 'Austria', portugal: 'Portugal', greece: 'Greece', turkey: 'Turkey',
  israel: 'Israel', hongkong: 'Hong Kong', japan: 'Japan', india: 'India',
  korea: 'South Korea', taiwan: 'Taiwan', singapore: 'Singapore',
  australia: 'Australia', newzealand: 'New Zealand', indonesia: 'Indonesia',
  malaysia: 'Malaysia', thailand: 'Thailand', philippines: 'Philippines',
  vietnam: 'Vietnam', pakistan: 'Pakistan', china: 'China', southafrica: 'South Africa',
  egypt: 'Egypt', saudi: 'Saudi Arabia', uae: 'UAE', qatar: 'Qatar',
  kuwait: 'Kuwait', bahrain: 'Bahrain', nigeria: 'Nigeria', kenya: 'Kenya', ghana: 'Ghana',
};

/**
 * Fetch a single page of stocks from one market.
 */
async function fetchPage(
  market: string,
  minRangeRatio: number,
  minVolume: number,
  minPrice: number,
  limit: number,
  offset: number,
): Promise<{ candidates: ZBCandidate[]; totalCount: number }> {
  const url = MARKET_URLS[market];
  if (!url) return { candidates: [], totalCount: 0 };

  const payload = {
    columns: [
      'name', 'description', 'close', 'change', 'volume',
      'average_volume_30d_calc', 'market_cap_basic', 'sector',
      'price_52_week_high', 'price_52_week_low', 'exchange', 'country',
    ],
    ignore_unknown_fields: true,
    options: { lang: 'en' },
    range: [offset, offset + limit],
    sort: { sortBy: 'average_volume_30d_calc', sortOrder: 'desc' },
    symbols: {},
    markets: [market],
    filter2: {
      operator: 'and',
      operands: [
        { operation: { operator: 'equal', operand: ['type', 'stock'] } },
        { operation: { operator: 'greater', operand: ['close', minPrice] } },
        { operation: { operator: 'greater', operand: ['average_volume_30d_calc', minVolume] } },
        { operation: { operator: 'greater', operand: ['price_52_week_high', 0] } },
        { operation: { operator: 'greater', operand: ['price_52_week_low', 0] } },
      ],
    },
  };

  const data = await retryWithBackoff(async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`TradingView ${market} HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<TradingViewResponse>;
  });

  if (!data?.data) return { candidates: [], totalCount: data?.totalCount || 0 };

  const candidates = data.data
    .map((item): ZBCandidate | null => {
      const [exchangePrefix, ticker] = item.s.split(':');
      const d = item.d;
      const name = (d[1] as string) || '';

      // Skip ETFs, funds, warrants, depositary receipts
      if (SKIP_NAME_PATTERNS.test(name)) return null;
      if (SKIP_TICKER_PATTERNS.test(ticker)) return null;

      const high52w = (d[8] as number) || null;
      const low52w = (d[9] as number) || null;
      const rangeRatio = high52w && low52w && low52w > 0 ? high52w / low52w : null;

      if (!rangeRatio || rangeRatio < minRangeRatio) return null;

      const close = (d[2] as number) || 0;
      if (close <= 0) return null;

      const exchange = (d[10] as string) || exchangePrefix || '';
      const yahooTicker = toYahooTicker(exchangePrefix, ticker);

      return {
        ticker: ticker || (d[0] as string) || '',
        yahooTicker,
        fullSymbol: item.s,
        exchange,
        name,
        close,
        change: (d[3] as number) || 0,
        volume: (d[4] as number) || 0,
        avgVolume30d: (d[5] as number) || null,
        marketCap: (d[6] as number) || null,
        sector: (d[7] as string) || null,
        high52w,
        low52w,
        rangeRatio,
        market,
        country: (d[11] as string) || MARKET_COUNTRIES[market] || null,
      };
    })
    .filter((s): s is ZBCandidate => s !== null && s.ticker.length > 0);

  return { candidates, totalCount: data.totalCount };
}

/**
 * Fetch ALL qualifying stocks from a single market using pagination.
 * Keeps fetching pages until no more results or max cap reached.
 */
export async function fetchHighRangeStocks(
  market: string,
  minRangeRatio: number = 1.5,
  minVolume: number = 10000,
  minPrice: number = 0.10,
  maxPerMarket: number = 5000,
): Promise<ZBCandidate[]> {
  const url = MARKET_URLS[market];
  if (!url) {
    console.warn(`ZB: Unknown market "${market}", skipping`);
    return [];
  }

  const pageSize = 1500;
  const allCandidates: ZBCandidate[] = [];
  let offset = 0;

  try {
    // First page
    const first = await fetchPage(market, minRangeRatio, minVolume, minPrice, pageSize, 0);
    allCandidates.push(...first.candidates);

    // If there are more results, paginate
    const totalAvailable = first.totalCount;
    offset = pageSize;

    while (offset < totalAvailable && allCandidates.length < maxPerMarket) {
      const page = await fetchPage(market, minRangeRatio, minVolume, minPrice, pageSize, offset);
      if (page.candidates.length === 0) break;
      allCandidates.push(...page.candidates);
      offset += pageSize;
    }

    return allCandidates.slice(0, maxPerMarket);
  } catch (error) {
    console.error(`ZB TradingView: Error fetching ${market}:`, error);
    // Return whatever we got before the error
    return allCandidates;
  }
}

/**
 * Scan multiple markets in parallel for high-range-ratio stocks.
 * Returns deduplicated candidates sorted by range ratio (highest first).
 */
export async function fetchCandidatesFromAllMarkets(
  markets: string[],
  minRangeRatio: number = 1.5,
  minVolume: number = 10000,
  minPrice: number = 0.10,
  maxPerMarket: number = 5000,
): Promise<ZBCandidate[]> {
  console.log(`ZB: Scanning ${markets.length} markets: ${markets.join(', ')}`);

  // Scan markets in parallel batches of 4 to avoid rate limiting
  const allCandidates: ZBCandidate[] = [];
  const batchSize = 4;

  for (let i = 0; i < markets.length; i += batchSize) {
    const batch = markets.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((market) =>
        fetchHighRangeStocks(market, minRangeRatio, minVolume, minPrice, maxPerMarket),
      ),
    );

    for (let j = 0; j < results.length; j++) {
      console.log(`ZB: Got ${results[j].length} candidates from ${batch[j]}`);
      allCandidates.push(...results[j]);
    }
  }

  // Deduplicate by ticker (keep the one with highest range ratio)
  const tickerMap = new Map<string, ZBCandidate>();
  for (const candidate of allCandidates) {
    const existing = tickerMap.get(candidate.ticker);
    if (!existing || (candidate.rangeRatio || 0) > (existing.rangeRatio || 0)) {
      tickerMap.set(candidate.ticker, candidate);
    }
  }

  const deduplicated = Array.from(tickerMap.values());
  deduplicated.sort((a, b) => (b.rangeRatio || 0) - (a.rangeRatio || 0));

  console.log(`ZB: Total ${allCandidates.length} raw -> ${deduplicated.length} unique candidates across ${markets.length} markets`);
  return deduplicated;
}
