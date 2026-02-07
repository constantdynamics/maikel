'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabase';
import type { Settings, ZonnebloemSettings } from '@/lib/types';
import { ZONNEBLOEM_DEFAULTS } from '@/lib/types';

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

const ALL_MARKETS = [
  { id: 'america', label: 'United States' },
  { id: 'europe', label: 'Europe (Euronext)' },
  { id: 'uk', label: 'United Kingdom' },
  { id: 'canada', label: 'Canada' },
  { id: 'australia', label: 'Australia' },
  { id: 'germany', label: 'Germany (XETRA)' },
  { id: 'hongkong', label: 'Hong Kong' },
  { id: 'japan', label: 'Japan' },
  { id: 'india', label: 'India' },
  { id: 'brazil', label: 'Brazil' },
  { id: 'korea', label: 'South Korea' },
  { id: 'taiwan', label: 'Taiwan' },
  { id: 'singapore', label: 'Singapore' },
  { id: 'mexico', label: 'Mexico' },
  { id: 'israel', label: 'Israel' },
  { id: 'indonesia', label: 'Indonesia' },
];

const EXCLUDED_COUNTRIES = [
  'Russia', 'North Korea', 'Iran', 'Syria', 'Belarus', 'Myanmar', 'Venezuela', 'Cuba',
  'Afghanistan', 'Somalia', 'Sudan', 'South Sudan', 'Yemen', 'Libya',
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'kuifje' | 'zonnebloem'>('kuifje');

  const [settings, setSettings] = useState<Settings>({
    ath_decline_min: 95,
    ath_decline_max: 99,
    growth_threshold_pct: 200,
    min_growth_events: 2,
    min_consecutive_days: 5,
    growth_lookback_years: 3,
    purchase_limit_multiplier: 1.20,
    scan_times: ['10:30', '15:00'],
    excluded_sectors: [],
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
      const newZbSettings = { ...ZONNEBLOEM_DEFAULTS };

      for (const row of data) {
        // Kuifje settings
        const key = row.key as keyof Settings;
        if (key in newSettings) {
          try {
            const val = typeof newSettings[key] === 'number'
              ? Number(row.value)
              : typeof row.value === 'string'
                ? JSON.parse(row.value)
                : row.value;
            (newSettings as Record<string, unknown>)[key] = val;
          } catch { /* keep default */ }
        }

        // Zonnebloem settings
        const zbKey = row.key as keyof ZonnebloemSettings;
        if (zbKey in newZbSettings) {
          try {
            const defaultVal = newZbSettings[zbKey];
            (newZbSettings as unknown as Record<string, unknown>)[zbKey] =
              typeof defaultVal === 'number'
                ? Number(row.value)
                : typeof row.value === 'string'
                  ? JSON.parse(row.value)
                  : row.value;
          } catch { /* keep default */ }
        }
      }
      setSettings(newSettings);
      setZbSettings(newZbSettings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    const kuifjeEntries = Object.entries(settings);
    for (const [key, value] of kuifjeEntries) {
      const storeValue = typeof value === 'number' ? String(value) : JSON.stringify(value);
      await supabase
        .from('settings')
        .upsert(
          { key, value: storeValue, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
    }

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

  function updateZbSetting<K extends keyof ZonnebloemSettings>(key: K, value: ZonnebloemSettings[K]) {
    setZbSettings((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSectorExclusion(sector: string) {
    setSettings((prev) => {
      const excluded = [...prev.excluded_sectors];
      const idx = excluded.indexOf(sector);
      if (idx >= 0) excluded.splice(idx, 1);
      else excluded.push(sector);
      return { ...prev, excluded_sectors: excluded };
    });
  }

  function toggleZbSectorExclusion(sector: string) {
    setZbSettings((prev) => {
      const excluded = [...prev.zb_excluded_sectors];
      const idx = excluded.indexOf(sector);
      if (idx >= 0) excluded.splice(idx, 1);
      else excluded.push(sector);
      return { ...prev, zb_excluded_sectors: excluded };
    });
  }

  function toggleZbMarket(marketId: string) {
    setZbSettings((prev) => {
      const markets = [...prev.zb_markets];
      const idx = markets.indexOf(marketId);
      if (idx >= 0) markets.splice(idx, 1);
      else markets.push(marketId);
      return { ...prev, zb_markets: markets };
    });
  }

  function toggleZbCountryExclusion(country: string) {
    setZbSettings((prev) => {
      const excluded = [...prev.zb_excluded_countries];
      const idx = excluded.indexOf(country);
      if (idx >= 0) excluded.splice(idx, 1);
      else excluded.push(country);
      return { ...prev, zb_excluded_countries: excluded };
    });
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="text-slate-400 py-8 text-center">Loading settings...</div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="max-w-2xl space-y-6">
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

        {/* Scanner Tabs */}
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => setActiveTab('kuifje')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'kuifje'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Kuifje (ATH Recovery)
          </button>
          <button
            onClick={() => setActiveTab('zonnebloem')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'zonnebloem'
                ? 'bg-purple-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Prof. Zonnebloem (Spike Scanner)
          </button>
        </div>

        {/* KUIFJE SETTINGS */}
        {activeTab === 'kuifje' && (
          <>
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Kuifje - Screening Criteria</h2>
              <p className="text-sm text-slate-400">
                Searches for stocks that have crashed 95-99% from ATH but show recovery growth events.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">ATH Decline Min (%)</label>
                  <input type="number" value={settings.ath_decline_min} onChange={(e) => updateSetting('ath_decline_min', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={0} max={100} />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">ATH Decline Max (%)</label>
                  <input type="number" value={settings.ath_decline_max} onChange={(e) => updateSetting('ath_decline_max', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={0} max={100} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Growth Threshold (%)</label>
                  <input type="number" value={settings.growth_threshold_pct} onChange={(e) => updateSetting('growth_threshold_pct', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={50} />
                  <p className="text-xs text-slate-500 mt-1">Min growth % for an event</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Growth Events</label>
                  <input type="number" value={settings.min_growth_events} onChange={(e) => updateSetting('min_growth_events', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={1} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Consecutive Days</label>
                  <input type="number" value={settings.min_consecutive_days} onChange={(e) => updateSetting('min_consecutive_days', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={1} />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Growth Lookback (years)</label>
                  <input type="number" value={settings.growth_lookback_years} onChange={(e) => updateSetting('growth_lookback_years', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={1} max={10} />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Purchase Limit Multiplier</label>
                <input type="number" value={settings.purchase_limit_multiplier} onChange={(e) => updateSetting('purchase_limit_multiplier', Number(e.target.value))} className="w-48 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={1} max={3} step={0.05} />
                <p className="text-xs text-slate-500 mt-1">Purchase limit = 5Y Low x {settings.purchase_limit_multiplier.toFixed(2)}</p>
              </div>
            </section>

            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Kuifje - Sector Exclusions</h2>
              <div className="grid grid-cols-2 gap-2">
                {SECTORS.map((sector) => (
                  <label key={sector} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input type="checkbox" checked={settings.excluded_sectors.includes(sector)} onChange={() => toggleSectorExclusion(sector)} className="rounded bg-slate-700 border-slate-500" />
                    {sector}
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-2">
              <h2 className="text-lg font-semibold">Kuifje - Scan Schedule</h2>
              <p className="text-sm text-slate-400">Scans run automatically on weekdays via Vercel Cron:</p>
              <ul className="text-sm text-slate-300 space-y-1 pl-4 list-disc">
                <li>4:21 PM EST (daily weekdays)</li>
              </ul>
            </section>
          </>
        )}

        {/* PROFESSOR ZONNEBLOEM SETTINGS */}
        {activeTab === 'zonnebloem' && (
          <>
            <section className="bg-slate-800 border border-purple-700/50 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-purple-300">Prof. Zonnebloem - Spike Detection</h2>
              <p className="text-sm text-slate-400">
                Searches for stocks with a stable base price and explosive upward spikes.
                Like NovaBay Pharmaceuticals: steady around $0.60, but spiking to $2.50 and even $15+.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Minimum Spike (%)</label>
                  <input type="number" value={zbSettings.zb_min_spike_pct} onChange={(e) => updateZbSetting('zb_min_spike_pct', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={50} max={500} />
                  <p className="text-xs text-slate-500 mt-1">Min spike % above base (100% = doubles)</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Spike Duration (days)</label>
                  <input type="number" value={zbSettings.zb_min_spike_duration_days} onChange={(e) => updateZbSetting('zb_min_spike_duration_days', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={2} max={10} />
                  <p className="text-xs text-slate-500 mt-1">Filters out splits / data errors</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Number of Spikes</label>
                  <input type="number" value={zbSettings.zb_min_spike_count} onChange={(e) => updateZbSetting('zb_min_spike_count', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={1} max={5} />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Lookback Period (months)</label>
                  <input type="number" value={zbSettings.zb_lookback_months} onChange={(e) => updateZbSetting('zb_lookback_months', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={6} max={36} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Max Price Decline 12m (%)</label>
                  <input type="number" value={zbSettings.zb_max_price_decline_12m_pct} onChange={(e) => updateZbSetting('zb_max_price_decline_12m_pct', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={0} max={50} />
                  <p className="text-xs text-slate-500 mt-1">Must not have fallen more than this</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Max Base Decline (%)</label>
                  <input type="number" value={zbSettings.zb_max_base_decline_pct} onChange={(e) => updateZbSetting('zb_max_base_decline_pct', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={10} max={50} />
                  <p className="text-xs text-slate-500 mt-1">Base price stability (excl. spikes)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Avg Volume (30d)</label>
                  <input type="number" value={zbSettings.zb_min_avg_volume} onChange={(e) => updateZbSetting('zb_min_avg_volume', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={10000} max={500000} step={10000} />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Price ($)</label>
                  <input type="number" value={zbSettings.zb_min_price} onChange={(e) => updateZbSetting('zb_min_price', Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm" min={0.01} max={5} step={0.01} />
                </div>
              </div>
            </section>

            <section className="bg-slate-800 border border-purple-700/50 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-purple-300">Prof. Zonnebloem - Markets</h2>
              <p className="text-sm text-slate-400">Select which global markets to scan.</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MARKETS.map((market) => (
                  <label key={market.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input type="checkbox" checked={zbSettings.zb_markets.includes(market.id)} onChange={() => toggleZbMarket(market.id)} className="rounded bg-slate-700 border-slate-500" />
                    {market.label}
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-slate-800 border border-purple-700/50 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-purple-300">Prof. Zonnebloem - Sector Exclusions</h2>
              <div className="grid grid-cols-2 gap-2">
                {SECTORS.map((sector) => (
                  <label key={sector} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input type="checkbox" checked={zbSettings.zb_excluded_sectors.includes(sector)} onChange={() => toggleZbSectorExclusion(sector)} className="rounded bg-slate-700 border-slate-500" />
                    {sector}
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-slate-800 border border-purple-700/50 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-purple-300">Prof. Zonnebloem - Country Exclusions</h2>
              <p className="text-sm text-slate-400">Stocks from sanctioned/controversial countries are excluded.</p>
              <div className="grid grid-cols-2 gap-2">
                {EXCLUDED_COUNTRIES.map((country) => (
                  <label key={country} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input type="checkbox" checked={zbSettings.zb_excluded_countries.includes(country)} onChange={() => toggleZbCountryExclusion(country)} className="rounded bg-slate-700 border-slate-500" />
                    {country}
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-slate-800 border border-purple-700/50 rounded-lg p-6 space-y-2">
              <h2 className="text-lg font-semibold text-purple-300">Prof. Zonnebloem - Scan Schedule</h2>
              <p className="text-sm text-slate-400">Scans run automatically on weekdays via Vercel Cron:</p>
              <ul className="text-sm text-slate-300 space-y-1 pl-4 list-disc">
                <li>11:00 AM EST (weekdays)</li>
                <li>4:00 PM EST (weekdays)</li>
              </ul>
              <p className="text-xs text-slate-500 mt-2">
                Each scan prioritizes never-scanned stocks first, ensuring new discoveries every cycle.
              </p>
            </section>
          </>
        )}
      </div>
    </AuthGuard>
  );
}
