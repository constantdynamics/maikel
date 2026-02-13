'use client';

import { useState, useMemo } from 'react';
import type { Stock, ChartTimeframe, ApiProvider, StockIssueType } from '@/lib/defog/types';
import { Modal } from './Modal';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

// Issue type options with Dutch labels
const ISSUE_TYPES: { value: StockIssueType; label: string; description: string }[] = [
  { value: 'price_not_loading', label: 'Koers laadt niet', description: 'De actuele koers wordt niet opgehaald' },
  { value: 'price_incorrect', label: 'Koers klopt niet', description: 'De getoonde koers wijkt af van de werkelijke koers' },
  { value: 'range_incorrect', label: 'Range klopt niet', description: 'De 52W/3Y/5Y high/low is incorrect' },
  { value: 'not_refreshing', label: 'Wordt niet ververst', description: 'Dit aandeel wordt overgeslagen tijdens scannen' },
  { value: 'wrong_exchange', label: 'Verkeerde exchange', description: 'Gekoppeld aan verkeerde beurs (bv. USA ipv Canada)' },
];

// Map exchange codes to Yahoo Finance suffixes (mirror of stockApi.ts)
function getYahooSymbolPreview(symbol: string, exchange?: string): string {
  if (!exchange) return symbol;
  if (symbol.includes('.')) return symbol;

  // Helper functions for Asian markets
  const formatHKTicker = (ticker: string): string => {
    if (/^\d+$/.test(ticker)) return ticker.padStart(4, '0') + '.HK';
    return ticker + '.HK';
  };
  const formatSSTicker = (ticker: string): string => {
    if (/^\d+$/.test(ticker)) return ticker.padStart(6, '0') + '.SS';
    return ticker + '.SS';
  };
  const formatSZTicker = (ticker: string): string => {
    if (/^\d+$/.test(ticker)) return ticker.padStart(6, '0') + '.SZ';
    return ticker + '.SZ';
  };

  const exchangeUpper = exchange.toUpperCase();

  // Special handling for Asian markets
  const isHongKong = ['HKG', 'HKEX', 'SEHK', 'HKSE'].includes(exchangeUpper) ||
    exchangeUpper.includes('HONG KONG') || exchangeUpper.includes('HK');
  const isShanghai = ['SHA', 'SSE'].includes(exchangeUpper) || exchangeUpper.includes('SHANGHAI');
  const isShenzhen = ['SHE', 'SZSE'].includes(exchangeUpper) || exchangeUpper.includes('SHENZHEN');

  if (isHongKong) return formatHKTicker(symbol);
  if (isShanghai) return formatSSTicker(symbol);
  if (isShenzhen) return formatSZTicker(symbol);

  const exchangeToSuffix: Record<string, string> = {
    'AMS': '.AS', 'XAMS': '.AS',
    'EPA': '.PA', 'XPAR': '.PA',
    'ETR': '.DE', 'XETR': '.DE',
    'FRA': '.F',
    'LON': '.L', 'XLON': '.L', 'LSE': '.L',
    'SWX': '.SW',
    'BRU': '.BR',
    'MIL': '.MI',
    'TYO': '.T',
    'SGX': '.SI',
    'KRX': '.KS',
    'TPE': '.TW',
    'ASX': '.AX',
    'TSX': '.TO', 'TSE': '.TO',
    'NASDAQ': '', 'NYSE': '', 'NYSEARCA': '', 'AMEX': '',
  };

  const suffix = exchangeToSuffix[exchangeUpper];
  if (suffix !== undefined) {
    return `${symbol}${suffix}`;
  }

  if (exchangeUpper.includes('AMSTERDAM') || exchangeUpper.includes('AMS')) return `${symbol}.AS`;
  if (exchangeUpper.includes('LONDON') || exchangeUpper.includes('LSE')) return `${symbol}.L`;
  if (exchangeUpper.includes('FRANKFURT') || exchangeUpper.includes('XETRA')) return `${symbol}.DE`;
  if (exchangeUpper.includes('PARIS')) return `${symbol}.PA`;
  if (exchangeUpper.includes('TOKYO')) return `${symbol}.T`;

  return symbol;
}

interface EditStockModalProps {
  stock: Stock;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Stock>) => void;
  onDelete: () => void;
  onReportIssue?: (issueType: StockIssueType, description: string) => Promise<string[]>;
  onMarkAsPurchased?: (purchasePrice: number) => void;
  isPurchasedStock?: boolean; // True if editing a purchased stock (from Purchased view)
}

