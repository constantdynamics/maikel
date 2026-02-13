import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';
import type { Tab, ArchivedStock, PurchasedStock, UserSettings, LimitHistory } from '../types';

// Supabase configuration
// The anon key is designed to be public - it works with Row Level Security (RLS)
// to ensure users can only access their own data. This is safe for client-side code.
const supabaseUrl = process.env.NEXT_PUBLIC_DEFOG_SUPABASE_URL || 'https://rhdjrmxqpgykbnfcunhg.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_DEFOG_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZGpybXhxcGd5a2JuZmN1bmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MzIyNjgsImV4cCI6MjA4NTQwODI2OH0.ZXui5Zog_eXt41vHkwYvxjfY0eapxMepBymmC8dR7Ck';

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey &&
    supabaseUrl !== 'https://your-project.supabase.co' &&
    supabaseAnonKey !== 'your-anon-key-here');
}

// Create Supabase client (singleton)
let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabase;
}

// User watchlist data structure for Supabase
export interface WatchlistData {
  id?: string;
  user_id: string;
  tabs: Tab[];
  archive: ArchivedStock[];
  purchased_stocks?: PurchasedStock[];
  settings: UserSettings;
  limit_history: LimitHistory[];
  updated_at?: string;
  created_at?: string;
}

// Auth functions
// Production URL for GitHub Pages - update this to your actual GitHub Pages URL
const PRODUCTION_URL = 'https://constantdynamics.github.io/defog';

function getRedirectUrl(): string {
  // If we're on localhost, use localhost for development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return window.location.origin;
  }
  // For production (GitHub Pages), use the production URL
  return PRODUCTION_URL;
}

export async function signInWithGitHub(): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: new Error('Supabase not configured') };

  const redirectUrl = getRedirectUrl();
  console.log('[Supabase] OAuth redirect URL:', redirectUrl);

  const { error } = await client.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: redirectUrl,
    },
  });

  return { error: error ? new Error(error.message) : null };
}

export async function signInWithEmail(email: string, password: string): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: new Error('Supabase not configured') };

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  return { error: error ? new Error(error.message) : null };
}

export async function signUpWithEmail(email: string, password: string): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: new Error('Supabase not configured') };

  const { error } = await client.auth.signUp({
    email,
    password,
  });

  return { error: error ? new Error(error.message) : null };
}

export async function signOut(): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: new Error('Supabase not configured') };

  const { error } = await client.auth.signOut();
  return { error: error ? new Error(error.message) : null };
}

export async function resetPasswordForEmail(email: string): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: new Error('Supabase not configured') };

  const redirectUrl = getRedirectUrl();

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${redirectUrl}?type=recovery`,
  });

  return { error: error ? new Error(error.message) : null };
}

export async function getCurrentUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: { user } } = await client.auth.getUser();
  return user;
}

export async function getCurrentSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: { session } } = await client.auth.getSession();
  return session;
}

// Subscribe to auth state changes
export function onAuthStateChange(callback: (user: User | null) => void): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return () => subscription.unsubscribe();
}

// Data sync functions
export async function saveWatchlistToCloud(data: Omit<WatchlistData, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: new Error('Supabase not configured') };

  const user = await getCurrentUser();
  if (!user) return { error: new Error('Not authenticated') };

  // Check if user already has watchlist data
  const { data: existing } = await client
    .from('watchlists')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (existing) {
    // Update existing
    const { error } = await client
      .from('watchlists')
      .update({
        tabs: data.tabs,
        archive: data.archive,
        settings: data.settings,
        limit_history: data.limit_history,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return { error: error ? new Error(error.message) : null };
  } else {
    // Insert new
    const { error } = await client
      .from('watchlists')
      .insert({
        user_id: user.id,
        tabs: data.tabs,
        archive: data.archive,
        settings: data.settings,
        limit_history: data.limit_history,
      });

    return { error: error ? new Error(error.message) : null };
  }
}

export async function loadWatchlistFromCloud(): Promise<{ data: WatchlistData | null; error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { data: null, error: new Error('Supabase not configured') };

  const user = await getCurrentUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };

  const { data, error } = await client
    .from('watchlists')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as WatchlistData | null, error: null };
}

export async function deleteWatchlistFromCloud(): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: new Error('Supabase not configured') };

  const user = await getCurrentUser();
  if (!user) return { error: new Error('Not authenticated') };

  const { error } = await client
    .from('watchlists')
    .delete()
    .eq('user_id', user.id);

  return { error: error ? new Error(error.message) : null };
}

// Get last sync timestamp
export async function getLastSyncTime(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const { data } = await client
    .from('watchlists')
    .select('updated_at')
    .eq('user_id', user.id)
    .single();

  return data?.updated_at || null;
}

// Real-time subscription (optional - for multi-tab sync)
export function subscribeToWatchlistChanges(
  callback: (data: WatchlistData) => void
): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  getCurrentUser().then(user => {
    if (!user) return;

    const channel = client
      .channel('watchlist-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'watchlists',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          callback(payload.new as WatchlistData);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  });

  return null;
}

// SQL schema for Supabase (run this in Supabase SQL editor)
export const SUPABASE_SCHEMA = `
-- Create watchlists table
CREATE TABLE IF NOT EXISTS watchlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tabs JSONB DEFAULT '[]'::jsonb,
  archive JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  limit_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only access their own data
CREATE POLICY "Users can view own watchlist" ON watchlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist" ON watchlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist" ON watchlists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist" ON watchlists
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS watchlists_user_id_idx ON watchlists(user_id);

-- Enable realtime for this table (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE watchlists;
`;
