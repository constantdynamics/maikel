'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import BackupStatus from '@/components/BackupStatus';
import { supabase } from '@/lib/supabase';
import type { Settings, MarketCapCategory, ZonnebloemSettings } from '@/lib/types';
import { DEFAULT_VOLATILE_SECTORS, MARKET_CAP_CATEGORIES, ZONNEBLOEM_DEFAULTS } from '@/lib/types';

// All available Zonnebloem markets with labels
const ZB_ALL_MARKETS = [
  // Americas
  { key: 'america', label: 'US (NYSE/NASDAQ/AMEX)' },
  { key: 'canada', label: 'Canada (TSE/TSX)' },
  { key: 'brazil', label: 'Brazil (B3)' },
  { key: 'mexico', label: 'Mexico (BMV)' },
  { key: 'argentina', label: 'Argentina (BCBA)' },
  { key: 'colombia', label: 'Colombia' },
  { key: 'chile', label: 'Chile' },
  { key: 'peru', label: 'Peru' },
  // Europe
  { key: 'europe', label: 'Europe (Euronext broad)' },
  { key: 'uk', label: 'UK (LSE)' },
  { key: 'germany', label: 'Germany (XETRA/FWB)' },
  { key: 'france', label: 'France (Euronext Paris)' },
  { key: 'spain', label: 'Spain (BME)' },
  { key: 'italy', label: 'Italy (Borsa Italiana)' },
  { key: 'sweden', label: 'Sweden (OMX Stockholm)' },
  { key: 'norway', label: 'Norway (Oslo)' },
  { key: 'denmark', label: 'Denmark (OMX Copenhagen)' },
  { key: 'finland', label: 'Finland (OMX Helsinki)' },
  { key: 'switzerland', label: 'Switzerland (SIX)' },
  { key: 'netherlands', label: 'Netherlands (AMS)' },
  { key: 'belgium', label: 'Belgium (Euronext Brussels)' },
  { key: 'poland', label: 'Poland (WSE)' },
  { key: 'austria', label: 'Austria (Vienna)' },
  { key: 'portugal', label: 'Portugal (Euronext Lisbon)' },
  { key: 'greece', label: 'Greece (Athens)' },
  { key: 'turkey', label: 'Turkey (BIST)' },
  { key: 'israel', label: 'Israel (TASE)' },
  // Asia-Pacific
  { key: 'hongkong', label: 'Hong Kong (HKEX)' },
  { key: 'japan', label: 'Japan (Tokyo)' },
  { key: 'india', label: 'India (NSE/BSE)' },
  { key: 'korea', label: 'South Korea (KRX)' },
  { key: 'taiwan', label: 'Taiwan (TWSE)' },
  { key: 'singapore', label: 'Singapore (SGX)' },
  { key: 'australia', label: 'Australia (ASX)' },
  { key: 'newzealand', label: 'New Zealand (NZX)' },
  { key: 'indonesia', label: 'Indonesia (IDX)' },
  { key: 'malaysia', label: 'Malaysia (Bursa)' },
  { key: 'thailand', label: 'Thailand (SET)' },
  { key: 'philippines', label: 'Philippines (PSE)' },
  { key: 'vietnam', label: 'Vietnam (HOSE)' },
  { key: 'pakistan', label: 'Pakistan (PSX)' },
  { key: 'china', label: 'China Mainland (SSE/SZSE)' },
  // Africa & Middle East
  { key: 'southafrica', label: 'South Africa (JSE)' },
  { key: 'egypt', label: 'Egypt (EGX)' },
  { key: 'saudi', label: 'Saudi Arabia (Tadawul)' },
  { key: 'uae', label: 'UAE (DFM/ADX)' },
  { key: 'qatar', label: 'Qatar (QSE)' },
  { key: 'kuwait', label: 'Kuwait' },
  { key: 'bahrain', label: 'Bahrain' },
  { key: 'nigeria', label: 'Nigeria (NGX)' },
  { key: 'kenya', label: 'Kenya (NSE)' },
  { key: 'ghana', label: 'Ghana (GSE)' },
];

