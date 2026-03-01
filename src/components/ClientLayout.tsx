'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Navbar from './Navbar';
import VersionBadge from './VersionBadge';

const PUBLIC_ROUTES = ['/login'];
// Auth-optional routes: show full layout (Navbar) but don't require auth.
// These pages handle their own auth/data independently.
const AUTH_OPTIONAL_ROUTES = ['/defog'];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const isAuthOptional = AUTH_OPTIONAL_ROUTES.some(r => pathname.startsWith(r));

  useEffect(() => {
    if (isPublicRoute) {
      setLoading(false);
      return;
    }

    // Auth-optional routes: try auth but don't block on failure
    if (isAuthOptional) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setAuthenticated(true);
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });

      // Listen for auth changes but NEVER redirect for auth-optional routes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          setAuthenticated(!!session);
        },
      );
      return () => subscription.unsubscribe();
    }

    // Standard auth-required routes
    let cancelled = false;

    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        setAuthenticated(true);
        setLoading(false);
        return;
      }

      // Give token refresh a moment
      await new Promise(resolve => setTimeout(resolve, 500));
      if (cancelled) return;

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
  }, [router, isPublicRoute, isAuthOptional]);

  // Public routes render without any wrapper
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Auth-optional routes: always render full layout, don't gate on auth
  if (isAuthOptional) {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-slate-400">Loading...</div>
        </div>
      );
    }
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

  // Auth-required routes: gate on authentication
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
