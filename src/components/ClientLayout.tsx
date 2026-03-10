'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Navbar from './Navbar';
import VersionBadge from './VersionBadge';
import { ToastProvider } from './Toast';

const PUBLIC_ROUTES = ['/login'];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (isPublicRoute) {
      setLoading(false);
      return;
    }

    // Use onAuthStateChange as the primary auth mechanism.
    // INITIAL_SESSION fires AFTER Supabase has fully restored the session
    // from localStorage (including token refresh), so it won't give false
    // negatives during page reload — which was causing the re-login bug
    // when using <a> tag navigation.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') {
          if (session) {
            setAuthenticated(true);
          } else {
            window.location.href = '/login';
          }
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          window.location.href = '/login';
          setAuthenticated(false);
        } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          setAuthenticated(true);
          setLoading(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [isPublicRoute]);

  // Public routes render without auth wrapper
  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <ToastProvider>
      <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
        <Navbar />
        <main id="main-content" className="flex-1 overflow-auto relative z-0">
          <div className="max-w-screen-2xl mx-auto p-4">{children}</div>
        </main>
        <VersionBadge />
      </div>
    </ToastProvider>
  );
}
