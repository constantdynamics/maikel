'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import packageJson from '../../package.json';

const APP_VERSION = packageJson.version;

const THEMES = [
  { id: 'sunflower', name: 'Sunflower', icon: '🌻' },
  { id: 'midnight', name: 'Midnight', icon: '🌙' },
  { id: 'ocean', name: 'Ocean', icon: '🌊' },
  { id: 'forest', name: 'Forest', icon: '🌲' },
  { id: 'sunset', name: 'Sunset', icon: '🌅' },
  { id: 'lavender', name: 'Lavender', icon: '💜' },
  { id: 'rose', name: 'Rose', icon: '🌸' },
  { id: 'cyber', name: 'Cyber', icon: '💚' },
  { id: 'arctic', name: 'Arctic', icon: '❄️' },
] as const;

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/scan-log', label: 'Scan Log' },
  { href: '/recycle-bin', label: 'Recycle Bin' },
  { href: '/archive', label: 'Archive' },
  { href: '/status', label: 'Status' },
  { href: '/settings', label: 'Settings' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState('midnight');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'sunflower';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    setThemeMenuOpen(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];

  return (
    <nav className="navbar-bg border-b border-[var(--border-color)] px-4 py-3">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Professor Zonnebloem"
              width={40}
              height={40}
              className="rounded-lg"
            />
          </Link>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <span>{currentTheme.icon}</span>
              <span className="hidden sm:inline">{currentTheme.name}</span>
            </button>
            {themeMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setThemeMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-40 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-20 py-1">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleThemeChange(t.id)}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-[var(--bg-tertiary)] transition-colors ${
                        theme === t.id ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <span>{t.icon}</span>
                      <span>{t.name}</span>
                      {theme === t.id && <span className="ml-auto">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
