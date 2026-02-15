'use client';

import { useMemo } from 'react';

interface ProfitBarProps {
  currentPrice: number;
  purchasePrice: number;
}

// Brand green - same as chart line
const BRAND_GREEN = '#00ff88';

// 12 rainbow colors from red (loss/small profit) to green (big profit)
// INVERTED from ProgressBar: more profit = more blocks filled = greener
const PROFIT_COLORS = [
  '#ff3366', // Red (loss or 0% profit)
  '#ff4444', // Red-orange
  '#ff6622', // Orange
  '#ff8800', // Orange
  '#ffaa00', // Orange-yellow
  '#ffcc00', // Yellow
  '#dddd00', // Yellow-lime
  '#aaee00', // Lime
  '#77ee33', // Light green
  '#44ff55', // Green
  '#22ff77', // Bright green
  BRAND_GREEN, // Brand green (100%+ profit)
];

// Thresholds for profit percentage (doubling pattern)
// 1%, 2%, 4%, 8%, 16%, 32%, 64%, 100%+
const PROFIT_THRESHOLDS = [1, 2, 4, 8, 16, 32, 48, 64, 80, 96, 100, 150];

export function ProfitBar({ currentPrice, purchasePrice }: ProfitBarProps) {
  const { filledBlocks, displayText, textColor, isLoss } = useMemo(() => {
    // No purchase price set
    if (!purchasePrice || purchasePrice <= 0) {
      return { filledBlocks: 0, displayText: '--', textColor: '#6b7280', isLoss: false };
    }

    // Calculate profit percentage
    const profitPercent = ((currentPrice - purchasePrice) / purchasePrice) * 100;
    const isLoss = profitPercent < 0;

    // Count how many thresholds we've passed
    // More profit = more blocks
    let blocks = 0;
    if (profitPercent > 0) {
      for (let i = 0; i < PROFIT_THRESHOLDS.length; i++) {
        if (profitPercent >= PROFIT_THRESHOLDS[i]) {
          blocks = i + 1;
        }
      }
    }

    // Format display text
    let text: string;
    if (profitPercent <= -50) {
      text = `${Math.round(profitPercent)}%`;
    } else if (profitPercent < 0) {
      text = `${profitPercent.toFixed(1)}%`;
    } else if (profitPercent < 100) {
      text = `+${profitPercent.toFixed(1)}%`;
    } else {
      text = `+${Math.round(profitPercent)}%`;
    }

    // Text color: red when loss, gradient to green based on profit
    let color: string;
    if (profitPercent < 0) {
      color = '#ff3366';
    } else if (profitPercent < 10) {
      color = '#ffcc00';
    } else if (profitPercent < 50) {
      color = '#77ee33';
    } else {
      color = BRAND_GREEN;
    }

    return { filledBlocks: blocks, displayText: text, textColor: color, isLoss };
  }, [currentPrice, purchasePrice]);

  // No purchase price - show gray blocks
  if (!purchasePrice || purchasePrice <= 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="w-2.5 h-4 rounded-sm bg-[#3d3d3d]" />
          ))}
        </div>
        <span className="font-mono text-sm text-gray-500 w-16 text-right">--</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* 12 blocks - fills from left to right based on profit */}
      <div className="flex gap-0.5">
        {Array.from({ length: 12 }).map((_, i) => {
          const isFilled = i < filledBlocks;
          const showLoss = isLoss && i === 0; // Show first block red when in loss

          return (
            <div
              key={i}
              className="w-2.5 h-4 rounded-sm transition-all duration-300"
              style={{
                backgroundColor: showLoss
                  ? '#ff3366'
                  : isFilled
                    ? PROFIT_COLORS[i]
                    : '#3d3d3d',
              }}
            />
          );
        })}
      </div>

      <span
        className="font-mono text-sm w-16 text-right"
        style={{ color: textColor }}
      >
        {displayText}
      </span>
    </div>
  );
}
