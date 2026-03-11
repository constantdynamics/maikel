// Cloud sync for Defog state via /api/defog/state (server-side, service role)
// This bypasses Supabase RLS and ensures data persists across any Vercel URL.

import type { AppState } from '../types';

const SYNC_DEBOUNCE_MS = 1000;

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;
let lastSavedHash = '';

// Simple hash to avoid saving identical data
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
}

export async function saveDefogStateToCloud(
  state: Partial<AppState>
): Promise<{ success: boolean; error?: string }> {
  try {
    const dataToSave = {
      tabs: state.tabs,
      archive: state.archive,
      purchasedStocks: state.purchasedStocks,
      notifications: state.notifications,
      limitHistory: state.limitHistory,
      settings: state.settings,
      lastSyncTime: new Date().toISOString(),
      encryptionKeyHash: state.encryptionKeyHash,
    };

    const json = JSON.stringify(dataToSave);
    const hash = simpleHash(json);

    // Skip if data hasn't changed
    if (hash === lastSavedHash) {
      return { success: true };
    }

    console.log('[Defog CloudSync] Saving', Math.round(json.length / 1024), 'KB via API...');

    const response = await fetch('/api/defog/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = errBody.error || `HTTP ${response.status}`;
      console.error('[Defog CloudSync] Save failed:', msg);
      return { success: false, error: msg };
    }

    lastSavedHash = hash;
    console.log('[Defog CloudSync] Save complete');
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Defog CloudSync] Save error:', msg);
    return { success: false, error: msg };
  }
}

export async function loadDefogStateFromCloud(): Promise<{
  data: Partial<AppState> | null;
  updatedAt?: string;
  error?: string;
}> {
  try {
    const response = await fetch('/api/defog/state', { cache: 'no-store' });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = errBody.error || `HTTP ${response.status}`;
      console.error('[Defog CloudSync] Load failed:', msg);
      return { data: null, error: msg };
    }

    const { data, updatedAt } = await response.json();

    if (!data) {
      console.log('[Defog CloudSync] No cloud data found');
      return { data: null };
    }

    console.log(
      '[Defog CloudSync] Loaded from cloud:',
      data.tabs?.length, 'tabs,',
      data.tabs?.reduce((n: number, t: { stocks?: unknown[] }) => n + (t.stocks?.length || 0), 0), 'stocks'
    );

    // Update hash so we don't immediately re-save what we just loaded
    lastSavedHash = simpleHash(JSON.stringify(data));

    return { data, updatedAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Defog CloudSync] Load error:', msg);
    return { data: null, error: msg };
  }
}

// Debounced cloud save — call this on every state change
export function scheduleCloudSave(state: Partial<AppState>): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(async () => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      await saveDefogStateToCloud(state);
    } finally {
      isSyncing = false;
    }
  }, SYNC_DEBOUNCE_MS);
}

// Immediate save via navigator.sendBeacon (works even as page is closing)
// Falls back to regular fetch if sendBeacon is unavailable.
export function saveDefogStateBeacon(state: Partial<AppState>): void {
  try {
    const dataToSave = {
      tabs: state.tabs,
      archive: state.archive,
      purchasedStocks: state.purchasedStocks,
      notifications: state.notifications,
      limitHistory: state.limitHistory,
      settings: state.settings,
      lastSyncTime: new Date().toISOString(),
      encryptionKeyHash: state.encryptionKeyHash,
    };

    const json = JSON.stringify(dataToSave);
    const hash = simpleHash(json);
    if (hash === lastSavedHash) return; // Nothing changed

    const blob = new Blob([json], { type: 'application/json' });

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon('/api/defog/state', blob);
      if (sent) {
        lastSavedHash = hash;
        console.log('[Defog CloudSync] Beacon sent on unload');
        return;
      }
    }

    // Fallback: keepalive fetch (also works during unload)
    fetch('/api/defog/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    }).then(() => { lastSavedHash = hash; }).catch(() => {});
  } catch (err) {
    console.error('[Defog CloudSync] Beacon save failed:', err);
  }
}
