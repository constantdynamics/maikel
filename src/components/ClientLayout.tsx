'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Navbar from './Navbar';
import VersionBadge from './VersionBadge';

const PUBLIC_ROUTES = ['/login'];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (isPublicRoute) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function checkAuth() {
      // First try getSession (reads from storage)
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        setAuthenticated(true);
        setLoading(false);
        return;
      }

      // No session from storage — give onAuthStateChange a moment
      // to fire (e.g. token refresh in progress or OAuth redirect)
      await new Promise(resolve => setTimeout(resolve, 500));
      if (cancelled) return;

      // Check once more after the brief wait
      const { data: { session: retrySession } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (retrySession) {
        setAuthenticated(true);
      } else {
        router.push('/login');
      }
      setLoading(false);
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          router.push('/login');
          setAuthenticated(false);
        } else if (session) {
          setAuthenticated(true);
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router, isPublicRoute]);

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
    <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
      <Navbar />
      <main className="flex-1 overflow-auto relative z-0">
        <div className="max-w-screen-2xl mx-auto p-4">{children}</div>
      </main>
      <VersionBadge />
    </div>
  );
}
