// Auto-sync service for Cloud Sync
// Automatically uploads changes to cloud and downloads on app load

import {
  getCurrentUser,
  saveWatchlistToCloud,
  loadWatchlistFromCloud,
} from './supabase';
import type { Tab, ArchivedStock, PurchasedStock, UserSettings, LimitHistory } from '../types';

const SYNC_DEBOUNCE_MS = 3000; // Wait 3 seconds after last change before syncing
const LOCAL_MODIFIED_KEY = 'defog-local-modified';

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;
let onSyncStatusChange: ((status: SyncStatus) => void) | null = null;

export type SyncStatus = 'idle' | 'uploading' | 'downloading' | 'error' | 'success';

// Track local modification time
export function markLocalModified(): void {
  localStorage.setItem(LOCAL_MODIFIED_KEY, new Date().toISOString());
}

export function getLocalModifiedTime(): string | null {
  return localStorage.getItem(LOCAL_MODIFIED_KEY);
}

// Subscribe to sync status changes
export function subscribeSyncStatus(callback: (status: SyncStatus) => void): () => void {
  onSyncStatusChange = callback;
  return () => {
    onSyncStatusChange = null;
  };
}

function notifyStatus(status: SyncStatus): void {
  if (onSyncStatusChange) {
    onSyncStatusChange(status);
  }
}

// Debounced auto-upload
export function scheduleAutoUpload(data: {
  tabs: Tab[];
  archive: ArchivedStock[];
  purchasedStocks?: PurchasedStock[];
  settings: UserSettings;
  limitHistory: LimitHistory[];
}): void {
  // Cancel any pending sync
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  // Schedule new sync after debounce period
  syncTimeout = setTimeout(async () => {
    await performAutoUpload(data);
  }, SYNC_DEBOUNCE_MS);
}

async function performAutoUpload(data: {
  tabs: Tab[];
  archive: ArchivedStock[];
  purchasedStocks?: PurchasedStock[];
  settings: UserSettings;
  limitHistory: LimitHistory[];
}): Promise<void> {
  if (isSyncing) {
    console.log('[AutoSync] Already syncing, skipping...');
    return;
  }

  // Check if user is logged in
  const user = await getCurrentUser();
  if (!user) {
    console.log('[AutoSync] Not logged in, skipping auto-upload');
    return;
  }

  isSyncing = true;
  notifyStatus('uploading');

  try {
    console.log('[AutoSync] Auto-uploading changes to cloud...');

    const { error } = await saveWatchlistToCloud({
      tabs: data.tabs,
      archive: data.archive,
      purchased_stocks: data.purchasedStocks || [],
      settings: data.settings,
      limit_history: data.limitHistory,
    });

    if (error) {
      console.error('[AutoSync] Upload failed:', error);
      notifyStatus('error');
    } else {
      console.log('[AutoSync] Upload successful');
      // Clear the local modified marker since we've synced
      localStorage.removeItem(LOCAL_MODIFIED_KEY);
      notifyStatus('success');

      // Reset status after a moment
      setTimeout(() => notifyStatus('idle'), 2000);
    }
  } catch (err) {
    console.error('[AutoSync] Upload error:', err);
    notifyStatus('error');
  } finally {
    isSyncing = false;
  }
}

// Check and auto-download on app load
export async function checkAndAutoDownload(): Promise<{
  shouldDownload: boolean;
  cloudData: {
    tabs: Tab[];
    archive: ArchivedStock[];
    purchasedStocks?: PurchasedStock[];
    settings: UserSettings;
    limitHistory: LimitHistory[];
  } | null;
  message: string;
}> {
  // Check if user is logged in
  const user = await getCurrentUser();
  if (!user) {
    return {
      shouldDownload: false,
      cloudData: null,
      message: 'Not logged in',
    };
  }

  try {
    notifyStatus('downloading');

    // Get cloud data
    const { data: cloudData, error } = await loadWatchlistFromCloud();

    if (error) {
      notifyStatus('error');
      return {
        shouldDownload: false,
        cloudData: null,
        message: `Error loading cloud data: ${error.message}`,
      };
    }

    if (!cloudData) {
      notifyStatus('idle');
      return {
        shouldDownload: false,
        cloudData: null,
        message: 'No cloud data found',
      };
    }

    // Get timestamps
    const cloudTime = cloudData.updated_at ? new Date(cloudData.updated_at).getTime() : 0;
    const localModified = getLocalModifiedTime();
    const localTime = localModified ? new Date(localModified).getTime() : 0;

    console.log('[AutoSync] Cloud updated:', cloudData.updated_at);
    console.log('[AutoSync] Local modified:', localModified);

    // If cloud is newer, download
    if (cloudTime > localTime) {
      notifyStatus('success');
      setTimeout(() => notifyStatus('idle'), 2000);

      return {
        shouldDownload: true,
        cloudData: {
          tabs: cloudData.tabs || [],
          archive: cloudData.archive || [],
          purchasedStocks: cloudData.purchased_stocks || [],
          settings: cloudData.settings as UserSettings,
          limitHistory: cloudData.limit_history || [],
        },
        message: 'Cloud data is newer - downloading',
      };
    }

    notifyStatus('idle');
    return {
      shouldDownload: false,
      cloudData: null,
      message: 'Local data is up to date',
    };
  } catch (err) {
    console.error('[AutoSync] Auto-download error:', err);
    notifyStatus('error');
    return {
      shouldDownload: false,
      cloudData: null,
      message: `Error: ${err}`,
    };
  }
}

// Force upload (manual)
export async function forceUpload(data: {
  tabs: Tab[];
  archive: ArchivedStock[];
  purchasedStocks?: PurchasedStock[];
  settings: UserSettings;
  limitHistory: LimitHistory[];
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Not logged in' };
  }

  isSyncing = true;
  notifyStatus('uploading');

  try {
    const { error } = await saveWatchlistToCloud({
      tabs: data.tabs,
      archive: data.archive,
      purchased_stocks: data.purchasedStocks || [],
      settings: data.settings,
      limit_history: data.limitHistory,
    });

    if (error) {
      notifyStatus('error');
      return { success: false, error: error.message };
    }

    localStorage.removeItem(LOCAL_MODIFIED_KEY);
    notifyStatus('success');
    setTimeout(() => notifyStatus('idle'), 2000);
    return { success: true };
  } catch (err) {
    notifyStatus('error');
    return { success: false, error: String(err) };
  } finally {
    isSyncing = false;
  }
}

// Force download (manual)
export async function forceDownload(): Promise<{
  success: boolean;
  data?: {
    tabs: Tab[];
    archive: ArchivedStock[];
    purchasedStocks?: PurchasedStock[];
    settings: UserSettings;
    limitHistory: LimitHistory[];
  };
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Not logged in' };
  }

  notifyStatus('downloading');

  try {
    const { data: cloudData, error } = await loadWatchlistFromCloud();

    if (error) {
      notifyStatus('error');
      return { success: false, error: error.message };
    }

    if (!cloudData) {
      notifyStatus('idle');
      return { success: false, error: 'No cloud data found' };
    }

    notifyStatus('success');
    setTimeout(() => notifyStatus('idle'), 2000);

    return {
      success: true,
      data: {
        tabs: cloudData.tabs || [],
        archive: cloudData.archive || [],
        purchasedStocks: cloudData.purchased_stocks || [],
        settings: cloudData.settings as UserSettings,
        limitHistory: cloudData.limit_history || [],
      },
    };
  } catch (err) {
    notifyStatus('error');
    return { success: false, error: String(err) };
  }
}
