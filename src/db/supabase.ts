import {createClient, type SupabaseClient} from '@supabase/supabase-js';

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';

export function getSupabaseAdmin(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceKey) {
    throw new SupabaseConfigError(
      'Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in AI Studio Secrets.',
    );
  }

  const signature = `${url}|${serviceKey.slice(0, 12)}`;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    cachedSignature = signature;
  }

  return cachedClient;
}

export function createSupabaseAuthClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceKey) {
    throw new SupabaseConfigError(
      'Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in AI Studio Secrets.',
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function detectSupabaseKeyRole(key: string): string {
  if (!key) return 'missing';
  if (key.startsWith('sb_secret_')) return 'service_role';
  if (key.startsWith('sb_publishable_')) return 'anon';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        role?: string;
      };
      if (payload?.role) return String(payload.role);
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

export async function inspectSupabaseHealth(): Promise<{
  configured: boolean;
  keyRole: string;
  creatorsTableOk: boolean;
  creatorsCount: number | null;
  giftsTableOk: boolean;
  giftsCount: number | null;
  error?: string;
}> {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const keyRole = detectSupabaseKeyRole(serviceKey);

  if (!url || !serviceKey) {
    return {
      configured: false,
      keyRole,
      creatorsTableOk: false,
      creatorsCount: null,
      giftsTableOk: false,
      giftsCount: null,
      error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const [creatorsRes, giftsRes] = await Promise.all([
      supabase.from('creators').select('creator_id', {count: 'exact', head: true}),
      supabase.from('gifts').select('slug', {count: 'exact', head: true}),
    ]);

    return {
      configured: true,
      keyRole,
      creatorsTableOk: !creatorsRes.error,
      creatorsCount: creatorsRes.count ?? null,
      giftsTableOk: !giftsRes.error,
      giftsCount: giftsRes.count ?? null,
      error: creatorsRes.error?.message || giftsRes.error?.message,
    };
  } catch (err) {
    return {
      configured: true,
      keyRole,
      creatorsTableOk: false,
      creatorsCount: null,
      giftsTableOk: false,
      giftsCount: null,
      error: err instanceof Error ? err.message : 'Supabase check failed',
    };
  }
}