// Sectors from TradingView
const ZB_SECTORS = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Consumer Cyclical',
  'Communication Services',
  'Industrials',
  'Consumer Defensive',
  'Energy',
  'Basic Materials',
  'Real Estate',
  'Utilities',
  'Commercial Services',
  'Distribution Services',
  'Electronic Technology',
  'Health Technology',
  'Industrial Services',
  'Non-Energy Minerals',
  'Process Industries',
  'Producer Manufacturing',
  'Retail Trade',
  'Transportation',
  'Miscellaneous',
];

const SECTORS = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Consumer Cyclical',
  'Communication Services',
  'Industrials',
  'Consumer Defensive',
  'Energy',
  'Basic Materials',
  'Real Estate',
  'Utilities',
];

const KUIFJE_RECOMMENDED_DEFAULTS: Settings = {
  ath_decline_min: 60,
  ath_decline_max: 100,
  growth_threshold_pct: 100,
  min_growth_events: 2,
  min_consecutive_days: 4,
  growth_lookback_years: 5,
  purchase_limit_multiplier: 1.20,
  scan_times: ['10:30', '15:00'],
  excluded_sectors: [],
  included_volatile_sectors: ['Biotechnology', 'Pharmaceuticals', 'Drug Manufacturers'],
  market_cap_categories: ['micro', 'small', 'mid', 'large'],
  auto_scan_interval_minutes: 15,
  enable_stable_spike_filter: false,
  stable_max_decline_pct: 10,
  stable_min_spike_pct: 100,
  stable_lookback_months: 12,
  skip_recently_scanned_hours: 0,
};

