// Progression module (client) — Mote economy, per DESIGN_ROUND_7.md B4/B5.
// This REPLACES SHELL_SPEC.md §2/§7.4's sequential unlock_track auto-grant:
// wins earn Motes, players spend Motes explicitly on a card of their choice
// in the collection screen (ui/collection.js) — a chosen unlock, not an
// auto-grant. See supabase/migrations/20260711000000_accounts_progression.sql
// for the server side (record_match_result / spend_motes RPCs).
//
// localStorage is always the source of truth for the active session's UI
// (SHELL_SPEC §3.6) — every read here is synchronous and local; cloud is an
// async best-effort sync layer for signed-in users, never a read-time
// blocker. Guests: 100% local. Signed-in: RPC on write, mirrored to the
// same local keys so every screen reads one shape regardless of session.
import { sb } from './client.js';
import { TILE_POOL } from '../data/tiles.js';

const PROGRESS_KEY = 'limen_progress';
const COLLECTION_KEY = 'limen_collection';

function today() { return new Date().toISOString().slice(0, 10); }

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeLocal(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function emptyProgress() {
  return { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, motes: 0, dailyFirstWinDate: null };
}

// The starter set is granted client-side, dynamically, from whatever
// TILE_POOL currently ships (never a hardcoded type list) — per B3, this
// keeps the guest path correct even as the core-rules agent's pool
// expansion lands independently tonight.
function starterCollection() {
  const c = {};
  for (const t of TILE_POOL) if ((t.count || 0) > 0) c[t.type] = t.count;
  return c;
}

export function getLocalProgress() {
  return readLocal(PROGRESS_KEY, emptyProgress());
}

export function getLocalCollection() {
  let c = readLocal(COLLECTION_KEY, null);
  if (!c) { c = starterCollection(); writeLocal(COLLECTION_KEY, c); }
  return c;
}

// ─── Mote price ladder (B4) ─────────────────────────────────────────────
// Computed from the live TILE_POOL — never hardcoded card names/counts.
// Commons are free (locked commons just need claiming, not saving toward).
// Uncommons/rares taper so completing the CURRENTLY-locked set costs
// ~50-65 wins total, matching B4's target for tonight's ~24-type pool.
// Documented, not solved tonight (B4): once the core-rules agent's ~40-type
// pool lands, newly-promoted cards belong on a separate Season-1 track —
// this base-ladder budget will need re-tuning in phase C2b, not blind reuse.
const UNCOMMON_BASE = 2, UNCOMMON_STEP = 1;
const RARE_BASE = 5, RARE_STEP = 1;

export function computeMotePrices() {
  const locked = TILE_POOL.filter(t => !((t.count || 0) > 0));
  const prices = {};
  const byRarity = { uncommon: [], rare: [] };
  for (const t of locked) {
    if (t.rarity === 'common') { prices[t.type] = 0; continue; }
    if (!byRarity[t.rarity]) byRarity[t.rarity] = [];
    byRarity[t.rarity].push(t);
  }
  (byRarity.uncommon || []).forEach((t, i) => { prices[t.type] = UNCOMMON_BASE + i * UNCOMMON_STEP; });
  (byRarity.rare || []).forEach((t, i) => { prices[t.type] = RARE_BASE + i * RARE_STEP; });
  return prices;
}

// Cheapest unowned, price-bearing card — the reward strip's "next unlock"
// target. Free (price 0) locked cards are excluded: nothing to save toward.
export function nextUnlock(owned, prices) {
  let best = null;
  for (const t of TILE_POOL) {
    if ((owned[t.type] || 0) > 0) continue;
    const price = prices[t.type];
    if (price === undefined || price === 0) continue;
    if (!best || price < prices[best.type]) best = t;
  }
  return best ? { type: best.type, price: prices[best.type] } : null;
}

// ─── auth-adjacent helper (kept here, not net/auth.js, to avoid a
// progress<->auth import cycle — auth.js calls INTO progress.js for the
// post-sign-in cloud pull, not the reverse) ───────────────────────────
async function currentUserId() {
  try {
    const { data: { user } } = await sb().auth.getUser();
    return user?.id || null;
  } catch { return null; }
}

// Best-effort refresh of the local mirrors from cloud state. Called once
// after a successful sign-in (net/auth.js). Never throws, never blocks —
// on failure the local mirror (starter defaults for a brand-new account,
// or whatever was cached) stays authoritative for reads.
export async function pullCloudState(uid) {
  try {
    const [{ data: prog }, { data: coll }] = await Promise.all([
      sb().from('progress').select('*').eq('user_id', uid).maybeSingle(),
      sb().from('collections').select('cards').eq('user_id', uid).maybeSingle(),
    ]);
    if (prog) {
      writeLocal(PROGRESS_KEY, {
        wins: prog.wins, losses: prog.losses, draws: prog.draws, streak: prog.streak,
        bestStreak: prog.best_streak, motes: prog.motes,
        dailyFirstWinDate: prog.daily_first_win_at ? String(prog.daily_first_win_at).slice(0, 10) : null,
      });
    }
    if (coll) writeLocal(COLLECTION_KEY, coll.cards || {});
  } catch { /* offline/failed — local mirror stays authoritative */ }
}

function recordMatchResultLocal(result) {
  const p = getLocalProgress();
  const isNewDay = p.dailyFirstWinDate !== today();
  let moteGain = 0;
  if (result === 'win') {
    p.wins++; p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak);
    moteGain = 1 + (isNewDay ? 1 : 0);
    p.motes += moteGain;
    if (isNewDay) p.dailyFirstWinDate = today();
  } else if (result === 'loss') {
    p.losses++; p.streak = 0;
  } else {
    p.draws++; p.streak = 0;
  }
  writeLocal(PROGRESS_KEY, p);
  return {
    wins: p.wins, losses: p.losses, draws: p.draws, streak: p.streak,
    bestStreak: p.bestStreak, motes: p.motes,
    daily_bonus: result === 'win' && isNewDay, offline: true,
  };
}