export function EditStockModal({
  stock,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onReportIssue,
  onMarkAsPurchased,
  isPurchasedStock = false,
}: EditStockModalProps) {
  const [displayName, setDisplayName] = useState(stock.displayName || '');
  const [buyLimit, setBuyLimit] = useState(
    stock.buyLimit !== null ? stock.buyLimit.toString() : ''
  );
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>(
    stock.chartTimeframe
  );
  const [customThresholds, setCustomThresholds] = useState(
    stock.alertSettings.customThresholds.join(', ')
  );
  const [alertsEnabled, setAlertsEnabled] = useState(stock.alertSettings.enabled);
  const [preferredProvider, setPreferredProvider] = useState<ApiProvider | 'auto'>(
    stock.preferredProvider || 'auto'
  );
  const [isin, setIsin] = useState(stock.isin || '');
  const [exchange, setExchange] = useState(stock.exchange || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Purchased tracking
  const [isPurchased, setIsPurchased] = useState(!!stock.purchasedPrice);
  const [purchasedPrice, setPurchasedPrice] = useState(
    stock.purchasedPrice ? stock.purchasedPrice.toString() : ''
  );
  const [purchasedDate, setPurchasedDate] = useState(
    stock.purchasedDate ? stock.purchasedDate.split('T')[0] : new Date().toISOString().split('T')[0]
  );

  // Issue reporting
  const [showIssuePanel, setShowIssuePanel] = useState(false);
  const [selectedIssueType, setSelectedIssueType] = useState<StockIssueType | null>(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [issueDiagnosticLog, setIssueDiagnosticLog] = useState<string[]>([]);
  const [isReportingIssue, setIsReportingIssue] = useState(false);

  // Calculate what Yahoo symbol will be used
  const yahooSymbolPreview = useMemo(() => {
    return getYahooSymbolPreview(stock.ticker, exchange.trim() || stock.exchange);
  }, [stock.ticker, exchange, stock.exchange]);

  const handleSave = () => {
    const limitValue = buyLimit.trim() === '' ? null : parseFloat(buyLimit);

    if (limitValue !== null && (isNaN(limitValue) || limitValue <= 0)) {
      alert('Buy limit must be a positive number');
      return;
    }

    const thresholds = customThresholds
      .split(',')
      .map((t) => parseFloat(t.trim()))
      .filter((t) => !isNaN(t) && t > 0);

    // Handle purchased price
    let purchasedPriceValue: number | undefined = undefined;
    let purchasedDateValue: string | undefined = undefined;

    if (isPurchased) {
      const ppValue = parseFloat(purchasedPrice);
      if (!isNaN(ppValue) && ppValue > 0) {
        purchasedPriceValue = ppValue;
        purchasedDateValue = purchasedDate || new Date().toISOString().split('T')[0];
      }
    }

    // If marking as purchased (new) and callback provided, use markAsPurchased
    // This moves the stock from the tab to the purchasedStocks array
    if (isPurchased && purchasedPriceValue && onMarkAsPurchased && !isPurchasedStock && !stock.purchasedPrice) {
      // First save other updates
      onSave({
        displayName: displayName.trim() || undefined,
        buyLimit: limitValue,
        chartTimeframe,
        alertSettings: {
          customThresholds: thresholds,
          enabled: alertsEnabled,
        },
        preferredProvider: preferredProvider === 'auto' ? undefined : preferredProvider,
        isin: isin.trim() || undefined,
        exchange: exchange.trim() || stock.exchange,
      });
      // Then mark as purchased (this will move it to purchasedStocks)
      onMarkAsPurchased(purchasedPriceValue);
      onClose();
      return;
    }

    // Regular save (for purchased stocks being edited, or non-purchased stocks)
    onSave({
      displayName: displayName.trim() || undefined,
      buyLimit: limitValue,
      chartTimeframe,
      alertSettings: {
        customThresholds: thresholds,
        enabled: alertsEnabled,
      },
      preferredProvider: preferredProvider === 'auto' ? undefined : preferredProvider,
      isin: isin.trim() || undefined,
      exchange: exchange.trim() || stock.exchange,
      purchasedPrice: purchasedPriceValue,
      purchasedDate: purchasedDateValue,
    });

    onClose();
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete();
      onClose();
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const currencySymbol = stock.currency === 'EUR' ? '€' : '$';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${stock.ticker}`}>
      <div className="space-y-4">
        {/* Stock Info */}
        <div className="bg-[#2d2d2d] rounded-lg p-3">
          <div className="text-sm text-gray-400">{stock.name}</div>
          <div className="text-xl font-semibold text-white mt-1">
            {currencySymbol}
            {stock.currentPrice.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stock.exchange} • {stock.currency}
          </div>
        </div>

        {/* ISIN */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">ISIN</label>
          <input
            type="text"
            value={isin}
            onChange={(e) => setIsin(e.target.value.toUpperCase())}
            placeholder="e.g., US0378331005"
            className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white font-mono text-sm focus:outline-none focus:border-white/30"
          />
          <p className="text-xs text-gray-500 mt-1">
            International Securities Identification Number
          </p>
        </div>

        {/* Exchange */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Exchange</label>
          <input
            type="text"
            value={exchange}
            onChange={(e) => setExchange(e.target.value.toUpperCase())}
            placeholder="e.g., NASDAQ, NYSE, AMS"
            className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white font-mono text-sm focus:outline-none focus:border-white/30"
          />
          <p className="text-xs text-gray-500 mt-1">
            Change if stock shows wrong exchange (affects API lookup)
          </p>
          <p className="text-xs text-[#00ff88] mt-1 font-mono">
            Yahoo symbol: {yahooSymbolPreview}
          </p>
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={stock.name}
            className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white font-mono focus:outline-none focus:border-white/30"
          />
          <p className="text-xs text-gray-500 mt-1">
            Custom name to display instead of official name (useful for Chinese stocks)
          </p>
        </div>

        {/* Buy Limit */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Buy Limit</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {currencySymbol}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={buyLimit}
              onChange={(e) => setBuyLimit(e.target.value)}
              placeholder="Enter buy limit"
              className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-3 pl-8 pr-4 text-white text-lg focus:outline-none focus:border-white/30"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Leave empty to disable limit tracking
          </p>
        </div>

        {/* Chart Timeframe */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Default Chart Timeframe
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['7d', '30d', '90d', '1y'] as ChartTimeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setChartTimeframe(tf)}
                className={`py-2 rounded-lg text-sm transition-colors ${
                  chartTimeframe === tf
                    ? 'bg-white/20 text-white'
                    : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred API Provider */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Preferred API Provider
          </label>
          <select
            value={preferredProvider}
            onChange={(e) => setPreferredProvider(e.target.value as ApiProvider | 'auto')}
            className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
          >
            <option value="auto">Auto (try all providers)</option>
            <option value="twelvedata">Twelve Data</option>
            <option value="alphavantage">Alpha Vantage</option>
            <option value="yahoo">Yahoo Finance (free, no key)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Force using a specific API for this stock (useful if one doesn't support it)
          </p>
        </div>

        {/* Purchased Tracking */}
        <div className="border border-[#3d3d3d] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-white font-medium">Gekocht</label>
              <p className="text-xs text-gray-500">
                Markeer als gekocht om winst/verlies te tracken
              </p>
            </div>
            <button
              onClick={() => {
                setIsPurchased(!isPurchased);
                if (!isPurchased && !purchasedPrice) {
                  // Default to buy limit or current price when enabling
                  setPurchasedPrice(
                    stock.buyLimit?.toString() || stock.currentPrice.toString()
                  );
                }
              }}
              className={`w-12 h-6 rounded-full transition-colors ${
                isPurchased ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  isPurchased ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {isPurchased && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Aankoopprijs</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={purchasedPrice}
                    onChange={(e) => setPurchasedPrice(e.target.value)}
                    placeholder="Aankoopprijs"
                    className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 pl-8 pr-4 text-white focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Aankoopdatum</label>
                <input
                  type="date"
                  value={purchasedDate}
                  onChange={(e) => setPurchasedDate(e.target.value)}
                  className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
                />
              </div>
              {purchasedPrice && parseFloat(purchasedPrice) > 0 && (
                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Huidige winst/verlies</span>
                    <span className={`font-mono ${
                      stock.currentPrice >= parseFloat(purchasedPrice) ? 'text-[#00ff88]' : 'text-red-400'
                    }`}>
                      {stock.currentPrice >= parseFloat(purchasedPrice) ? '+' : ''}
                      {((stock.currentPrice - parseFloat(purchasedPrice)) / parseFloat(purchasedPrice) * 100).toFixed(1)}%
                      ({currencySymbol}{(stock.currentPrice - parseFloat(purchasedPrice)).toFixed(2)})
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Alert Settings */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">Alerts Enabled</label>
            <button
              onClick={() => setAlertsEnabled(!alertsEnabled)}
              className={`w-12 h-6 rounded-full transition-colors ${
                alertsEnabled ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  alertsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Custom Thresholds */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Custom Alert Thresholds (%)
          </label>
          <input
            type="text"
            value={customThresholds}
            onChange={(e) => setCustomThresholds(e.target.value)}
            placeholder="e.g., 2, 3, 7"
            className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
          />
          <p className="text-xs text-gray-500 mt-1">
            Comma-separated percentages for custom alerts
          </p>
        </div>

        {/* Issue Reporting */}
        <div className="border border-[#3d3d3d] rounded-lg p-4 space-y-3">
          <button
            onClick={() => setShowIssuePanel(!showIssuePanel)}
            className="flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            <ExclamationTriangleIcon className="w-4 h-4" />
            Er gaat iets mis met dit aandeel
          </button>

          {showIssuePanel && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Wat is het probleem?</label>
                <div className="space-y-2">
                  {ISSUE_TYPES.map((issue) => (
                    <button
                      key={issue.value}
                      onClick={() => setSelectedIssueType(issue.value)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedIssueType === issue.value
                          ? 'bg-yellow-500/20 border border-yellow-500/50'
                          : 'bg-[#2d2d2d] hover:bg-[#3d3d3d] border border-transparent'
                      }`}
                    >
                      <div className="text-sm text-white font-medium">{issue.label}</div>
                      <div className="text-xs text-gray-400">{issue.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedIssueType && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Extra informatie (optioneel)</label>
                    <textarea
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      placeholder="Beschrijf het probleem in meer detail..."
                      className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white text-sm focus:outline-none focus:border-white/30 resize-none"
                      rows={3}
                    />
                  </div>

                  <button
                    onClick={async () => {
                      if (!selectedIssueType || !onReportIssue) return;
                      setIsReportingIssue(true);
                      setIssueDiagnosticLog(['Diagnose starten...']);

                      try {
                        const log = await onReportIssue(selectedIssueType, issueDescription);
                        setIssueDiagnosticLog(log);
                      } catch (error) {
                        setIssueDiagnosticLog(['Fout bij diagnose: ' + String(error)]);
                      } finally {
                        setIsReportingIssue(false);
                      }
                    }}
                    disabled={isReportingIssue}
                    className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isReportingIssue ? 'Bezig met diagnose...' : 'Diagnose starten'}
                  </button>
                </>
              )}

              {issueDiagnosticLog.length > 0 && (
                <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-1">
                  <div className="text-xs text-gray-400 font-medium mb-2">Diagnose log:</div>
                  <div className="font-mono text-xs space-y-0.5 max-h-40 overflow-y-auto">
                    {issueDiagnosticLog.map((line, i) => (
                      <div key={i} className="text-gray-300">{line}</div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const logText = [
                        `Stock Issue Report - ${stock.ticker}`,
                        `Issue Type: ${selectedIssueType}`,
                        `Description: ${issueDescription || 'None'}`,
                        `Exchange: ${stock.exchange}`,
                        `Current Price: ${stock.currentPrice}`,
                        `Yahoo Symbol: ${yahooSymbolPreview}`,
                        '',
                        'Diagnostic Log:',
                        ...issueDiagnosticLog,
                      ].join('\n');
                      navigator.clipboard.writeText(logText);
                      alert('Log gekopieerd naar klembord!');
                    }}
                    className="mt-2 text-xs text-[#00ff88] hover:text-[#00dd77] transition-colors"
                  >
                    Kopieer log voor support
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium rounded-lg transition-colors"
          >
            Opslaan
          </button>
          <button
            onClick={handleDelete}
            className={`px-4 py-2 rounded-lg transition-colors ${
              showDeleteConfirm
                ? 'bg-[#ff3366] text-white'
                : 'bg-[#3d3d3d] text-gray-400 hover:text-[#ff3366]'
            }`}
          >
            {showDeleteConfirm ? 'Bevestigen' : 'Verwijder'}
          </button>
        </div>

        {showDeleteConfirm && (
          <p className="text-xs text-[#ff3366] text-center">
            Klik nogmaals om te bevestigen
          </p>
        )}
      </div>
    </Modal>
  );
}
