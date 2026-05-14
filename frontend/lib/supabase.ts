/**
 * Supabase client + feature-flag helper.
 *
 * Plan 2.0 uses Supabase phone-OTP auth + persistence. If the env vars
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing,
 * the app falls back to a localStorage-only mock so the UI is still
 * fully usable without backend creds. This is per the project's
 * credentials-batch rule — never block on user creds.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let cached: SupabaseClient | null = null;

/**
 * Get the Supabase browser client. Returns null when Supabase is not
 * configured — callers must handle the null case and fall back to the
 * localStorage mock.
 */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (cached) return cached;
  cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
