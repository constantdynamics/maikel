// Exchange to country mapping and flags

export interface ExchangeInfo {
  code: string;
  name: string;
  country: string;
  countryCode: string;
}

export const EXCHANGE_DATA: Record<string, ExchangeInfo> = {
  // United States
  'NYSE': { code: 'NYSE', name: 'New York Stock Exchange', country: 'United States', countryCode: 'US' },
  'NASDAQ': { code: 'NASDAQ', name: 'NASDAQ', country: 'United States', countryCode: 'US' },
  'AMEX': { code: 'AMEX', name: 'NYSE American', country: 'United States', countryCode: 'US' },
  'NYSE ARCA': { code: 'NYSE ARCA', name: 'NYSE Arca', country: 'United States', countryCode: 'US' },
  'NYSE MKT': { code: 'NYSE MKT', name: 'NYSE MKT', country: 'United States', countryCode: 'US' },
  'OTC': { code: 'OTC', name: 'OTC Markets', country: 'United States', countryCode: 'US' },
  'BATS': { code: 'BATS', name: 'BATS Exchange', country: 'United States', countryCode: 'US' },

  // Canada
  'TSX': { code: 'TSX', name: 'Toronto Stock Exchange', country: 'Canada', countryCode: 'CA' },
  'TSXV': { code: 'TSXV', name: 'TSX Venture Exchange', country: 'Canada', countryCode: 'CA' },
  'NEO': { code: 'NEO', name: 'NEO Exchange', country: 'Canada', countryCode: 'CA' },
  'CSE': { code: 'CSE', name: 'Canadian Securities Exchange', country: 'Canada', countryCode: 'CA' },

  // United Kingdom
  'LSE': { code: 'LSE', name: 'London Stock Exchange', country: 'United Kingdom', countryCode: 'GB' },
  'AIM': { code: 'AIM', name: 'AIM (LSE)', country: 'United Kingdom', countryCode: 'GB' },

  // Germany
  'XETRA': { code: 'XETRA', name: 'XETRA', country: 'Germany', countryCode: 'DE' },
  'FWB': { code: 'FWB', name: 'Frankfurt Stock Exchange', country: 'Germany', countryCode: 'DE' },

  // France
  'EURONEXT': { code: 'EURONEXT', name: 'Euronext Paris', country: 'France', countryCode: 'FR' },

  // Netherlands
  'AEX': { code: 'AEX', name: 'Euronext Amsterdam', country: 'Netherlands', countryCode: 'NL' },

  // Australia
  'ASX': { code: 'ASX', name: 'Australian Securities Exchange', country: 'Australia', countryCode: 'AU' },

  // Japan
  'TSE': { code: 'TSE', name: 'Tokyo Stock Exchange', country: 'Japan', countryCode: 'JP' },

  // Hong Kong
  'HKEX': { code: 'HKEX', name: 'Hong Kong Stock Exchange', country: 'Hong Kong', countryCode: 'HK' },

  // India
  'NSE': { code: 'NSE', name: 'National Stock Exchange of India', country: 'India', countryCode: 'IN' },
  'BSE': { code: 'BSE', name: 'Bombay Stock Exchange', country: 'India', countryCode: 'IN' },

  // Brazil
  'B3': { code: 'B3', name: 'B3 (Brasil Bolsa Balcão)', country: 'Brazil', countryCode: 'BR' },
  'BOVESPA': { code: 'BOVESPA', name: 'B3', country: 'Brazil', countryCode: 'BR' },

  // Mexico
  'BMV': { code: 'BMV', name: 'Bolsa Mexicana de Valores', country: 'Mexico', countryCode: 'MX' },

  // Spain
  'BME': { code: 'BME', name: 'Bolsas y Mercados Españoles', country: 'Spain', countryCode: 'ES' },

  // Italy
  'MIL': { code: 'MIL', name: 'Borsa Italiana', country: 'Italy', countryCode: 'IT' },

  // Switzerland
  'SIX': { code: 'SIX', name: 'SIX Swiss Exchange', country: 'Switzerland', countryCode: 'CH' },

  // South Korea
  'KRX': { code: 'KRX', name: 'Korea Exchange', country: 'South Korea', countryCode: 'KR' },
  'KOSDAQ': { code: 'KOSDAQ', name: 'KOSDAQ', country: 'South Korea', countryCode: 'KR' },

  // Taiwan
  'TWSE': { code: 'TWSE', name: 'Taiwan Stock Exchange', country: 'Taiwan', countryCode: 'TW' },

  // Singapore
  'SGX': { code: 'SGX', name: 'Singapore Exchange', country: 'Singapore', countryCode: 'SG' },

  // South Africa
  'JSE': { code: 'JSE', name: 'Johannesburg Stock Exchange', country: 'South Africa', countryCode: 'ZA' },

  // Russia
  'MOEX': { code: 'MOEX', name: 'Moscow Exchange', country: 'Russia', countryCode: 'RU' },

  // Poland
  'GPW': { code: 'GPW', name: 'Warsaw Stock Exchange', country: 'Poland', countryCode: 'PL' },

  // Turkey
  'BIST': { code: 'BIST', name: 'Borsa Istanbul', country: 'Turkey', countryCode: 'TR' },

  // Israel
  'TASE': { code: 'TASE', name: 'Tel Aviv Stock Exchange', country: 'Israel', countryCode: 'IL' },

  // Sweden
  'OMX': { code: 'OMX', name: 'Nasdaq Stockholm', country: 'Sweden', countryCode: 'SE' },

  // Norway
  'OSE': { code: 'OSE', name: 'Oslo Stock Exchange', country: 'Norway', countryCode: 'NO' },

  // Denmark
  'CSE_DK': { code: 'CSE', name: 'Nasdaq Copenhagen', country: 'Denmark', countryCode: 'DK' },

  // Finland
  'OMXH': { code: 'OMXH', name: 'Nasdaq Helsinki', country: 'Finland', countryCode: 'FI' },

  // Belgium
  'EURONEXT_BR': { code: 'EURONEXT', name: 'Euronext Brussels', country: 'Belgium', countryCode: 'BE' },

  // Austria
  'WBAG': { code: 'WBAG', name: 'Vienna Stock Exchange', country: 'Austria', countryCode: 'AT' },

  // New Zealand
  'NZX': { code: 'NZX', name: 'New Zealand Stock Exchange', country: 'New Zealand', countryCode: 'NZ' },

  // Indonesia
  'IDX': { code: 'IDX', name: 'Indonesia Stock Exchange', country: 'Indonesia', countryCode: 'ID' },

  // Malaysia
  'MYX': { code: 'MYX', name: 'Bursa Malaysia', country: 'Malaysia', countryCode: 'MY' },

  // Thailand
  'SET': { code: 'SET', name: 'Stock Exchange of Thailand', country: 'Thailand', countryCode: 'TH' },

  // Philippines
  'PSE': { code: 'PSE', name: 'Philippine Stock Exchange', country: 'Philippines', countryCode: 'PH' },

  // Vietnam
  'HOSE': { code: 'HOSE', name: 'Ho Chi Minh Stock Exchange', country: 'Vietnam', countryCode: 'VN' },

  // Argentina
  'BCBA': { code: 'BCBA', name: 'Buenos Aires Stock Exchange', country: 'Argentina', countryCode: 'AR' },

  // Chile
  'BCS': { code: 'BCS', name: 'Bolsa de Santiago', country: 'Chile', countryCode: 'CL' },

  // Colombia
  'BVC': { code: 'BVC', name: 'Bolsa de Valores de Colombia', country: 'Colombia', countryCode: 'CO' },

  // Peru
  'BVL': { code: 'BVL', name: 'Bolsa de Valores de Lima', country: 'Peru', countryCode: 'PE' },
};

