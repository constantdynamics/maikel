// Country zone definitions and mapping utilities for zone-based tab view

import { getCountryCode } from '@/lib/exchanges';
import type { Stock } from '@/lib/defog/types';

export type ZoneId = 'americas' | 'europe' | 'asia_pacific' | 'other';

export interface Zone {
  id: ZoneId;
  name: string;
  color: string;
}

export const ZONES: Zone[] = [
  { id: 'americas', name: 'VS & Canada', color: '#3b82f6' },
  { id: 'europe', name: 'Europa', color: '#8b5cf6' },
  { id: 'asia_pacific', name: 'Azië & Pacific', color: '#f97316' },
  { id: 'other', name: 'Overige', color: '#6b7280' },
];

const COUNTRY_ZONE_MAP: Record<string, ZoneId> = {
  // Americas
  US: 'americas', CA: 'americas', BR: 'americas', MX: 'americas',
  AR: 'americas', CL: 'americas', CO: 'americas', PE: 'americas',
  // Europe
  GB: 'europe', DE: 'europe', FR: 'europe', NL: 'europe', BE: 'europe',
  IT: 'europe', ES: 'europe', CH: 'europe', SE: 'europe', NO: 'europe',
  DK: 'europe', FI: 'europe', PL: 'europe', AT: 'europe', CZ: 'europe',
  RU: 'europe', TR: 'europe', IL: 'europe', PT: 'europe', GR: 'europe',
  // Asia & Pacific
  JP: 'asia_pacific', HK: 'asia_pacific', AU: 'asia_pacific', IN: 'asia_pacific',
  SG: 'asia_pacific', KR: 'asia_pacific', TW: 'asia_pacific', NZ: 'asia_pacific',
  ID: 'asia_pacific', MY: 'asia_pacific', TH: 'asia_pacific', PH: 'asia_pacific',
  VN: 'asia_pacific', CN: 'asia_pacific',
  // Other (default bucket)
  ZA: 'other',
};

export function getZoneForCountryCode(countryCode: string): ZoneId {
  return COUNTRY_ZONE_MAP[countryCode] || 'other';
}

export function getStockCountryCode(stock: Stock): string {
  return getCountryCode(stock.exchange, stock.ticker);
}

export function getStockZone(stock: Stock): ZoneId {
  return getZoneForCountryCode(getStockCountryCode(stock));
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: 'VS',
  CA: 'Canada',
  GB: 'VK',
  DE: 'Duitsland',
  FR: 'Frankrijk',
  NL: 'Nederland',
  BE: 'België',
  IT: 'Italië',
  ES: 'Spanje',
  CH: 'Zwitserland',
  SE: 'Zweden',
  NO: 'Noorwegen',
  DK: 'Denemarken',
  FI: 'Finland',
  PL: 'Polen',
  AT: 'Oostenrijk',
  CZ: 'Tsjechië',
  RU: 'Rusland',
  TR: 'Turkije',
  IL: 'Israël',
  PT: 'Portugal',
  GR: 'Griekenland',
  JP: 'Japan',
  HK: 'Hongkong',
  AU: 'Australië',
  IN: 'India',
  SG: 'Singapore',
  KR: 'Z-Korea',
  TW: 'Taiwan',
  NZ: 'Nieuw-Zeeland',
  ID: 'Indonesië',
  MY: 'Maleisië',
  TH: 'Thailand',
  PH: 'Filipijnen',
  VN: 'Vietnam',
  CN: 'China',
  ZA: 'Z-Afrika',
  BR: 'Brazilië',
  MX: 'Mexico',
  AR: 'Argentinië',
  CL: 'Chili',
  CO: 'Colombia',
  PE: 'Peru',
  XX: 'Onbekend',
};

export function getCountryDisplayName(countryCode: string): string {
  return COUNTRY_NAMES[countryCode] || countryCode;
}
