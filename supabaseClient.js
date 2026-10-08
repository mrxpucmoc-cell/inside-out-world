// supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://inside-out-proxy.mr-xpucmoc.workers.dev';
const supabaseKey = 'sb_publishable_tGyvr0C9deXUZKFmjqK48g_TYE2mErs';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    storage: window.localStorage,
    storageKey: 'inside-out-auth',
  },
  global: {
    headers: {
      'X-Client-Info': 'inside-out-web',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export async function pingSupabase() {
  try {
    const t0 = performance.now();
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: supabaseKey },
    });
    const ms = Math.round(performance.now() - t0);
    return { ok: res.ok, status: res.status, ms };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}