'use client';

import { useMemo } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { Stock, FixedTabColors } from '@/lib/defog/types';
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

interface ZoneTabBarProps {
  /** All stocks across all tabs (for counting and grouping) */
  allStocks: Stock[];
  /** Current fixed tab (e.g. __all__, __topmovers__, __purchased__) or zone-view active */
  activeTabId: string | null;
  /** Zone + country selection for the zone view */
  zoneViewState: ZoneViewState;
  onFixedTabSelect: (tabId: string) => void;
  onZoneSelect: (zone: ZoneId | '__all__') => void;
  onCountrySelect: (country: string) => void;
  fixedTabColors?: FixedTabColors;
  allStockCount?: number;
  purchasedStockCount?: number;
}

// ── Default colors ────────────────────────────────────────────────────────────

const DEFAULT_FIXED_COLORS: FixedTabColors = {
  all: 'rainbow',
  topGainers: '#00ff88',
  topLosers: '#ff3366',
  purchased: '#00ff88',
};

const TAB_MIN_WIDTH = '160px';

// ── Zone flag (globe emoji per zone) ─────────────────────────────────────────

function ZoneIcon({ zoneId }: { zoneId: ZoneId | '__all__' }) {
  const icons: Record<string, string> = {
    __all__: '🌍',
    americas: '🌎',
    europe: '🌍',
    asia_pacific: '🌏',
    other: '🌐',
  };
  return <span className="text-sm">{icons[zoneId] ?? '🌐'}</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ZoneTabBar({
  allStocks,
  activeTabId,
  zoneViewState,
  onFixedTabSelect,
  onZoneSelect,
  onCountrySelect,
  fixedTabColors = DEFAULT_FIXED_COLORS,
  allStockCount = 0,
  purchasedStockCount = 0,
}: ZoneTabBarProps) {
  const colors = { ...DEFAULT_FIXED_COLORS, ...fixedTabColors };

  // Determine whether we're in "zone browse" mode (not a fixed special tab)
  const isFixedTab = activeTabId === '__topmovers__' || activeTabId === '__purchased__';
  const isZoneBrowse = !isFixedTab; // includes __all__ (which shows zone-filtered all stocks)

  // ── Count stocks per zone and per country ─────────────────────────────────

  const zoneCounts = useMemo(() => {
    const counts: Partial<Record<ZoneId | '__all__', number>> = { __all__: allStocks.length };
    for (const stock of allStocks) {
      const zone = getZoneForCountryCode(getStockCountryCode(stock));
      counts[zone] = (counts[zone] ?? 0) + 1;
    }
    return counts;
  }, [allStocks]);

  /** Countries present within the currently selected zone */
  const countriesInZone = useMemo(() => {
    if (zoneViewState.zone === '__all__') return [];
    const counts: Record<string, number> = {};
    for (const stock of allStocks) {
      const cc = getStockCountryCode(stock);
      const zone = getZoneForCountryCode(cc);
      if (zone === zoneViewState.zone) {
        counts[cc] = (counts[cc] ?? 0) + 1;
      }
    }
    // Sort: most stocks first, then alphabetical
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([cc, count]) => ({ cc, count }));
  }, [allStocks, zoneViewState.zone]);

  // ── Fixed tab row (Alles / Top / Gekocht) ────────────────────────────────

  const renderFixedTabs = () => (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
      {/* Alles */}
      <button
        onClick={() => onFixedTabSelect('__all__')}
        className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg transition-all ${
          isZoneBrowse
            ? 'text-white shadow-lg'
            : 'bg-transparent hover:bg-white/5 border-2 border-dashed border-gray-500 text-gray-400'
        }`}
        style={{
          minWidth: TAB_MIN_WIDTH,
          background: isZoneBrowse
            ? colors.all === 'rainbow'
              ? 'linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)'
              : colors.all
            : undefined,
          borderColor: !isZoneBrowse && colors.all !== 'rainbow' ? colors.all : undefined,
          color: !isZoneBrowse && colors.all !== 'rainbow' ? colors.all : undefined,
        }}
      >
        <span className="text-sm font-bold">{colors.all === 'rainbow' ? '🌈' : '📋'} Alles</span>
        <span className="text-xs opacity-80">({allStockCount})</span>
      </button>

      {/* Top Movers */}
      <button
        onClick={() => onFixedTabSelect('__topmovers__')}
        className={`flex items-center justify-center px-0 py-0 rounded-lg whitespace-nowrap transition-all overflow-hidden ${
          activeTabId === '__topmovers__'
            ? 'shadow-lg'
            : 'bg-transparent hover:bg-white/5 border-2 border-dashed border-gray-500'
        }`}
        style={{ minWidth: TAB_MIN_WIDTH }}
      >
        {activeTabId === '__topmovers__' ? (
          <div className="flex w-full h-full">
            <div className="flex-1 flex items-center justify-center py-2.5 px-2" style={{ backgroundColor: colors.topGainers }}>
              <ChevronUpIcon className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
            <div className="flex-1 flex items-center justify-center py-2.5 px-2" style={{ backgroundColor: colors.topLosers }}>
              <ChevronDownIcon className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1 py-2.5 px-4 text-gray-400">
            <span style={{ color: colors.topGainers }}>↑</span>
            <span className="text-sm font-bold">Top</span>
            <span style={{ color: colors.topLosers }}>↓</span>
          </div>
        )}
      </button>

      {/* Gekocht */}
      <button
        onClick={() => onFixedTabSelect('__purchased__')}
        className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg transition-all ${
          activeTabId === '__purchased__'
            ? 'text-white shadow-lg'
            : 'bg-transparent hover:bg-white/5 border-2 border-dashed'
        }`}
        style={{
          minWidth: TAB_MIN_WIDTH,
          backgroundColor: activeTabId === '__purchased__' ? colors.purchased : undefined,
          borderColor: activeTabId !== '__purchased__' ? `${colors.purchased}80` : undefined,
          color: activeTabId !== '__purchased__' ? `${colors.purchased}b3` : undefined,
        }}
      >
        <span className="text-sm font-bold">💰 Gekocht</span>
        <span className="text-xs opacity-80">({purchasedStockCount})</span>
      </button>
    </div>
  );

  // ── Zone tab row ──────────────────────────────────────────────────────────

  const renderZoneTabs = () => (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
      {/* "Alle zones" tab */}
      <ZoneTab
        id="__all__"
        label="Alle zones"
        count={zoneCounts.__all__ ?? 0}
        color="#6b7280"
        isActive={isZoneBrowse && zoneViewState.zone === '__all__'}
        onClick={() => { onFixedTabSelect('__all__'); onZoneSelect('__all__'); }}
      >
        <ZoneIcon zoneId="__all__" />
      </ZoneTab>

      {ZONES.filter(z => (zoneCounts[z.id] ?? 0) > 0).map(zone => (
        <ZoneTab
          key={zone.id}
          id={zone.id}
          label={zone.name}
          count={zoneCounts[zone.id] ?? 0}
          color={zone.color}
          isActive={isZoneBrowse && zoneViewState.zone === zone.id}
          onClick={() => { onFixedTabSelect('__all__'); onZoneSelect(zone.id as ZoneId); }}
        >
          <ZoneIcon zoneId={zone.id} />
        </ZoneTab>
      ))}
    </div>
  );

  // ── Country tab row ───────────────────────────────────────────────────────

  const renderCountryTabs = () => {
    if (!isZoneBrowse || zoneViewState.zone === '__all__' || countriesInZone.length === 0) return null;

    const zoneColor = ZONES.find(z => z.id === zoneViewState.zone)?.color ?? '#6b7280';
    const zoneStockCount = zoneCounts[zoneViewState.zone] ?? 0;

    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
        {/* "Alle [zone]" option */}
        <button
          onClick={() => onCountrySelect('__all__')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm whitespace-nowrap ${
            zoneViewState.country === '__all__'
              ? 'text-white shadow-md'
              : 'bg-transparent hover:bg-white/5 border border-dashed'
          }`}
          style={{
            backgroundColor: zoneViewState.country === '__all__' ? zoneColor : 'transparent',
            borderColor: zoneViewState.country !== '__all__' ? `${zoneColor}60` : undefined,
            color: zoneViewState.country !== '__all__' ? `${zoneColor}cc` : undefined,
          }}
        >
          <ZoneIcon zoneId={zoneViewState.zone} />
          <span className="font-medium">Alle</span>
          <span className="opacity-70 text-xs">({zoneStockCount})</span>
        </button>

        {/* Country buttons */}
        {countriesInZone.map(({ cc, count }) => {
          const isActive = zoneViewState.country === cc;
          return (
            <button
              key={cc}
              onClick={() => onCountrySelect(cc)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm whitespace-nowrap ${
                isActive
                  ? 'text-white shadow-md'
                  : 'bg-transparent hover:bg-white/5 border border-dashed'
              }`}
              style={{
                backgroundColor: isActive ? zoneColor : 'transparent',
                borderColor: !isActive ? `${zoneColor}50` : undefined,
                color: !isActive ? `${zoneColor}bb` : undefined,
              }}
            >
              <CountryFlag countryCode={cc} size={14} />
              <span className="font-medium">{getCountryDisplayName(cc)}</span>
              <span className="opacity-70 text-xs">({count})</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {renderFixedTabs()}
      {renderZoneTabs()}
      {renderCountryTabs()}
    </div>
  );
}

// ── ZoneTab helper ────────────────────────────────────────────────────────────

function ZoneTab({
  id, label, count, color, isActive, onClick, children,
}: {
  id: string; label: string; count: number; color: string;
  isActive: boolean; onClick: () => void;
  children?: JSX.Element;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
        isActive ? 'text-white shadow-md' : 'bg-transparent hover:bg-white/5 border-2 border-dashed'
      }`}
      style={{
        minWidth: '140px',
        backgroundColor: isActive ? color : 'transparent',
        borderColor: !isActive ? `${color}60` : undefined,
        color: !isActive ? `${color}cc` : undefined,
      }}
    >
      {children}
      <div className="flex flex-col items-start">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-xs opacity-70">({count})</span>
      </div>
    </button>
  );
}
