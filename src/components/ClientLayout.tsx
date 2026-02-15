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

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
      } else {
        setAuthenticated(true);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          router.push('/login');
          setAuthenticated(false);
        } else if (session) {
          setAuthenticated(true);
        }
      },
    );

    return () => subscription.unsubscribe();
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
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="sticky top-0" style={{ zIndex: 9999 }}>
        <Navbar />
      </div>
      <main style={{ position: 'relative', zIndex: 0, isolation: 'isolate' }}>
        <div className="max-w-screen-2xl mx-auto p-4">{children}</div>
      </main>
      <VersionBadge />
    </div>
  );
}
