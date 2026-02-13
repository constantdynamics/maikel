'use client';

import { useState, useEffect } from 'react';
import { LockClosedIcon, EyeIcon, EyeSlashIcon, CloudArrowDownIcon } from '@heroicons/react/24/outline';
import { DefogLogo } from './DefogLogo';
import { hashPassword, verifyPassword } from '@/lib/defog/utils/encryption';
import {
  hasExistingData,
  loadFromLocalStorage,
  setSessionPassword,
} from '@/lib/defog/utils/storage';
import { useStore } from '@/lib/defog/store';
import {
  isSupabaseConfigured,
  signInWithGitHub,
  signInWithEmail,
  signUpWithEmail,
  resetPasswordForEmail,
  loadWatchlistFromCloud,
} from '@/lib/defog/services/supabase';

interface AuthProps {
  onAuthenticated: (password: string) => void;
}

export function Auth({ onAuthenticated }: AuthProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Cloud sync login state
  const [showCloudLogin, setShowCloudLogin] = useState(false);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [isCloudSignUp, setIsCloudSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [cloudDataLoaded, setCloudDataLoaded] = useState(false);

  const { setEncryptionKeyHash, loadState, loadCloudData } = useStore();

  useEffect(() => {
    const checkExistingData = async () => {
      const exists = await hasExistingData();
      setIsNewUser(!exists);
      setIsLoading(false);
    };

    checkExistingData();
  }, []);

  const handleCreateAccount = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const hash = await hashPassword(password);
      setEncryptionKeyHash(hash);
      setSessionPassword(password);
      onAuthenticated(password);
    } catch {
      setError('Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const data = await loadFromLocalStorage(password);

      if (!data) {
        setError('Incorrect password');
        setIsLoading(false);
        return;
      }

      // Verify password hash if available
      if (data.encryptionKeyHash) {
        const isValid = await verifyPassword(password, data.encryptionKeyHash);
        if (!isValid) {
          setError('Incorrect password');
          setIsLoading(false);
          return;
        }
      }

      setSessionPassword(password);
      loadState(data);
      onAuthenticated(password);
    } catch {
      setError('Failed to decrypt data. Check your password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNewUser) {
      handleCreateAccount();
    } else {
      handleLogin();
    }
  };

  // Cloud login handlers
  const handleCloudLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!cloudEmail) {
      setError('Vul je email in');
      return;
    }

    // Password reset mode
    if (isResetPassword) {
      const { error } = await resetPasswordForEmail(cloudEmail);
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Check je email voor de reset link!');
        setIsResetPassword(false);
      }
      return;
    }

    if (!cloudPassword) {
      setError('Vul email en wachtwoord in');
      return;
    }

    if (cloudPassword.length < 6) {
      setError('Wachtwoord moet minimaal 6 tekens zijn');
      return;
    }

    setIsLoading(true);

    try {
      if (isCloudSignUp) {
        const { error } = await signUpWithEmail(cloudEmail, cloudPassword);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Check je email om je account te bevestigen!');
          setIsCloudSignUp(false);
        }
      } else {
        const { error } = await signInWithEmail(cloudEmail, cloudPassword);
        if (error) {
          setError(error.message);
        } else {
          // Successfully logged in - try to load cloud data
          const { data, error: loadError } = await loadWatchlistFromCloud();
          if (loadError) {
            setError('Ingelogd maar kon data niet laden: ' + loadError.message);
          } else if (data) {
            // Load cloud data into store
            loadCloudData({
              tabs: data.tabs,
              archive: data.archive,
              settings: data.settings,
              limitHistory: data.limit_history,
            });
            setCloudDataLoaded(true);
            setSuccess('Cloud data geladen! Maak nu een lokaal wachtwoord aan.');
            setShowCloudLogin(false);
            setIsNewUser(true); // Force create account flow to encrypt the data
          } else {
            setSuccess('Ingelogd! Geen bestaande data gevonden - maak een nieuw account.');
            setShowCloudLogin(false);
            setIsNewUser(true);
          }
        }
      }
    } catch (err) {
      setError('Er ging iets mis: ' + String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setError('');
    const { error } = await signInWithGitHub();
    if (error) {
      setError(error.message);
    }
    // GitHub login will redirect, so we don't need to handle success here
  };

  if (isLoading && isNewUser === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#00ff88]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <LockClosedIcon className="w-8 h-8 text-[#00ff88]" />
          </div>
          <h1 className="text-2xl font-bold"><DefogLogo size="lg" /></h1>
          <p className="text-gray-400 mt-2">
            {isNewUser
              ? 'Create a password to encrypt your data'
              : 'Enter your password to unlock'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isNewUser ? 'Create a password' : 'Enter password'}
                className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-3 px-4 pr-12 text-white focus:outline-none focus:border-[#00ff88]/50"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? (
                  <EyeSlashIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {isNewUser && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-3 px-4 text-white focus:outline-none focus:border-[#00ff88]/50"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-[#ff3366] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[#00ff88] hover:bg-[#00dd77] disabled:bg-[#3d3d3d] disabled:text-gray-500 text-black font-semibold rounded-lg transition-colors"
          >
            {isLoading
              ? 'Loading...'
              : isNewUser
              ? 'Create Account'
              : 'Unlock'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Your data is encrypted locally using AES-256.</p>
          <p className="mt-1">Your password never leaves your device.</p>
        </div>

        {/* Cloud Sync Login Option */}
        {isSupabaseConfigured() && isNewUser && !cloudDataLoaded && (
          <div className="mt-6 pt-6 border-t border-[#3d3d3d]">
            {!showCloudLogin ? (
              <button
                onClick={() => setShowCloudLogin(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-white rounded-lg transition-colors"
              >
                <CloudArrowDownIcon className="w-5 h-5" />
                Inloggen met Cloud Account
              </button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                  <CloudArrowDownIcon className="w-4 h-4" />
                  {isResetPassword
                    ? 'Wachtwoord resetten'
                    : isCloudSignUp
                    ? 'Cloud account aanmaken'
                    : 'Inloggen met Cloud Account'}
                </div>

                <form onSubmit={handleCloudLogin} className="space-y-3">
                  <input
                    type="email"
                    value={cloudEmail}
                    onChange={(e) => setCloudEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white text-sm focus:outline-none focus:border-[#00ff88]/50"
                  />
                  {!isResetPassword && (
                    <input
                      type="password"
                      value={cloudPassword}
                      onChange={(e) => setCloudPassword(e.target.value)}
                      placeholder="Wachtwoord"
                      className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white text-sm focus:outline-none focus:border-[#00ff88]/50"
                    />
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-[#3d3d3d] text-white font-medium rounded-lg transition-colors"
                  >
                    {isLoading
                      ? 'Bezig...'
                      : isResetPassword
                      ? 'Verstuur reset link'
                      : isCloudSignUp
                      ? 'Account aanmaken'
                      : 'Inloggen'}
                  </button>
                </form>

                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex justify-between">
                    {!isResetPassword ? (
                      <button
                        type="button"
                        onClick={() => setIsCloudSignUp(!isCloudSignUp)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {isCloudSignUp ? 'Al een account? Inloggen' : 'Nieuw? Maak account'}
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowCloudLogin(false);
                        setCloudEmail('');
                        setCloudPassword('');
                        setError('');
                        setSuccess('');
                        setIsResetPassword(false);
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      Annuleer
                    </button>
                  </div>
                  {!isCloudSignUp && !isResetPassword && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetPassword(true);
                        setCloudPassword('');
                        setError('');
                        setSuccess('');
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
                        setError('');
                        setSuccess('');
                      }}
                      className="text-gray-400 hover:text-white transition-colors text-left"
                    >
                      Terug naar inloggen
                    </button>
                  )}
                </div>

                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#3d3d3d]" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[#1a1a1a] px-2 text-gray-500">of</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGitHubLogin}
                  className="w-full py-2 bg-[#333] hover:bg-[#444] text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 text-center mt-3">
              Heb je al een cloud account? Log in om je data te synchroniseren.
            </p>
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
            <p className="text-sm text-green-400 text-center">{success}</p>
          </div>
        )}
      </div>
    </div>
  );
}
