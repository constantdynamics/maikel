'use client';

import { useState, useEffect } from 'react';
import type { UserSettings, ApiProvider, ChartTimeframe, FontSize, ColorScheme, ApiKeyConfig, Tab, ArchivedStock, PurchasedStock, LimitHistory, ColumnVisibility, ViewMode, HeaderButtonVisibility, BuySignalDisplayOptions, FixedTabColors, ScanPriorityWeights } from '@/lib/defog/types';
import { Modal } from './Modal';
import { VERSION, BUILD_DATE } from '@/lib/defog/version';
import { getAllApiUsage, resetAllUsage } from '@/lib/defog/services/rateLimiter';
import { PlusIcon, TrashIcon, DevicePhoneMobileIcon, ComputerDesktopIcon, ArrowsRightLeftIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import {
  requestNotificationPermission,
  getNotificationPermission,
  isNotificationSupported,
  canShowInstallPrompt,
  showInstallPrompt,
  isAppInstalled,
} from '@/lib/defog/services/notifications';
import { CloudSync } from './CloudSync';
import { DEFAULT_SCAN_WEIGHTS } from '@/lib/defog/services/autoScanService';

interface SettingsProps {
  settings: UserSettings;
  tabs: Tab[];
  archive: ArchivedStock[];
  purchasedStocks: PurchasedStock[];
  limitHistory: LimitHistory[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: Partial<UserSettings>) => void;
  onCloudDataLoaded: (data: {
    tabs: Tab[];
    archive: ArchivedStock[];
    purchasedStocks?: PurchasedStock[];
    settings: UserSettings;
    limitHistory: LimitHistory[];
  }) => void;
  onLogout: () => void;
}

const API_PROVIDERS: { value: ApiProvider; label: string; description: string }[] = [
  { value: 'twelvedata', label: 'Twelve Data', description: '800/day' },
  { value: 'alphavantage', label: 'Alpha Vantage', description: '25/day' },
  { value: 'fmp', label: 'FMP', description: '250/day' },
];

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const COLOR_SCHEMES: { value: ColorScheme; label: string; bg: string; accent: string }[] = [
  { value: 'dark', label: 'Dark', bg: '#1a1a1a', accent: '#3b82f6' },
  { value: 'midnight', label: 'Midnight', bg: '#0f172a', accent: '#6366f1' },
  { value: 'ocean', label: 'Ocean', bg: '#0c1929', accent: '#06b6d4' },
  { value: 'forest', label: 'Forest', bg: '#14201a', accent: '#00ff88' },
];

export function Settings({
  settings,
  tabs,
  archive,
  purchasedStocks,
  limitHistory,
  isOpen,
  onClose,
  onSave,
  onCloudDataLoaded,
  onLogout,
}: SettingsProps) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [apiProvider, setApiProvider] = useState(settings.apiProvider);
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig[]>(settings.apiKeys || []);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    settings.notifications.enabled
  );
  const [audioEnabled, setAudioEnabled] = useState(
    settings.notifications.audioEnabled
  );
  const [pushEnabled, setPushEnabled] = useState(
    settings.notifications.pushEnabled || false
  );
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(
    settings.notifications.quietHours?.enabled || false
  );
  const [quietHoursStart, setQuietHoursStart] = useState(
    settings.notifications.quietHours?.start || '22:00'
  );
  const [quietHoursEnd, setQuietHoursEnd] = useState(
    settings.notifications.quietHours?.end || '08:00'
  );
  const [dailyDropAlert, setDailyDropAlert] = useState(
    settings.notifications.dailyDropAlert?.toString() || ''
  );
  const [thresholds, setThresholds] = useState(
    settings.notifications.thresholds.join(', ')
  );
  const [globalTimeframe, setGlobalTimeframe] = useState<ChartTimeframe | null>(
    settings.globalChartTimeframe
  );
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>(settings.fontSize || 'medium');
  const [colorScheme, setColorScheme] = useState<ColorScheme>(settings.colorScheme || 'dark');
  const [viewMode, setViewMode] = useState<ViewMode>(settings.viewMode || 'auto');
  const [mobileColumnVisibility, setMobileColumnVisibility] = useState<ColumnVisibility>(
    settings.mobileColumnVisibility || {
      name: false,
      price: true,
      limit: false,
      distance: true,
      dayChange: true,
      range: false,
      rangeDelta: false,
      chart: false,
      currency: true,
    }
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiUsageByProvider, setApiUsageByProvider] = useState<Map<ApiProvider, { count: number; limit: number; resetTime: number }>>(new Map());
  const [headerButtonVisibility, setHeaderButtonVisibility] = useState<HeaderButtonVisibility>(
    settings.headerButtonVisibility || {
      search: true,
      apiStatus: true,
      debugLog: false,
      refresh: true,
      notifications: true,
      archive: true,
      settings: true,
      syncStatus: true,
    }
  );
  const [buySignalDisplay, setBuySignalDisplay] = useState<BuySignalDisplayOptions>(
    settings.buySignalDisplay || {
      showTabName: false,
      compactMode: true,
    }
  );
  const [fixedTabColors, setFixedTabColors] = useState<FixedTabColors>(
    settings.fixedTabColors || {
      all: 'rainbow',
      topGainers: '#00ff88',
      topLosers: '#ff3366',
      purchased: '#00ff88',
    }
  );
  const [scanWeights, setScanWeights] = useState<ScanPriorityWeights>(
    settings.scanPriorityWeights || DEFAULT_SCAN_WEIGHTS
  );

  // Update API usage display
  useEffect(() => {
    if (isOpen) {
      setApiUsageByProvider(getAllApiUsage());

      const interval = setInterval(() => {
        setApiUsageByProvider(getAllApiUsage());
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Check notification permission and PWA status
  useEffect(() => {
    if (isOpen) {
      setNotificationPermission(getNotificationPermission());
      setCanInstall(canShowInstallPrompt());
      setIsInstalled(isAppInstalled());
    }
  }, [isOpen]);

  // Sync state when settings change
  useEffect(() => {
    setApiKey(settings.apiKey);
    setApiProvider(settings.apiProvider);
    setApiKeys(settings.apiKeys || []);
    setFontSize(settings.fontSize || 'medium');
    setColorScheme(settings.colorScheme || 'dark');
    setViewMode(settings.viewMode || 'auto');
    setMobileColumnVisibility(settings.mobileColumnVisibility || {
      name: false,
      price: true,
      limit: false,
      distance: true,
      dayChange: true,
      range: false,
      rangeDelta: false,
      chart: false,
      currency: true,
    });
    setHeaderButtonVisibility(settings.headerButtonVisibility || {
      search: true,
      apiStatus: true,
      debugLog: false,
      refresh: true,
      notifications: true,
      archive: true,
      settings: true,
      syncStatus: true,
    });
    setBuySignalDisplay(settings.buySignalDisplay || {
      showTabName: false,
      compactMode: true,
    });
    setFixedTabColors(settings.fixedTabColors || {
      all: 'rainbow',
      topGainers: '#00ff88',
      topLosers: '#ff3366',
      purchased: '#00ff88',
    });
    setScanWeights(settings.scanPriorityWeights || DEFAULT_SCAN_WEIGHTS);
  }, [settings]);

  const handleSave = () => {
    const parsedThresholds = thresholds
      .split(',')
      .map((t) => parseFloat(t.trim()))
      .filter((t) => !isNaN(t) && t > 0)
      .sort((a, b) => a - b);

    const parsedDailyDrop = dailyDropAlert
      ? parseFloat(dailyDropAlert)
      : null;

    onSave({
      apiKey,
      apiProvider,
      apiKeys: apiKeys.filter(k => k.apiKey), // Only save keys that have values
      notifications: {
        enabled: notificationsEnabled,
        audioEnabled,
        pushEnabled,
        thresholds: parsedThresholds,
        quietHours: {
          enabled: quietHoursEnabled,
          start: quietHoursStart,
          end: quietHoursEnd,
        },
        dailyDropAlert: parsedDailyDrop && !isNaN(parsedDailyDrop) ? parsedDailyDrop : null,
      },
      globalChartTimeframe: globalTimeframe,
      fontSize,
      colorScheme,
      viewMode,
      mobileColumnVisibility,
      headerButtonVisibility,
      buySignalDisplay,
      fixedTabColors,
      scanPriorityWeights: scanWeights,
    });

    onClose();
  };

  // Toggle header button visibility
  const toggleHeaderButton = (button: keyof HeaderButtonVisibility) => {
    setHeaderButtonVisibility(prev => ({
      ...prev,
      [button]: !prev[button],
    }));
  };

  // Toggle mobile column visibility
  const toggleMobileColumn = (column: keyof ColumnVisibility) => {
    setMobileColumnVisibility(prev => ({
      ...prev,
      [column]: !prev[column],
    }));
  };

  const handleRequestNotificationPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      setPushEnabled(true);
    }
  };

  const handleInstallApp = async () => {
    const installed = await showInstallPrompt();
    if (installed) {
      setIsInstalled(true);
      setCanInstall(false);
    }
  };

  const formatResetTime = (resetTime: number) => {
    const now = Date.now();
    const diff = resetTime - now;
    if (diff <= 0) return 'Now';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const addApiKey = () => {
    // Find a provider not already in use
    const usedProviders = new Set([apiProvider, ...apiKeys.map(k => k.provider)]);
    const availableProvider = API_PROVIDERS.find(p => !usedProviders.has(p.value));

    if (availableProvider) {
      setApiKeys([...apiKeys, { provider: availableProvider.value, apiKey: '', enabled: true }]);
    }
  };

  const updateApiKeyConfig = (index: number, updates: Partial<ApiKeyConfig>) => {
    const newKeys = [...apiKeys];
    newKeys[index] = { ...newKeys[index], ...updates };
    setApiKeys(newKeys);
  };

  // Export portfolio to CSV
  const handleExportCSV = () => {
    // Build CSV content
    const headers = [
      'Tab',
      'Ticker',
      'Name',
      'Price',
      'Currency',
      'Buy Limit',
      'Distance (%)',
      'Day Change',
      'Day Change (%)',
      '52W High',
      '52W Low',
      'Exchange',
    ];

    const rows: string[][] = [];

    // Export all stocks from all tabs
    for (const tab of tabs) {
      for (const stock of tab.stocks) {
        const distance = stock.buyLimit
          ? (((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100).toFixed(2)
          : '';

        rows.push([
          tab.name,
          stock.ticker,
          stock.name || '',
          stock.currentPrice?.toFixed(2) || '',
          stock.currency || 'USD',
          stock.buyLimit?.toFixed(2) || '',
          distance,
          stock.dayChange?.toFixed(2) || '',
          stock.dayChangePercent?.toFixed(2) || '',
          stock.week52High?.toFixed(2) || '',
          stock.week52Low?.toFixed(2) || '',
          stock.exchange || '',
        ]);
      }
    }

    // Add archived stocks
    for (const archived of archive) {
      const profitPercent = archived.purchasePrice && archived.currentPrice
        ? (((archived.currentPrice - archived.purchasePrice) / archived.purchasePrice) * 100).toFixed(2)
        : '';

      rows.push([
        'Archived',
        archived.ticker,
        archived.name || '',
        archived.currentPrice?.toFixed(2) || '',
        archived.currency || 'USD',
        archived.purchasePrice?.toFixed(2) || '',
        profitPercent,
        '',
        '',
        '',
        '',
        archived.exchange || '',
      ]);
    }

    // Create CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `defog-portfolio-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export all data as JSON for browser migration
  const handleExportJSON = () => {
    const exportData = {
      version: VERSION,
      exportDate: new Date().toISOString(),
      tabs,
      archive,
      purchasedStocks,
      settings,
      limitHistory,
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `defog-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import data from JSON file
  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importData = JSON.parse(text);

        // Validate the imported data structure
        if (!importData.tabs || !Array.isArray(importData.tabs)) {
          alert('Ongeldig bestand: geen tabs gevonden');
          return;
        }

        // Confirm import
        const stockCount = importData.tabs.reduce((sum: number, tab: Tab) => sum + (tab.stocks?.length || 0), 0);
        const archiveCount = importData.archive?.length || 0;
        const confirmed = window.confirm(
          `Weet je zeker dat je deze data wilt importeren?\n\n` +
          `• ${importData.tabs.length} tabbladen\n` +
          `• ${stockCount} aandelen\n` +
          `• ${archiveCount} gearchiveerd\n\n` +
          `Dit vervangt al je huidige data!`
        );

        if (!confirmed) return;

        // Load the imported data
        onCloudDataLoaded({
          tabs: importData.tabs,
          archive: importData.archive || [],
          purchasedStocks: importData.purchasedStocks || [],
          settings: importData.settings || settings,
          limitHistory: importData.limitHistory || [],
        });

        alert('Data succesvol geïmporteerd!');
        onClose();
      } catch (err) {
        console.error('Import error:', err);
        alert('Fout bij importeren: ongeldig JSON bestand');
      }
    };
    input.click();
  };

  const removeApiKey = (index: number) => {
    setApiKeys(apiKeys.filter((_, i) => i !== index));
  };

  // Get total usage across all configured providers
  const getTotalUsage = () => {
    let totalUsed = 0;
    let totalLimit = 0;

    // Primary provider
    const primaryUsage = apiUsageByProvider.get(apiProvider);
    if (primaryUsage && apiKey) {
      totalUsed += primaryUsage.count;
      totalLimit += primaryUsage.limit;
    }

    // Additional providers
    for (const config of apiKeys) {
      if (config.enabled && config.apiKey) {
        const usage = apiUsageByProvider.get(config.provider);
        if (usage) {
          totalUsed += usage.count;
          totalLimit += usage.limit;
        }
      }
    }

    return { used: totalUsed, limit: totalLimit || 100 };
  };

  const totalUsage = getTotalUsage();
  const usagePercent = (totalUsage.used / totalUsage.limit) * 100;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" size="md">
      <div className="space-y-6">
        {/* API Configuration */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3">
            API Configuration
          </h3>

          <div className="space-y-3">
            {/* Primary API */}
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="text-xs text-gray-400 mb-2">Primary API</div>
              <div className="space-y-2">
                <select
                  value={apiProvider}
                  onChange={(e) => setApiProvider(e.target.value as ApiProvider)}
                  className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-white/30"
                >
                  {API_PROVIDERS.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label} ({provider.description})
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg py-2 px-3 pr-16 text-white text-sm focus:outline-none focus:border-white/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white px-2 py-1"
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            </div>

            {/* Additional API Keys */}
            {apiKeys.map((config, index) => {
              const usage = apiUsageByProvider.get(config.provider);
              return (
                <div key={index} className="p-3 bg-[#2d2d2d] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-gray-400">Additional API #{index + 1}</div>
                    <button
                      onClick={() => removeApiKey(index)}
                      className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-red-400"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={config.provider}
                        onChange={(e) => updateApiKeyConfig(index, { provider: e.target.value as ApiProvider })}
                        className="flex-1 bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-white/30"
                      >
                        {API_PROVIDERS.map((provider) => (
                          <option key={provider.value} value={provider.value}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => updateApiKeyConfig(index, { enabled: !config.enabled })}
                        className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                          config.enabled ? 'bg-[#00ff88] text-black' : 'bg-[#3d3d3d] text-gray-400'
                        }`}
                      >
                        {config.enabled ? 'On' : 'Off'}
                      </button>
                    </div>
                    <input
                      type="password"
                      value={config.apiKey}
                      onChange={(e) => updateApiKeyConfig(index, { apiKey: e.target.value })}
                      placeholder="API key"
                      className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-white/30"
                    />
                    {usage && config.apiKey && (
                      <div className="text-xs text-gray-500">
                        {usage.count}/{usage.limit} used · Resets in {formatResetTime(usage.resetTime)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add API button */}
            {apiKeys.length < 2 && (
              <button
                onClick={addApiKey}
                className="w-full py-2 border border-dashed border-[#3d3d3d] hover:border-[#00ff88] text-gray-400 hover:text-[#00ff88] rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Another API
              </button>
            )}

            {/* Combined API Usage */}
            <div className="bg-[#1a1a1a] rounded-lg p-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Combined API Usage</span>
                <span>{totalUsage.used} / {totalUsage.limit}</span>
              </div>
              <div className="h-2 bg-[#3d3d3d] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usagePercent > 80 ? 'bg-[#ff3366]' : usagePercent > 50 ? 'bg-[#ffaa00]' : 'bg-[#00ff88]'
                  }`}
                  style={{ width: `${Math.min(100, usagePercent)}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-600">
                  Tip: Add multiple API keys to increase your daily quota
                </p>
                <button
                  onClick={() => {
                    resetAllUsage();
                    setApiUsageByProvider(getAllApiUsage());
                  }}
                  className="text-xs px-2 py-1 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-gray-400 hover:text-white rounded transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Display Settings */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3">Display</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Font Size</label>
              <div className="grid grid-cols-3 gap-2">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size.value}
                    onClick={() => setFontSize(size.value)}
                    className={`py-2 rounded-lg text-sm transition-colors ${
                      fontSize === size.value
                        ? 'bg-white/20 text-white'
                        : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
                    }`}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Color Scheme</label>
              <div className="grid grid-cols-2 gap-2">
                {COLOR_SCHEMES.map((scheme) => (
                  <button
                    key={scheme.value}
                    onClick={() => setColorScheme(scheme.value)}
                    className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                      colorScheme === scheme.value
                        ? 'ring-2 ring-white/50'
                        : 'hover:bg-white/5'
                    }`}
                    style={{ backgroundColor: scheme.bg }}
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: scheme.accent }}
                    />
                    <span className="text-sm text-white">{scheme.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Fixed Tab Colors */}
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <label className="block text-sm text-gray-400 mb-3">Tab Kleuren</label>
              <div className="space-y-3">
                {/* All tab */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">🌈 Alles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFixedTabColors(prev => ({ ...prev, all: 'rainbow' }))}
                      className={`px-2 py-1 text-xs rounded ${
                        fixedTabColors.all === 'rainbow'
                          ? 'bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white'
                          : 'bg-[#3d3d3d] text-gray-400 hover:bg-[#4d4d4d]'
                      }`}
                    >
                      Rainbow
                    </button>
                    <input
                      type="color"
                      value={fixedTabColors.all === 'rainbow' ? '#3b82f6' : fixedTabColors.all}
                      onChange={(e) => setFixedTabColors(prev => ({ ...prev, all: e.target.value }))}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent"
                    />
                  </div>
                </div>

                {/* Top Gainers */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: fixedTabColors.topGainers }}>↑</span>
                    <span className="text-sm text-white">Top Stijgers</span>
                  </div>
                  <input
                    type="color"
                    value={fixedTabColors.topGainers}
                    onChange={(e) => setFixedTabColors(prev => ({ ...prev, topGainers: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent"
                  />
                </div>

                {/* Top Losers */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: fixedTabColors.topLosers }}>↓</span>
                    <span className="text-sm text-white">Top Dalers</span>
                  </div>
                  <input
                    type="color"
                    value={fixedTabColors.topLosers}
                    onChange={(e) => setFixedTabColors(prev => ({ ...prev, topLosers: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent"
                  />
                </div>

                {/* Purchased */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💰</span>
                    <span className="text-sm text-white">Gekocht</span>
                  </div>
                  <input
                    type="color"
                    value={fixedTabColors.purchased}
                    onChange={(e) => setFixedTabColors(prev => ({ ...prev, purchased: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </div>

            {/* View Mode */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Weergave Modus</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setViewMode('auto')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-colors ${
                    viewMode === 'auto'
                      ? 'bg-[#00ff88]/20 ring-1 ring-[#00ff88]'
                      : 'bg-[#2d2d2d] hover:bg-[#3d3d3d]'
                  }`}
                >
                  <ArrowsRightLeftIcon className={`w-5 h-5 ${viewMode === 'auto' ? 'text-[#00ff88]' : 'text-gray-400'}`} />
                  <span className={`text-xs ${viewMode === 'auto' ? 'text-[#00ff88]' : 'text-gray-400'}`}>Auto</span>
                </button>
                <button
                  onClick={() => setViewMode('mobile')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-colors ${
                    viewMode === 'mobile'
                      ? 'bg-[#00ff88]/20 ring-1 ring-[#00ff88]'
                      : 'bg-[#2d2d2d] hover:bg-[#3d3d3d]'
                  }`}
                >
                  <DevicePhoneMobileIcon className={`w-5 h-5 ${viewMode === 'mobile' ? 'text-[#00ff88]' : 'text-gray-400'}`} />
                  <span className={`text-xs ${viewMode === 'mobile' ? 'text-[#00ff88]' : 'text-gray-400'}`}>Mobiel</span>
                </button>
                <button
                  onClick={() => setViewMode('desktop')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-colors ${
                    viewMode === 'desktop'
                      ? 'bg-[#00ff88]/20 ring-1 ring-[#00ff88]'
                      : 'bg-[#2d2d2d] hover:bg-[#3d3d3d]'
                  }`}
                >
                  <ComputerDesktopIcon className={`w-5 h-5 ${viewMode === 'desktop' ? 'text-[#00ff88]' : 'text-gray-400'}`} />
                  <span className={`text-xs ${viewMode === 'desktop' ? 'text-[#00ff88]' : 'text-gray-400'}`}>Desktop</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Auto past automatisch aan op schermgrootte
              </p>
            </div>

            {/* Mobile Column Visibility */}
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <DevicePhoneMobileIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300">Mobiele weergave kolommen</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'name', label: 'Naam' },
                  { key: 'price', label: 'Prijs' },
                  { key: 'limit', label: 'Limiet' },
                  { key: 'distance', label: 'Afstand' },
                  { key: 'dayChange', label: 'Dag %' },
                  { key: 'range', label: 'Range' },
                  { key: 'rangeDelta', label: 'Range Δ' },
                  { key: 'chart', label: 'Chart' },
                  { key: 'currency', label: 'Valuta' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={mobileColumnVisibility[key as keyof ColumnVisibility]}
                      onChange={() => toggleMobileColumn(key as keyof ColumnVisibility)}
                      className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0"
                    />
                    <span className="text-xs text-gray-400">{label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Deze kolommen worden getoond in de compacte mobiele weergave
              </p>
            </div>

            {/* Header Button Visibility */}
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="text-sm text-gray-300 mb-3">Header knoppen</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'search', label: 'Zoeken' },
                  { key: 'apiStatus', label: 'API Status' },
                  { key: 'debugLog', label: 'Debug Log' },
                  { key: 'refresh', label: 'Ververs' },
                  { key: 'notifications', label: 'Notificaties' },
                  { key: 'archive', label: 'Archief' },
                  { key: 'syncStatus', label: 'Sync Status' },
                  { key: 'settings', label: 'Instellingen' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={headerButtonVisibility[key as keyof HeaderButtonVisibility]}
                      onChange={() => toggleHeaderButton(key as keyof HeaderButtonVisibility)}
                      className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0"
                    />
                    <span className="text-xs text-gray-400">{label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Kies welke knoppen zichtbaar zijn in de header
              </p>
            </div>

            {/* Buy Signal Display Options */}
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="text-sm text-gray-300 mb-3">Buy Signals weergave</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Toon tabnaam</label>
                  <button
                    onClick={() => setBuySignalDisplay(prev => ({ ...prev, showTabName: !prev.showTabName }))}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      buySignalDisplay.showTabName ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        buySignalDisplay.showTabName ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Compacte weergave</label>
                  <button
                    onClick={() => setBuySignalDisplay(prev => ({ ...prev, compactMode: !prev.compactMode }))}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      buySignalDisplay.compactMode ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        buySignalDisplay.compactMode ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Kleurindicator toont altijd tot welk tabblad het aandeel behoort
              </p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3">Notifications</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">
                Enable Notifications
              </label>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  notificationsEnabled ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    notificationsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="text-sm text-gray-400">Push Notifications</label>
                {!isNotificationSupported() && (
                  <p className="text-xs text-yellow-500">Niet ondersteund in deze browser</p>
                )}
                {isNotificationSupported() && notificationPermission === 'denied' && (
                  <p className="text-xs text-red-400">Geblokkeerd in browser settings</p>
                )}
              </div>
              {isNotificationSupported() && notificationPermission !== 'granted' ? (
                <button
                  onClick={handleRequestNotificationPermission}
                  className="px-3 py-1 text-xs bg-[#00ff88] text-black rounded hover:bg-[#00dd77] transition-colors"
                  disabled={notificationPermission === 'denied'}
                >
                  Toestaan
                </button>
              ) : (
                <button
                  onClick={() => setPushEnabled(!pushEnabled)}
                  disabled={notificationPermission !== 'granted'}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    pushEnabled && notificationPermission === 'granted' ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      pushEnabled && notificationPermission === 'granted' ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">Audio Alerts</label>
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  audioEnabled ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    audioEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Quiet Hours */}
            <div className="p-3 bg-[#2d2d2d] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-400">Stille uren</label>
                <button
                  onClick={() => setQuietHoursEnabled(!quietHoursEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    quietHoursEnabled ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      quietHoursEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {quietHoursEnabled && (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-white text-sm"
                  />
                  <span className="text-gray-400">tot</span>
                  <input
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-white text-sm"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Alert Thresholds (%)
              </label>
              <input
                type="text"
                value={thresholds}
                onChange={(e) => setThresholds(e.target.value)}
                placeholder="e.g., 1, 5, 10"
                className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
              />
              <p className="text-xs text-gray-500 mt-1">Alert wanneer koers binnen X% van buy limit komt</p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Dagelijkse daling alert (%)
              </label>
              <input
                type="number"
                value={dailyDropAlert}
                onChange={(e) => setDailyDropAlert(e.target.value)}
                placeholder="bv. 5"
                min="0"
                max="100"
                className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
              />
              <p className="text-xs text-gray-500 mt-1">Alert wanneer aandeel X% daalt op één dag (leeg = uit)</p>
            </div>
          </div>
        </div>

        {/* PWA Install */}
        {(canInstall || isInstalled) && (
          <div>
            <h3 className="text-sm font-medium text-white mb-3">App Installeren</h3>
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              {isInstalled ? (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <DevicePhoneMobileIcon className="w-5 h-5" />
                  App is geïnstalleerd
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <DevicePhoneMobileIcon className="w-5 h-5" />
                    Installeer als app
                  </div>
                  <button
                    onClick={handleInstallApp}
                    className="px-3 py-1 text-xs bg-[#00ff88] text-black rounded hover:bg-[#00dd77] transition-colors"
                  >
                    Installeren
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cloud Sync */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3">Cloud Sync</h3>
          <CloudSync
            tabs={tabs}
            archive={archive}
            settings={settings}
            limitHistory={limitHistory}
            onDataLoaded={onCloudDataLoaded}
          />
        </div>

        {/* Chart Settings */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3">Charts</h3>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Default Timeframe
            </label>
            <div className="grid grid-cols-5 gap-2">
              <button
                onClick={() => setGlobalTimeframe(null)}
                className={`py-2 rounded-lg text-sm transition-colors ${
                  globalTimeframe === null
                    ? 'bg-white/20 text-white'
                    : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
                }`}
              >
                Auto
              </button>
              {(['7d', '30d', '90d', '1y'] as ChartTimeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setGlobalTimeframe(tf)}
                  className={`py-2 rounded-lg text-sm transition-colors ${
                    globalTimeframe === tf
                      ? 'bg-white/20 text-white'
                      : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Export / Import */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3">Data Export / Import</h3>
          <div className="space-y-3">
            {/* Browser Migration - Full Backup */}
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm text-gray-300">Browser Migratie</div>
                  <div className="text-xs text-gray-500">
                    Volledige backup voor overzetten naar andere browser
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleExportJSON}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#00ff88] hover:bg-[#00dd77] text-black text-sm font-medium rounded-lg transition-colors"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Export Backup
                </button>
                <button
                  onClick={handleImportJSON}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  Import Backup
                </button>
              </div>
            </div>

            {/* CSV Export */}
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-300">Portfolio CSV</div>
                  <div className="text-xs text-gray-500">
                    {tabs.reduce((sum, tab) => sum + tab.stocks.length, 0)} aandelen + {archive.length} gearchiveerd
                  </div>
                </div>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-3 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scan Priority Settings */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3">Scan Prioriteit</h3>
          <p className="text-xs text-gray-500 mb-4">
            Stel in welke factoren de volgorde van scannen bepalen. Hogere waarde = meer invloed.
          </p>

          <div className="space-y-4">
            {/* Last Scan Time */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-300">Langst niet gescand eerst</label>
                <span className="text-xs text-gray-400 font-mono w-10 text-right">{scanWeights.lastScanTime}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={scanWeights.lastScanTime}
                onChange={(e) => setScanWeights(w => ({ ...w, lastScanTime: parseInt(e.target.value) }))}
                className="w-full h-2 bg-[#3d3d3d] rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
              />
              <p className="text-[10px] text-gray-600 mt-0.5">Aandelen die het langst niet gescand zijn krijgen voorrang</p>
            </div>

            {/* Distance to Limit */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-300">Dichtbij kooplimiet (&lt;15%)</label>
                <span className="text-xs text-gray-400 font-mono w-10 text-right">{scanWeights.distanceToLimit}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={scanWeights.distanceToLimit}
                onChange={(e) => setScanWeights(w => ({ ...w, distanceToLimit: parseInt(e.target.value) }))}
                className="w-full h-2 bg-[#3d3d3d] rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
              />
              <p className="text-[10px] text-gray-600 mt-0.5">Aandelen waarvan de afstand tot de limiet klein is krijgen voorrang</p>
            </div>

            {/* Volatility */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-300">Hoge mutaties (volatiliteit)</label>
                <span className="text-xs text-gray-400 font-mono w-10 text-right">{scanWeights.volatility}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={scanWeights.volatility}
                onChange={(e) => setScanWeights(w => ({ ...w, volatility: parseInt(e.target.value) }))}
                className="w-full h-2 bg-[#3d3d3d] rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
              />
              <p className="text-[10px] text-gray-600 mt-0.5">Aandelen met grote koersschommelingen worden vaker gescand</p>
            </div>

            {/* Rainbow Blocks */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-300">Regenboogblokjes (meest gevuld)</label>
                <span className="text-xs text-gray-400 font-mono w-10 text-right">{scanWeights.rainbowBlocks}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={scanWeights.rainbowBlocks}
                onChange={(e) => setScanWeights(w => ({ ...w, rainbowBlocks: parseInt(e.target.value) }))}
                className="w-full h-2 bg-[#3d3d3d] rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
              />
              <p className="text-[10px] text-gray-600 mt-0.5">Aandelen met de meeste regenboogblokjes (dichtst bij kooplimiet) worden het vaakst gescand. Aandelen zonder ingestelde limiet tonen geen blokjes.</p>
            </div>

            {/* Skip Error Stocks */}
            <div className="flex items-center justify-between py-2 border-t border-[#3d3d3d]">
              <div>
                <label className="text-sm text-gray-300">Fouten overslaan</label>
                <p className="text-[10px] text-gray-600">Aandelen met eerdere fouten later scannen</p>
              </div>
              <button
                onClick={() => setScanWeights(w => ({ ...w, skipErrorStocks: !w.skipErrorStocks }))}
                className={`w-12 h-6 rounded-full transition-colors ${
                  scanWeights.skipErrorStocks ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  scanWeights.skipErrorStocks ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Reset to defaults */}
            <button
              onClick={() => setScanWeights(DEFAULT_SCAN_WEIGHTS)}
              className="w-full py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors border border-[#3d3d3d]"
            >
              Reset naar standaard
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-[#3d3d3d]">
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium rounded-lg transition-colors"
          >
            Save
          </button>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-[#3d3d3d] hover:bg-[#ff3366] text-gray-400 hover:text-white rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Version Info */}
        <div className="pt-4 border-t border-[#3d3d3d] text-center">
          <p className="text-xs text-gray-500">
            Defog v{VERSION}
          </p>
          <p className="text-xs text-gray-600">
            {BUILD_DATE}
          </p>
        </div>
      </div>
    </Modal>
  );
}
