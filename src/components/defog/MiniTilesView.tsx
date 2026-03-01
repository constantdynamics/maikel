import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Stock, TileSettings } from '@/lib/defog/types';
import { RAINBOW_PRESETS, type RainbowPreset } from './rainbowPresets';

// No buy limit set - neutral gray
const NO_LIMIT_COLOR = '#3d3d3d';
// Below buy limit - bright brand green
const BELOW_LIMIT_COLOR = '#00ff88';

const TILE_SIZE_MIN = 40;
const TILE_SIZE_MAX = 180;
const TILE_SIZE_DEFAULT = 80;

function getDistanceColor(currentPrice: number, buyLimit: number | null, preset: RainbowPreset): string {
  if (!buyLimit || buyLimit <= 0) return NO_LIMIT_COLOR;
  // Price 0 means not yet scanned — show as neutral gray, not green
  if (currentPrice <= 0) return NO_LIMIT_COLOR;
  if (currentPrice <= buyLimit) return BELOW_LIMIT_COLOR;
  const distancePercent = ((currentPrice - buyLimit) / buyLimit) * 100;
  for (let i = 0; i < preset.thresholds.length; i++) {
    if (distancePercent > preset.thresholds[i]) return preset.colors[i];
  }
  return preset.colors[preset.colors.length - 1];
}

function getDistancePercent(currentPrice: number, buyLimit: number | null): number | null {
  if (!buyLimit || buyLimit <= 0) return null;
  return ((currentPrice - buyLimit) / buyLimit) * 100;
}

export function getContrastTextColor(hexColor: string): '#ffffff' | '#000000' {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  const contrastWithWhite = (1.0 + 0.05) / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / (0.0 + 0.05);
  return contrastWithWhite > contrastWithBlack ? '#ffffff' : '#000000';
}

function tickerHasMoreThanTwoDigits(ticker: string): boolean {
  return (ticker.replace(/[^0-9]/g, '')).length > 2;
}

function getFreshnessDots(lastUpdated: string): number {
  if (!lastUpdated) return 0;
  const updated = new Date(lastUpdated).getTime();
  if (isNaN(updated)) return 0;
  const hoursAgo = (Date.now() - updated) / (1000 * 60 * 60);
  if (hoursAgo < 1) return 5;
  if (hoursAgo < 2) return 4;
  if (hoursAgo < 3) return 3;
  if (hoursAgo < 4) return 2;
  if (hoursAgo < 6) return 1;
  return 0;
}

function openGoogleSearch(stock: Stock) {
  const query = encodeURIComponent(`${stock.ticker} ${stock.name || ''} stock`);
  window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
}

// Scale font size string by a factor (works with clamp(...) values)
function scaleFontSize(fontSize: string, factor: number): string {
  return fontSize.replace(/[\d.]+rem/g, (match) => {
    const val = parseFloat(match);
    return `${(val * factor).toFixed(3)}rem`;
  }).replace(/[\d.]+vw/g, (match) => {
    const val = parseFloat(match);
    return `${(val * factor).toFixed(2)}vw`;
  });
}

const FONT_SIZES: Record<string, Record<string, string>> = {
  label: { xs: 'clamp(0.4rem, 1.2vw, 0.55rem)', sm: 'clamp(0.5rem, 1.5vw, 0.7rem)', md: 'clamp(0.6rem, 1.8vw, 0.8rem)', lg: 'clamp(0.75rem, 2.2vw, 1rem)', xl: 'clamp(0.9rem, 2.8vw, 1.2rem)' },
  distance: { sm: 'clamp(0.6rem, 1.6vw, 0.85rem)', md: 'clamp(0.7rem, 2vw, 1rem)', lg: 'clamp(0.85rem, 2.5vw, 1.2rem)', xl: 'clamp(1rem, 3vw, 1.5rem)', xxl: 'clamp(1.2rem, 3.5vw, 1.8rem)' },
  dayChange: { xs: 'clamp(0.4rem, 1vw, 0.5rem)', sm: 'clamp(0.45rem, 1.2vw, 0.6rem)', md: 'clamp(0.55rem, 1.5vw, 0.7rem)', lg: 'clamp(0.7rem, 2vw, 0.9rem)' },
};

