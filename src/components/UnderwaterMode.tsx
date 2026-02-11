'use client';

import type { ZonnebloemStock } from '@/lib/types';
import { SpikeDotDisplay } from './ZonnebloemTable';

interface UnderwaterModeProps {
  stocks: ZonnebloemStock[];
  onExit: () => void;
}

export default function UnderwaterMode({ stocks, onExit }: UnderwaterModeProps) {
  // Split stocks into 4 columns
  const colCount = 4;
  const columns: ZonnebloemStock[][] = Array.from({ length: colCount }, () => []);
  stocks.forEach((stock, i) => {
    columns[i % colCount].push(stock);
  });

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto"
      style={{ backgroundColor: '#1a1c1e' }}
    >
      {/* Toggle button top-left */}
      <button
        onClick={onExit}
        className="fixed top-4 left-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors bg-[#2a2d31] text-[#8a8d91] hover:text-white hover:bg-[#3a3d41] border border-[#3a3d41]"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
        Ground Mode
      </button>

      {/* Stock count */}
      <div className="pt-16 pb-4 px-6">
        <span
          className="font-mono font-bold tracking-tight"
          style={{ color: '#4a4d52', fontSize: '4rem', lineHeight: 1 }}
        >
          {stocks.length}
        </span>
        <span className="ml-3 text-sm" style={{ color: '#3a3d41' }}>
          stocks
        </span>
      </div>

      {/* 4-column grid */}
      <div className="px-6 pb-8 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-0">
        {columns.map((col, colIdx) => (
          <div key={colIdx}>
            {col.map((stock) => (
              <div
                key={stock.id}
                className="flex items-center justify-between py-1 border-b"
                style={{ borderColor: '#252729' }}
              >
                <span
                  className="font-mono text-xs font-medium truncate mr-2"
                  style={{ color: '#7a7d82' }}
                >
                  {stock.ticker}
                </span>
                <SpikeDotDisplay
                  spikeCount={stock.spike_count}
                  highestSpikePct={stock.highest_spike_pct}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
