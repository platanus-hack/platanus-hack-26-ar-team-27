/**
 * Supabase client BROWSER-SAFE (publishable key).
 *
 * Para escrituras server-side, usar el postgres client (lib/db/pg.ts) con
 * DATABASE_URL — necesitamos pg directo para LISTEN/NOTIFY del event bus.
 *
 * Sin auth en MVP (design D13): RLS abierta, todo filtra por project_id en query.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function getPublicClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Supabase env missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
}
