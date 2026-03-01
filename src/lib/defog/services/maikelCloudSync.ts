// Cloud sync for Defog state via server-side API route.
// Uses /api/defog-sync which has the service role key — no client auth needed.
// This ensures data persists across deployments, URL changes, and auth issues.

import type { AppState } from '../types';

const SYNC_DEBOUNCE_MS = 3000;

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

// Track cloud load success to prevent overwriting good data
let minimumStockCountForSave = 0;

export function markCloudLoadSuccess(stockCount: number) {
  minimumStockCountForSave = Math.max(minimumStockCountForSave, Math.floor(stockCount * 0.7));
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

    // SAFETY: Never save empty state
    const totalStocks = dataToSave.tabs?.reduce(
      (n: number, t: { stocks?: unknown[] }) => n + (t.stocks?.length || 0), 0
    ) || 0;

    if (totalStocks === 0) {
      console.warn('[Defog CloudSync] BLOCKED: refusing to save empty state');
      return { success: false, error: 'Blocked: empty state' };
    }

    const json = JSON.stringify(dataToSave);
    const hash = simpleHash(json);

    // Skip if data hasn't changed
    if (hash === lastSavedHash) {
      return { success: true };
    }

    console.log('[Defog CloudSync] Saving', Math.round(json.length / 1024), 'KB via API...');

    const response = await fetch('/api/defog-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: dataToSave,
        minStockCount: minimumStockCountForSave || undefined,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      console.error('[Defog CloudSync] Save failed:', err.error);
      return { success: false, error: err.error };
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
  error?: string;
}> {
  try {
    const response = await fetch('/api/defog-sync');

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      console.error('[Defog CloudSync] Load failed:', err.error);
      return { data: null, error: err.error };
    }

    const result = await response.json();

    if (!result.data) {
      console.log('[Defog CloudSync] No cloud data found');
      return { data: null };
    }

    const parsed = result.data;
    const totalStocks = parsed.tabs?.reduce(
      (n: number, t: { stocks?: unknown[] }) => n + (t.stocks?.length || 0), 0
    ) || 0;

    console.log(
      '[Defog CloudSync] Loaded from cloud:',
      parsed.tabs?.length, 'tabs,',
      totalStocks, 'stocks'
    );

    // Update hash so we don't immediately re-save what we just loaded
    lastSavedHash = simpleHash(JSON.stringify(parsed));

    return { data: parsed };
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
