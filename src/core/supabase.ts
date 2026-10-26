import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://xmbzxitenfaehjrycege.supabase.co';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_TZEGjsOPOVp0VBG5iib6NQ_Cij3MR3g';

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (!browserClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch (err) {
      console.warn('[Supabase Client] Failed to initialize browser client:', err);
      browserClient = null;
    }
  }
  return browserClient;
}

export async function fetchSupabaseBackendStatus(): Promise<{
  ok: boolean;
  connected?: boolean;
  url?: string;
  jwksUrl?: string;
  hasSecretKey?: boolean;
  hasPublishableKey?: boolean;
}> {
  try {
    const res = await fetch('/api/supabase/status');
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}
