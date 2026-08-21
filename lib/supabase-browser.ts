import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// The public Supabase URL/key are safe for browser use. Keep Vercel env vars as
// the primary configuration, with the project's publishable key as a build-safe
// fallback so static prerendering cannot fail when Vercel env injection is absent.
const FALLBACK_SUPABASE_URL = 'https://uuofdbsnkazmfdqfflnq.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_hTQ3aZug7m5vX93fpaX4JA_TgaFt7Pa';

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_KEY;

  client = createClient(url, key);
  return client;
}
