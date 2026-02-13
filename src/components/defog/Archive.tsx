'use client';

import { useState } from 'react';
import { TrashIcon, ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { ArchivedStock } from '@/lib/defog/types';
import { Modal } from './Modal';
import { exportToCSV } from '@/lib/defog/utils/storage';
import { ProfitBar } from './ProfitBar';

interface ArchiveProps {
  archive: ArchivedStock[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Archive({ archive, onRemove, onClearAll, onRefresh, isRefreshing }: ArchiveProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Calculate total profit/loss
  const totalInvested = archive.reduce((sum, item) => sum + item.purchasePrice, 0);
  const totalCurrentValue = archive.reduce((sum, item) => sum + (item.currentPrice || item.purchasePrice), 0);
  const totalProfit = totalCurrentValue - totalInvested;
  const totalProfitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  const handleExport = () => {
    const data = archive.map((item) => ({
      Ticker: item.ticker,
      Name: item.name,
      'Purchase Price': item.purchasePrice,
      'Purchase Date': new Date(item.purchaseDate).toLocaleDateString(),
      'Buy Limit': item.buyLimit || 'N/A',
      Currency: item.currency,
      'Archived At': new Date(item.archivedAt).toLocaleDateString(),
    }));

    exportToCSV(data, `stock-archive-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Purchased Stocks ({archive.length})
          </h2>
          {archive.length > 0 && (
            <div className="flex items-center gap-4 mt-1">
              <span className="text-sm text-gray-400">
                Total invested: €{totalInvested.toFixed(2)}
              </span>
              <span
                className="text-sm font-medium"
                style={{ color: totalProfit >= 0 ? '#00ff88' : '#ff3366' }}
              >
                {totalProfit >= 0 ? '+' : ''}€{totalProfit.toFixed(2)} ({totalProfitPercent >= 0 ? '+' : ''}{totalProfitPercent.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>
        {archive.length > 0 && (
          <div className="flex gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-400 hover:text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Prices
              </button>
            )}
            <button
              onClick={handleExport}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-400 hover:text-white text-sm rounded-lg transition-colors"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#2d2d2d] hover:bg-[#ff3366] text-gray-400 hover:text-white text-sm rounded-lg transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              Clear All
            </button>
          </div>
        )}
      </div>

      {archive.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No purchased stocks in archive</p>
          <p className="text-sm mt-1">
            Stocks you mark as purchased will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {archive.map((item) => {
            const currencySymbol = item.currency === 'EUR' ? '€' : '$';
            const currentPrice = item.currentPrice || item.purchasePrice;
            const profit = currentPrice - item.purchasePrice;

            return (
              <div
                key={item.id}
                className="bg-[#2d2d2d] rounded-lg p-4"
              >
                {/* Main row */}
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {item.ticker}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400 truncate">{item.name}</div>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-right min-w-[80px]">
                      <div className="text-xs text-gray-500">Aankoop</div>
                      <div className="text-gray-400 text-sm font-mono">
                        {currencySymbol}{item.purchasePrice.toFixed(2)}
                      </div>
                    </div>

                    <div className="text-right min-w-[80px]">
                      <div className="text-xs text-gray-500">Huidig</div>
                      <div className="text-white text-sm font-mono">
                        {currencySymbol}{currentPrice.toFixed(2)}
                      </div>
                    </div>

                    {/* Profit bar */}
                    <div className="min-w-[200px]">
                      <ProfitBar
                        currentPrice={currentPrice}
                        purchasePrice={item.purchasePrice}
                      />
                    </div>

                    <div className="text-right min-w-[70px]">
                      <div className="text-xs text-gray-500">Winst</div>
                      <div
                        className="text-sm font-mono font-medium"
                        style={{ color: profit >= 0 ? '#00ff88' : '#ff3366' }}
                      >
                        {profit >= 0 ? '+' : ''}{currencySymbol}{profit.toFixed(2)}
                      </div>
                    </div>

                    <div className="text-right min-w-[60px]">
                      <div className="text-xs text-gray-500">Datum</div>
                      <div className="text-gray-400 text-xs">
                        {formatDate(item.purchaseDate)}
                      </div>
                    </div>

                    <button
                      onClick={() => onRemove(item.id)}
                      className="p-2 hover:bg-[#ff3366]/20 text-gray-400 hover:text-[#ff3366] rounded transition-colors"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear Archive"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-300">
            Are you sure you want to clear all {archive.length} items from the
            archive? This action cannot be undone.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => {
                onClearAll();
                setShowClearConfirm(false);
              }}
              className="flex-1 py-2 bg-[#ff3366] hover:bg-[#ff1144] text-white font-medium rounded-lg transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-4 py-2 bg-[#3d3d3d] text-gray-400 hover:text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