const DEFAULT_TILE_SETTINGS: TileSettings = {
  showLabel: 'auto', showDistance: true, showDayChange: true, showFreshness: true,
  tileSize: 'medium', fontWeight: 'bold',
  labelColor: 'auto', distanceColor: 'auto', dayChangeColor: '#ffffff', dotsColor: 'auto',
  labelFontSize: 'sm', distanceFontSize: 'md', dayChangeFontSize: 'xs',
  rainbowPreset: 'classic',
};

export type TileSortMode = 'default' | 'dayChange' | 'distance';

interface MiniTilesViewProps {
  stocks: Stock[];
  tileSettings?: TileSettings;
  onStockClick?: (stock: Stock) => void;
  onRefreshStocks?: (stocks: Stock[]) => void;
  sortMode?: TileSortMode;
}

export function MiniTilesView({ stocks, tileSettings, onStockClick, onRefreshStocks, sortMode = 'default' }: MiniTilesViewProps) {
  const settings = { ...DEFAULT_TILE_SETTINGS, ...tileSettings };
  const preset = RAINBOW_PRESETS.find(p => p.id === settings.rainbowPreset) || RAINBOW_PRESETS[0];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [tileSize, setTileSize] = useState(TILE_SIZE_DEFAULT);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Font scale factor based on tile size (1.0 at 80px)
  const fontScale = tileSize / 80;

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  const toggleSelection = useCallback((stockId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(stockId)) {
        next.delete(stockId);
      } else {
        next.add(stockId);
      }
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleTileClick = useCallback((stock: Stock) => {
    if (selectionMode) {
      toggleSelection(stock.id);
    } else {
      openGoogleSearch(stock);
    }
  }, [selectionMode, toggleSelection]);

  const handleBulkGoogleSearch = useCallback(() => {
    const selected = stocks.filter(s => selectedIds.has(s.id));
    for (const stock of selected) {
      openGoogleSearch(stock);
    }
  }, [stocks, selectedIds]);

  const handleBulkRefresh = useCallback(() => {
    if (!onRefreshStocks) return;
    const selected = stocks.filter(s => selectedIds.has(s.id));
    onRefreshStocks(selected);
    clearSelection();
  }, [stocks, selectedIds, onRefreshStocks, clearSelection]);

  const handleSingleRefresh = useCallback((stock: Stock, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRefreshStocks) {
      onRefreshStocks([stock]);
    }
  }, [onRefreshStocks]);

  // Sort stocks based on mode — price-0 (not yet scanned) always at bottom
  const displayStocks = useMemo(() => {
    const sorted = [...stocks];
    const withPriceZeroBottom = (compare: (a: Stock, b: Stock) => number) => (a: Stock, b: Stock) => {
      const aZero = a.currentPrice <= 0;
      const bZero = b.currentPrice <= 0;
      if (aZero && !bZero) return 1;
      if (!aZero && bZero) return -1;
      if (aZero && bZero) return a.ticker.localeCompare(b.ticker);
      return compare(a, b);
    };

    if (sortMode === 'dayChange') {
      sorted.sort(withPriceZeroBottom((a, b) => a.dayChangePercent - b.dayChangePercent));
    } else if (sortMode === 'distance') {
      sorted.sort(withPriceZeroBottom((a, b) => {
        const distA = a.buyLimit ? ((a.currentPrice - a.buyLimit) / a.buyLimit) * 100 : Infinity;
        const distB = b.buyLimit ? ((b.currentPrice - b.buyLimit) / b.buyLimit) * 100 : Infinity;
        return distA - distB;
      }));
    } else {
      sorted.sort(withPriceZeroBottom(() => 0));
    }
    return sorted;
  }, [stocks, sortMode]);

  // Freshness stats
  const freshStats = useMemo(() => {
    let fresh = 0;
    for (const s of stocks) {
      if (s.lastUpdated) {
        const hoursAgo = (Date.now() - new Date(s.lastUpdated).getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 1) fresh++;
      }
    }
    return { fresh, total: stocks.length };
  }, [stocks]);

  if (stocks.length === 0) {
    return <div className="text-center text-gray-500 py-8 text-sm">Geen aandelen om weer te geven</div>;
  }

  // Scaled dot size
  const dotSize = `${Math.max(3, Math.round(4 * fontScale))}px`;
  const staleDotSize = `${Math.max(4, Math.round(5 * fontScale))}px`;
  // Scaled refresh icon size
  const refreshIconSize = Math.max(10, Math.round(14 * fontScale));

  return (
    <div ref={containerRef} className={isFullscreen ? 'bg-[#1a1a1a] p-4 overflow-auto h-full' : ''}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (selectionMode) {
                clearSelection();
              } else {
                setSelectionMode(true);
              }
            }}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              selectionMode
                ? 'bg-[#00ff88] text-black font-medium'
                : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
            }`}
          >
            {selectionMode ? `Selectie (${selectedIds.size})` : 'Selecteren'}
          </button>

          {/* Bulk actions */}
          {selectionMode && selectedIds.size > 0 && (
            <>
              <button
                onClick={handleBulkGoogleSearch}
                className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                title="Open geselecteerde aandelen in Google"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Google ({selectedIds.size})
              </button>
              {onRefreshStocks && (
                <button
                  onClick={handleBulkRefresh}
                  className="px-3 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center gap-1"
                  title="Koers verversen van geselecteerde aandelen"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Verversen ({selectedIds.size})
                </button>
              )}
              <button
                onClick={clearSelection}
                className="px-2 py-1 text-xs rounded bg-[#3d3d3d] text-gray-400 hover:bg-[#4d4d4d] transition-colors"
                title="Selectie wissen"
              >
                Wissen
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Tile size slider */}
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 16 16">
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
            <input
              type="range"
              min={TILE_SIZE_MIN}
              max={TILE_SIZE_MAX}
              value={tileSize}
              onChange={(e) => setTileSize(Number(e.target.value))}
              className="w-20 h-1 accent-gray-500 cursor-pointer"
              title={`Tegelgrootte: ${tileSize}px`}
            />
            <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 16 16">
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </div>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d] hover:text-white transition-colors"
            title={isFullscreen ? 'Volledig scherm sluiten' : 'Volledig scherm'}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-1.5 w-full" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}>
        {displayStocks.map((stock) => {
          const bgColor = getDistanceColor(stock.currentPrice, stock.buyLimit, preset);
          const freshnessDots = getFreshnessDots(stock.lastUpdated);
          const distPct = getDistancePercent(stock.currentPrice, stock.buyLimit);
          const isBelow = distPct !== null && distPct <= 0;
          const isSelected = selectedIds.has(stock.id);

          // Determine label
          let label = stock.ticker;
          if (settings.showLabel === 'name') {
            label = stock.displayName || stock.name || stock.ticker;
          } else if (settings.showLabel === 'auto' && tickerHasMoreThanTwoDigits(stock.ticker)) {
            label = stock.displayName || stock.name || stock.ticker;
          }

          // Day change color: green for positive, red for negative (on dark bg)
          const dayChangeDisplayColor = stock.dayChangePercent >= 0 ? '#00ee77' : '#ff4466';

          // Selection highlight
          const selectionStyle: React.CSSProperties = isSelected ? {
            outline: '2px solid #00ff88',
            outlineOffset: '-2px',
          } : {};

          return (
            <div key={stock.id} className="relative">
              {/* Checkbox in selection mode */}
              {selectionMode && (
                <div
                  className="absolute top-0.5 left-0.5 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(stock.id);
                  }}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#00ff88] border-[#00ff88]'
                        : 'bg-black/40 border-white/40 hover:border-white/70'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              )}

              {/* Mini refresh icon (top-left, hidden in selection mode) */}
              {!selectionMode && onRefreshStocks && (
                <div
                  className="absolute top-0.5 left-0.5 z-10 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={(e) => handleSingleRefresh(stock, e)}
                  title="Koers verversen"
                  style={{ width: refreshIconSize, height: refreshIconSize }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#000000"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-full h-full drop-shadow-[0_0_2px_rgba(255,255,255,0.8)]"
                  >
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              )}

              <button
                onClick={() => handleTileClick(stock)}
                className="w-full rounded-md transition-transform hover:scale-105 active:scale-95 focus:outline-none cursor-pointer select-none overflow-hidden"
                style={{
                  backgroundColor: bgColor,
                  aspectRatio: '1',
                  minHeight: `${tileSize}px`,
                  ...selectionStyle,
                }}
                title={`${stock.ticker} - ${stock.name}\nPrijs: ${stock.currency} ${stock.currentPrice.toFixed(2)}\nLimiet: ${stock.buyLimit ? `${stock.currency} ${stock.buyLimit.toFixed(2)}` : 'Niet ingesteld'}\nAfstand: ${distPct !== null ? `${distPct >= 0 ? '+' : ''}${distPct.toFixed(1)}%` : 'N/A'}\nDag: ${stock.dayChangePercent >= 0 ? '+' : ''}${stock.dayChangePercent.toFixed(2)}%\nUpdate: ${stock.lastUpdated ? new Date(stock.lastUpdated).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : 'Nooit'}\nKlik om te zoeken in Google`}
              >
                <div className="flex flex-col h-full">
                  {/* Top 80%: colored area with label, dots, distance — always black text */}
                  <div className="flex flex-col items-center justify-center p-1 overflow-hidden" style={{ flex: '4 1 0%' }}>
                    {/* Freshness dots — always black */}
                    {settings.showFreshness && freshnessDots > 0 && (
                      <div className="flex gap-0.5 mb-0.5">
                        {[1, 2, 3, 4, 5].map((dot) => (
                          <div key={dot} className="rounded-full" style={{
                            width: dotSize, height: dotSize,
                            backgroundColor: dot <= freshnessDots ? '#000000' : 'rgba(0,0,0,0.15)',
                          }} />
                        ))}
                      </div>
                    )}
                    {settings.showFreshness && freshnessDots === 0 && (
                      <div className="rounded-full mb-0.5" style={{ width: staleDotSize, height: staleDotSize, backgroundColor: '#ff3366' }} />
                    )}

                    {/* Label — always black */}
                    <span className="leading-tight truncate w-full text-center" style={{
                      fontSize: scaleFontSize(FONT_SIZES.label[settings.labelFontSize] || FONT_SIZES.label.sm, fontScale),
                      fontWeight: settings.fontWeight === 'bold' ? 700 : 400,
                      color: '#000000',
                    }}>
                      {label}
                    </span>

                    {/* Distance % — always black */}
                    {settings.showDistance && (
                      <span className="font-bold leading-tight" style={{
                        fontSize: scaleFontSize(FONT_SIZES.distance[settings.distanceFontSize] || FONT_SIZES.distance.md, fontScale),
                        color: '#000000',
                      }}>
                        {distPct !== null ? <>{isBelow ? '' : '+'}{distPct.toFixed(1)}%</> : '—'}
                      </span>
                    )}
                  </div>

                  {/* Bottom 20%: black strip with day change in color */}
                  {settings.showDayChange && (
                    <div className="flex items-center justify-center rounded-b-md" style={{ flex: '1 1 0%', backgroundColor: '#000000' }}>
                      <span className="font-bold flex items-center gap-px" style={{
                        fontSize: scaleFontSize(FONT_SIZES.dayChange[settings.dayChangeFontSize] || FONT_SIZES.dayChange.xs, fontScale),
                        color: dayChangeDisplayColor,
                        lineHeight: 1,
                      }}>
                        <span style={{ fontSize: '0.75em' }}>
                          {stock.dayChangePercent >= 0 ? '▲' : '▼'}
                        </span>
                        {stock.dayChangePercent >= 0 ? '+' : ''}{stock.dayChangePercent.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Freshness counter bar */}
      <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-gray-500">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: freshStats.fresh > freshStats.total * 0.5 ? '#00ff88' : freshStats.fresh > 0 ? '#ffcc00' : '#ff3366' }}
        />
        <span>{freshStats.fresh} van {freshStats.total} aandelen vers (&lt;1u)</span>
      </div>
    </div>
  );
}
