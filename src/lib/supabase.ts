import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-initialized client-side Supabase client
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    _supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _supabase;
}

// Backward-compatible export for client components
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// Server-side Supabase client (uses service role key for cron jobs)
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceRoleKey);
}

/**
 * Fetch all rows from a Supabase table, bypassing the default 1000-row limit.
 * Takes a builder function so each page gets a fresh query.
 *
 * Usage:
 *   const data = await fetchAllRows<Stock>(() =>
 *     supabase.from('stocks').select('*').eq('is_deleted', false)
 *   );
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(buildQuery: () => any): Promise<{ data: T[]; error: unknown }> {
  const PAGE_SIZE = 1000;
  const allData: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return { data: allData, error };
    }

    if (data) {
      allData.push(...(data as T[]));
    }

    if (!data || data.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return { data: allData, error: null };
}
