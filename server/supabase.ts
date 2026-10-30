import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://xmbzxitenfaehjrycege.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_TZEGjsOPOVp0VBG5iib6NQ_Cij3MR3g';
const supabaseJwksUrl = process.env.SUPABASE_JWKS_URL || 'https://xmbzxitenfaehjrycege.supabase.co/auth/v1/.well-known/jwks.json';

let supabaseInstance: SupabaseClient | null = null;
let supabaseAdminInstance: SupabaseClient | null = null;

/** Server-only client. Never falls back to a publishable/anon key for privileged writes. */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !supabaseUrl) return null;
  if (!supabaseAdminInstance) {
    try {
      supabaseAdminInstance = createClient(supabaseUrl, secretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      console.info('[Supabase] Initialized server-only admin client.');
    } catch (err) {
      console.error('[Supabase] Admin client initialization failed:', err);
      supabaseAdminInstance = null;
    }
  }
  return supabaseAdminInstance;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseInstance && supabaseUrl && supabaseKey) {
    try {
      supabaseInstance = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      console.info('[Supabase] Initialized client for:', supabaseUrl);
    } catch (err) {
      console.warn('[Supabase] Initialization failed:', err);
      supabaseInstance = null;
    }
  }
  return supabaseInstance;
}

export interface SupabaseHealth {
  connected: boolean;
  url: string;
  jwksUrl: string;
  hasSecretKey: boolean;
  hasPublishableKey: boolean;
  timestamp: number;
  error?: string;
}

export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  const client = getSupabaseClient();
  const health: SupabaseHealth = {
    connected: false,
    url: supabaseUrl,
    jwksUrl: supabaseJwksUrl,
    hasSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
    hasPublishableKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
    timestamp: Date.now(),
  };

  if (!client) {
    health.error = 'Supabase client not initialized';
    return health;
  }

  try {
    // Quick probe to Supabase auth/health endpoint
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (res.ok) {
      health.connected = true;
    } else {
      health.connected = true; // Endpoint responded
    }
  } catch (err: any) {
    // If fetch failed due to network, record error
    health.error = err?.message || 'Connection probe failed';
  }

  return health;
}
