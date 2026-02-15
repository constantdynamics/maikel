'use client';

import type { Stock } from '@/lib/defog/types';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';

interface StockWithTab {
  stock: Stock;
  tabId: string;
  tabName: string;
  tabColor: string;
}

interface TopMoversProps {
  gainers: StockWithTab[];
  losers: StockWithTab[];
  onStockClick: (tabId: string, stock: Stock) => void;
}

export function TopMovers({ gainers, losers, onStockClick }: TopMoversProps) {
  const formatChange = (change: number) => {
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${change.toFixed(2)}%`;
  };

  const formatPrice = (price: number, currency: string) => {
    const symbol = currency === 'EUR' ? '€' : '$';
    return `${symbol}${price.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <ArrowTrendingUpIcon className="w-6 h-6 text-green-400" />
        <ArrowTrendingDownIcon className="w-6 h-6 text-red-400" />
        Top Movers van Vandaag
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gainers */}
        <div className="bg-[#1a2f1a] border border-green-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
            <ArrowTrendingUpIcon className="w-5 h-5" />
            Top 10 Stijgers
          </h3>

          {gainers.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Geen stijgers vandaag</p>
          ) : (
            <div className="space-y-2">
              {gainers.map((item, index) => (
                <button
                  key={item.stock.id}
                  onClick={() => onStockClick(item.tabId, item.stock)}
                  className="w-full flex items-center justify-between p-3 bg-[#0d1f0d] hover:bg-[#1a3a1a] rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-green-400 font-bold w-6">{index + 1}</span>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{item.stock.ticker}</span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: item.tabColor + '30', color: item.tabColor }}
                        >
                          {item.tabName}
                        </span>
                      </div>
                      <span className="text-gray-400 text-xs">{item.stock.name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-bold">
                      {formatChange(item.stock.dayChangePercent)}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {formatPrice(item.stock.currentPrice, item.stock.currency)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Losers */}
        <div className="bg-[#2f1a1a] border border-red-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
            <ArrowTrendingDownIcon className="w-5 h-5" />
            Top 10 Dalers
          </h3>

          {losers.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Geen dalers vandaag</p>
          ) : (
            <div className="space-y-2">
              {losers.map((item, index) => (
                <button
                  key={item.stock.id}
                  onClick={() => onStockClick(item.tabId, item.stock)}
                  className="w-full flex items-center justify-between p-3 bg-[#1f0d0d] hover:bg-[#3a1a1a] rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-red-400 font-bold w-6">{index + 1}</span>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{item.stock.ticker}</span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: item.tabColor + '30', color: item.tabColor }}
                        >
                          {item.tabName}
                        </span>
                      </div>
                      <span className="text-gray-400 text-xs">{item.stock.name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-red-400 font-bold">
                      {formatChange(item.stock.dayChangePercent)}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {formatPrice(item.stock.currentPrice, item.stock.currency)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
