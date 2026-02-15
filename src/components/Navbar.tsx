'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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
  { href: '/defog', label: 'Defog' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/kz-report', label: 'K&Z Report' },
  { href: '/scan-log', label: 'Scan Log' },
  { href: '/archive', label: 'Archive' },
  { href: '/status', label: 'Status' },
  { href: '/recycle-bin', label: 'Recycle Bin' },
  { href: '/settings', label: 'Settings' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState('midnight');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'sunflower';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  // Close theme menu on outside click
  useEffect(() => {
    if (!themeMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [themeMenuOpen]);

  function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    setThemeMenuOpen(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];

  return (
    <nav
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          maxWidth: '1536px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: logo + nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Professor Zonnebloem"
              width={40}
              height={40}
              style={{ borderRadius: '8px' }}
            />
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s, color 0.15s',
                    backgroundColor: isActive ? 'var(--accent-primary)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: defog slot + theme picker + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Portal slot for Defog toolbar buttons */}
          <div id="navbar-defog-slot" style={{ display: 'flex', alignItems: 'center', gap: '4px' }} />

          {/* Theme picker */}
          <div ref={themeRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                transition: 'background-color 0.15s',
              }}
              title={currentTheme.name}
            >
              {currentTheme.icon}
            </button>

            {themeMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '8px',
                  width: '160px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                  zIndex: 10,
                  padding: '4px 0',
                }}
              >
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleThemeChange(t.id)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: '14px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: 'transparent',
                      color: theme === t.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span>{t.icon}</span>
                    <span>{t.name}</span>
                    {theme === t.id && <span style={{ marginLeft: 'auto' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