type SettingsTab = 'kuifje' | 'zonnebloem' | 'system';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('kuifje');
  const [settings, setSettings] = useState<Settings>({
    ath_decline_min: 85,
    ath_decline_max: 100,
    growth_threshold_pct: 200,
    min_growth_events: 2,
    min_consecutive_days: 5,
    growth_lookback_years: 3,
    purchase_limit_multiplier: 1.20,
    scan_times: ['10:30', '15:00'],
    excluded_sectors: [],
    included_volatile_sectors: [],
    market_cap_categories: ['micro', 'small', 'mid', 'large'],
    auto_scan_interval_minutes: 5,
    enable_stable_spike_filter: false,
    stable_max_decline_pct: 10,
    stable_min_spike_pct: 100,
    stable_lookback_months: 12,
    skip_recently_scanned_hours: 0,
  });
  const [zbSettings, setZbSettings] = useState<ZonnebloemSettings>({ ...ZONNEBLOEM_DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('settings').select('key, value');

    if (data) {
      const newSettings = { ...settings };
      for (const row of data) {
        const key = row.key as keyof Settings;
        if (key in newSettings) {
          try {
            const val = typeof newSettings[key] === 'number'
              ? Number(row.value)
              : typeof row.value === 'string'
                ? JSON.parse(row.value)
                : row.value;
            (newSettings as Record<string, unknown>)[key] = val;
          } catch {
            // keep default
          }
        }
      }
      setSettings(newSettings);

      // Load Zonnebloem settings
      const zbData = data?.filter(row => (row.key as string).startsWith('zb_'));
      if (zbData && zbData.length > 0) {
        const newZb = { ...ZONNEBLOEM_DEFAULTS };
        for (const row of zbData) {
          const key = row.key as keyof ZonnebloemSettings;
          if (key in newZb) {
            try {
              const val = typeof newZb[key] === 'number'
                ? Number(row.value)
                : typeof row.value === 'string'
                  ? JSON.parse(row.value)
                  : row.value;
              (newZb as Record<string, unknown>)[key] = val;
            } catch { /* keep default */ }
          }
        }
        setZbSettings(newZb);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    const entries = Object.entries(settings);
    for (const [key, value] of entries) {
      const storeValue = typeof value === 'number' ? String(value) : JSON.stringify(value);
      await supabase
        .from('settings')
        .upsert(
          { key, value: storeValue, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
    }

    // Save Zonnebloem settings
    const zbEntries = Object.entries(zbSettings);
    for (const [key, value] of zbEntries) {
      const storeValue = typeof value === 'number' ? String(value) : JSON.stringify(value);
      await supabase
        .from('settings')
        .upsert(
          { key, value: storeValue, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSectorExclusion(sector: string) {
    setSettings((prev) => {
      const excluded = [...prev.excluded_sectors];
      const idx = excluded.indexOf(sector);
      if (idx >= 0) {
        excluded.splice(idx, 1);
      } else {
        excluded.push(sector);
      }
      return { ...prev, excluded_sectors: excluded };
    });
  }

  function toggleVolatileSectorInclusion(sector: string) {
    setSettings((prev) => {
      const included = [...prev.included_volatile_sectors];
      const idx = included.indexOf(sector);
      if (idx >= 0) {
        included.splice(idx, 1);
      } else {
        included.push(sector);
      }
      return { ...prev, included_volatile_sectors: included };
    });
  }

  function toggleMarketCapCategory(category: string) {
    setSettings((prev) => {
      const categories = [...prev.market_cap_categories];
      const idx = categories.indexOf(category);
      if (idx >= 0) {
        categories.splice(idx, 1);
      } else {
        categories.push(category);
      }
      return { ...prev, market_cap_categories: categories };
    });
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="text-slate-400 py-8 text-center">Loading settings...</div>
      </AuthGuard>
    );
  }

  const tabs: { key: SettingsTab; label: string; color: string; activeColor: string }[] = [
    { key: 'kuifje', label: 'Kuifje', color: 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]', activeColor: 'border-[var(--accent-primary)] text-[var(--accent-primary)]' },
    { key: 'zonnebloem', label: 'Prof. Zonnebloem', color: 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]', activeColor: 'border-purple-500 text-purple-400' },
    { key: 'system', label: 'Systeem', color: 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]', activeColor: 'border-slate-400 text-slate-300' },
  ];

  return (
    <AuthGuard>
      <div className="max-w-2xl space-y-6">
        {/* Header with save button */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <div className="flex items-center gap-3">
            {saved && <span className="text-green-400 text-sm">Settings saved</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded font-medium text-sm transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 border-b border-[var(--border-color)]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key ? tab.activeColor : tab.color
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== KUIFJE TAB ===== */}
        {activeTab === 'kuifje' && (
          <div className="space-y-6">
            {/* Reset to defaults */}
            <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-300">Recommended Defaults</p>
                <p className="text-xs text-amber-200/60 mt-0.5">
                  ATH decline 60-100%, growth 100%+, 2 events, 4 days, 5yr lookback, incl. biotech/pharma
                </p>
              </div>
              <button
                onClick={() => setSettings(prev => ({ ...prev, ...KUIFJE_RECOMMENDED_DEFAULTS }))}
                className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 text-white rounded font-medium transition-colors whitespace-nowrap"
              >
                Reset to Defaults
              </button>
            </div>

            {/* Screening Criteria */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Screening Criteria</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">ATH Decline Min (%)</label>
                  <input
                    type="number"
                    value={settings.ath_decline_min}
                    onChange={(e) => updateSetting('ath_decline_min', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={0} max={100}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">ATH Decline Max (%)</label>
                  <input
                    type="number"
                    value={settings.ath_decline_max}
                    onChange={(e) => updateSetting('ath_decline_max', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={0} max={100}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Growth Threshold (%)</label>
                  <input
                    type="number"
                    value={settings.growth_threshold_pct}
                    onChange={(e) => updateSetting('growth_threshold_pct', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={50}
                  />
                  <p className="text-xs text-slate-500 mt-1">Min growth % for an event (e.g. 200 or 300)</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Growth Events</label>
                  <input
                    type="number"
                    value={settings.min_growth_events}
                    onChange={(e) => updateSetting('min_growth_events', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Consecutive Days Above Threshold</label>
                  <input
                    type="number"
                    value={settings.min_consecutive_days}
                    onChange={(e) => updateSetting('min_consecutive_days', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={1}
                  />
                  <p className="text-xs text-slate-500 mt-1">Filters out single-day spikes</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Growth Lookback (years)</label>
                  <input
                    type="number"
                    value={settings.growth_lookback_years}
                    onChange={(e) => updateSetting('growth_lookback_years', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={1} max={10}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Purchase Limit Multiplier</label>
                <input
                  type="number"
                  value={settings.purchase_limit_multiplier}
                  onChange={(e) => updateSetting('purchase_limit_multiplier', Number(e.target.value))}
                  className="w-48 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                  min={1} max={3} step={0.05}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Purchase limit = 5Y Low x {settings.purchase_limit_multiplier.toFixed(2)} (currently {((settings.purchase_limit_multiplier - 1) * 100).toFixed(0)}% above 5Y low)
                </p>
              </div>
            </section>

            {/* Sector Exclusions */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Sector Exclusions</h2>
              <p className="text-sm text-slate-400">Stocks in excluded sectors will be skipped during scanning.</p>
              <div className="grid grid-cols-2 gap-2">
                {SECTORS.map((sector) => (
                  <label key={sector} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={settings.excluded_sectors.includes(sector)}
                      onChange={() => toggleSectorExclusion(sector)}
                      className="rounded bg-slate-700 border-slate-500"
                    />
                    {sector}
                  </label>
                ))}
              </div>
            </section>

            {/* Volatile Sectors */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Volatile Sectors</h2>
              <p className="text-sm text-slate-400">
                These sectors are known for extreme volatility. Check the ones you <strong>want to include</strong> in scanning.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_VOLATILE_SECTORS.map((sector) => (
                  <label key={sector} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={settings.included_volatile_sectors.includes(sector)}
                      onChange={() => toggleVolatileSectorInclusion(sector)}
                      className="rounded bg-slate-700 border-slate-500"
                    />
                    {sector}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setSettings(prev => ({ ...prev, included_volatile_sectors: [...DEFAULT_VOLATILE_SECTORS] }))}
                  className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 rounded transition-colors"
                >
                  Include All
                </button>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, included_volatile_sectors: [] }))}
                  className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                >
                  Exclude All
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {settings.included_volatile_sectors.length === 0
                  ? 'All volatile sectors excluded'
                  : `${settings.included_volatile_sectors.length} volatile sector(s) included`}
              </p>
            </section>

            {/* Market Cap Filter */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Market Cap Filter</h2>
              <p className="text-sm text-slate-400">Check the market cap categories you want to include in scanning.</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(MARKET_CAP_CATEGORIES) as [MarketCapCategory, typeof MARKET_CAP_CATEGORIES[MarketCapCategory]][]).map(([key, cat]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={settings.market_cap_categories.includes(key)}
                      onChange={() => toggleMarketCapCategory(key)}
                      className="rounded bg-slate-700 border-slate-500"
                    />
                    {cat.label}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setSettings(prev => ({ ...prev, market_cap_categories: ['micro', 'small', 'mid', 'large'] }))}
                  className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 rounded transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, market_cap_categories: [] }))}
                  className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                >
                  Clear All
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {settings.market_cap_categories.length === 0
                  ? 'Warning: No market caps selected - nothing will be scanned!'
                  : settings.market_cap_categories.length === 4
                    ? 'All market cap sizes included'
                    : `${settings.market_cap_categories.length} category(s) selected`}
              </p>
            </section>

            {/* NovaBay-Type Filter */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Stable with Spikes Filter (NovaBay-type)</h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_stable_spike_filter}
                    onChange={(e) => updateSetting('enable_stable_spike_filter', e.target.checked)}
                    className="rounded bg-slate-700 border-slate-500"
                  />
                  <span className="text-sm text-slate-300">Enable</span>
                </label>
              </div>
              <p className="text-sm text-slate-400">
                Find stocks like NovaBay: stable base price with occasional large upward spikes.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Max Decline from Average (%)</label>
                  <input
                    type="number"
                    value={settings.stable_max_decline_pct}
                    onChange={(e) => updateSetting('stable_max_decline_pct', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={1} max={50}
                  />
                  <p className="text-xs text-slate-500 mt-1">E.g., 10 = stock can&apos;t drop more than 10% below its average</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Spike Above Average (%)</label>
                  <input
                    type="number"
                    value={settings.stable_min_spike_pct}
                    onChange={(e) => updateSetting('stable_min_spike_pct', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={50}
                  />
                  <p className="text-xs text-slate-500 mt-1">E.g., 100 = require at least 2x spike above average</p>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Lookback Period (months)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={settings.stable_lookback_months}
                    onChange={(e) => updateSetting('stable_lookback_months', Math.max(1, Number(e.target.value)))}
                    className="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={1} max={24}
                  />
                  <div className="flex gap-2">
                    {[3, 6, 12, 18, 24].map((months) => (
                      <button
                        key={months}
                        onClick={() => updateSetting('stable_lookback_months', months)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          settings.stable_lookback_months === months
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                      >
                        {months}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-slate-700/50 rounded p-3 text-sm">
                <p className="text-slate-300 font-medium">Example: NovaBay</p>
                <p className="text-slate-400 text-xs mt-1">
                  Stayed around $0.75 for most of 2024, but spiked to $4.22 (Sept) and $19 (Jan).
                  With max decline 10% and min spike 100%, this stock would be flagged.
                </p>
              </div>
            </section>

            {/* Scanner Variety */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Scanner Variety</h2>
              <p className="text-sm text-slate-400">Configure how the scanner prioritizes new stocks over recently scanned ones.</p>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Skip Recently Scanned (hours)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={settings.skip_recently_scanned_hours}
                    onChange={(e) => updateSetting('skip_recently_scanned_hours', Math.max(0, Number(e.target.value)))}
                    className="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={0} max={168}
                  />
                  <div className="flex gap-2">
                    {[0, 4, 12, 24, 48].map((hours) => (
                      <button
                        key={hours}
                        onClick={() => updateSetting('skip_recently_scanned_hours', hours)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          settings.skip_recently_scanned_hours === hours
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                      >
                        {hours === 0 ? 'Off' : `${hours}h`}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Set to 0 to disable. Higher values = more new stocks per scan.
                </p>
              </div>
            </section>
          </div>
        )}

        {/* ===== ZONNEBLOEM TAB ===== */}
        {activeTab === 'zonnebloem' && (
          <div className="space-y-6">
            {/* Scan Parameters */}
            <section className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-purple-300">Scan Parameters</h2>
              <p className="text-sm text-slate-400">
                Zonnebloem finds stocks with a stable base price and occasional explosive upward spikes.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Spike % Above Base</label>
                  <input
                    type="number"
                    value={zbSettings.zb_min_spike_pct}
                    onChange={(e) => setZbSettings(prev => ({ ...prev, zb_min_spike_pct: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={25}
                  />
                  <p className="text-xs text-slate-500 mt-1">E.g. 75 = spike must be 75% above base price</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Spike Duration (days)</label>
                  <input
                    type="number"
                    value={zbSettings.zb_min_spike_duration_days}
                    onChange={(e) => setZbSettings(prev => ({ ...prev, zb_min_spike_duration_days: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Spike Count</label>
                  <input
                    type="number"
                    value={zbSettings.zb_min_spike_count}
                    onChange={(e) => setZbSettings(prev => ({ ...prev, zb_min_spike_count: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Lookback (months)</label>
                  <input
                    type="number"
                    value={zbSettings.zb_lookback_months}
                    onChange={(e) => setZbSettings(prev => ({ ...prev, zb_lookback_months: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={6} max={60}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Max Price Decline 12m (%)</label>
                  <input
                    type="number"
                    value={zbSettings.zb_max_price_decline_12m_pct}
                    onChange={(e) => setZbSettings(prev => ({ ...prev, zb_max_price_decline_12m_pct: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={5} max={80}
                  />
                  <p className="text-xs text-slate-500 mt-1">Reject stocks that dropped more than this</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Max Base Decline (%)</label>
                  <input
                    type="number"
                    value={zbSettings.zb_max_base_decline_pct}
                    onChange={(e) => setZbSettings(prev => ({ ...prev, zb_max_base_decline_pct: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={5} max={80}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Avg Volume (30d)</label>
                  <input
                    type="number"
                    value={zbSettings.zb_min_avg_volume}
                    onChange={(e) => setZbSettings(prev => ({ ...prev, zb_min_avg_volume: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Price ($)</label>
                  <input
                    type="number"
                    value={zbSettings.zb_min_price}
                    onChange={(e) => setZbSettings(prev => ({ ...prev, zb_min_price: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={0} step={0.01}
                  />
                </div>
              </div>
            </section>

            {/* Exchanges */}
            <section className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-purple-300">Exchanges</h2>
              <p className="text-sm text-slate-400">Check the exchanges you want Zonnebloem to scan.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ZB_ALL_MARKETS.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={zbSettings.zb_markets.includes(m.key)}
                      onChange={() => {
                        setZbSettings(prev => {
                          const markets = prev.zb_markets.includes(m.key)
                            ? prev.zb_markets.filter(k => k !== m.key)
                            : [...prev.zb_markets, m.key];
                          return { ...prev, zb_markets: markets };
                        });
                      }}
                      className="rounded bg-slate-700 border-slate-500"
                    />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setZbSettings(prev => ({ ...prev, zb_markets: ZB_ALL_MARKETS.map(m => m.key) }))}
                  className="px-3 py-1 text-xs bg-purple-700 hover:bg-purple-600 rounded transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={() => setZbSettings(prev => ({ ...prev, zb_markets: [] }))}
                  className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                >
                  Clear All
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {zbSettings.zb_markets.length === 0
                  ? 'Warning: No exchanges selected!'
                  : `${zbSettings.zb_markets.length} of ${ZB_ALL_MARKETS.length} exchanges selected`}
              </p>
            </section>

            {/* Sector Filter */}
            <section className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-purple-300">Sector Filter</h2>
              <p className="text-sm text-slate-400">
                Check sectors to <strong>exclude</strong> from scanning. Unchecked sectors will be scanned.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ZB_SECTORS.map((sector) => (
                  <label key={sector} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={zbSettings.zb_excluded_sectors.includes(sector)}
                      onChange={() => {
                        setZbSettings(prev => {
                          const excluded = prev.zb_excluded_sectors.includes(sector)
                            ? prev.zb_excluded_sectors.filter(s => s !== sector)
                            : [...prev.zb_excluded_sectors, sector];
                          return { ...prev, zb_excluded_sectors: excluded };
                        });
                      }}
                      className="rounded bg-slate-700 border-slate-500"
                    />
                    <span>{sector}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setZbSettings(prev => ({ ...prev, zb_excluded_sectors: [...ZB_SECTORS] }))}
                  className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 rounded transition-colors"
                >
                  Exclude All
                </button>
                <button
                  onClick={() => setZbSettings(prev => ({ ...prev, zb_excluded_sectors: [] }))}
                  className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 rounded transition-colors"
                >
                  Include All
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {zbSettings.zb_excluded_sectors.length === 0
                  ? 'All sectors included'
                  : `${zbSettings.zb_excluded_sectors.length} sector(s) excluded`}
              </p>
            </section>
          </div>
        )}

        {/* ===== SYSTEM TAB ===== */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* Auto-Scan Settings */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Auto-Scan Settings</h2>
              <p className="text-sm text-slate-400">Configure how often the auto-scanner runs when enabled on the dashboard.</p>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Auto-Scan Interval (minutes)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={settings.auto_scan_interval_minutes}
                    onChange={(e) => updateSetting('auto_scan_interval_minutes', Math.max(1, Number(e.target.value)))}
                    className="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    min={1} max={60}
                  />
                  <div className="flex gap-2">
                    {[1, 5, 10, 15, 30, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => updateSetting('auto_scan_interval_minutes', mins)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          settings.auto_scan_interval_minutes === mins
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Lower intervals = more API calls. Recommended: 5-15 minutes to avoid rate limiting.
                </p>
              </div>
            </section>

            {/* Server Scan Schedule */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Server Scan Schedule</h2>
              <p className="text-sm text-slate-400">
                Scans run automatically on weekdays via Vercel Cron (even when your browser is closed):
              </p>
              <ul className="text-sm text-slate-300 space-y-1 pl-4 list-disc">
                <li>10:30 AM EST - 1 hour after market open</li>
                <li>3:00 PM EST - 1 hour before market close</li>
                <li>4:00 PM UTC - Zonnebloem daily scan</li>
              </ul>
              <p className="text-xs text-slate-500 mt-2">
                Schedule is configured in vercel.json. Manual scans can be triggered from the dashboard.
              </p>
            </section>

            {/* Background Scanning Info */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Background Scanning</h2>
              <div className="bg-amber-900/30 border border-amber-700/50 rounded p-3">
                <p className="text-amber-300 text-sm font-medium">Browser Limitations</p>
                <p className="text-amber-200/80 text-xs mt-1">
                  When you switch tabs or close your laptop, browsers pause JavaScript to save battery.
                  The auto-scan uses timestamps and catches up when you return to the tab.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-300 font-medium">For true background scanning:</p>
                <ul className="text-sm text-slate-400 space-y-1 pl-4 list-disc">
                  <li><strong className="text-slate-300">Server-side cron jobs</strong> run automatically even when your browser is closed</li>
                  <li>These scans happen on the server and don&apos;t require your browser</li>
                </ul>
              </div>
            </section>

            {/* Data Backup */}
            <BackupStatus />
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
