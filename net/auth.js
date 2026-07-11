// Auth module — boot/upgrade/sign-in/sign-out. SHELL_SPEC.md §3, §5.2.
// Guest-by-default: silent anonymous sign-in attempted at boot (currently
// OFF at the project level — see §3.2 — so this fails and degrades to pure
// local-guest mode; the exact same code starts working the moment the
// toggle flips, no redeploy needed).
import { sb } from './client.js';

// Site ROOT, no subpath — GitHub Pages has no server-side routing, so a
// path like /hexagon/auth/confirm 404s. Must exactly match the Redirect
// URLs allowlist entry in the Supabase dashboard (B7, SHELL_SPEC §3.5).
export const REDIRECT_URL = 'https://laulpogan.github.io/hexagon/';

const ANON_ATTEMPT_DATE_KEY = 'limen_anon_attempted_date';

function today() { return new Date().toISOString().slice(0, 10); }

// Fire-and-forget from main.js — never gates menu interactivity on this
// promise (SHELL_SPEC §3.2). `onSignedIn(user)` fires once per SIGNED_IN
// event (fresh anonymous session, email upgrade confirmed, or magic-link
// sign-in) — callers hang the cloud-pull + deck migration off it.
export async function bootAuth(onSignedIn) {
  const client = sb();

  client.auth.onAuthStateChange((event, session) => {
    // Implicit-flow magic-link redirects land the access/refresh tokens in
    // the URL hash (detectSessionInUrl parses them automatically) — strip
    // them from the visible URL/history once SIGNED_IN fires (§3.5).
    if (event === 'SIGNED_IN' && location.hash.includes('access_token')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (event === 'SIGNED_IN' && session?.user && onSignedIn) onSignedIn(session.user);
  });

  const { data: { session } } = await client.auth.getSession();
  if (session) return session;

  // Anonymous sign-ins are OFF tonight (project toggle) — this call is
  // expected to fail. Gate on a once-per-calendar-day flag so a broken
  // retry loop can't exhaust the 30 requests/hour/IP rate limit (§3.2) —
  // a single failed attempt doesn't retry again until tomorrow or the next
  // explicit account-modal open.
  if (localStorage.getItem(ANON_ATTEMPT_DATE_KEY) !== today()) {
    localStorage.setItem(ANON_ATTEMPT_DATE_KEY, today());
    client.auth.signInAnonymously().catch(() => { /* degrade to pure-guest mode */ });
  }
  return null;
}

export async function currentUser() {
  try {
    const { data: { user } } = await sb().auth.getUser();
    return user;
  } catch { return null; }
}

// "Save your progress" — upgrades an EXISTING session (anonymous or email)
// in place; auth.uid() is unchanged, so every owned row carries over with
// zero migration (SHELL_SPEC §3.3). Requires an active session.
export async function upgradeToEmail(email) {
  return sb().auth.updateUser({ email }, { emailRedirectTo: REDIRECT_URL });
}

// Magic-link sign-in/sign-up — works with or without an existing session.
// This is also the returning-user path wired to the "already registered"
// error branch from upgradeToEmail (B7): if updateUser() reports the email
// is taken, the account modal falls back to this call to sign into that
// existing account instead.
export async function signInWithMagicLink(email) {
  return sb().auth.signInWithOtp({ email, options: { emailRedirectTo: REDIRECT_URL } });
}

export function isAlreadyRegisteredError(error) {
  // Supabase's actual message is "...has already been registered" — match
  // loosely (not a literal "already registered" substring) so wording
  // drift across GoTrue versions doesn't silently break this branch.
  return !!error && /already.*registered/i.test(error.message || '');
}

export async function signOut() {
  await sb().auth.signOut();
}

// B7 — sign out AND clear the local progress/collection mirrors + the
// anonymous-attempt gate, so the next boot looks like a genuinely fresh
// guest rather than a stale cache of the account just left. The active
// deck (`limen_deck`) is deliberately left alone — losing your decklist on
// sign-out would be a hostile surprise, not a "fresh start".
export async function startFreshGuest() {
  await signOut();
  try {
    localStorage.removeItem('limen_progress');
    localStorage.removeItem('limen_collection');
    localStorage.removeItem(ANON_ATTEMPT_DATE_KEY);
  } catch {}
}

// §8 — the existing localStorage['limen_deck'] migrates into a cloud deck
// row exactly once, guarded so a churning anonymous session (cleared
// storage, re-signed-in) doesn't repeat it. Per §8, progress/collection
// local mirrors do NOT migrate — they're superseded by the cloud rows the
// signup trigger already created; only the active decklist moves up.
export async function migrateLocalDeckIfNeeded(uid) {
  const flag = `limen_migrated_${uid}`;
  if (localStorage.getItem(flag)) return;
  try {
    const raw = localStorage.getItem('limen_deck');
    if (raw) {
      const composition = JSON.parse(raw);
      const { data: existing } = await sb().from('decks').select('user_id').eq('user_id', uid).maybeSingle();
      if (!existing) await sb().from('decks').upsert({ user_id: uid, composition });
    }
  } catch { /* best-effort — never block boot on this */ }
  try { localStorage.setItem(flag, '1'); } catch {}
}
