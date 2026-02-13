'use client';

import { useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import type { BuySignal, BuySignalDisplayOptions } from '@/lib/defog/types';
import { Modal } from './Modal';

interface BuySignalsProps {
  signals: BuySignal[];
  onMarkAsPurchased: (tabId: string, stockId: string, purchasePrice: number) => void;
  displayOptions?: BuySignalDisplayOptions;
}

export function BuySignals({ signals, onMarkAsPurchased, displayOptions }: BuySignalsProps) {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<BuySignal | null>(null);
  const [purchasePrice, setPurchasePrice] = useState('');

  const showTabName = displayOptions?.showTabName ?? false;
  const compactMode = displayOptions?.compactMode ?? true;

  if (signals.length === 0) return null;

  const handleOpenPurchaseModal = (signal: BuySignal) => {
    setSelectedSignal(signal);
    setPurchasePrice(signal.stock.currentPrice.toFixed(2));
    setShowPurchaseModal(true);
  };

  const handleConfirmPurchase = () => {
    if (!selectedSignal) return;

    const price = parseFloat(purchasePrice);
    if (isNaN(price) || price <= 0) return;

    onMarkAsPurchased(selectedSignal.tabId, selectedSignal.stock.id, price);
    setShowPurchaseModal(false);
    setSelectedSignal(null);
    setPurchasePrice('');
  };

  const formatTimeSince = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  return (
    <>
      <div className="mb-6 bg-gradient-to-r from-[#00ff88]/20 to-[#00ff88]/5 border border-[#00ff88]/30 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-[#00ff88] mb-3">
          Buy Signals ({signals.length})
        </h2>

        <div className="space-y-2">
          {signals.map((signal) => {
            const currencySymbol = signal.stock.currency === 'EUR' ? '€' : '$';

            return (
              <div
                key={`${signal.tabId}-${signal.stock.id}`}
                className={`flex items-center justify-between bg-[#1a1a1a]/50 rounded-lg ${compactMode ? 'p-2' : 'p-3'}`}
              >
                <div className="flex items-center gap-3">
                  {/* Color indicator dot (always visible, shows tab color) */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: signal.tabColor }}
                    title={signal.tabName}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-semibold cursor-pointer hover:underline ${compactMode ? 'text-sm' : ''}`}
                        style={{ color: signal.tabColor }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const searchQuery = encodeURIComponent(`${signal.stock.ticker} ${signal.stock.name} stock`);
                          window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
                        }}
                        title={`Zoek ${signal.stock.ticker} op Google`}
                      >
                        {signal.stock.ticker}
                      </span>
                      {showTabName && (
                        <span className="text-xs px-2 py-0.5 rounded bg-[#2d2d2d] text-gray-400">
                          {signal.tabName}
                        </span>
                      )}
                    </div>
                    {!compactMode && (
                      <div className="text-xs text-gray-400">
                        {signal.stock.name}
                      </div>
                    )}
                  </div>
                </div>

                <div className={`flex items-center ${compactMode ? 'gap-2' : 'gap-4'}`}>
                  <div className="text-right">
                    <div className={`text-[#00ff88] font-medium font-mono ${compactMode ? 'text-sm' : ''}`}>
                      {currencySymbol}
                      {signal.stock.currentPrice.toFixed(2)}
                    </div>
                    {!compactMode && (
                      <div className="text-xs text-gray-400 font-mono">
                        Limit: {currencySymbol}
                        {signal.stock.buyLimit?.toFixed(2)}
                      </div>
                    )}
                  </div>

                  {!compactMode && (
                    <div className="text-xs text-gray-500">
                      {formatTimeSince(signal.reachedAt)}
                    </div>
                  )}

                  <button
                    onClick={() => handleOpenPurchaseModal(signal)}
                    className={`flex items-center gap-1 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium rounded transition-colors ${
                      compactMode ? 'p-1.5' : 'px-3 py-1.5 text-sm'
                    }`}
                    title="Mark as purchased"
                  >
                    <CheckIcon className={compactMode ? 'w-4 h-4' : 'w-4 h-4'} />
                    {!compactMode && <span className="hidden sm:inline">Purchased</span>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Purchase Confirmation Modal */}
      <Modal
        isOpen={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        title="Mark as Purchased"
        size="sm"
      >
        {selectedSignal && (
          <div className="space-y-4">
            <div className="bg-[#2d2d2d] rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span
                  className="font-semibold"
                  style={{ color: selectedSignal.tabColor }}
                >
                  {selectedSignal.stock.ticker}
                </span>
              </div>
              <div className="text-sm text-gray-400">
                {selectedSignal.stock.name}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Purchase Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {selectedSignal.stock.currency === 'EUR' ? '€' : '$'}
                </span>
                <input
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 pl-8 pr-4 text-white focus:outline-none focus:border-white/30"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              This will move the stock to your archive and remove it from the
              watchlist.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmPurchase}
                className="flex-1 py-2 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium rounded-lg transition-colors"
              >
                Confirm Purchase
              </button>
              <button
                onClick={() => setShowPurchaseModal(false)}
                className="px-4 py-2 bg-[#3d3d3d] text-gray-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
