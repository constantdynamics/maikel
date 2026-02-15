'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, PencilIcon } from '@heroicons/react/24/outline';
import type { Stock, ChartTimeframe, RangePeriod, ColumnVisibility } from '@/lib/defog/types';
import { ProgressBar } from './ProgressBar';
import { Sparkline, ExpandedChart } from './Sparkline';
import { isMarketOpen } from '@/lib/defog/services/stockApi';

interface MobileStockCardProps {
  stock: Stock;
  accentColor: string;
  rangePeriod: RangePeriod;
  isSelected?: boolean;
  columnVisibility: ColumnVisibility;
  onSelect?: (selected: boolean) => void;
  onEdit: () => void;
  onTimeframeChange: (timeframe: ChartTimeframe) => void;
  tabName?: string; // For "All" view - show which tab the stock belongs to
  onCustomToggle?: (checked: boolean) => void; // Custom checkbox column toggle
}

// Consistent green color
const BRAND_GREEN = '#00ff88';

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

// Convert range period to chart timeframe
function getChartTimeframeFromPeriod(period: RangePeriod): ChartTimeframe {
  switch (period) {
    case '3y': return '3y';
    case '5y': return '5y';
    default: return '1y';
  }
}

// Range bar component
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
      <span className="text-gray-500 w-12 text-right font-mono text-xs">{formatPrice(low)}</span>
      <div className="flex-1 h-1.5 bg-[#3d3d3d] rounded relative mx-1">
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white"
          style={{ left: `${clampedPosition}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <span className="text-gray-500 w-12 font-mono text-xs">{formatPrice(high)}</span>
    </div>
  );
}

export function MobileStockCard({
  stock,
  accentColor,
  rangePeriod,
  isSelected = false,
  columnVisibility,
  onSelect,
  onEdit,
  onTimeframeChange,
  tabName,
  onCustomToggle,
}: MobileStockCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const isPositive = stock.dayChangePercent >= 0;
  const { high, low, label } = getRangeValues(stock, rangePeriod);
  const marketStatus = isMarketOpen(stock.exchange);

  // Calculate distance to limit
  const distancePercent = stock.buyLimit !== null
    ? ((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100
    : null;

  // Check if stock is unavailable
  const isUnavailable = stock.unavailableReason && stock.unavailableProviders && stock.unavailableProviders.length > 0;

  return (
    <>
      <div className={`rounded-lg overflow-hidden ${isUnavailable ? 'bg-[#1a1a1a] opacity-60' : 'bg-[#2d2d2d]'}`}>
        {/* Main row - always visible */}
        <div
          className="p-3 cursor-pointer active:bg-[#353535]"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Unavailable indicator */}
          {isUnavailable && (
            <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 bg-[#2d2d2d] rounded px-2 py-1">
              <span className="text-yellow-500">⚠</span>
              <span className="truncate">{stock.unavailableReason}</span>
            </div>
          )}

          {/* Top row: Checkbox, Ticker, Price, Day Change */}
          <div className="flex items-center gap-2 mb-2">
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onSelect?.(e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0"
            />

            {/* Market status + Ticker + Name */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isUnavailable ? 'bg-yellow-500' : marketStatus.isOpen ? 'bg-green-400' : 'bg-gray-500'}`}
              />
              <span
                className={`font-semibold text-sm flex-shrink-0 cursor-pointer hover:underline ${isUnavailable ? 'text-gray-500' : ''}`}
                style={{ color: isUnavailable ? undefined : accentColor }}
                onClick={(e) => {
                  e.stopPropagation();
                  const searchQuery = encodeURIComponent(`${stock.ticker} ${stock.name} stock`);
                  window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
                }}
                title={`Zoek ${stock.ticker} op Google`}
              >
                {stock.ticker}
                {tabName && (
                  <span
                    className="ml-1 text-[10px] px-1 py-0.5 rounded"
                    style={{ backgroundColor: accentColor + '30', color: accentColor }}
                  >
                    {tabName}
                  </span>
                )}
              </span>
              {columnVisibility.name && (
                <span className="text-gray-400 text-xs truncate">
                  {stock.displayName || stock.name}
                </span>
              )}
            </div>

            {/* Price + Currency */}
            {columnVisibility.price && !isUnavailable && (
              <div className="text-right">
                <span className="font-mono text-sm text-white">
                  {stock.currentPrice.toFixed(2)}
                </span>
                {columnVisibility.currency && (
                  <span className="text-xs text-gray-400 ml-1">
                    {stock.currency}
                  </span>
                )}
              </div>
            )}

            {/* Day Change */}
            {columnVisibility.dayChange && !isUnavailable && (
              <span
                className="font-mono text-sm min-w-[50px] text-right"
                style={{ color: isPositive ? BRAND_GREEN : '#ff3366' }}
              >
                {isPositive ? '+' : ''}{stock.dayChangePercent.toFixed(1)}%
              </span>
            )}

            {/* Show "N/A" for unavailable stocks */}
            {isUnavailable && (
              <span className="text-xs text-gray-500">N/A</span>
            )}

            {/* Expand indicator */}
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
          </div>

          {/* Second row: Distance bar (always show if has buy limit) - hide for unavailable stocks */}
          {columnVisibility.distance && stock.buyLimit !== null && !isUnavailable && (
            <div className="flex justify-end">
              <div className="w-[70%]">
                <ProgressBar
                  currentPrice={stock.currentPrice}
                  buyLimit={stock.buyLimit}
                  showThresholds={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-3 pb-3 border-t border-[#3d3d3d] space-y-3">
            {/* Name */}
            <div className="pt-3 flex justify-between items-center">
              <span className="text-gray-400 text-xs">Naam</span>
              <span className="text-white text-sm truncate max-w-[200px]">
                {stock.displayName || stock.name}
              </span>
            </div>

            {/* Buy Limit */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-xs">Buy Limit</span>
              <span className="text-white font-mono text-sm">
                {stock.buyLimit !== null ? (
                  <>
                    {stock.buyLimit.toFixed(2)}
                    {distancePercent !== null && (
                      <span
                        className="ml-2 text-xs"
                        style={{ color: distancePercent <= 0 ? BRAND_GREEN : distancePercent <= 5 ? '#fbbf24' : '#9ca3af' }}
                      >
                        ({distancePercent > 0 ? '+' : ''}{distancePercent.toFixed(1)}%)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-500">--</span>
                )}
              </span>
            </div>

            {/* Range */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400 text-xs">{label} Range</span>
              </div>
              <RangeBar low={low} high={high} current={stock.currentPrice} />
            </div>

            {/* Custom Checkbox */}
            {columnVisibility.custom && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-xs">Custom</span>
                <input
                  type="checkbox"
                  checked={stock.customChecked || false}
                  onChange={(e) => {
                    e.stopPropagation();
                    onCustomToggle?.(e.target.checked);
                  }}
                  className="w-5 h-5 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
                />
              </div>
            )}

            {/* Mini Chart */}
            <div className="pt-2">
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

            {/* Edit Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 bg-white/10 hover:bg-white/20 rounded text-sm text-white transition-colors"
            >
              <PencilIcon className="w-4 h-4" />
              Bewerken
            </button>
          </div>
        )}
      </div>

      {/* Full Chart Modal */}
      {showChart && (
        <ExpandedChart
          data={stock.historicalData}
          ticker={stock.ticker}
          name={stock.displayName || stock.name}
          buyLimit={stock.buyLimit}
          currentPrice={stock.currentPrice}
          timeframe={stock.chartTimeframe || getChartTimeframeFromPeriod(rangePeriod)}
          onClose={() => setShowChart(false)}
          onTimeframeChange={onTimeframeChange}
        />
      )}
    </>
  );
}
