'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import BackupStatus from '@/components/BackupStatus';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/lib/types';

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

export default function SettingsPage() {
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

        {/* Screening Criteria */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Screening Criteria</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                ATH Decline Min (%)
              </label>
              <input
                type="number"
                value={settings.ath_decline_min}
                onChange={(e) => updateSetting('ath_decline_min', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                min={0}
                max={100}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                ATH Decline Max (%)
              </label>
              <input
                type="number"
                value={settings.ath_decline_max}
                onChange={(e) => updateSetting('ath_decline_max', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                min={0}
                max={100}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Growth Threshold (%)
              </label>
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
              <label className="block text-sm text-slate-400 mb-1">
                Min Growth Events
              </label>
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
              <label className="block text-sm text-slate-400 mb-1">
                Min Consecutive Days Above Threshold
              </label>
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
              <label className="block text-sm text-slate-400 mb-1">
                Growth Lookback (years)
              </label>
              <input
                type="number"
                value={settings.growth_lookback_years}
                onChange={(e) => updateSetting('growth_lookback_years', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                min={1}
                max={10}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Purchase Limit Multiplier
            </label>
            <input
              type="number"
              value={settings.purchase_limit_multiplier}
              onChange={(e) => updateSetting('purchase_limit_multiplier', Number(e.target.value))}
              className="w-48 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
              min={1}
              max={3}
              step={0.05}
            />
            <p className="text-xs text-slate-500 mt-1">
              Purchase limit = 5Y Low x {settings.purchase_limit_multiplier.toFixed(2)} (currently {((settings.purchase_limit_multiplier - 1) * 100).toFixed(0)}% above 5Y low)
            </p>
          </div>
        </section>

        {/* Sector Exclusions */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Sector Exclusions</h2>
          <p className="text-sm text-slate-400">
            Stocks in excluded sectors will be skipped during scanning.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SECTORS.map((sector) => (
              <label
                key={sector}
                className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white"
              >
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

        {/* Scan Schedule Info */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-2">
          <h2 className="text-lg font-semibold">Scan Schedule</h2>
          <p className="text-sm text-slate-400">
            Scans run automatically on weekdays via Vercel Cron:
          </p>
          <ul className="text-sm text-slate-300 space-y-1 pl-4 list-disc">
            <li>10:30 AM EST - 1 hour after market open</li>
            <li>3:00 PM EST - 1 hour before market close</li>
          </ul>
          <p className="text-xs text-slate-500 mt-2">
            Schedule is configured in vercel.json. Manual scans can be triggered from the dashboard.
          </p>
        </section>

        {/* Data Backup */}
        <BackupStatus />
      </div>
    </AuthGuard>
  );
}
