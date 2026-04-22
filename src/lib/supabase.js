import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

let supabaseClient = null;

function getDefaultRedirectUrl() {
  const { protocol, hostname, port, pathname } = window.location;
  const isLocalDevHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname) || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.');
  if (isLocalDevHost) {
    return `${protocol}//localhost${port ? `:${port}` : ''}${pathname === '/' ? '' : pathname}`;
  }
  return window.location.origin;
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseClient;
}

export async function getSupabaseSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function getSupabaseUser() {
  const session = await getSupabaseSession();
  return session?.user || null;
}

export async function signInWithGoogle(options = {}) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const redirectTo = options.redirectTo || getDefaultRedirectUrl();
  const queryParams = {
    access_type: 'offline',
  };

  if (options.forceAccountSelection !== false) {
    queryParams.prompt = 'select_account';
  }

  if (options.loginHint) {
    queryParams.login_hint = options.loginHint;
  }

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOutSupabase() {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export function onSupabaseAuthStateChange(callback) {
  const client = getSupabaseClient();
  if (!client) return { data: { subscription: { unsubscribe() {} } } };
  return client.auth.onAuthStateChange(callback);
}
