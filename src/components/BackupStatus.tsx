'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Backup {
  id: string;
  backup_type: string;
  stock_count: number;
  favorite_count: number;
  size_bytes: number;
  created_at: string;
}

export default function BackupStatus() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/backup', {
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups || []);
        if (data.backups?.length > 0) {
          setLastBackup(data.backups[0].created_at);
        }
      }
    } catch (error) {
      console.error('Failed to fetch backups:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();

    // Auto-backup check: create backup if none in last 24 hours
    async function checkAutoBackup() {
      const lastAutoBackup = localStorage.getItem('lastAutoBackup');
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      if (!lastAutoBackup || now - parseInt(lastAutoBackup, 10) >= dayMs) {
        await createBackup('auto');
        localStorage.setItem('lastAutoBackup', now.toString());
      }
    }

    // Run auto-backup check after a delay
    const timer = setTimeout(checkAutoBackup, 5000);
    return () => clearTimeout(timer);
  }, [fetchBackups]);

  async function createBackup(type: 'manual' | 'auto' = 'manual') {
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        await fetchBackups();
      }
    } catch (error) {
      console.error('Failed to create backup:', error);
    } finally {
      setCreating(false);
    }
  }

  async function restoreBackup(backupId: string) {
    if (!confirm('Restore from this backup? This will update existing stocks with backup data.')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ backupId }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Restored ${data.restored} of ${data.total} stocks successfully!`);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(`Restore failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to restore backup:', error);
      alert('Restore failed. Check console for details.');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString();
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function getTimeSinceBackup() {
    if (!lastBackup) return 'Never';
    const diff = Date.now() - new Date(lastBackup).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💾</span>
          <div>
            <h3 className="font-medium text-[var(--text-primary)]">Data Backup</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Last backup: {getTimeSinceBackup()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => createBackup('manual')}
            disabled={creating}
            className="px-3 py-1.5 text-sm bg-[var(--accent-primary)] text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Backup Now'}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {expanded ? 'Hide' : 'History'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-[var(--border-color)] pt-4">
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading backups...</p>
          ) : backups.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No backups yet. Create your first backup above.</p>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between p-2 bg-[var(--bg-tertiary)] rounded"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      backup.backup_type === 'auto'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {backup.backup_type}
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {formatDate(backup.created_at)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {backup.stock_count} stocks ({backup.favorite_count} favorites)
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatBytes(backup.size_bytes)}
                    </span>
                  </div>
                  <button
                    onClick={() => restoreBackup(backup.id)}
                    className="text-xs text-[var(--accent-primary)] hover:underline"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
