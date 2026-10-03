// Server-side Supabase client for AlalAI.
//
// SAFETY: this module is for SERVER use only (route handlers, server components).
// It prefers the service-role key when present (SUPABASE_SERVICE_ROLE_KEY,
// server-only, bypasses RLS for trusted server writes) and falls back to the
// anon key for the demo. Never import this into client components, and never
// expose the service-role key with a NEXT_PUBLIC_ prefix.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** Returns a configured server Supabase client, or null if env is missing. */
export function getSupabaseServer(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer the service-role key for server writes; fall back to anon for demo.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
