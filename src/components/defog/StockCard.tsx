'use client';

import { useState } from 'react';
import { PencilIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import type { Stock, ChartTimeframe, RangePeriod, ColumnVisibility, ColumnStyles, ColumnStyle, ColumnFontSize, ColumnFontWeight } from '@/lib/defog/types';
import { ProgressBar } from './ProgressBar';
import { Sparkline, ExpandedChart } from './Sparkline';
import { isMarketOpen, getRefreshAgeInfo } from '@/lib/defog/services/stockApi';

interface StockCardProps {
  stock: Stock;
  accentColor: string;
  rangePeriod: RangePeriod;
  isSelected?: boolean;
  columnVisibility: ColumnVisibility;
  columnStyles: ColumnStyles;
  onSelect?: (selected: boolean) => void;
  onEdit: () => void;
  onTimeframeChange: (timeframe: ChartTimeframe) => void;
  tabName?: string; // For "All" view - show which tab the stock belongs to
  onCustomToggle?: (checked: boolean) => void; // Custom checkbox column toggle
}

// Consistent green color used throughout the app (same as chart line)
const BRAND_GREEN = '#00ff88';

// Font size mapping
const FONT_SIZE_CLASSES: Record<ColumnFontSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
};

// Font weight mapping
const FONT_WEIGHT_CLASSES: Record<ColumnFontWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

// Helper to get style classes and inline styles for a column
function getColumnClasses(style: ColumnStyle, dynamicColor?: string, accentColor?: string, isNumeric = true): { className: string; style: React.CSSProperties } {
  const sizeClass = FONT_SIZE_CLASSES[style.fontSize];
  const weightClass = FONT_WEIGHT_CLASSES[style.fontWeight];

  let color = style.fontColor;
  if (style.fontColor === 'dynamic' && dynamicColor) {
    color = dynamicColor;
  } else if (style.fontColor === 'accent' && accentColor) {
    color = accentColor;
  }

  // Use font-mono only for numeric values (prices, percentages)
  const fontClass = isNumeric ? 'font-mono' : '';

  return {
    className: `${sizeClass} ${weightClass} ${fontClass}`.trim(),
    style: { color },
  };
}

// Convert range period to chart timeframe
function getChartTimeframeFromPeriod(period: RangePeriod): ChartTimeframe {
  switch (period) {
    case '3y':
      return '3y';
    case '5y':
      return '5y';
    default:
      return '1y';
  }
}

// Calculate range from historical data for a given period
function calculateRangeFromHistorical(
  historicalData: Stock['historicalData'],
  years: number
): { high: number; low: number } | null {
  if (!historicalData || historicalData.length === 0) return null;

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - years);

  let high: number | null = null;
  let low: number | null = null;

  for (const point of historicalData) {
    const pointDate = new Date(point.date);
    if (pointDate >= cutoffDate) {
      const pointHigh = point.high || point.close;
      const pointLow = point.low || point.close;

      if (high === null || pointHigh > high) high = pointHigh;
      if (low === null || pointLow < low) low = pointLow;
    }
  }

  if (high !== null && low !== null) {
    return { high, low };
  }
  return null;
}

// Get high/low based on selected period
function getRangeValues(stock: Stock, period: RangePeriod): { high: number; low: number; label: string } {
  switch (period) {
    case '3y': {
      // Use stored values if available, otherwise calculate from historical data
      if (stock.year3High !== undefined && stock.year3Low !== undefined) {
        return { high: stock.year3High, low: stock.year3Low, label: '3Y' };
      }
      const calculated = calculateRangeFromHistorical(stock.historicalData, 3);
      if (calculated) {
        return { ...calculated, label: '3Y' };
      }
      return { high: stock.week52High, low: stock.week52Low, label: '3Y' };
    }
    case '5y': {
      // Use stored values if available, otherwise calculate from historical data
      if (stock.year5High !== undefined && stock.year5Low !== undefined) {
        return { high: stock.year5High, low: stock.year5Low, label: '5Y' };
      }
      const calculated = calculateRangeFromHistorical(stock.historicalData, 5);
      if (calculated) {
        return { ...calculated, label: '5Y' };
      }
      return { high: stock.week52High, low: stock.week52Low, label: '5Y' };
    }
    default:
      return {
        high: stock.week52High,
        low: stock.week52Low,
        label: '52W'
      };
  }
}

