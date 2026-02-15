'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type LoginMode = 'password' | 'otp' | 'otp-verify';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>('password');

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess('Code verstuurd! Check je email (ook spam folder).');
      setMode('otp-verify');
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'email',
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  }

  function switchMode(newMode: LoginMode) {
    setMode(newMode);
    setError(null);
    setSuccess(null);
    setOtpCode('');
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="w-full max-w-md p-8 bg-slate-800 rounded-lg border border-slate-700">
        <h1 className="text-2xl font-bold text-center mb-2 text-[var(--text-primary)]">Welcome Back</h1>
        <p className="text-[var(--text-secondary)] text-center mb-8 text-sm">
          Sign in to continue
        </p>

        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-slate-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-slate-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                placeholder="Your password"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-slate-400 rounded font-medium transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('otp')}
              className="w-full py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Wachtwoord vergeten? Login via email code
            </button>
          </form>
        )}

        {mode === 'otp' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <p className="text-sm text-slate-400">
              We sturen een inlogcode naar je email adres.
            </p>

            <div>
              <label htmlFor="otp-email" className="block text-sm text-slate-300 mb-1">
                Email
              </label>
              <input
                id="otp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-slate-400 rounded font-medium transition-colors"
            >
              {loading ? 'Versturen...' : 'Verstuur inlogcode'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('password')}
              className="w-full py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Terug naar wachtwoord login
            </button>
          </form>
        )}

        {mode === 'otp-verify' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            {success && (
              <div className="text-green-400 text-sm p-2 bg-green-900/20 rounded">
                {success}
              </div>
            )}

            <p className="text-sm text-slate-400">
              Voer de 6-cijferige code in die we naar <strong className="text-white">{email}</strong> hebben gestuurd.
            </p>

            <div>
              <label htmlFor="otp-code" className="block text-sm text-slate-300 mb-1">
                Inlogcode
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-center text-2xl tracking-[0.5em] font-mono"
                placeholder="000000"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-slate-400 rounded font-medium transition-colors"
            >
              {loading ? 'Verifiëren...' : 'Verifieer & Login'}
            </button>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => switchMode('otp')}
                className="py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Nieuwe code versturen
              </button>
              <button
                type="button"
                onClick={() => switchMode('password')}
                className="py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Wachtwoord login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
