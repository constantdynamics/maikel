/**
 * Stock universe: NYSE and NASDAQ listed stocks.
 *
 * Since there's no free reliable API to get all tickers,
 * we maintain a curated list of potentially interesting tickers
 * and supplement with Yahoo Finance screener results.
 *
 * The scan process:
 * 1. Start with known universe of ~3000 major NYSE/NASDAQ stocks
 * 2. Supplement with Yahoo screener for active/volatile stocks
 * 3. Filter based on criteria (age, exchange, etc.)
 */

// A representative set of tickers across sectors - in production,
// this would be supplemented by the screener API.
// This list focuses on stocks that have historically shown high volatility
// (biotech, tech, small-cap) which are more likely to match our criteria.
const SCAN_SECTORS = {
  biotech: [
    'NVAX', 'MRNA', 'SAVA', 'BNGO', 'CLOV', 'WKHS', 'RIDE', 'NKLA',
    'GEVO', 'FCEL', 'PLUG', 'BLNK', 'QS', 'LAZR', 'VLDR', 'GOEV',
    'ARVL', 'FSR', 'LCID', 'RIVN', 'JOBY', 'DNA', 'BFLY', 'SEER',
    'GDRX', 'TDOC', 'AMWL', 'TALK', 'MNDY', 'HIMS', 'NUVB', 'CRSP',
    'EDIT', 'NTLA', 'BEAM', 'VERV', 'PCVX', 'ABCL', 'AFRM',
  ],
  tech_growth: [
    'PLTR', 'SNOW', 'NET', 'DDOG', 'ZS', 'CRWD', 'OKTA', 'MDB',
    'CFLT', 'S', 'GTLB', 'DOCN', 'BRZE', 'RBRK', 'IOT', 'AI',
    'BBAI', 'SOUN', 'ASTS', 'LUNR', 'RKLB', 'IREN', 'CLSK', 'MARA',
    'RIOT', 'COIN', 'HOOD', 'SOFI', 'UPST', 'AFRM', 'BILL', 'TOST',
  ],
  ev_energy: [
    'TSLA', 'NIO', 'XPEV', 'LI', 'LCID', 'RIVN', 'FSR', 'GOEV',
    'WKHS', 'RIDE', 'NKLA', 'ARVL', 'FCEL', 'PLUG', 'BLDP', 'BE',
    'ENPH', 'SEDG', 'RUN', 'NOVA', 'ARRY', 'SHLS', 'GEVO', 'CLNE',
  ],
  cannabis_speculative: [
    'TLRY', 'CGC', 'ACB', 'SNDL', 'OGI', 'HEXO', 'VFF',
    'CRON', 'GRWG', 'MAPS',
  ],
  spac_recent_ipo: [
    'DKNG', 'SKLZ', 'UWMC', 'RKT', 'PSFE', 'WISH', 'CLOV',
    'BARK', 'OPAD', 'BGRY', 'MVST', 'PAYO', 'GGPI',
  ],
  small_cap_volatile: [
    'AMC', 'GME', 'BB', 'BBBY', 'EXPR', 'KOSS', 'NAKD',
    'SPCE', 'SKLZ', 'WISH', 'SDC', 'IRNT', 'ATER', 'PROG',
    'CENN', 'MULN', 'FFIE', 'GOEV', 'OPEN', 'CANO', 'MAPS',
  ],
  traditional_decline: [
    'T', 'VZ', 'INTC', 'WBA', 'PARA', 'LUMN', 'DISH',
    'GPS', 'BBWI', 'AAL', 'UAL', 'DAL', 'LUV', 'CCL',
    'RCL', 'NCLH', 'MGM', 'WYNN', 'LVS',
  ],
};

export function getTickerUniverse(): string[] {
  const allTickers = new Set<string>();

  for (const sectorTickers of Object.values(SCAN_SECTORS)) {
    for (const ticker of sectorTickers) {
      allTickers.add(ticker);
    }
  }

  return Array.from(allTickers);
}

export function getSectorForTicker(ticker: string): string | null {
  for (const [sector, tickers] of Object.entries(SCAN_SECTORS)) {
    if (tickers.includes(ticker)) {
      return sector.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

export function getTickersBySector(sector: string): string[] {
  const key = sector.toLowerCase().replace(/ /g, '_');
  return SCAN_SECTORS[key as keyof typeof SCAN_SECTORS] || [];
}

export function getAllSectors(): string[] {
  return Object.keys(SCAN_SECTORS).map(
    (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  );
}
