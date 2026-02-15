/**
 * Local Backup Service
 * Automatically creates backups of the app state to localStorage
 * Keeps up to 30 backups, removing oldest when limit is exceeded
 */

import type { Tab, ArchivedStock, PurchasedStock, UserSettings, LimitHistory } from '../types';

const BACKUP_KEY_PREFIX = 'defog_backup_';
const BACKUP_INDEX_KEY = 'defog_backup_index';
const MAX_BACKUPS = 30;
const BACKUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface BackupData {
  tabs: Tab[];
  archive: ArchivedStock[];
  purchasedStocks: PurchasedStock[];
  settings: UserSettings;
  limitHistory: LimitHistory[];
  timestamp: string;
  reason: 'auto' | 'manual' | 'evening' | 'close' | 'import';
}

export interface BackupMetadata {
  id: string;
  timestamp: string;
  reason: BackupData['reason'];
  tabCount: number;
  stockCount: number;
  purchasedCount: number;
  sizeKB: number;
}

// Get all backup metadata
export function getBackupList(): BackupMetadata[] {
  try {
    const indexStr = localStorage.getItem(BACKUP_INDEX_KEY);
    if (!indexStr) return [];
    return JSON.parse(indexStr) as BackupMetadata[];
  } catch (error) {
    console.error('[Backup] Failed to read backup index:', error);
    return [];
  }
}

// Save backup index
function saveBackupIndex(index: BackupMetadata[]): void {
  try {
    localStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error('[Backup] Failed to save backup index:', error);
  }
}

// Create a new backup
export function createBackup(
  data: Omit<BackupData, 'timestamp' | 'reason'>,
  reason: BackupData['reason'] = 'auto'
): BackupMetadata | null {
  try {
    const timestamp = new Date().toISOString();
    const backupId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const fullData: BackupData = {
      ...data,
      timestamp,
      reason,
    };

    const dataStr = JSON.stringify(fullData);
    const sizeKB = Math.round(dataStr.length / 1024);

    // Calculate stock counts
    const stockCount = data.tabs.reduce((sum, tab) => sum + tab.stocks.length, 0);

    const metadata: BackupMetadata = {
      id: backupId,
      timestamp,
      reason,
      tabCount: data.tabs.length,
      stockCount,
      purchasedCount: data.purchasedStocks?.length || 0,
      sizeKB,
    };

    // Save the backup data
    localStorage.setItem(`${BACKUP_KEY_PREFIX}${backupId}`, dataStr);

    // Update the index
    const index = getBackupList();
    index.push(metadata);

    // Sort by timestamp (newest first)
    index.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Remove oldest backups if over limit
    while (index.length > MAX_BACKUPS) {
      const oldest = index.pop();
      if (oldest) {
        localStorage.removeItem(`${BACKUP_KEY_PREFIX}${oldest.id}`);
        console.log(`[Backup] Removed old backup: ${oldest.id}`);
      }
    }

    saveBackupIndex(index);

    const reasonLabel = {
      'auto': 'automatisch',
      'manual': 'handmatig',
      'evening': 'avondbackup',
      'close': 'bij sluiten',
      'import': 'voor import',
    }[reason];

    console.log(`[Backup] Created ${reasonLabel} backup: ${backupId} (${sizeKB}KB, ${stockCount} stocks)`);

    return metadata;
  } catch (error) {
    console.error('[Backup] Failed to create backup:', error);
    return null;
  }
}

// Get a specific backup
export function getBackup(backupId: string): BackupData | null {
  try {
    const dataStr = localStorage.getItem(`${BACKUP_KEY_PREFIX}${backupId}`);
    if (!dataStr) return null;
    return JSON.parse(dataStr) as BackupData;
  } catch (error) {
    console.error('[Backup] Failed to read backup:', error);
    return null;
  }
}

// Delete a specific backup
export function deleteBackup(backupId: string): boolean {
  try {
    localStorage.removeItem(`${BACKUP_KEY_PREFIX}${backupId}`);

    const index = getBackupList();
    const newIndex = index.filter((b) => b.id !== backupId);
    saveBackupIndex(newIndex);

    console.log(`[Backup] Deleted backup: ${backupId}`);
    return true;
  } catch (error) {
    console.error('[Backup] Failed to delete backup:', error);
    return false;
  }
}

// Get the latest backup
export function getLatestBackup(): BackupData | null {
  const index = getBackupList();
  if (index.length === 0) return null;
  return getBackup(index[0].id);
}

