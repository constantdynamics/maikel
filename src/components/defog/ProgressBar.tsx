'use client';

import { useMemo } from 'react';

interface ProgressBarProps {
  currentPrice: number;
  buyLimit: number | null;
  showThresholds?: boolean;
}

// Brand green - same as chart line
const BRAND_GREEN = '#00ff88';

// 12 rainbow colors from red (far, index 0) to green (close, index 11)
const RAINBOW_COLORS = [
  '#ff3366', // Red (2048%+)
  '#ff4444', // Red-orange (1024%)
  '#ff6622', // Orange (512%)
  '#ff8800', // Orange (256%)
  '#ffaa00', // Orange-yellow (128%)
  '#ffcc00', // Yellow (64%)
  '#dddd00', // Yellow-lime (32%)
  '#aaee00', // Lime (16%)
  '#77ee33', // Light green (8%)
  '#44ff55', // Green (4%)
  '#22ff77', // Bright green (2%)
  BRAND_GREEN, // Brand green (1% or less)
];

// Thresholds that double each step: 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048
const THRESHOLDS = [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1];

export function ProgressBar({ currentPrice, buyLimit }: ProgressBarProps) {
  const { filledBlocks, displayText, textColor, shouldPulse } = useMemo(() => {
    // No buy limit set
    if (buyLimit === null || buyLimit === 0) {
      return { filledBlocks: 0, displayText: '--', textColor: '#6b7280', shouldPulse: false };
    }

    // Calculate distance percentage (positive = above limit)
    const distancePercent = ((currentPrice - buyLimit) / buyLimit) * 100;

    // Count how many thresholds we're below
    // If distancePercent <= 1%, all 12 blocks are green
    // If distancePercent <= 2%, 11 blocks are filled
    // etc.
    let blocks = 0;
    for (let i = 0; i < THRESHOLDS.length; i++) {
      if (distancePercent <= THRESHOLDS[i]) {
        blocks = i + 1;
      }
    }

    // Format display text
    let text: string;
    if (distancePercent <= 0) {
      text = 'BUY!';
    } else if (distancePercent < 100) {
      text = `${distancePercent.toFixed(1)}%`;
    } else {
      text = `${Math.round(distancePercent)}%`;
    }

    // Text color: green when close, red when far
    let color: string;
    if (distancePercent <= 1) {
      color = BRAND_GREEN;
    } else if (distancePercent <= 10) {
      color = '#44ff55';
    } else if (distancePercent <= 50) {
      color = '#ffcc00';
    } else {
      color = '#ff3366';
    }

    const pulse = distancePercent <= 1;

    return { filledBlocks: blocks, displayText: text, textColor: color, shouldPulse: pulse };
  }, [currentPrice, buyLimit]);

  // No buy limit set (null or 0) - show gray blocks with dash
  // This indicates the user still needs to set a buy limit
  if (buyLimit === null || buyLimit === 0) {
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
      {/* 12 rainbow blocks - fills from left to right */}
      <div className="flex gap-0.5">
        {Array.from({ length: 12 }).map((_, i) => {
          const isFilled = i < filledBlocks;

          return (
            <div
              key={i}
              className={`w-2.5 h-4 rounded-sm transition-all duration-300 ${
                isFilled && shouldPulse ? 'animate-pulse' : ''
              }`}
              style={{
                backgroundColor: isFilled ? RAINBOW_COLORS[i] : '#3d3d3d',
              }}
            />
          );
        })}
      </div>

      <span
        className={`font-mono text-sm w-16 text-right ${shouldPulse ? 'animate-pulse' : ''}`}
        style={{ color: textColor }}
      >
        {displayText}
      </span>
    </div>
  );
}
