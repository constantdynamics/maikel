'use client';

import type { Stock } from '@/lib/types';

interface TileGridProps {
  stocks: Stock[];
}

// Rainbow score colors (1-10) matching globals.css
const SCORE_COLORS: Record<number, string> = {
  0: '#374151',  // gray-700 for score 0
  1: '#ef4444',  // red
  2: '#f97316',  // orange
  3: '#eab308',  // yellow
  4: '#a3e635',  // lime
  5: '#22c55e',  // green
  6: '#10b981',  // emerald
  7: '#14b8a6',  // teal
  8: '#06b6d4',  // cyan
  9: '#0ea5e9',  // sky
  10: '#3b82f6', // blue
};

/**
 * Calculate relative luminance for WCAG contrast.
 * Returns 'white' or 'black' depending on which has better contrast.
 */
function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  // WCAG: use white text on dark backgrounds, black on light
  return luminance > 0.35 ? '#000000' : '#ffffff';
}

/**
 * Calculate how far the current price is from the purchase limit.
 * Positive = above limit (more expensive), negative = below limit (cheaper / buy zone).
 */
function getPriceLimitPct(stock: Stock): number | null {
  if (!stock.current_price || !stock.purchase_limit || stock.purchase_limit === 0) return null;
  return ((stock.current_price - stock.purchase_limit) / stock.purchase_limit) * 100;
}

export default function TileGrid({ stocks }: TileGridProps) {
  return (
    <div className="grid gap-1.5" style={{
      gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
    }}>
      {stocks.map((stock) => {
        const score = Math.min(10, Math.max(0, stock.score));
        const bg = SCORE_COLORS[score] || SCORE_COLORS[0];
        const textColor = getContrastColor(bg);
        const limitPct = getPriceLimitPct(stock);
        const limitText = limitPct !== null ? `${limitPct >= 0 ? '+' : ''}${limitPct.toFixed(0)}%` : '-';

        return (
          <a
            key={stock.id}
            href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' ' + (stock.company_name || '') + ' stock')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded transition-transform hover:scale-105 hover:shadow-lg"
            style={{ backgroundColor: bg, color: textColor }}
          >
            <div className="p-2 flex flex-col items-center justify-center text-center min-h-[72px]">
              <div className="font-bold text-xs leading-tight tracking-wide truncate w-full" style={{ color: textColor }}>
                {stock.ticker}
              </div>
              <div className="font-extrabold text-lg leading-tight mt-0.5" style={{ color: textColor }}>
                {limitText}
              </div>
              <div className="text-[10px] leading-tight opacity-80 mt-0.5" style={{ color: textColor }}>
                ${stock.current_price?.toFixed(2) ?? '-'}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