// Compare two states to find missing stocks
export interface StockComparison {
  missingInCurrent: Array<{
    ticker: string;
    name: string;
    tabName: string;
    wasPurchased: boolean;
  }>;
  addedInCurrent: Array<{
    ticker: string;
    name: string;
    tabName: string;
  }>;
  changedTabs: Array<{
    ticker: string;
    fromTab: string;
    toTab: string;
  }>;
}

export function compareWithBackup(
  currentTabs: Tab[],
  currentPurchased: PurchasedStock[],
  backupData: BackupData
): StockComparison {
  const result: StockComparison = {
    missingInCurrent: [],
    addedInCurrent: [],
    changedTabs: [],
  };

  // Build maps for current state
  const currentStockMap = new Map<string, { tabName: string; stock: Tab['stocks'][0] }>();
  for (const tab of currentTabs) {
    for (const stock of tab.stocks) {
      currentStockMap.set(stock.ticker.toUpperCase(), { tabName: tab.name, stock });
    }
  }
  const currentPurchasedMap = new Map<string, PurchasedStock>();
  for (const stock of currentPurchased) {
    currentPurchasedMap.set(stock.ticker.toUpperCase(), stock);
  }

  // Build maps for backup state
  const backupStockMap = new Map<string, { tabName: string; stock: Tab['stocks'][0] }>();
  for (const tab of backupData.tabs) {
    for (const stock of tab.stocks) {
      backupStockMap.set(stock.ticker.toUpperCase(), { tabName: tab.name, stock });
    }
  }
  const backupPurchasedMap = new Map<string, PurchasedStock>();
  for (const stock of backupData.purchasedStocks || []) {
    backupPurchasedMap.set(stock.ticker.toUpperCase(), stock);
  }

  // Find stocks that were in backup but are now missing
  for (const [ticker, { tabName, stock }] of backupStockMap) {
    if (!currentStockMap.has(ticker) && !currentPurchasedMap.has(ticker)) {
      result.missingInCurrent.push({
        ticker: stock.ticker,
        name: stock.name,
        tabName,
        wasPurchased: false,
      });
    }
  }

  // Find purchased stocks that were in backup but are now missing
  for (const [ticker, stock] of backupPurchasedMap) {
    if (!currentStockMap.has(ticker) && !currentPurchasedMap.has(ticker)) {
      result.missingInCurrent.push({
        ticker: stock.ticker,
        name: stock.name,
        tabName: stock.originalTabName || 'Gekocht',
        wasPurchased: true,
      });
    }
  }

  // Find stocks that are in current but weren't in backup
  for (const [ticker, { tabName, stock }] of currentStockMap) {
    if (!backupStockMap.has(ticker) && !backupPurchasedMap.has(ticker)) {
      result.addedInCurrent.push({
        ticker: stock.ticker,
        name: stock.name,
        tabName,
      });
    }
  }

  // Find stocks that changed tabs
  for (const [ticker, current] of currentStockMap) {
    const backup = backupStockMap.get(ticker);
    if (backup && backup.tabName !== current.tabName) {
      result.changedTabs.push({
        ticker: current.stock.ticker,
        fromTab: backup.tabName,
        toTab: current.tabName,
      });
    }
  }

  return result;
}

// Format comparison result for display
export function formatComparisonReport(comparison: StockComparison, backupTimestamp: string): string {
  const lines: string[] = [];
  const backupDate = new Date(backupTimestamp).toLocaleString('nl-NL');

  lines.push('=== BACKUP VERGELIJKING ===');
  lines.push(`Backup van: ${backupDate}`);
  lines.push('');

  if (comparison.missingInCurrent.length > 0) {
    lines.push(`🔴 ONTBREKENDE AANDELEN (${comparison.missingInCurrent.length}):`);
    for (const stock of comparison.missingInCurrent) {
      const purchasedNote = stock.wasPurchased ? ' [was gekocht]' : '';
      lines.push(`  - ${stock.ticker} (${stock.name}) uit ${stock.tabName}${purchasedNote}`);
    }
    lines.push('');
  }

  if (comparison.addedInCurrent.length > 0) {
    lines.push(`🟢 NIEUWE AANDELEN (${comparison.addedInCurrent.length}):`);
    for (const stock of comparison.addedInCurrent) {
      lines.push(`  - ${stock.ticker} (${stock.name}) in ${stock.tabName}`);
    }
    lines.push('');
  }

  if (comparison.changedTabs.length > 0) {
    lines.push(`🔵 VERPLAATSTE AANDELEN (${comparison.changedTabs.length}):`);
    for (const change of comparison.changedTabs) {
      lines.push(`  - ${change.ticker}: ${change.fromTab} → ${change.toTab}`);
    }
    lines.push('');
  }

  if (
    comparison.missingInCurrent.length === 0 &&
    comparison.addedInCurrent.length === 0 &&
    comparison.changedTabs.length === 0
  ) {
    lines.push('✓ Geen verschillen gevonden');
  }

  return lines.join('\n');
}

