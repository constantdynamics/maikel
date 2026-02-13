'use client';

import { useState } from 'react';
import type { PurchasedStock } from '@/lib/defog/types';

interface PurchasedStocksProps {
  stocks: Array<{
    stock: PurchasedStock;
    tabId: string;
    tabName: string;
    tabColor: string;
    profitPercent: number;
  }>;
  onSelectStock: (stockId: string) => void;
  onRemovePurchased?: (stockId: string) => void;
  onRestoreToTab?: (stockId: string) => void;
}

// Calculate progress bar fill based on profit/loss percentage
// Thresholds matching the buy signal rainbow logic but for profit
function calculateProgressBlocks(percent: number): number {
  const absPercent = Math.abs(percent);
  if (absPercent <= 0) return 0;
  if (absPercent <= 2) return 1;
  if (absPercent <= 4) return 2;
  if (absPercent <= 8) return 3;
  if (absPercent <= 16) return 4;
  if (absPercent <= 32) return 5;
  if (absPercent <= 64) return 6;
  if (absPercent <= 128) return 7;
  if (absPercent <= 256) return 8;
  if (absPercent <= 512) return 9;
  if (absPercent <= 1024) return 10;
  if (absPercent <= 2048) return 11;
  return 12;
}

// Green gradient for profit
const PROFIT_COLORS = [
  '#004d00', '#006600', '#008000', '#00a600', '#00cc00', '#00ff00',
  '#33ff33', '#66ff66', '#99ff99', '#bbffbb', '#ddffdd', '#ffffff',
];

// Red gradient for loss
const LOSS_COLORS = [
  '#4d0000', '#660000', '#800000', '#a60000', '#cc0000', '#ff0000',
  '#ff3333', '#ff6666', '#ff9999', '#ffbbbb', '#ffdddd', '#ffffff',
];

