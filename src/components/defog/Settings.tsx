'use client';

import { useState, useEffect, useCallback } from 'react';
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

type SettingsTab = 'api' | 'display' | 'notifications' | 'data' | 'scan';

const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: 'api', label: 'API' },
  { key: 'display', label: 'Weergave' },
  { key: 'notifications', label: 'Notificaties' },
  { key: 'data', label: 'Data' },
  { key: 'scan', label: 'Scan' },
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('api');
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [apiProvider, setApiProvider] = useState(settings.apiProvider);
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig[]>(settings.apiKeys || []);
  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notifications.enabled);
  const [audioEnabled, setAudioEnabled] = useState(settings.notifications.audioEnabled);
  const [pushEnabled, setPushEnabled] = useState(settings.notifications.pushEnabled || false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(settings.notifications.quietHours?.enabled || false);
  const [quietHoursStart, setQuietHoursStart] = useState(settings.notifications.quietHours?.start || '22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState(settings.notifications.quietHours?.end || '08:00');
  const [dailyDropAlert, setDailyDropAlert] = useState(settings.notifications.dailyDropAlert?.toString() || '');
  const [thresholds, setThresholds] = useState(settings.notifications.thresholds.join(', '));
  const [globalTimeframe, setGlobalTimeframe] = useState<ChartTimeframe | null>(settings.globalChartTimeframe);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>(settings.fontSize || 'medium');
  const [colorScheme, setColorScheme] = useState<ColorScheme>(settings.colorScheme || 'dark');
  const [viewMode, setViewMode] = useState<ViewMode>(settings.viewMode || 'auto');
  const [mobileColumnVisibility, setMobileColumnVisibility] = useState<ColumnVisibility>(
    settings.mobileColumnVisibility || { name: false, price: true, limit: false, distance: true, dayChange: true, range: false, rangeDelta: false, chart: false, currency: true }
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiUsageByProvider, setApiUsageByProvider] = useState<Map<ApiProvider, { count: number; limit: number; resetTime: number }>>(new Map());
  const [headerButtonVisibility, setHeaderButtonVisibility] = useState<HeaderButtonVisibility>(
    settings.headerButtonVisibility || { search: true, apiStatus: true, debugLog: false, refresh: true, notifications: true, archive: true, settings: true, syncStatus: true }
  );
  const [buySignalDisplay, setBuySignalDisplay] = useState<BuySignalDisplayOptions>(
    settings.buySignalDisplay || { showTabName: false, compactMode: true }
  );
  const [fixedTabColors, setFixedTabColors] = useState<FixedTabColors>(
    settings.fixedTabColors || { all: 'rainbow', topGainers: '#00ff88', topLosers: '#ff3366', purchased: '#00ff88' }
  );
  const [scanWeights, setScanWeights] = useState<ScanPriorityWeights>(
    settings.scanPriorityWeights || DEFAULT_SCAN_WEIGHTS
  );

  useEffect(() => {
    if (isOpen) {
      setApiUsageByProvider(getAllApiUsage());
      const interval = setInterval(() => setApiUsageByProvider(getAllApiUsage()), 10000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setNotificationPermission(getNotificationPermission());
      setCanInstall(canShowInstallPrompt());
      setIsInstalled(isAppInstalled());
    }
  }, [isOpen]);

  useEffect(() => {
    setApiKey(settings.apiKey);
    setApiProvider(settings.apiProvider);
    setApiKeys(settings.apiKeys || []);
    setFontSize(settings.fontSize || 'medium');
    setColorScheme(settings.colorScheme || 'dark');
    setViewMode(settings.viewMode || 'auto');
    setMobileColumnVisibility(settings.mobileColumnVisibility || { name: false, price: true, limit: false, distance: true, dayChange: true, range: false, rangeDelta: false, chart: false, currency: true });
    setHeaderButtonVisibility(settings.headerButtonVisibility || { search: true, apiStatus: true, debugLog: false, refresh: true, notifications: true, archive: true, settings: true, syncStatus: true });
    setBuySignalDisplay(settings.buySignalDisplay || { showTabName: false, compactMode: true });
    setFixedTabColors(settings.fixedTabColors || { all: 'rainbow', topGainers: '#00ff88', topLosers: '#ff3366', purchased: '#00ff88' });
    setScanWeights(settings.scanPriorityWeights || DEFAULT_SCAN_WEIGHTS);
  }, [settings]);

  // Collect all current local state into a settings update
  const collectSettings = useCallback((): Partial<UserSettings> => {
    const parsedThresholds = thresholds.split(',').map((t) => parseFloat(t.trim())).filter((t) => !isNaN(t) && t > 0).sort((a, b) => a - b);
    const parsedDailyDrop = dailyDropAlert ? parseFloat(dailyDropAlert) : null;
    return {
      apiKey, apiProvider, apiKeys: apiKeys.filter(k => k.apiKey),
      notifications: { enabled: notificationsEnabled, audioEnabled, pushEnabled, thresholds: parsedThresholds, quietHours: { enabled: quietHoursEnabled, start: quietHoursStart, end: quietHoursEnd }, dailyDropAlert: parsedDailyDrop && !isNaN(parsedDailyDrop) ? parsedDailyDrop : null },
      globalChartTimeframe: globalTimeframe, fontSize, colorScheme, viewMode, mobileColumnVisibility, headerButtonVisibility, buySignalDisplay, fixedTabColors, scanPriorityWeights: scanWeights,
    };
  }, [apiKey, apiProvider, apiKeys, notificationsEnabled, audioEnabled, pushEnabled, thresholds, quietHoursEnabled, quietHoursStart, quietHoursEnd, dailyDropAlert, globalTimeframe, fontSize, colorScheme, viewMode, mobileColumnVisibility, headerButtonVisibility, buySignalDisplay, fixedTabColors, scanWeights]);

  // ALWAYS save when closing — whether via Save button or X/overlay close
  const handleClose = useCallback(() => {
    onSave(collectSettings());
    onClose();
  }, [onSave, onClose, collectSettings]);

  const handleSave = () => {
    onSave(collectSettings());
    onClose();
  };

  const toggleHeaderButton = (button: keyof HeaderButtonVisibility) => setHeaderButtonVisibility(prev => ({ ...prev, [button]: !prev[button] }));
  const toggleMobileColumn = (column: keyof ColumnVisibility) => setMobileColumnVisibility(prev => ({ ...prev, [column]: !prev[column] }));

  const handleRequestNotificationPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') setPushEnabled(true);
  };

  const handleInstallApp = async () => {
    const installed = await showInstallPrompt();
    if (installed) { setIsInstalled(true); setCanInstall(false); }
  };

  const formatResetTime = (resetTime: number) => {
    const diff = resetTime - Date.now();
    if (diff <= 0) return 'Now';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const addApiKey = () => {
    const usedProviders = new Set([apiProvider, ...apiKeys.map(k => k.provider)]);
    const available = API_PROVIDERS.find(p => !usedProviders.has(p.value));
    if (available) setApiKeys([...apiKeys, { provider: available.value, apiKey: '', enabled: true }]);
  };

  const updateApiKeyConfig = (index: number, updates: Partial<ApiKeyConfig>) => {
    const newKeys = [...apiKeys];
    newKeys[index] = { ...newKeys[index], ...updates };
    setApiKeys(newKeys);
  };

  const removeApiKey = (index: number) => setApiKeys(apiKeys.filter((_, i) => i !== index));

  const handleExportCSV = () => {
    const headers = ['Tab', 'Ticker', 'Name', 'Price', 'Currency', 'Buy Limit', 'Distance (%)', 'Day Change', 'Day Change (%)', '52W High', '52W Low', 'Exchange'];
    const rows: string[][] = [];
    for (const tab of tabs) {
      for (const stock of tab.stocks) {
        const distance = stock.buyLimit ? (((stock.currentPrice - stock.buyLimit) / stock.buyLimit) * 100).toFixed(2) : '';
        rows.push([tab.name, stock.ticker, stock.name || '', stock.currentPrice?.toFixed(2) || '', stock.currency || 'USD', stock.buyLimit?.toFixed(2) || '', distance, stock.dayChange?.toFixed(2) || '', stock.dayChangePercent?.toFixed(2) || '', stock.week52High?.toFixed(2) || '', stock.week52Low?.toFixed(2) || '', stock.exchange || '']);
      }
    }
    for (const a of archive) {
      const p = a.purchasePrice && a.currentPrice ? (((a.currentPrice - a.purchasePrice) / a.purchasePrice) * 100).toFixed(2) : '';
      rows.push(['Archived', a.ticker, a.name || '', a.currentPrice?.toFixed(2) || '', a.currency || 'USD', a.purchasePrice?.toFixed(2) || '', p, '', '', '', '', a.exchange || '']);
    }
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `defog-portfolio-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = { version: VERSION, exportDate: new Date().toISOString(), tabs, archive, purchasedStocks, settings, limitHistory };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `defog-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const importData = JSON.parse(await file.text());
        if (!importData.tabs || !Array.isArray(importData.tabs)) { alert('Ongeldig bestand: geen tabs gevonden'); return; }
        const stockCount = importData.tabs.reduce((sum: number, tab: Tab) => sum + (tab.stocks?.length || 0), 0);
        if (!window.confirm(`Importeren?\n\n• ${importData.tabs.length} tabbladen\n• ${stockCount} aandelen\n• ${importData.archive?.length || 0} gearchiveerd\n\nDit vervangt al je huidige data!`)) return;
        onCloudDataLoaded({ tabs: importData.tabs, archive: importData.archive || [], purchasedStocks: importData.purchasedStocks || [], settings: importData.settings || settings, limitHistory: importData.limitHistory || [] });
        alert('Data succesvol geïmporteerd!');
        onClose();
      } catch (err) { console.error('Import error:', err); alert('Fout bij importeren: ongeldig JSON bestand'); }
    };
    input.click();
  };

  const totalUsage = (() => {
    let used = 0, limit = 0;
    const pu = apiUsageByProvider.get(apiProvider);
    if (pu && apiKey) { used += pu.count; limit += pu.limit; }
    for (const c of apiKeys) { if (c.enabled && c.apiKey) { const u = apiUsageByProvider.get(c.provider); if (u) { used += u.count; limit += u.limit; } } }
    return { used, limit: limit || 100 };
  })();
  const usagePercent = (totalUsage.used / totalUsage.limit) * 100;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Settings" size="md">
      <div className="space-y-4">
        {/* Tab navigation — styled like main site settings */}
        <div className="flex items-center gap-1 border-b border-[#3d3d3d] -mx-1 px-1">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-[#00ff88] text-[#00ff88]'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== API TAB ===== */}
        {activeTab === 'api' && (
          <div className="space-y-4">
            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="text-xs text-gray-400 mb-2">Primary API</div>
              <div className="space-y-2">
                <select value={apiProvider} onChange={(e) => setApiProvider(e.target.value as ApiProvider)} className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-white/30">
                  {API_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label} ({p.description})</option>)}
                </select>
                <div className="relative">
                  <input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter your API key" className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg py-2 px-3 pr-16 text-white text-sm focus:outline-none focus:border-white/30" />
                  <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white px-2 py-1">{showApiKey ? 'Hide' : 'Show'}</button>
                </div>
              </div>
            </div>

            {apiKeys.map((config, index) => {
              const usage = apiUsageByProvider.get(config.provider);
              return (
                <div key={index} className="p-3 bg-[#2d2d2d] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-gray-400">Additional API #{index + 1}</div>
                    <button onClick={() => removeApiKey(index)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-red-400"><TrashIcon className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select value={config.provider} onChange={(e) => updateApiKeyConfig(index, { provider: e.target.value as ApiProvider })} className="flex-1 bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-white/30">
                        {API_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <button onClick={() => updateApiKeyConfig(index, { enabled: !config.enabled })} className={`px-3 py-2 rounded-lg text-xs transition-colors ${config.enabled ? 'bg-[#00ff88] text-black' : 'bg-[#3d3d3d] text-gray-400'}`}>{config.enabled ? 'On' : 'Off'}</button>
                    </div>
                    <input type="password" value={config.apiKey} onChange={(e) => updateApiKeyConfig(index, { apiKey: e.target.value })} placeholder="API key" className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-white/30" />
                    {usage && config.apiKey && <div className="text-xs text-gray-500">{usage.count}/{usage.limit} used · Resets in {formatResetTime(usage.resetTime)}</div>}
                  </div>
                </div>
              );
            })}

            {apiKeys.length < 2 && (
              <button onClick={addApiKey} className="w-full py-2 border border-dashed border-[#3d3d3d] hover:border-[#00ff88] text-gray-400 hover:text-[#00ff88] rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
                <PlusIcon className="w-4 h-4" />Add Another API
              </button>
            )}

            <div className="bg-[#1a1a1a] rounded-lg p-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Combined API Usage</span><span>{totalUsage.used} / {totalUsage.limit}</span></div>
              <div className="h-2 bg-[#3d3d3d] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${usagePercent > 80 ? 'bg-[#ff3366]' : usagePercent > 50 ? 'bg-[#ffaa00]' : 'bg-[#00ff88]'}`} style={{ width: `${Math.min(100, usagePercent)}%` }} />
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-600">Tip: Add multiple API keys to increase your daily quota</p>
                <button onClick={() => { resetAllUsage(); setApiUsageByProvider(getAllApiUsage()); }} className="text-xs px-2 py-1 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-gray-400 hover:text-white rounded transition-colors">Reset</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== DISPLAY TAB ===== */}
        {activeTab === 'display' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Font Size</label>
              <div className="grid grid-cols-3 gap-2">
                {FONT_SIZES.map((s) => (
                  <button key={s.value} onClick={() => setFontSize(s.value)} className={`py-2 rounded-lg text-sm transition-colors ${fontSize === s.value ? 'bg-white/20 text-white' : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'}`}>{s.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Color Scheme</label>
              <div className="grid grid-cols-2 gap-2">
                {COLOR_SCHEMES.map((s) => (
                  <button key={s.value} onClick={() => setColorScheme(s.value)} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${colorScheme === s.value ? 'ring-2 ring-white/50' : 'hover:bg-white/5'}`} style={{ backgroundColor: s.bg }}>
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: s.accent }} />
                    <span className="text-sm text-white">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <label className="block text-sm text-gray-400 mb-3">Tab Kleuren</label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">Alles</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setFixedTabColors(prev => ({ ...prev, all: 'rainbow' }))} className={`px-2 py-1 text-xs rounded ${fixedTabColors.all === 'rainbow' ? 'bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white' : 'bg-[#3d3d3d] text-gray-400'}`}>Rainbow</button>
                    <input type="color" value={fixedTabColors.all === 'rainbow' ? '#3b82f6' : fixedTabColors.all} onChange={(e) => setFixedTabColors(prev => ({ ...prev, all: e.target.value }))} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                  </div>
                </div>
                {([
                  { key: 'topGainers' as const, label: 'Top Stijgers', icon: '↑' },
                  { key: 'topLosers' as const, label: 'Top Dalers', icon: '↓' },
                  { key: 'purchased' as const, label: 'Gekocht', icon: '' },
                ] as const).map(({ key, label, icon }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-white">{icon && <span style={{ color: fixedTabColors[key] }}>{icon} </span>}{label}</span>
                    <input type="color" value={fixedTabColors[key]} onChange={(e) => setFixedTabColors(prev => ({ ...prev, [key]: e.target.value }))} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Weergave Modus</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { mode: 'auto' as ViewMode, Icon: ArrowsRightLeftIcon, label: 'Auto' },
                  { mode: 'mobile' as ViewMode, Icon: DevicePhoneMobileIcon, label: 'Mobiel' },
                  { mode: 'desktop' as ViewMode, Icon: ComputerDesktopIcon, label: 'Desktop' },
                ]).map(({ mode, Icon, label }) => (
                  <button key={mode} onClick={() => setViewMode(mode)} className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-colors ${viewMode === mode ? 'bg-[#00ff88]/20 ring-1 ring-[#00ff88]' : 'bg-[#2d2d2d] hover:bg-[#3d3d3d]'}`}>
                    <Icon className={`w-5 h-5 ${viewMode === mode ? 'text-[#00ff88]' : 'text-gray-400'}`} />
                    <span className={`text-xs ${viewMode === mode ? 'text-[#00ff88]' : 'text-gray-400'}`}>{label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Auto past automatisch aan op schermgrootte</p>
            </div>

            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="flex items-center gap-2 mb-3"><DevicePhoneMobileIcon className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-300">Mobiele weergave kolommen</span></div>
              <div className="grid grid-cols-3 gap-2">
                {[{ key: 'name', label: 'Naam' }, { key: 'price', label: 'Prijs' }, { key: 'limit', label: 'Limiet' }, { key: 'distance', label: 'Afstand' }, { key: 'dayChange', label: 'Dag %' }, { key: 'range', label: 'Range' }, { key: 'rangeDelta', label: 'Range Δ' }, { key: 'chart', label: 'Chart' }, { key: 'currency', label: 'Valuta' }].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={mobileColumnVisibility[key as keyof ColumnVisibility]} onChange={() => toggleMobileColumn(key as keyof ColumnVisibility)} className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0" />
                    <span className="text-xs text-gray-400">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="text-sm text-gray-300 mb-3">Header knoppen</div>
              <div className="grid grid-cols-2 gap-2">
                {[{ key: 'search', label: 'Zoeken' }, { key: 'apiStatus', label: 'API Status' }, { key: 'debugLog', label: 'Debug Log' }, { key: 'refresh', label: 'Ververs' }, { key: 'notifications', label: 'Notificaties' }, { key: 'archive', label: 'Archief' }, { key: 'syncStatus', label: 'Sync Status' }, { key: 'settings', label: 'Instellingen' }].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={headerButtonVisibility[key as keyof HeaderButtonVisibility]} onChange={() => toggleHeaderButton(key as keyof HeaderButtonVisibility)} className="w-4 h-4 rounded border-gray-500 bg-[#3d3d3d] text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0" />
                    <span className="text-xs text-gray-400">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="text-sm text-gray-300 mb-3">Buy Signals weergave</div>
              <div className="space-y-3">
                {([{ key: 'showTabName' as const, label: 'Toon tabnaam' }, { key: 'compactMode' as const, label: 'Compacte weergave' }]).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">{label}</label>
                    <button onClick={() => setBuySignalDisplay(prev => ({ ...prev, [key]: !prev[key] }))} className={`w-10 h-5 rounded-full transition-colors ${buySignalDisplay[key] ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${buySignalDisplay[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Default Timeframe</label>
              <div className="grid grid-cols-5 gap-2">
                <button onClick={() => setGlobalTimeframe(null)} className={`py-2 rounded-lg text-sm transition-colors ${globalTimeframe === null ? 'bg-white/20 text-white' : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'}`}>Auto</button>
                {(['7d', '30d', '90d', '1y'] as ChartTimeframe[]).map((tf) => (
                  <button key={tf} onClick={() => setGlobalTimeframe(tf)} className={`py-2 rounded-lg text-sm transition-colors ${globalTimeframe === tf ? 'bg-white/20 text-white' : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3d3d3d]'}`}>{tf}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== NOTIFICATIONS TAB ===== */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">Enable Notifications</label>
              <button onClick={() => setNotificationsEnabled(!notificationsEnabled)} className={`w-12 h-6 rounded-full transition-colors ${notificationsEnabled ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="text-sm text-gray-400">Push Notifications</label>
                {!isNotificationSupported() && <p className="text-xs text-yellow-500">Niet ondersteund in deze browser</p>}
                {isNotificationSupported() && notificationPermission === 'denied' && <p className="text-xs text-red-400">Geblokkeerd in browser settings</p>}
              </div>
              {isNotificationSupported() && notificationPermission !== 'granted' ? (
                <button onClick={handleRequestNotificationPermission} className="px-3 py-1 text-xs bg-[#00ff88] text-black rounded hover:bg-[#00dd77] transition-colors" disabled={notificationPermission === 'denied'}>Toestaan</button>
              ) : (
                <button onClick={() => setPushEnabled(!pushEnabled)} disabled={notificationPermission !== 'granted'} className={`w-12 h-6 rounded-full transition-colors ${pushEnabled && notificationPermission === 'granted' ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${pushEnabled && notificationPermission === 'granted' ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">Audio Alerts</label>
              <button onClick={() => setAudioEnabled(!audioEnabled)} className={`w-12 h-6 rounded-full transition-colors ${audioEnabled ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${audioEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="p-3 bg-[#2d2d2d] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-400">Stille uren</label>
                <button onClick={() => setQuietHoursEnabled(!quietHoursEnabled)} className={`w-12 h-6 rounded-full transition-colors ${quietHoursEnabled ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${quietHoursEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {quietHoursEnabled && (
                <div className="flex items-center gap-2 text-sm">
                  <input type="time" value={quietHoursStart} onChange={(e) => setQuietHoursStart(e.target.value)} className="bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-white text-sm" />
                  <span className="text-gray-400">tot</span>
                  <input type="time" value={quietHoursEnd} onChange={(e) => setQuietHoursEnd(e.target.value)} className="bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-white text-sm" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Alert Thresholds (%)</label>
              <input type="text" value={thresholds} onChange={(e) => setThresholds(e.target.value)} placeholder="e.g., 1, 5, 10" className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30" />
              <p className="text-xs text-gray-500 mt-1">Alert wanneer koers binnen X% van buy limit komt</p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Dagelijkse daling alert (%)</label>
              <input type="number" value={dailyDropAlert} onChange={(e) => setDailyDropAlert(e.target.value)} placeholder="bv. 5" min="0" max="100" className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30" />
              <p className="text-xs text-gray-500 mt-1">Alert wanneer aandeel X% daalt op één dag (leeg = uit)</p>
            </div>

            {(canInstall || isInstalled) && (
              <div className="p-3 bg-[#2d2d2d] rounded-lg">
                {isInstalled ? (
                  <div className="flex items-center gap-2 text-sm text-green-400"><DevicePhoneMobileIcon className="w-5 h-5" />App is geïnstalleerd</div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-400"><DevicePhoneMobileIcon className="w-5 h-5" />Installeer als app</div>
                    <button onClick={handleInstallApp} className="px-3 py-1 text-xs bg-[#00ff88] text-black rounded hover:bg-[#00dd77] transition-colors">Installeren</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== DATA TAB ===== */}
        {activeTab === 'data' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-white mb-3">Cloud Sync</h3>
              <CloudSync tabs={tabs} archive={archive} settings={settings} limitHistory={limitHistory} onDataLoaded={onCloudDataLoaded} />
            </div>

            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="mb-2">
                <div className="text-sm text-gray-300">Browser Migratie</div>
                <div className="text-xs text-gray-500">Volledige backup voor overzetten naar andere browser</div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleExportJSON} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#00ff88] hover:bg-[#00dd77] text-black text-sm font-medium rounded-lg transition-colors"><ArrowDownTrayIcon className="w-4 h-4" />Export Backup</button>
                <button onClick={handleImportJSON} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm font-medium rounded-lg transition-colors"><ArrowUpTrayIcon className="w-4 h-4" />Import Backup</button>
              </div>
            </div>

            <div className="p-3 bg-[#2d2d2d] rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-300">Portfolio CSV</div>
                  <div className="text-xs text-gray-500">{tabs.reduce((sum, tab) => sum + tab.stocks.length, 0)} aandelen + {archive.length} gearchiveerd</div>
                </div>
                <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm font-medium rounded-lg transition-colors"><ArrowDownTrayIcon className="w-4 h-4" />Export CSV</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== SCAN TAB ===== */}
        {activeTab === 'scan' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Stel in welke factoren de volgorde van scannen bepalen. Hogere waarde = meer invloed.</p>

            {([
              { key: 'lastScanTime' as const, label: 'Langst niet gescand eerst', desc: 'Aandelen die het langst niet gescand zijn krijgen voorrang' },
              { key: 'distanceToLimit' as const, label: 'Dichtbij kooplimiet (<15%)', desc: 'Aandelen waarvan de afstand tot de limiet klein is krijgen voorrang' },
              { key: 'volatility' as const, label: 'Hoge mutaties (volatiliteit)', desc: 'Aandelen met grote koersschommelingen worden vaker gescand' },
              { key: 'rainbowBlocks' as const, label: 'Regenboogblokjes (meest gevuld)', desc: 'Aandelen met de meeste regenboogblokjes worden het vaakst gescand' },
            ]).map(({ key, label, desc }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-300">{label}</label>
                  <span className="text-xs text-gray-400 font-mono w-10 text-right">{scanWeights[key]}</span>
                </div>
                <input type="range" min="0" max="100" value={scanWeights[key] as number} onChange={(e) => setScanWeights(w => ({ ...w, [key]: parseInt(e.target.value) }))} className="w-full h-2 bg-[#3d3d3d] rounded-lg appearance-none cursor-pointer accent-[#00ff88]" />
                <p className="text-[10px] text-gray-600 mt-0.5">{desc}</p>
              </div>
            ))}

            <div className="flex items-center justify-between py-2 border-t border-[#3d3d3d]">
              <div>
                <label className="text-sm text-gray-300">Fouten overslaan</label>
                <p className="text-[10px] text-gray-600">Aandelen met eerdere fouten later scannen</p>
              </div>
              <button onClick={() => setScanWeights(w => ({ ...w, skipErrorStocks: !w.skipErrorStocks }))} className={`w-12 h-6 rounded-full transition-colors ${scanWeights.skipErrorStocks ? 'bg-[#00ff88]' : 'bg-[#3d3d3d]'}`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${scanWeights.skipErrorStocks ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <button onClick={() => setScanWeights(DEFAULT_SCAN_WEIGHTS)} className="w-full py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors border border-[#3d3d3d]">Reset naar standaard</button>
          </div>
        )}

        {/* Actions — always visible */}
        <div className="flex gap-3 pt-4 border-t border-[#3d3d3d]">
          <button onClick={handleSave} className="flex-1 py-2 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium rounded-lg transition-colors">Save</button>
          <button onClick={onLogout} className="px-4 py-2 bg-[#3d3d3d] hover:bg-[#ff3366] text-gray-400 hover:text-white rounded-lg transition-colors">Logout</button>
        </div>

        <div className="pt-4 border-t border-[#3d3d3d] text-center">
          <p className="text-xs text-gray-500">Defog v{VERSION}</p>
          <p className="text-xs text-gray-600">{BUILD_DATE}</p>
        </div>
      </div>
    </Modal>
  );
}