// Schedule evening backup (around 22:00 local time)
let eveningBackupScheduled = false;

function scheduleEveningBackup(): void {
  if (eveningBackupScheduled) return;
  eveningBackupScheduled = true;

  const checkAndBackup = () => {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();

    // Create backup between 21:55 and 22:05
    if (hour === 21 && minutes >= 55) {
      const index = getBackupList();
      const lastEvening = index.find((b) => b.reason === 'evening');

      // Check if we already have an evening backup today
      if (lastEvening) {
        const lastDate = new Date(lastEvening.timestamp);
        const isSameDay =
          lastDate.getDate() === now.getDate() &&
          lastDate.getMonth() === now.getMonth() &&
          lastDate.getFullYear() === now.getFullYear();

        if (isSameDay) {
          console.log('[Backup] Evening backup already exists for today');
          return;
        }
      }

      // Get current state from localStorage (since we don't have direct store access)
      const stateStr = localStorage.getItem('defog_app_state');
      if (stateStr) {
        try {
          const state = JSON.parse(stateStr);
          createBackup(
            {
              tabs: state.tabs || [],
              archive: state.archive || [],
              purchasedStocks: state.purchasedStocks || [],
              settings: state.settings || {},
              limitHistory: state.limitHistory || [],
            },
            'evening'
          );
        } catch (error) {
          console.error('[Backup] Failed to create evening backup:', error);
        }
      }
    }
  };

  // Check every 5 minutes
  setInterval(checkAndBackup, 5 * 60 * 1000);

  // Also check immediately
  checkAndBackup();
}

// Auto backup interval tracking
let autoBackupInterval: ReturnType<typeof setInterval> | null = null;
let lastAutoBackupData: string = '';

export function startAutoBackup(getData: () => Omit<BackupData, 'timestamp' | 'reason'>): void {
  // Clear existing interval
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
  }

  // Schedule evening backups
  scheduleEveningBackup();

  // Create initial backup
  const initialData = getData();
  lastAutoBackupData = JSON.stringify(initialData);
  createBackup(initialData, 'auto');

  // Set up periodic backup
  autoBackupInterval = setInterval(() => {
    const currentData = getData();
    const currentDataStr = JSON.stringify(currentData);

    // Only backup if data has changed
    if (currentDataStr !== lastAutoBackupData) {
      createBackup(currentData, 'auto');
      lastAutoBackupData = currentDataStr;
    } else {
      console.log('[Backup] No changes since last backup, skipping');
    }
  }, BACKUP_INTERVAL_MS);

  // Backup on page unload/close
  const handleUnload = () => {
    const data = getData();
    createBackup(data, 'close');
  };

  window.addEventListener('beforeunload', handleUnload);
  window.addEventListener('pagehide', handleUnload);

  // Backup when visibility changes (tab hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const data = getData();
      const dataStr = JSON.stringify(data);
      if (dataStr !== lastAutoBackupData) {
        createBackup(data, 'auto');
        lastAutoBackupData = dataStr;
      }
    }
  });

  console.log('[Backup] Auto backup started with 1-hour interval');
}

export function stopAutoBackup(): void {
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
    autoBackupInterval = null;
  }
  console.log('[Backup] Auto backup stopped');
}

// Export backup to file (for manual download)
export function exportBackupToFile(backupId?: string): void {
  const backup = backupId ? getBackup(backupId) : getLatestBackup();
  if (!backup) {
    console.error('[Backup] No backup found to export');
    return;
  }

  const dataStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date(backup.timestamp).toISOString().split('T')[0];
  const filename = `defog_backup_${date}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`[Backup] Exported backup to ${filename}`);
}

// Get backup storage usage
export function getBackupStorageInfo(): { count: number; totalSizeKB: number; oldestDate: string | null } {
  const index = getBackupList();
  const totalSizeKB = index.reduce((sum, b) => sum + b.sizeKB, 0);
  const oldestDate = index.length > 0 ? index[index.length - 1].timestamp : null;

  return {
    count: index.length,
    totalSizeKB,
    oldestDate,
  };
}