// Progress bar component that shows green for profit, red for loss
function ProfitLossBar({ profitPercent }: { profitPercent: number }) {
  const blocks = calculateProgressBlocks(profitPercent);
  const colors = profitPercent >= 0 ? PROFIT_COLORS : LOSS_COLORS;

  return (
    <div className="flex gap-0.5 w-full h-2">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all"
          style={{
            backgroundColor: i < blocks ? colors[i] : '#2d2d2d',
            opacity: i < blocks ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

export function PurchasedStocks({ stocks, onSelectStock, onRemovePurchased, onRestoreToTab }: PurchasedStocksProps) {
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());

  const handleToggleSelect = (stockId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStocks(prev => {
      const next = new Set(prev);
      if (next.has(stockId)) {
        next.delete(stockId);
      } else {
        next.add(stockId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedStocks.size === stocks.length) {
      setSelectedStocks(new Set());
    } else {
      setSelectedStocks(new Set(stocks.map(s => s.stock.id)));
    }
  };

  const handleBulkRestore = () => {
    if (!onRestoreToTab) return;
    selectedStocks.forEach(id => onRestoreToTab(id));
    setSelectedStocks(new Set());
  };

  const handleBulkRemove = () => {
    if (!onRemovePurchased) return;
    selectedStocks.forEach(id => onRemovePurchased(id));
    setSelectedStocks(new Set());
  };

  if (stocks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">💰</div>
        <h3 className="text-xl font-bold text-white mb-2">Geen gekochte aandelen</h3>
        <p className="text-gray-400 max-w-md mx-auto">
          Markeer aandelen als "Gekocht" via het aandeel menu om ze hier te zien.
          Je kunt dan de aankoopprijs instellen en je winst/verlies bijhouden.
        </p>
      </div>
    );
  }

  // Calculate totals
  const avgProfitPercent = stocks.reduce((sum, s) => sum + s.profitPercent, 0) / stocks.length;
  const totalInvested = stocks.reduce((sum, s) => sum + (s.stock.purchasedPrice || 0), 0);
  const totalValue = stocks.reduce((sum, s) => sum + s.stock.currentPrice, 0);
  const totalProfit = totalValue - totalInvested;

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-gradient-to-r from-[#00ff88]/20 to-[#00cc66]/20 border border-[#00ff88]/30 rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#00ff88]">
              💰 {stocks.length} Gekochte Aandelen
            </h3>
            <p className="text-sm text-gray-400">
              Gesorteerd op winst percentage
            </p>
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-xs text-gray-400">Gemiddelde winst</div>
              <div className={`text-xl font-bold ${avgProfitPercent >= 0 ? 'text-[#00ff88]' : 'text-red-400'}`}>
                {avgProfitPercent >= 0 ? '+' : ''}{avgProfitPercent.toFixed(1)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Totale winst/verlies</div>
              <div className={`text-xl font-bold ${totalProfit >= 0 ? 'text-[#00ff88]' : 'text-red-400'}`}>
                {totalProfit >= 0 ? '+' : ''}€{totalProfit.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedStocks.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#2d2d2d] border border-[#3d3d3d] rounded-xl shadow-lg px-4 py-3 flex items-center gap-4 z-50">
          <span className="text-white font-medium">
            {selectedStocks.size} geselecteerd
          </span>
          <div className="h-6 w-px bg-[#3d3d3d]" />
          {onRestoreToTab && (
            <button
              onClick={handleBulkRestore}
              className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
            >
              ↩ Terugzetten
            </button>
          )}
          {onRemovePurchased && (
            <button
              onClick={handleBulkRemove}
              className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
            >
              🗑 Verwijderen
            </button>
          )}
          <button
            onClick={() => setSelectedStocks(new Set())}
            className="px-3 py-1.5 bg-[#3d3d3d] text-gray-300 rounded-lg hover:bg-[#4d4d4d] transition-colors text-sm"
          >
            OK
          </button>
        </div>
      )}

      {/* Stock rows - similar to regular tab view */}
      <div className="space-y-2">
        {/* Select all row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <input
            type="checkbox"
            checked={selectedStocks.size === stocks.length && stocks.length > 0}
            onChange={handleSelectAll}
            className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-sm text-gray-400">Selecteer alles</span>
        </div>

        {stocks.map((item) => {
          const currencySymbol = item.stock.currency === 'EUR' ? '€' : '$';
          const profitAmount = item.stock.currentPrice - (item.stock.purchasedPrice || 0);
          const isSelected = selectedStocks.has(item.stock.id);

          return (
            <div
              key={item.stock.id}
              onClick={() => onSelectStock(item.stock.id)}
              className={`bg-[#1d1d1d] rounded-lg overflow-hidden border cursor-pointer transition-colors ${
                isSelected ? 'border-[#00ff88]' : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
              }`}
              style={{ borderLeft: `4px solid ${item.tabColor}` }}
            >
              {/* Main row content */}
              <div className="p-3 flex items-center gap-4">
                {/* Checkbox */}
                <div className="flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleToggleSelect(item.stock.id, e as unknown as React.MouseEvent)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
                  />
                </div>

                {/* Ticker and name */}
                <div className="w-24 flex-shrink-0">
                  <div
                    className="font-semibold text-sm cursor-pointer hover:underline"
                    style={{ color: item.tabColor }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const searchQuery = encodeURIComponent(`${item.stock.ticker} ${item.stock.name} stock`);
                      window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
                    }}
                    title={`Zoek ${item.stock.ticker} op Google`}
                  >
                    {item.stock.ticker}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {item.stock.displayName || item.stock.name}
                  </div>
                </div>

                {/* Current price */}
                <div className="w-20 flex-shrink-0 text-right">
                  <div className="text-xs text-gray-500">Koers</div>
                  <div className="font-mono text-white text-sm">
                    {currencySymbol}{item.stock.currentPrice.toFixed(2)}
                  </div>
                </div>

                {/* Purchase price (replaces buy limit) */}
                <div className="w-20 flex-shrink-0 text-right">
                  <div className="text-xs text-gray-500">Aankoop</div>
                  <div className="font-mono text-gray-300 text-sm">
                    {currencySymbol}{item.stock.purchasedPrice?.toFixed(2)}
                  </div>
                </div>

                {/* Day change */}
                <div className="w-16 flex-shrink-0 text-right">
                  <div className="text-xs text-gray-500">Dag</div>
                  <div className={`font-mono text-sm ${item.stock.dayChangePercent >= 0 ? 'text-[#00ff88]' : 'text-red-400'}`}>
                    {item.stock.dayChangePercent >= 0 ? '+' : ''}{item.stock.dayChangePercent.toFixed(1)}%
                  </div>
                </div>

                {/* Profit/loss progress bar - takes remaining space */}
                <div className="flex-1 min-w-[100px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 font-bold">Winst/Verlies</span>
                    <span className={`text-xs font-mono font-bold ${item.profitPercent >= 0 ? 'text-[#00ff88]' : 'text-red-400'}`}>
                      {item.profitPercent >= 0 ? '+' : ''}{item.profitPercent.toFixed(1)}%
                    </span>
                  </div>
                  <ProfitLossBar profitPercent={item.profitPercent} />
                </div>

                {/* Profit amount */}
                <div className="w-24 flex-shrink-0 text-right">
                  <div className={`font-mono text-sm font-bold ${profitAmount >= 0 ? 'text-[#00ff88]' : 'text-red-400'}`}>
                    {profitAmount >= 0 ? '+' : ''}{currencySymbol}{profitAmount.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">{item.tabName}</div>
                </div>

                {/* Action button */}
                {onRemovePurchased && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePurchased(item.stock.id);
                    }}
                    className="text-xs text-gray-400 hover:text-red-400 transition-colors px-2"
                    title="Terugzetten naar watchlist"
                  >
                    ↩
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