// Country code to flag emoji mapping
const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸',
  CA: '🇨🇦',
  GB: '🇬🇧',
  DE: '🇩🇪',
  FR: '🇫🇷',
  NL: '🇳🇱',
  AU: '🇦🇺',
  JP: '🇯🇵',
  HK: '🇭🇰',
  IN: '🇮🇳',
  BR: '🇧🇷',
  MX: '🇲🇽',
  ES: '🇪🇸',
  IT: '🇮🇹',
  CH: '🇨🇭',
  KR: '🇰🇷',
  TW: '🇹🇼',
  SG: '🇸🇬',
  ZA: '🇿🇦',
  RU: '🇷🇺',
  PL: '🇵🇱',
  TR: '🇹🇷',
  IL: '🇮🇱',
  SE: '🇸🇪',
  NO: '🇳🇴',
  DK: '🇩🇰',
  FI: '🇫🇮',
  BE: '🇧🇪',
  AT: '🇦🇹',
  NZ: '🇳🇿',
  ID: '🇮🇩',
  MY: '🇲🇾',
  TH: '🇹🇭',
  PH: '🇵🇭',
  VN: '🇻🇳',
  AR: '🇦🇷',
  CL: '🇨🇱',
  CO: '🇨🇴',
  PE: '🇵🇪',
};

export function getExchangeInfo(exchange: string | null): ExchangeInfo | null {
  if (!exchange) return null;
  const upperExchange = exchange.toUpperCase();
  return EXCHANGE_DATA[upperExchange] || null;
}

export function getExchangeCountry(exchange: string | null): string {
  const info = getExchangeInfo(exchange);
  return info?.country || 'Unknown';
}

export function getCountryCode(exchange: string | null): string {
  const info = getExchangeInfo(exchange);
  return info?.countryCode || 'XX';
}

export function getCountryFlag(country: string): string {
  // Try to find the country code from the country name
  for (const [code, info] of Object.entries(EXCHANGE_DATA)) {
    if (info.country === country) {
      return COUNTRY_FLAGS[info.countryCode] || '🏳️';
    }
  }
  return '🏳️';
}

export function getExchangeFlag(exchange: string | null): string {
  const countryCode = getCountryCode(exchange);
  return COUNTRY_FLAGS[countryCode] || '🏳️';
}

