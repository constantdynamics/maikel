import { openDB, type IDBPDatabase } from 'idb';
import type { AppState } from '../types';
import { encrypt, decrypt } from './encryption';

const DB_NAME = 'stock-watchlist-db';
const DB_VERSION = 1;
const STORE_NAME = 'app-data';
const DATA_KEY = 'encrypted-state';

let db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db;

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    },
  });

  return db;
}

export async function saveToLocalStorage(
  state: Partial<AppState>,
  password: string
): Promise<void> {
  const database = await getDB();
  const dataToSave = {
    tabs: state.tabs,
    archive: state.archive,
    notifications: state.notifications,
    limitHistory: state.limitHistory,
    settings: state.settings,
    lastSyncTime: state.lastSyncTime,
    encryptionKeyHash: state.encryptionKeyHash,
  };

  const encryptedData = await encrypt(JSON.stringify(dataToSave), password);
  await database.put(STORE_NAME, encryptedData, DATA_KEY);
}

export async function loadFromLocalStorage(
  password: string
): Promise<Partial<AppState> | null> {
  try {
    const database = await getDB();
    const encryptedData = await database.get(STORE_NAME, DATA_KEY);

    if (!encryptedData) return null;

    const decryptedData = await decrypt(encryptedData, password);
    return JSON.parse(decryptedData);
  } catch {
    return null;
  }
}

export async function hasExistingData(): Promise<boolean> {
  try {
    const database = await getDB();
    const data = await database.get(STORE_NAME, DATA_KEY);
    return !!data;
  } catch {
    return false;
  }
}

export async function clearLocalStorage(): Promise<void> {
  const database = await getDB();
  await database.delete(STORE_NAME, DATA_KEY);
}

// Session storage for temporary password (cleared on tab close)
const SESSION_PASSWORD_KEY = 'session-password';

export function setSessionPassword(password: string): void {
  sessionStorage.setItem(SESSION_PASSWORD_KEY, password);
}

export function getSessionPassword(): string | null {
  return sessionStorage.getItem(SESSION_PASSWORD_KEY);
}

export function clearSessionPassword(): void {
  sessionStorage.removeItem(SESSION_PASSWORD_KEY);
}

// Export to CSV
export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Export to JSON
export function exportToJSON(data: unknown, filename: string): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