// Range bar component with line marker
function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const range = high - low;
  const position = range > 0 ? ((current - low) / range) * 100 : 50;
  const clampedPosition = Math.max(0, Math.min(100, position));

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(0);
    if (price >= 100) return price.toFixed(1);
    return price.toFixed(2);
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-500 w-14 text-right font-mono text-sm">{formatPrice(low)}</span>
      <div className="flex-1 h-2 bg-[#3d3d3d] rounded relative mx-1 min-w-[50px]">
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white"
          style={{ left: `${clampedPosition}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <span className="text-gray-500 w-14 font-mono text-sm">{formatPrice(high)}</span>
    </div>
  );
}

export function StockCard({
  stock,
  accentColor,
  rangePeriod,
  isSelected = false,
  columnVisibility,
  columnStyles,
  onSelect,
  onEdit,
  onTimeframeChange,
  tabName,
  onCustomToggle,
}: StockCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const isPositive = stock.dayChangePercent >= 0;
  const { high, low, label } = getRangeValues(stock, rangePeriod);

  // Check if stock is unavailable from all providers
  const isUnavailable = stock.unavailableReason && stock.unavailableProviders && stock.unavailableProviders.length > 0;

  // Calculate range difference as percentage
  const rangeDiffPercent = low > 0 ? ((high - low) / low) * 100 : 0;

  return (
    <>
      {/* Desktop view - full width with mini chart */}
      <div className={`hidden md:block rounded-lg ${isUnavailable ? 'bg-[#1a1a1a] opacity-60' : 'bg-[#2d2d2d] hover:bg-[#353535]'} transition-colors`}>
        {/* Unavailable warning banner */}
        {isUnavailable && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 border-b border-[#2d2d2d]">
            <span className="text-yellow-500">⚠</span>
            <span className="truncate">{stock.unavailableReason}</span>
          </div>
        )}
      <div className="grid gap-3 items-center p-3"
        style={{
          gridTemplateColumns: [
            '32px', // checkbox
            columnVisibility.name ? `${columnStyles.name.width}px` : '',
            `${columnStyles.ticker.width}px`, // ticker
            columnVisibility.price ? `${columnStyles.price.width}px` : '',
            columnVisibility.limit ? `${columnStyles.limit.width}px` : '',
            columnVisibility.distance ? `${columnStyles.distance.width}px` : '',
            columnVisibility.dayChange ? `${columnStyles.dayChange.width}px` : '',
            columnVisibility.range ? `${columnStyles.range.width}px` : '',
            columnVisibility.rangeDelta ? `${columnStyles.rangeDelta.width}px` : '',
            columnVisibility.chart ? `${columnStyles.chart.width}px` : '',
            columnVisibility.currency ? `${columnStyles.currency.width}px` : '',
            columnVisibility.lastRefresh ? `${columnStyles.lastRefresh?.width || 80}px` : '',
            columnVisibility.custom ? '60px' : '', // custom checkbox column
            '40px', // edit
          ].filter(Boolean).join(' ')
        }}
      >
        {/* Checkbox */}
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect?.(e.target.checked)}
            className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Name - uses same styling as Ticker */}
        {columnVisibility.name && (() => {
          const nameStyle = getColumnClasses(columnStyles.name, undefined, accentColor, false);
          return (
            <div
              className={`truncate cursor-pointer hover:opacity-80 ${nameStyle.className}`}
              style={nameStyle.style}
              onClick={onEdit}
              title={stock.displayName || stock.name}
            >
              {stock.displayName || stock.name}
            </div>
          );
        })()}

        {/* Ticker with market status indicator */}
        {(() => {
          const tickerStyle = getColumnClasses(columnStyles.ticker, undefined, accentColor, false);
          const marketStatus = isMarketOpen(stock.exchange);
          const openGoogleSearch = (e: React.MouseEvent) => {
            e.stopPropagation();
            const searchQuery = encodeURIComponent(`${stock.ticker} ${stock.name} stock`);
            window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
          };
          return (
            <div
              className={`truncate cursor-pointer hover:opacity-80 hover:underline flex items-center gap-1.5 ${tickerStyle.className}`}
              style={tickerStyle.style}
              onClick={openGoogleSearch}
              title={`Zoek ${stock.ticker} op Google`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${marketStatus.isOpen ? 'bg-green-400' : 'bg-gray-500'}`}
                title={marketStatus.isOpen ? 'Markt open' : 'Markt gesloten'}
              />
              {stock.ticker}
              {tabName && (
                <span
                  className="ml-1 text-[10px] px-1 py-0.5 rounded"
                  style={{ backgroundColor: accentColor + '30', color: accentColor }}
                >
                  {tabName}
                </span>
              )}
            </div>
          );
        })()}

        {/* Current Price */}
        {columnVisibility.price && (() => {
          const priceStyle = getColumnClasses(columnStyles.price);
          return (
            <div className={`text-right ${priceStyle.className}`} style={priceStyle.style}>
              {stock.currentPrice.toFixed(2)}
            </div>
          );
        })()}

        {/* Buy Limit */}
        {columnVisibility.limit && (() => {
          const limitStyle = getColumnClasses(columnStyles.limit);
          return (
            <div className={`text-right ${limitStyle.className}`} style={limitStyle.style}>
              {stock.buyLimit !== null ? (
                <span>{stock.buyLimit.toFixed(2)}</span>
              ) : (
                <span className="text-gray-500">--</span>
              )}
            </div>
          );
        })()}

        {/* Progress Bar - Rainbow */}
        {columnVisibility.distance && (
          <div>
            <ProgressBar
              currentPrice={stock.currentPrice}
              buyLimit={stock.buyLimit}
            />
          </div>
        )}

        {/* Day Change */}
        {columnVisibility.dayChange && (() => {
          const dayStyle = getColumnClasses(columnStyles.dayChange, isPositive ? BRAND_GREEN : '#ff3366');
          return (
            <div className={`text-right ${dayStyle.className}`} style={dayStyle.style}>
              {isPositive ? '+' : ''}{stock.dayChangePercent.toFixed(1)}%
            </div>
          );
        })()}

        {/* Range Bar */}
        {columnVisibility.range && (
          <div>
            <RangeBar low={low} high={high} current={stock.currentPrice} />
          </div>
        )}

        {/* Range Diff as percentage */}
        {columnVisibility.rangeDelta && (() => {
          const deltaStyle = getColumnClasses(columnStyles.rangeDelta);
          return (
            <div className={`text-right ${deltaStyle.className}`} style={deltaStyle.style}>
              {rangeDiffPercent.toFixed(0)}%
            </div>
          );
        })()}

        {/* Mini Chart */}
        {columnVisibility.chart && (
          <div style={{ width: columnStyles.chart.width }}>
            <Sparkline
              data={stock.historicalData}
              timeframe={getChartTimeframeFromPeriod(rangePeriod)}
              buyLimit={stock.buyLimit}
              currentPrice={stock.currentPrice}
              height={32}
              onClick={() => setShowChart(true)}
            />
          </div>
        )}

        {/* Currency */}
        {columnVisibility.currency && (() => {
          const ccyStyle = getColumnClasses(columnStyles.currency);
          return (
            <div className={`text-center ${ccyStyle.className}`} style={ccyStyle.style}>
              {stock.currency}
            </div>
          );
        })()}

        {/* Last Refresh Time */}
        {columnVisibility.lastRefresh && (() => {
          const refreshInfo = getRefreshAgeInfo(stock.lastScanStatus?.timestamp, stock.exchange);
          return (
            <div
              className="text-center font-mono text-xs"
              style={{ color: refreshInfo.color }}
              title={`Laatst gescand: ${stock.lastScanStatus?.timestamp ? new Date(stock.lastScanStatus.timestamp).toLocaleString('nl-NL') : 'Nooit'}`}
            >
              {refreshInfo.formattedTime}
            </div>
          );
        })()}

        {/* Custom Checkbox Column */}
        {columnVisibility.custom && (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={stock.customChecked || false}
              onChange={(e) => {
                e.stopPropagation();
                onCustomToggle?.(e.target.checked);
              }}
              className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
            />
          </div>
        )}

        {/* Edit Button */}
        <button
          onClick={onEdit}
          className="p-1.5 hover:bg-white/10 rounded transition-colors justify-self-end"
        >
          <PencilIcon className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      </div>

      {/* Mobile view */}
      <div className={`md:hidden rounded-lg overflow-hidden ${isUnavailable ? 'bg-[#1a1a1a] opacity-60' : 'bg-[#2d2d2d]'}`}>
        {/* Unavailable warning banner */}
        {isUnavailable && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-500 border-b border-[#2d2d2d]">
            <span className="text-yellow-500">⚠</span>
            <span className="truncate">{stock.unavailableReason}</span>
          </div>
        )}
        <div
          className="p-4 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex justify-between items-start mb-2">
            <div
              className="font-semibold text-sm flex items-center gap-1.5 hover:underline"
              style={{ color: accentColor }}
              onClick={(e) => {
                e.stopPropagation();
                const searchQuery = encodeURIComponent(`${stock.ticker} ${stock.name} stock`);
                window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
              }}
              title={`Zoek ${stock.ticker} op Google`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isMarketOpen(stock.exchange).isOpen ? 'bg-green-400' : 'bg-gray-500'}`}
              />
              {stock.ticker}
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-white">
                {stock.currentPrice.toFixed(2)} <span className="text-gray-400">{stock.currency}</span>
              </div>
              <div className="font-mono text-sm" style={{ color: isPositive ? BRAND_GREEN : '#ff3366' }}>
                {isPositive ? '+' : ''}{stock.dayChangePercent.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex-1 mr-4">
              <ProgressBar
                currentPrice={stock.currentPrice}
                buyLimit={stock.buyLimit}
                showThresholds={false}
              />
            </div>
            {isExpanded ? (
              <ChevronUpIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-[#3d3d3d]">
            <div className="pt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Buy Limit</span>
                <span className="text-white font-mono">
                  {stock.buyLimit !== null ? stock.buyLimit.toFixed(2) : '--'}
                </span>
              </div>

              <div>
                <div className="text-gray-400 text-sm mb-1">{label} Range</div>
                <RangeBar low={low} high={high} current={stock.currentPrice} />
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{label} Range %</span>
                <span className="text-gray-300 font-mono">{rangeDiffPercent.toFixed(0)}%</span>
              </div>
            </div>

            <div className="mt-4">
              <Sparkline
                data={stock.historicalData}
                timeframe={getChartTimeframeFromPeriod(rangePeriod)}
                buyLimit={stock.buyLimit}
                currentPrice={stock.currentPrice}
                height={60}
                showTimeframeSelector
                onTimeframeChange={onTimeframeChange}
                onClick={() => setShowChart(true)}
              />
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 rounded text-sm text-white transition-colors"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {showChart && (
        <ExpandedChart
          data={stock.historicalData}
          ticker={stock.ticker}
          name={stock.name}
          buyLimit={stock.buyLimit}
          currentPrice={stock.currentPrice}
          timeframe={getChartTimeframeFromPeriod(rangePeriod)}
          onTimeframeChange={onTimeframeChange}
          onClose={() => setShowChart(false)}
        />
      )}
    </>
  );
}
