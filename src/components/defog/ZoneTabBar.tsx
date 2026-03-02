'use client';

import { useMemo } from 'react';
import type { Stock } from '@/lib/defog/types';
import {
  ZONES,
  type ZoneId,
  getZoneForCountryCode,
  getStockCountryCode,
  getCountryDisplayName,
} from '@/lib/defog/countryZones';
import { CountryFlag } from './CountryFlag';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ZoneViewState {
  zone: ZoneId | '__all__';
  country: string | '__all__';
}

interface ZoneFilterBarProps {
  /** Stocks from the current view (before zone filtering) — used for counting */
  stocks: Stock[];
  zoneViewState: ZoneViewState;
  onZoneSelect: (zone: ZoneId | '__all__') => void;
  onCountrySelect: (country: string) => void;
  onClose: () => void;
}

// ── Zone icons ────────────────────────────────────────────────────────────────

function ZoneIcon({ zoneId }: { zoneId: ZoneId | '__all__' }) {
  const icons: Record<string, string> = {
    __all__: '🌍',
    americas: '🌎',
    europe: '🌍',
    asia_pacific: '🌏',
    other: '🌐',
  };
  return <span className="text-xs">{icons[zoneId] ?? '🌐'}</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ZoneFilterBar({
  stocks,
  zoneViewState,
  onZoneSelect,
  onCountrySelect,
  onClose,
}: ZoneFilterBarProps) {
  // Count stocks per zone (based on the current tab's stocks)
  const zoneCounts = useMemo(() => {
    const counts: Partial<Record<ZoneId | '__all__', number>> = { __all__: stocks.length };
    for (const stock of stocks) {
      const zone = getZoneForCountryCode(getStockCountryCode(stock));
      counts[zone] = (counts[zone] ?? 0) + 1;
    }
    return counts;
  }, [stocks]);

  // Countries within the currently selected zone
  const countriesInZone = useMemo(() => {
    if (zoneViewState.zone === '__all__') return [];
    const counts: Record<string, number> = {};
    for (const stock of stocks) {
      const cc = getStockCountryCode(stock);
      if (getZoneForCountryCode(cc) === zoneViewState.zone) {
        counts[cc] = (counts[cc] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([cc, count]) => ({ cc, count }));
  }, [stocks, zoneViewState.zone]);

  const activeZoneColor = zoneViewState.zone !== '__all__'
    ? ZONES.find(z => z.id === zoneViewState.zone)?.color ?? '#6b7280'
    : '#6b7280';

  const hasFilter = zoneViewState.zone !== '__all__' || zoneViewState.country !== '__all__';

  return (
    <div className="rounded-lg border border-[#3d3d3d] bg-[#1a1a1a]/50 px-3 py-2 space-y-2">
      {/* Header with close and reset */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Zone / land filter</span>
        <div className="flex items-center gap-2">
          {hasFilter && (
            <button
              onClick={() => { onZoneSelect('__all__'); onCountrySelect('__all__'); }}
              className="text-[10px] text-gray-500 hover:text-[#ff6666] transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-sm leading-none transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Zone buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
        {/* "Alle" (no filter) */}
        <ZoneButton
          active={zoneViewState.zone === '__all__'}
          color="#6b7280"
          onClick={() => onZoneSelect('__all__')}
        >
          <ZoneIcon zoneId="__all__" />
          <span>Alle</span>
          <span className="opacity-60">({zoneCounts.__all__ ?? 0})</span>
        </ZoneButton>

        {ZONES.filter(z => (zoneCounts[z.id] ?? 0) > 0).map(zone => (
          <ZoneButton
            key={zone.id}
            active={zoneViewState.zone === zone.id}
            color={zone.color}
            onClick={() => onZoneSelect(zone.id)}
          >
            <ZoneIcon zoneId={zone.id} />
            <span>{zone.name}</span>
            <span className="opacity-60">({zoneCounts[zone.id] ?? 0})</span>
          </ZoneButton>
        ))}
      </div>

      {/* Country buttons (only when a specific zone is selected) */}
      {zoneViewState.zone !== '__all__' && countriesInZone.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
          {/* "Alle" in this zone */}
          <CountryButton
            active={zoneViewState.country === '__all__'}
            color={activeZoneColor}
            onClick={() => onCountrySelect('__all__')}
          >
            <ZoneIcon zoneId={zoneViewState.zone} />
            <span>Alle</span>
            <span className="opacity-60">({zoneCounts[zoneViewState.zone] ?? 0})</span>
          </CountryButton>

          {countriesInZone.map(({ cc, count }) => (
            <CountryButton
              key={cc}
              active={zoneViewState.country === cc}
              color={activeZoneColor}
              onClick={() => onCountrySelect(cc)}
            >
              <CountryFlag countryCode={cc} size={12} />
              <span>{getCountryDisplayName(cc)}</span>
              <span className="opacity-60">({count})</span>
            </CountryButton>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ZoneButton({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: JSX.Element | (JSX.Element | string)[];
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
        active ? 'text-white shadow-sm' : 'hover:bg-white/5'
      }`}
      style={{
        backgroundColor: active ? color : 'transparent',
        border: active ? 'none' : `1px dashed ${color}50`,
        color: active ? 'white' : `${color}cc`,
      }}
    >
      {children}
    </button>
  );
}

function CountryButton({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: JSX.Element | (JSX.Element | string)[];
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap transition-all ${
        active ? 'text-white shadow-sm' : 'hover:bg-white/5'
      }`}
      style={{
        backgroundColor: active ? color : 'transparent',
        border: active ? 'none' : `1px dashed ${color}40`,
        color: active ? 'white' : `${color}bb`,
      }}
    >
      {children}
    </button>
  );
}
