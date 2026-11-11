import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Public Supabase client. Reads the NEXT_PUBLIC_* envs (inlined by Next at build
 * time — never hardcode the values here). When either env is missing the client
 * is `null`, which keeps auth OFF and preserves the localStorage-only behavior.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