// result: 'win' | 'loss' | 'draw'. Signed-in path calls the server RPC
// (atomic cooldown guard, B1) and mirrors the response locally; any
// failure (offline, rate-limited, RPC error) falls through to the local
// ledger — the player's win/loss feedback never depends on the network
// (SHELL_SPEC §3.6/§9). No retroactive reconciliation of a fallback write.
export async function recordMatchResult(result) {
  const uid = await currentUserId();
  if (uid) {
    try {
      const { data, error } = await sb().rpc('record_match_result', { p_result: result });
      const row = !error && Array.isArray(data) ? data[0] : null;
      if (row) {
        writeLocal(PROGRESS_KEY, {
          wins: row.wins, losses: row.losses, draws: row.draws, streak: row.streak,
          bestStreak: row.best_streak, motes: row.motes,
          dailyFirstWinDate: row.daily_bonus ? today() : getLocalProgress().dailyFirstWinDate,
        });
        return { ...row, offline: false };
      }
    } catch { /* fall through to local */ }
  }
  return recordMatchResultLocal(result);
}

// Explicit purchase — the collection screen's "buy/reveal" action (B4/B5's
// dopamine choice moment). Signed-in path spends via spend_motes (atomic,
// server-side WHERE-guard); guest path spends against the local ledger.
// price is client-computed from computeMotePrices() either way — the
// documented, accepted trust model (B9): honest, cheatable by devtools,
// fine for a friendly game.
export async function unlockCard(type, price) {
  const uid = await currentUserId();
  if (uid) {
    try {
      const { data, error } = await sb().rpc('spend_motes', { p_card_type: type, p_price: price });
      const row = !error && Array.isArray(data) ? data[0] : null;
      if (row) {
        const p = getLocalProgress();
        p.motes = row.motes;
        writeLocal(PROGRESS_KEY, p);
        writeLocal(COLLECTION_KEY, row.cards || {});
        return { ok: true, motes: row.motes, cards: row.cards };
      }
      return { ok: false, reason: error?.message || 'purchase failed' };
    } catch {
      return { ok: false, reason: 'offline — try again once connected' };
    }
  }
  const p = getLocalProgress();
  if (p.motes < price) return { ok: false, reason: 'not enough Motes' };
  p.motes -= price;
  writeLocal(PROGRESS_KEY, p);
  const c = getLocalCollection();
  c[type] = (c[type] || 0) + 1;
  writeLocal(COLLECTION_KEY, c);
  return { ok: true, motes: p.motes, cards: c };
}
