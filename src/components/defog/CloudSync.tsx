'use client';

import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import {
  isSupabaseConfigured,
  signInWithGitHub,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  resetPasswordForEmail,
  getCurrentUser,
  onAuthStateChange,
  saveWatchlistToCloud,
  loadWatchlistFromCloud,
  getLastSyncTime,
} from '@/lib/defog/services/supabase';
import type { Tab, ArchivedStock, UserSettings, LimitHistory } from '@/lib/defog/types';

interface CloudSyncProps {
  tabs: Tab[];
  archive: ArchivedStock[];
  settings: UserSettings;
  limitHistory: LimitHistory[];
  onDataLoaded: (data: {
    tabs: Tab[];
    archive: ArchivedStock[];
    settings: UserSettings;
    limitHistory: LimitHistory[];
  }) => void;
}

export function CloudSync({
  tabs,
  archive,
  settings,
  limitHistory,
  onDataLoaded,
}: CloudSyncProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);

  const isConfigured = isSupabaseConfigured();

  // Check auth state on mount
  useEffect(() => {
    if (!isConfigured) {
      setIsLoading(false);
      return;
    }

    getCurrentUser().then(user => {
      setUser(user);
      setIsLoading(false);
    });

    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      if (user) {
        // Load last sync time when user signs in
        getLastSyncTime().then(setLastSync);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isConfigured]);

  // Load last sync time when user is available
  useEffect(() => {
    if (user) {
      getLastSyncTime().then(setLastSync);
    }
  }, [user]);

  const handleSignIn = async () => {
    setError(null);
    const { error } = await signInWithGitHub();
    if (error) {
      setError(error.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError('Vul je email in');
      return;
    }

    // Password reset mode
    if (isResetPassword) {
      const { error } = await resetPasswordForEmail(email);
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Check je email voor de reset link!');
        setIsResetPassword(false);
      }
      return;
    }

    if (!password) {
      setError('Vul email en wachtwoord in');
      return;
    }

    if (password.length < 6) {
      setError('Wachtwoord moet minimaal 6 tekens zijn');
      return;
    }

    if (isSignUp) {
      const { error } = await signUpWithEmail(email, password);
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Check je email om je account te bevestigen!');
        setIsSignUp(false);
      }
    } else {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        setError(error.message);
      }
    }
  };

  const handleSignOut = async () => {
    setError(null);
    const { error } = await signOut();
    if (error) {
      setError(error.message);
    } else {
      setUser(null);
      setLastSync(null);
    }
  };

  const handleSaveToCloud = async () => {
    setError(null);
    setSuccess(null);
    setIsSyncing(true);

    try {
      const { error } = await saveWatchlistToCloud({
        tabs,
        archive,
        settings,
        limit_history: limitHistory,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('Data opgeslagen in de cloud!');
        const syncTime = await getLastSyncTime();
        setLastSync(syncTime);
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (e) {
      setError('Sync mislukt');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoadFromCloud = async () => {
    setError(null);
    setSuccess(null);
    setIsSyncing(true);

    try {
      const { data, error } = await loadWatchlistFromCloud();

      if (error) {
        setError(error.message);
      } else if (data) {
        onDataLoaded({
          tabs: data.tabs || [],
          archive: data.archive || [],
          settings: data.settings as UserSettings,
          limitHistory: data.limit_history || [],
        });
        setSuccess('Data geladen uit de cloud!');
        setLastSync(data.updated_at || null);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Geen cloud data gevonden');
      }
    } catch (e) {
      setError('Laden mislukt');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatSyncTime = (timestamp: string | null) => {
    if (!timestamp) return 'Nooit';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Zojuist';
    if (diffMins < 60) return `${diffMins} min geleden`;
    if (diffHours < 24) return `${diffHours} uur geleden`;
    if (diffDays < 7) return `${diffDays} dagen geleden`;

    return date.toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isConfigured) {
    return (
      <div className="p-4 bg-[#2d2d2d] rounded-lg">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <CloudArrowUpIcon className="w-5 h-5" />
          <span className="text-sm font-medium">Cloud Sync</span>
        </div>
        <p className="text-xs text-gray-500">
          Cloud sync is niet geconfigureerd. Voeg Supabase credentials toe aan je .env bestand.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-[#2d2d2d] rounded-lg">
        <div className="flex items-center gap-2 text-gray-400">
          <ArrowPathIcon className="w-5 h-5 animate-spin" />
          <span className="text-sm">Laden...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#2d2d2d] rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <CloudArrowUpIcon className="w-5 h-5" />
          <span className="text-sm font-medium">Cloud Sync</span>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="w-6 h-6 rounded-full"
              />
            )}
            <span className="text-xs text-gray-400 truncate max-w-[120px]">
              {user.user_metadata?.user_name || user.email}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs">
          {error}
        </div>
      )}

      {success && (
        <div className="p-2 bg-green-500/20 border border-green-500/50 rounded text-green-400 text-xs">
          {success}
        </div>
      )}

      {!user ? (
        <div className="space-y-3">
          {!showEmailLogin ? (
            <>
              <button
                onClick={handleSignIn}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#24292e] hover:bg-[#2f363d] text-white rounded-lg transition-colors text-sm"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Inloggen met GitHub
              </button>
              <button
                onClick={() => setShowEmailLogin(true)}
                className="w-full text-xs text-gray-400 hover:text-white transition-colors"
              >
                Of inloggen met email
              </button>
            </>
          ) : (
            <form onSubmit={handleEmailAuth} className="space-y-2">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg text-white text-sm focus:outline-none focus:border-[#00ff88]"
              />
              {!isResetPassword && (
                <input
                  type="password"
                  placeholder="Wachtwoord (min. 6 tekens)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg text-white text-sm focus:outline-none focus:border-[#00ff88]"
                />
              )}
              <button
                type="submit"
                className="w-full py-2 bg-[#00ff88] hover:bg-[#00dd77] text-black rounded-lg transition-colors text-sm font-medium"
              >
                {isResetPassword ? 'Verstuur reset link' : isSignUp ? 'Account aanmaken' : 'Inloggen'}
              </button>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  {!isResetPassword ? (
                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      {isSignUp ? 'Al een account? Inloggen' : 'Nieuw? Maak account'}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmailLogin(false);
                      setEmail('');
                      setPassword('');
                      setError(null);
                      setIsResetPassword(false);
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    Terug
                  </button>
                </div>
                {!isSignUp && !isResetPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetPassword(true);
                      setPassword('');
                      setError(null);
                      setSuccess(null);
                    }}
                    className="text-gray-400 hover:text-[#00ff88] transition-colors text-left"
                  >
                    Wachtwoord vergeten?
                  </button>
                )}
                {isResetPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetPassword(false);
                      setError(null);
                      setSuccess(null);
                    }}
                    className="text-gray-400 hover:text-white transition-colors text-left"
                  >
                    Terug naar inloggen
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-400">
            Laatste sync: {formatSyncTime(lastSync)}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSaveToCloud}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:bg-[#00ff88]/50 text-black rounded-lg transition-colors text-sm font-medium"
            >
              {isSyncing ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <CloudArrowUpIcon className="w-4 h-4" />
              )}
              Uploaden
            </button>

            <button
              onClick={handleLoadFromCloud}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {isSyncing ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <CloudArrowDownIcon className="w-4 h-4" />
              )}
              Downloaden
            </button>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-gray-400 hover:text-white rounded-lg transition-colors text-xs"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
            Uitloggen
          </button>

          <p className="text-xs text-gray-500 text-center">
            Let op: Downloaden overschrijft je lokale data
          </p>
        </>
      )}
    </div>
  );
}
