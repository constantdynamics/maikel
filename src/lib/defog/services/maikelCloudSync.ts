// Cloud sync for Defog state using the MAIKEL Supabase instance
// This ensures data persists even when IndexedDB is cleared
// Uses the 'settings' table with key 'defog_state'

import { getSupabase } from '@/lib/supabase';
import type { AppState } from '../types';

const DEFOG_STATE_KEY = 'defog_state';
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

export async function saveDefogStateToCloud(
  state: Partial<AppState>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase();

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

    console.log('[Defog CloudSync] Saving', Math.round(json.length / 1024), 'KB to Maikel Supabase...');

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key: DEFOG_STATE_KEY, value: json, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('[Defog CloudSync] Save failed:', error.message);
      return { success: false, error: error.message };
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
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', DEFOG_STATE_KEY)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found - that's OK
        console.log('[Defog CloudSync] No cloud data found');
        return { data: null };
      }
      console.error('[Defog CloudSync] Load failed:', error.message);
      return { data: null, error: error.message };
    }

    if (!data?.value) {
      return { data: null };
    }

    const parsed = JSON.parse(data.value);
    console.log(
      '[Defog CloudSync] Loaded from cloud:',
      parsed.tabs?.length, 'tabs,',
      parsed.tabs?.reduce((n: number, t: { stocks?: unknown[] }) => n + (t.stocks?.length || 0), 0), 'stocks,',
      parsed.settings?.apiKey ? 'API key present' : 'no API key'
    );

    // Update the hash so we don't immediately re-save what we just loaded
    lastSavedHash = simpleHash(data.value);

    return { data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Defog CloudSync] Load error:', msg);
    return { data: null, error: msg };
  }
}

// Debounced cloud save - call this on every state change
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
