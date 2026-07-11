// Singleton Supabase client — the whole app (rooms + auth) shares one
// GoTrueClient instance. Constructing a fresh client per call against the
// same localStorage session key causes session-refresh races (supabase-js
// warns about this) — SHELL_SPEC §0.6/§5.1. Everything that needs Supabase
// imports sb() from here; this is the only construction call site.
const SUPABASE_URL = 'https://kghzdnspdsxrheuckizp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TTNv39Gsg8o20dmCOj2lfQ_rttaEvPR'; // client-safe by design

let _sb = null;

export function sb() {
  if (!_sb) {
    if (!window.supabase) throw new Error('supabase-js not loaded');
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit', // PKCE pins code_verifier to one browser — breaks
                               // desktop-request/phone-click magic links. See
                               // SHELL_SPEC.md §3.4. No OAuth providers are
                               // enabled, so PKCE's actual security win doesn't
                               // apply here.
      },
    });
  }
  return _sb;
}
