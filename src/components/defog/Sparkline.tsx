'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { HistoricalDataPoint, ChartTimeframe } from '@/lib/defog/types';

interface SparklineProps {
  data: HistoricalDataPoint[];
  timeframe: ChartTimeframe;
  buyLimit: number | null;
  currentPrice: number;
  height?: number;
  onClick?: () => void;
  showTimeframeSelector?: boolean;
  onTimeframeChange?: (timeframe: ChartTimeframe) => void;
}

const TIMEFRAME_DAYS: Record<ChartTimeframe, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  '3y': 365 * 3,
  '5y': 365 * 5,
};

export function Sparkline({
  data,
  timeframe,
  buyLimit,
  currentPrice,
  height = 40,
  onClick,
  showTimeframeSelector = false,
  onTimeframeChange,
}: SparklineProps) {
  const [hoveredValue, setHoveredValue] = useState<{ date: string; price: number } | null>(null);

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const days = TIMEFRAME_DAYS[timeframe];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Filter data by timeframe
    const filtered = data
      .filter((d) => new Date(d.date) >= cutoffDate)
      .map((d) => ({
        date: d.date,
        price: d.close,
      }));

    // If no data for selected timeframe, show all available data
    // This handles stocks that were listed less than 5 years ago
    if (filtered.length === 0 && data.length > 0) {
      return data.map((d) => ({
        date: d.date,
        price: d.close,
      }));
    }

    return filtered;
  }, [data, timeframe]);

  const { minPrice, maxPrice, lineColor } = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        minPrice: 0,
        maxPrice: 100,
        lineColor: '#6b7280',
      };
    }

    const prices = filteredData.map((d) => d.price);
    const min = Math.min(...prices, buyLimit || Infinity);
    const max = Math.max(...prices, buyLimit || -Infinity);
    const padding = (max - min) * 0.1;

    const above = buyLimit === null || currentPrice > buyLimit;

    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      lineColor: above ? '#00ff88' : '#ff3366',
    };
  }, [filteredData, buyLimit, currentPrice]);

  if (filteredData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-[#2d2d2d] rounded"
        style={{ height }}
      >
        <span className="text-xs text-gray-500">No data</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {showTimeframeSelector && (
        <div className="absolute top-0 right-0 z-10 flex gap-1">
          {(['7d', '30d', '90d', '1y', '3y', '5y'] as ChartTimeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={(e) => {
                e.stopPropagation();
                onTimeframeChange?.(tf);
              }}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                timeframe === tf
                  ? 'bg-white/20 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      )}

      <div
        className={`cursor-pointer transition-opacity hover:opacity-80 ${
          showTimeframeSelector ? 'pt-5' : ''
        }`}
        onClick={onClick}
        style={{ height: showTimeframeSelector ? height + 20 : height }}
      >
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={filteredData}
            margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
            onMouseMove={(e) => {
              const payload = e as unknown as { activePayload?: Array<{ payload: { date: string; price: number } }> };
              if (payload.activePayload?.[0]) {
                setHoveredValue({
                  date: payload.activePayload[0].payload.date,
                  price: payload.activePayload[0].payload.price,
                });
              }
            }}
            onMouseLeave={() => setHoveredValue(null)}
          >
            <XAxis dataKey="date" hide />
            <YAxis domain={[minPrice, maxPrice]} hide />

            {buyLimit !== null && (
              <ReferenceLine
                y={buyLimit}
                stroke="#ffffff"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
            )}

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length > 0) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-xs">
                      <div className="text-gray-400">{data.date}</div>
                      <div className="text-white font-medium">
                        ${data.price.toFixed(2)}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            <Line
              type="monotone"
              dataKey="price"
              stroke={lineColor}
              strokeWidth={1.5}
              dot={false}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hoveredValue && (
        <div className="absolute bottom-0 left-0 text-[10px] text-gray-400">
          {hoveredValue.date}: ${hoveredValue.price.toFixed(2)}
        </div>
      )}
    </div>
  );
}

// Expanded chart modal
interface ExpandedChartProps {
  data: HistoricalDataPoint[];
  ticker: string;
  name: string;
  buyLimit: number | null;
  currentPrice: number;
  timeframe: ChartTimeframe;
  onTimeframeChange: (timeframe: ChartTimeframe) => void;
  onClose: () => void;
}

export function ExpandedChart({
  data,
  ticker,
  name,
  buyLimit,
  currentPrice,
  timeframe,
  onTimeframeChange,
  onClose,
}: ExpandedChartProps) {
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const days = TIMEFRAME_DAYS[timeframe];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Filter data by timeframe
    const filtered = data
      .filter((d) => new Date(d.date) >= cutoffDate)
      .map((d) => ({
        date: d.date,
        price: d.close,
      }));

    // If no data for selected timeframe, show all available data
    if (filtered.length === 0 && data.length > 0) {
      return data.map((d) => ({
        date: d.date,
        price: d.close,
      }));
    }

    return filtered;
  }, [data, timeframe]);

  const { minPrice, maxPrice, lineColor } = useMemo(() => {
    if (filteredData.length === 0) {
      return { minPrice: 0, maxPrice: 100, lineColor: '#6b7280' };
    }

    const prices = filteredData.map((d) => d.price);
    const min = Math.min(...prices, buyLimit || Infinity);
    const max = Math.max(...prices, buyLimit || -Infinity);
    const padding = (max - min) * 0.1;

    const above = buyLimit === null || currentPrice > buyLimit;

    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      lineColor: above ? '#00ff88' : '#ff3366',
    };
  }, [filteredData, buyLimit, currentPrice]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] rounded-lg w-full max-w-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-semibold text-white">{ticker}</h3>
            <p className="text-gray-400 text-sm">{name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {(['7d', '30d', '90d', '1y', '3y', '5y'] as ChartTimeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                timeframe === tf
                  ? 'bg-white/20 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={filteredData}
              margin={{ top: 10, right: 10, bottom: 20, left: 40 }}
            >
              <XAxis
                dataKey="date"
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={{ stroke: '#4b5563' }}
                axisLine={{ stroke: '#4b5563' }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={{ stroke: '#4b5563' }}
                axisLine={{ stroke: '#4b5563' }}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />

              {buyLimit !== null && (
                <ReferenceLine
                  y={buyLimit}
                  stroke="#ffffff"
                  strokeDasharray="5 5"
                  strokeOpacity={0.7}
                  label={{
                    value: `Limit: $${buyLimit.toFixed(2)}`,
                    fill: '#ffffff',
                    fontSize: 12,
                    position: 'right',
                  }}
                />
              )}

              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-3 py-2">
                        <div className="text-gray-400 text-sm">{data.date}</div>
                        <div className="text-white font-medium text-lg">
                          ${data.price.toFixed(2)}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              <Line
                type="monotone"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                animationDuration={300}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex justify-between text-sm">
          <div className="text-gray-400">
            Current: <span className="text-white">${currentPrice.toFixed(2)}</span>
          </div>
          {buyLimit !== null && (
            <div className="text-gray-400">
              Buy Limit: <span className="text-white">${buyLimit.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