// TradingView scanner endpoints for different markets
export const TRADINGVIEW_MARKETS = {
  america: {
    name: 'Americas',
    url: 'https://scanner.tradingview.com/america/scan',
    countries: ['United States', 'Canada', 'Brazil', 'Mexico', 'Argentina', 'Chile', 'Colombia', 'Peru'],
  },
  uk: {
    name: 'United Kingdom',
    url: 'https://scanner.tradingview.com/uk/scan',
    countries: ['United Kingdom'],
  },
  germany: {
    name: 'Germany',
    url: 'https://scanner.tradingview.com/germany/scan',
    countries: ['Germany'],
  },
  france: {
    name: 'France',
    url: 'https://scanner.tradingview.com/france/scan',
    countries: ['France'],
  },
  spain: {
    name: 'Spain',
    url: 'https://scanner.tradingview.com/spain/scan',
    countries: ['Spain'],
  },
  italy: {
    name: 'Italy',
    url: 'https://scanner.tradingview.com/italy/scan',
    countries: ['Italy'],
  },
  australia: {
    name: 'Australia',
    url: 'https://scanner.tradingview.com/australia/scan',
    countries: ['Australia'],
  },
  japan: {
    name: 'Japan',
    url: 'https://scanner.tradingview.com/japan/scan',
    countries: ['Japan'],
  },
  hongkong: {
    name: 'Hong Kong',
    url: 'https://scanner.tradingview.com/hongkong/scan',
    countries: ['Hong Kong'],
  },
  india: {
    name: 'India',
    url: 'https://scanner.tradingview.com/india/scan',
    countries: ['India'],
  },
  korea: {
    name: 'South Korea',
    url: 'https://scanner.tradingview.com/korea/scan',
    countries: ['South Korea'],
  },
  taiwan: {
    name: 'Taiwan',
    url: 'https://scanner.tradingview.com/taiwan/scan',
    countries: ['Taiwan'],
  },
  singapore: {
    name: 'Singapore',
    url: 'https://scanner.tradingview.com/singapore/scan',
    countries: ['Singapore'],
  },
  sweden: {
    name: 'Sweden',
    url: 'https://scanner.tradingview.com/sweden/scan',
    countries: ['Sweden'],
  },
  norway: {
    name: 'Norway',
    url: 'https://scanner.tradingview.com/norway/scan',
    countries: ['Norway'],
  },
  denmark: {
    name: 'Denmark',
    url: 'https://scanner.tradingview.com/denmark/scan',
    countries: ['Denmark'],
  },
  finland: {
    name: 'Finland',
    url: 'https://scanner.tradingview.com/finland/scan',
    countries: ['Finland'],
  },
  switzerland: {
    name: 'Switzerland',
    url: 'https://scanner.tradingview.com/switzerland/scan',
    countries: ['Switzerland'],
  },
  netherlands: {
    name: 'Netherlands',
    url: 'https://scanner.tradingview.com/netherlands/scan',
    countries: ['Netherlands'],
  },
  belgium: {
    name: 'Belgium',
    url: 'https://scanner.tradingview.com/belgium/scan',
    countries: ['Belgium'],
  },
  austria: {
    name: 'Austria',
    url: 'https://scanner.tradingview.com/austria/scan',
    countries: ['Austria'],
  },
  poland: {
    name: 'Poland',
    url: 'https://scanner.tradingview.com/poland/scan',
    countries: ['Poland'],
  },
  russia: {
    name: 'Russia',
    url: 'https://scanner.tradingview.com/russia/scan',
    countries: ['Russia'],
  },
  turkey: {
    name: 'Turkey',
    url: 'https://scanner.tradingview.com/turkey/scan',
    countries: ['Turkey'],
  },
  israel: {
    name: 'Israel',
    url: 'https://scanner.tradingview.com/israel/scan',
    countries: ['Israel'],
  },
  indonesia: {
    name: 'Indonesia',
    url: 'https://scanner.tradingview.com/indonesia/scan',
    countries: ['Indonesia'],
  },
  malaysia: {
    name: 'Malaysia',
    url: 'https://scanner.tradingview.com/malaysia/scan',
    countries: ['Malaysia'],
  },
  thailand: {
    name: 'Thailand',
    url: 'https://scanner.tradingview.com/thailand/scan',
    countries: ['Thailand'],
  },
  philippines: {
    name: 'Philippines',
    url: 'https://scanner.tradingview.com/philippines/scan',
    countries: ['Philippines'],
  },
  vietnam: {
    name: 'Vietnam',
    url: 'https://scanner.tradingview.com/vietnam/scan',
    countries: ['Vietnam'],
  },
  newzealand: {
    name: 'New Zealand',
    url: 'https://scanner.tradingview.com/newzealand/scan',
    countries: ['New Zealand'],
  },
  southafrica: {
    name: 'South Africa',
    url: 'https://scanner.tradingview.com/rsa/scan',
    countries: ['South Africa'],
  },
};

export function getAvailableMarkets(): string[] {
  return Object.keys(TRADINGVIEW_MARKETS);
}

export function getMarketInfo(market: string) {
  return TRADINGVIEW_MARKETS[market as keyof typeof TRADINGVIEW_MARKETS];
}
