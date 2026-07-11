# Limen online shell — accounts, cloud progression, unlocks

Research + spec only. No repo code touched by this pass. Written against the
repo state on branch `limen-design` at research time (`net/supabase.js`,
`ui/deckbuilder.js`, `main.js`, `index.html`, `data/tiles.js`, `core/config.js`,
`core/game.js`). Supabase project `limen` (ref `kghzdnspdsxrheuckizp`,
`https://kghzdnspdsxrheuckizp.supabase.co`, publishable key
`sb_publishable_TTNv39Gsg8o20dmCOj2lfQ_rttaEvPR`, vendored client
`vendor/supabase.min.js` = **supabase-js 2.110.2 UMD**, confirmed by header
comment in the file). Live project state confirmed directly via Supabase MCP
(`list_tables`, `execute_sql`, `get_advisors`) and via the public
`/auth/v1/settings` endpoint — not guessed.

---

## 0. Executive findings (read this first)

1. **Anonymous sign-ins are OFF right now.** Verified live:
   `GET https://kghzdnspdsxrheuckizp.supabase.co/auth/v1/settings` →
   `"anonymous_users":false`. This is the one hard blocker — see §4.
2. **Recommended flow:** guest-by-default via **silent anonymous sign-in on
   page load** (not a button), local-first storage as the source of truth,
   Supabase as an async best-effort sync layer, optional **email upgrade**
   (`updateUser({ email })`) that preserves `auth.uid()` and all owned rows.
3. **Use `flowType: 'implicit'`, not `'pkce'`, for the email link** — a
   deliberate deviation from the "PKCE is more secure" default advice. Reason
   in §3.4: PKCE's `code_verifier` is `localStorage`-pinned to the *browser
   that started the flow*; a user who requests the link on desktop and opens
   their email on a phone cannot complete sign-in. Implicit has no such
   requirement and this project has zero OAuth providers enabled (only
   `email`), which is the scenario implicit's known weakness targets — so the
   trade-off costs nothing here.
4. **Unlock grants are server-side** via one Postgres function
   (`record_match_result`, ~35 lines, security definer) — not client-computed.
   `collections` and `progress` get **no client INSERT/UPDATE policies at
   all**; the function is the only writer. `decks` stays directly
   client-writable (your own decklist isn't an economy).
5. `limen_rooms` (multiplayer) needs **zero changes** — its open RLS already
   works identically for anon-role callers and authenticated-role callers
   (anonymous-signed-in users assume the `authenticated` Postgres role but
   the existing policies target `anon`... see §2.3 for the one real fix
   needed there).
6. Architecture bug found while reading `net/supabase.js`: `client()`
   constructs a **new** `createClient()` on every call (twice already, in
   `NetSession.host` and `NetSession.join`). Adding auth means a third
   caller. supabase-js warns/misbehaves with multiple `GoTrueClient`
   instances sharing one `localStorage` key (session refresh races). Fix:
   **one module-level singleton**, imported everywhere. Spec'd in §5.1.

---

## 1. Current state audit

| File | Role today |
|---|---|
| `net/supabase.js` | `client()` — fresh `createClient()` per call, no auth config passed (defaults apply: `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`, `flowType: 'implicit'` — see §3.1). `NetSession` — action-log relay over `limen_rooms`. |
| `ui/deckbuilder.js` | Single deck. `localStorage['limen_deck']` holds one composition object `{TYPE: count}`. `loadSavedDeck()` / save-on-close. Iterates the **entire** `TILE_POOL` with no ownership gating — every card is always available today, gated only by `CONFIG` tier caps. This is the thing "unlock progression" changes. |
| `main.js` | Wires menu buttons, starts games, multiplayer modal. `checkGameOver()` calls `hud.showWin(...)` — **no persistence of win/loss happens anywhere today.** This is the wire point for `record_match_result`. |
| `index.html` | Static overlays (`#deckOverlay`, `#mpOverlay`, `#helpOverlay`, `#winOverlay`...). No account/collection overlay exists yet. |
| `data/tiles.js` | `TILE_POOL` (24 entries: 6 common, 8 uncommon incl. 2 rites, ... see full table §6.1), `defaultDeckComposition()` sums to `CONFIG.DECK_SIZE` (20). |
| `core/config.js` | `DECK_SIZE: 20`, `COPY_CAP: {common:3, uncommon:2, rare:1}`, `MAX_RARE: 2`, `MAX_UNCOMMON: 6`. Owned by the core-rules workstream — this spec does not touch it. |
| `core/game.js` | `validateDeck(composition)` — pure function, checks size + copy caps + rarity caps. Deckbuilder v2 must still pass this; ownership gating is an *additional* client-side constraint on top, not a replacement. |
| `supabase/migrations/20241001180000_create_game_tables.sql` | **Stale — do not trust.** Describes tables `rooms`/`players` that do not exist on the live project. Confirmed via `list_tables`: the only table in `public` is `limen_rooms` (1 row, RLS on). The real `limen_rooms` migration is not in this repo (applied out-of-band). New migration should go in a **new** timestamped file; don't edit or rely on the 2024 file. |
| `assets/tiles/*.jpg` | Card art. **17 of 24 `TILE_POOL` types have art.** Missing: `DREADMAW, FANGWOLF, FORESIGHT, GALEHARRIER, JUGGERNAUT, LEECHSPRITE, RALLYING_CRY, SUNDER, VEILWISP` (the 6 wave-1 mechanic tiles + all 3 rites). This is being worked by a parallel art-gen workstream per `NIGHT_PLAN.md`; the collection gallery needs a fallback for these regardless of timing (§7.3). |

Live Supabase project facts (via MCP, not assumed):
- `auth.users`: 0 rows. Clean slate.
- `auth.users` has an `is_anonymous` column and `auth.flow_state` table exists
  → this GoTrue instance supports both anonymous auth and PKCE natively; only
  the project-level *toggle* is off.
- `get_advisors(security)`: two pre-existing WARNs on `limen_rooms`
  (`INSERT`/`UPDATE` policies `USING (true)`) — expected, already
  acknowledged in `GAME_DESIGN.md` by design. New tables in this spec do
  **not** add new WARNs (owner-scoped RLS throughout).

---

## 2. Schema + RLS (ready-to-apply SQL)

File: `supabase/migrations/20260711000000_accounts_progression.sql`

### 2.1 Design decisions

- **Table shape:** one row per user for `profiles`/`collections`/`progress`
  (PK = `auth.uid()`), many rows per user for `decks` (deckbuilder v2 needs
  multiple named decks).
- **`collections.cards` and `decks.composition` are `jsonb`** — same
  `{TYPE: count}` shape as today's `localStorage['limen_deck']` and
  `limen_rooms.host_deck/guest_deck`. Zero format translation needed when
  migrating localStorage → cloud (§3.5) or cloud → `Game` constructor.
- **`unlock_track` is a small static reference table, not client-readable.**
  RLS enabled, **no policies** — only the `SECURITY DEFINER` function can see
  it. Clients never need the raw unlock order; they get told what they
  unlocked via the function's return value. (A JS-side copy of the same
  order is still needed for the *offline fallback* path — §3.6 — that's
  accepted duplication, not a schema concern.)
- **Starter collection is granted at signup**, not earned — it's exactly
  `defaultDeckComposition()` today (20 cards across 12 types), hardcoded as a
  JSONB literal in the trigger function below. **Drift risk, documented, not
  solved tonight:** if `data/tiles.js`'s default composition changes, this
  SQL literal goes stale silently. Fixing it properly means a config table
  both SQL and JS read from — real improvement, out of scope for tonight's
  deadline; flag for a follow-up ticket.
- **Why a Postgres function over client-computed grants:** the task allows
  either, with the tradeoff to be documented honestly either way. Client-side
  would mean any browser devtools user can `UPDATE collections SET cards = ...`
  directly if RLS allowed it, or simply lie about match results before
  writing — trivial to cheat, and for a "friendly game" that might be an
  acceptable tradeoff (this is genuinely a casual multiplayer hex game, not a
  ranked ladder). But the function costs about 20 minutes and ~35 lines, so
  there's no real reason to accept the cheatable version — picked the
  function. If a future implementer wants the simpler client-side path
  instead, the one change needed is: add `INSERT`/`UPDATE` policies to
  `collections`/`progress` scoped to `auth.uid() = user_id`, drop the RPC
  call, and have the client compute `unlock_step`/next card straight from
  `progress` after a local `validateDeck`-style check. That's the whole diff.

### 2.2 Migration SQL

```sql
-- 20260711000000_accounts_progression.sql
-- Accounts, cloud collection/decks, and server-validated unlock progression.
-- Additive only — does not touch limen_rooms.

-- ─── profiles ────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own profile select" on profiles
  for select using (auth.uid() = id);
create policy "own profile update" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- no insert policy for clients — profiles are created by the trigger below.

-- ─── collections ─────────────────────────────────────────────────────────
create table if not exists collections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cards jsonb not null default '{}'::jsonb,   -- {TYPE: owned_count}
  updated_at timestamptz not null default now()
);

alter table collections enable row level security;

create policy "own collection select" on collections
  for select using (auth.uid() = user_id);
-- deliberately no insert/update/delete policy — record_match_result() is
-- the only writer (SECURITY DEFINER bypasses RLS). See §2.1.

-- ─── decks (multi-deck, deckbuilder v2) ────────────────────────────────
create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  composition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table decks enable row level security;

create policy "own decks select" on decks
  for select using (auth.uid() = user_id);
create policy "own decks insert" on decks
  for insert with check (auth.uid() = user_id);
create policy "own decks update" on decks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own decks delete" on decks
  for delete using (auth.uid() = user_id);

-- ─── progress ────────────────────────────────────────────────────────────
create table if not exists progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  unlock_step int not null default 0,
  daily_first_win_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table progress enable row level security;

create policy "own progress select" on progress
  for select using (auth.uid() = user_id);
-- writer is record_match_result() only — see §2.1.

-- ─── unlock_track (server-only reference data) ─────────────────────────
create table if not exists unlock_track (
  step int primary key,
  card_type text not null
);

alter table unlock_track enable row level security;
-- no policies at all: unreadable/unwritable by anon or authenticated roles.
-- only SECURITY DEFINER functions (which run as the table owner) can read it.

insert into unlock_track (step, card_type) values
  (1,  'BASTION'),       -- uncommon, has art
  (2,  'MIRRORSAINT'),   -- rare, has art
  (3,  'RIFTWARDEN'),    -- rare, has art
  (4,  'SUNDER'),        -- rite, common (no art yet — client fallback art)
  (5,  'FORESIGHT'),     -- rite, common (no art yet)
  (6,  'RALLYING_CRY'),  -- rite, uncommon (no art yet)
  (7,  'FANGWOLF'),      -- uncommon (no art yet)
  (8,  'LEECHSPRITE'),   -- uncommon (no art yet)
  (9,  'VEILWISP'),      -- uncommon (no art yet)
  (10, 'JUGGERNAUT'),    -- rare (no art yet)
  (11, 'GALEHARRIER'),   -- rare (no art yet)
  (12, 'DREADMAW')       -- rare (no art yet)
on conflict (step) do nothing;
-- Every TILE_POOL type not already in defaultDeckComposition() (§2.1
-- starter grant), ordered art-first then rarity ascending, rites before
-- the still-art-less wave-1 mechanic tiles. Wins 13+ still count (progress
-- keeps incrementing) but grant no further card — record_match_result
-- returns unlocked_type = null past step 12. Documented as v1 scope: no
-- second-copy unlocks, no cosmetics track. Revisit once deck size / pool
-- size decisions land from the core-rules workstream.

-- ─── auto-provision on signup (covers anonymous AND email signups) ─────
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  insert into progress (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into collections (user_id, cards) values (new.id, '{
    "THICKET": 3, "OUTCROP": 3, "LANTERN": 2, "PALISADE": 2, "ALTAR": 2,
    "SKIRMISHER": 2, "WARDSTONE": 1, "ECHO": 1, "HERALD": 1, "REAVER": 1,
    "RIFTWALKER": 1, "COLOSSUS": 1
  }'::jsonb) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── record_match_result: the sole writer for progress + collections ───
create or replace function record_match_result(p_result text)
returns table(unlocked_type text, unlocked_step int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_step int;
  v_card text;
  v_new_day boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_result not in ('win', 'loss', 'draw') then
    raise exception 'p_result must be win, loss, or draw';
  end if;

  -- defensive fallback in case the signup trigger ever lagged/missed
  insert into progress (user_id) values (v_user) on conflict (user_id) do nothing;
  insert into collections (user_id) values (v_user) on conflict (user_id) do nothing;

  select (daily_first_win_at is null or daily_first_win_at::date <> current_date)
    into v_new_day from progress where user_id = v_user;

  update progress set
    wins = wins + (p_result = 'win')::int,
    losses = losses + (p_result = 'loss')::int,
    draws = draws + (p_result = 'draw')::int,
    streak = case when p_result = 'win' then streak + 1 else 0 end,
    best_streak = greatest(best_streak,
      case when p_result = 'win' then streak + 1 else 0 end),
    unlock_step = unlock_step + (p_result = 'win')::int,
    daily_first_win_at = case when p_result = 'win' and v_new_day
      then now() else daily_first_win_at end,
    updated_at = now()
  where user_id = v_user
  returning unlock_step into v_step;

  if p_result <> 'win' then return; end if;

  select ut.card_type into v_card from unlock_track ut where ut.step = v_step;
  if v_card is not null then
    update collections set
      cards = cards || jsonb_build_object(v_card,
        coalesce((cards->>v_card)::int, 0) + 1),
      updated_at = now()
    where user_id = v_user;
  end if;

  return query select v_card, v_step;
end;
$$;

grant execute on function record_match_result(text) to authenticated;
```

`daily_first_win_at` is tracked but **no bonus logic is wired to it yet** —
deliberately. The task asked for the column; inventing a bonus-unlock rule
for it tonight is scope creep past what's needed to ship. It's a clean hook
for a future "daily win bonus" feature (client can already display "first
win today!" from the timestamp).

### 2.3 `limen_rooms` — no schema change, one thing to verify

Anonymous-signed-in users hold the Postgres **`authenticated`** role (per
Supabase's anonymous-auth guide — anonymous is not the `anon` role). Today's
`limen_rooms` policies (`anon can create rooms`, `anon can update rooms`,
confirmed via `get_advisors`) are scoped to the `anon` role specifically. If
every visitor gets a silent anonymous session (§3.2), most traffic hitting
`limen_rooms` will actually be under `authenticated`, not `anon` — **the
existing policies would then block multiplayer** unless they also grant to
`authenticated`, or unless a role-agnostic policy exists.

Action needed (small, additive, in the same migration file):

```sql
-- Multiplayer must keep working once most visitors are auth'd anonymously.
drop policy if exists "anon can create rooms" on limen_rooms;
drop policy if exists "anon can update rooms" on limen_rooms;
-- (repeat drop/create for select/delete if those exist under anon-only names —
--  check exact current policy names with `select policyname, roles, cmd from
--  pg_policies where tablename='limen_rooms'` before dropping; the names
--  above are the two confirmed via get_advisors, there may be more.)
create policy "anyone can create rooms" on limen_rooms
  for insert to anon, authenticated with check (true);
create policy "anyone can update rooms" on limen_rooms
  for update to anon, authenticated using (true) with check (true);
```

Read the full current policy list first
(`select policyname, roles, cmd, qual, with_check from pg_policies where
tablename = 'limen_rooms'`) before writing the drop/create statements for
real — this spec only confirmed the two `INSERT`/`UPDATE` policy names via
the security advisor output; `SELECT`/`DELETE` policies may also exist and
need the same `anon, authenticated` treatment if so.

---

## 3. Auth flow — researched, with primary sources

Trust-prior tags: `[P]` = primary doc/live check, `[S]` = secondary
(community/GitHub), score 0–100 = confidence.

### 3.1 Client config (createClient auth options)

```js
auth: {
  persistSession: true,      // localStorage-backed session — required for guest continuity
  autoRefreshToken: true,    // default; keeps the anon/email session alive across a long play session
  detectSessionInUrl: true,  // parses the magic-link redirect automatically
  flowType: 'implicit',      // see §3.4 — deliberate, not the "just use PKCE" default advice
}
```
`persistSession`/`autoRefreshToken`/`detectSessionInUrl` are documented
client options [P, supabase.com/docs/reference/javascript/initializing, 85].
`flowType` default in supabase-js v2 is `'implicit'` (PKCE is opt-in, and is
the default only for the Swift client) [S, supabase.com/docs/guides/auth/
sessions/implicit-flow + dev.to/supabase confirmation, 70].

### 3.2 Guest-by-default: silent anonymous sign-in

On every page load, before the menu is interactive, in a **non-blocking**
call:

```js
const { data: { session } } = await sb.auth.getSession();
if (!session) {
  sb.auth.signInAnonymously().catch(() => {
    /* offline or feature not yet enabled — fall through to pure local mode */
  });
}
```

- `signInAnonymously()` is the documented call
  [P, supabase.com/docs/guides/auth/auth-anonymous, 90].
- Anonymous users are real rows in `auth.users` with `is_anonymous = true`;
  they persist across reloads (same browser) but are **lost** on clearing
  storage / switching browser or device — this is the exact reason the email
  upgrade nudge matters [P, same doc, 90].
- **Do not await this before enabling menu buttons.** `index.html`'s menu is
  already fully interactive with zero network dependency today — keep it
  that way. The call races in the background; if it hasn't resolved by the
  time the player finishes their first match, use the offline fallback
  (§3.6) for that one match and let the next app boot pick up the synced
  session normally.
- Rate limit: **30 requests/hour per IP, not configurable**
  [P, supabase.com/docs/guides/auth/rate-limits, 90]. A single visitor
  reloading the page repeatedly without ever completing sign-in (e.g. a
  broken retry loop) could exhaust this for everyone behind the same IP
  (school/office NAT). Mitigation: only call `signInAnonymously()` once per
  browser — gate it on a `localStorage` flag (`limen_anon_attempted`) so a
  failed attempt doesn't retry every single page load, only on next
  explicit user action (e.g. opening the account modal) or next full day.

### 3.3 Email upgrade (the "save your progress" flow)

```js
const { data, error } = await sb.auth.updateUser(
  { email },
  { emailRedirectTo: 'https://laulpogan.github.io/hexagon/' } // see §3.4 — site ROOT, no subpath
);
```
- Confirmed: **no "manual linking" dashboard setting required** for
  email/phone upgrade — that setting only gates OAuth `linkIdentity()`
  [P, supabase.com/blog/anonymous-sign-ins, 85].
- Confirmed: **`auth.uid()` is unchanged after conversion** — "the user id
  remains the same, which means that any data associated with the user's id
  would be carried over" [P, supabase.com/blog/anonymous-sign-ins, 85]. This
  is exactly why the "guest progress becomes account progress" flow needs no
  data migration at all once the user is on this browser — the rows are
  already keyed to the same `auth.uid()`, cloud-side, from the moment
  `signInAnonymously()` first ran.
- Known rough edge (GoTrue version-dependent, worth a smoke test before
  relying on it): some versions set `email_confirmed_at` and flip
  `is_anonymous` to `false` **immediately** on `updateUser({email})` rather
  than waiting for the confirmation click; others wait correctly
  [S, github.com/supabase/supabase issue #29350, 65]. Either behavior is
  fine for this app (worst case: `is_anonymous` flips a little early) — just
  don't build UI logic that depends on `is_anonymous` staying `true` until
  confirmation; key the UI off "does `session.user.email` exist" instead.
- Confirms via `updateUser` sends a confirmation email; error surface
  includes `"A user with this email address has already been registered"`
  [S, GitHub issue search across supabase/supabase, 70] — the account modal
  must handle this specific case with a clear message ("that email already
  has an account — sign in with a magic link instead") rather than a raw
  error dump.
- **Rate limits — the real gotcha for tonight:** built-in Supabase mailer is
  capped at **2 emails/hour project-wide** [P, supabase.com/docs/guides/
  auth/rate-limits, 90]. The per-endpoint OTP limit (30/hr) and per-user
  cooldown (60s) don't matter — the mailer itself is the bottleneck. This is
  fine for a handful of manual smoke tests tonight; it is **not** fine for
  any real morning traffic. Flag prominently in the human checklist (§4).

### 3.4 Why implicit flow, not PKCE, for this app

- PKCE stores a `code_verifier` in `localStorage` when the flow starts, and
  "the code exchange must be initiated on the same browser and device where
  the flow was started" [P, supabase.com/docs/guides/auth/sessions/
  pkce-flow, 90]. A player who requests the magic link from their gaming
  browser and opens the confirmation email on their phone — extremely common
  — **cannot complete sign-in** under PKCE; the phone's browser has no
  `code_verifier`.
- Implicit flow puts `access_token`/`refresh_token` directly in the URL
  fragment on redirect; `detectSessionInUrl: true` parses it automatically,
  and the fragment is never sent to any server (fragments aren't part of an
  HTTP request), so it doesn't leak into GitHub Pages' static-file server
  logs. No per-device pinning.
- PKCE's actual security win over implicit is protecting **OAuth** redirect
  URIs from interception by a malicious app registered on the same device
  (mobile OAuth flow hijacking). This project has **zero OAuth providers
  enabled** (`/auth/v1/settings` confirms only `"email": true`) — the threat
  PKCE defends against doesn't apply here. If Google/Discord sign-in is ever
  added later, revisit this decision for that provider specifically; email
  magic links can stay implicit regardless.
- Net: explicitly pass `flowType: 'implicit'` at `createClient()` time
  (§3.1) rather than leaving it to default silently — make the choice
  visible in code, with a comment pointing at this section.

### 3.5 Static-site redirect handling (GitHub Pages specific)

- Site is served from `https://laulpogan.github.io/hexagon/` (a **project
  page**, path-prefixed, confirmed via `index.html`'s `og:url` meta tag) —
  not a custom domain, not the repo root.
- GitHub Pages has no server-side routing — a path like `/hexagon/auth/
  confirm` returns a real 404 unless a matching static file exists. **Do not
  configure `emailRedirectTo` to any subpath.** Point it at the site root:
  `https://laulpogan.github.io/hexagon/`.
- With implicit flow (§3.4) and the **default** Supabase email template
  (`{{ .ConfirmationURL }}`), Supabase's own `/auth/v1/verify` endpoint does
  the token exchange server-side and 302s the browser to
  `emailRedirectTo` with `#access_token=...&refresh_token=...&...` appended.
  `index.html`'s single page loads normally, `detectSessionInUrl` sees the
  hash, fires `SIGNED_IN` via `onAuthStateChange`, and
  `history.replaceState(null, '', location.pathname)` should be called
  immediately after to strip the token out of the visible URL/browser
  history.
- Dashboard config needed either way (see §4): **Site URL** =
  `https://laulpogan.github.io/hexagon/`, and that exact URL added to
  **Redirect URLs** allowlist — Supabase rejects `emailRedirectTo` values not
  on the allowlist.
- Multiple tabs: each tab gets its own in-memory `GoTrueClient` (once §5.1's
  singleton fix lands, one per tab, not one per call within a tab), all
  reading/writing the same `localStorage` session key. supabase-js does not
  broadcast auth-state changes across tabs by itself in v2 — a second tab
  open during the magic-link click won't reactively update until it next
  reads `localStorage` (e.g. its own `getSession()` call, or a manual
  `storage` event listener if cross-tab-live-update is wanted later). Not
  needed for tonight: this is a single-page game, players aren't expected to
  run two tabs of the same session.

### 3.6 Offline / guest fallback (never block on Supabase)

- **localStorage is always the source of truth for the active session's
  UI**, cloud is sync, never the reverse for read-time blocking. No screen
  should show a loading spinner waiting on a Supabase round-trip before
  becoming usable — deckbuilder, collection gallery, and the menu must all
  render instantly from local state, then reconcile with cloud async if/when
  it responds.
- If a match ends and there is no active Supabase session (either
  `signInAnonymously()` hasn't resolved yet, per §3.2, or the network is
  down): compute the win/loss/streak/unlock locally using a **JS constant**
  that mirrors `unlock_track` exactly (kept in `data/` next to `tiles.js`,
  same 12-entry order as §2.2 — duplication accepted, see §2.1). Write to
  `localStorage['limen_progress']` / `localStorage['limen_collection']`.
- **No retroactive reconciliation.** A match played fully offline does not
  get replayed into the cloud once connectivity returns. Accepted tradeoff:
  building a real offline-outbox/replay queue is more engineering than a
  casual browser game's "played once while wifi was down" edge case
  justifies tonight. Forward state (next match onward, once a session
  exists) syncs normally.

---

## 4. Exactly what a human (or an orchestrator with dashboard/Management-API
   access) must do before this ships — nothing in this list is doable from
   the tools available to this research pass

1. **Enable anonymous sign-ins** (the one real blocker). Supabase Dashboard
   → Authentication → Sign In / Providers → **Anonymous** → toggle on. No
   equivalent found in the MCP toolset available to this session (no
   `update_auth_config`-shaped tool); this specific project's Management API
   PATCH would be `PATCH /v1/projects/kghzdnspdsxrheuckizp/config/auth` with
   `{"external_anonymous_users_enabled": true}` if a Management API personal
   access token is available to whoever implements this — otherwise it's a
   two-click dashboard action.
2. **Set Site URL + add Redirect URL**: Dashboard → Authentication → URL
   Configuration → Site URL = `https://laulpogan.github.io/hexagon/`;
   same value added under Redirect URLs. Required for `emailRedirectTo` to
   be accepted at all (§3.5).
3. **Know the mailer limit before testing**: built-in SMTP = 2 emails/hour
   project-wide (§3.3). Fine for a couple of manual checks tonight; if the
   morning demo needs more than ~2 real email upgrades tested, either accept
   the wait between tests or wire custom SMTP (Dashboard → Authentication →
   Emails → SMTP Settings) — that's a bigger lift (needs a transactional
   email provider + verified sending domain) and is **not** recommended as a
   tonight task; call it out as a known limitation instead.
4. **Apply the migration** in §2.2 + §2.3 (via `apply_migration` MCP tool,
   Supabase CLI, or dashboard SQL editor) — not done by this research pass by
   design (read-only mandate).
5. **Run `select policyname, roles, cmd, qual, with_check from pg_policies
   where tablename = 'limen_rooms'`** before writing the §2.3 drop/create
   statements for real, to catch any `SELECT`/`DELETE` anon-scoped policies
   this pass didn't see reflected in the advisor output (advisors only flag
   `USING(true)`/`WITH CHECK(true)` on non-SELECT commands, so a narrower
   anon-only SELECT policy wouldn't have surfaced there).

Nothing else is blocked — `email` provider is already enabled
(`/auth/v1/settings` → `"email": true`), signups are open
(`"disable_signup": false`), and the GoTrue instance already supports both
anonymous auth and PKCE at the schema level (confirmed via `auth.users.
is_anonymous` and `auth.flow_state` existing) — only the project-level
anonymous toggle is off.

---

## 5. Client architecture sketch

### 5.1 Singleton client — fixes the multi-instance bug (§0.6)

New file `net/client.js`:
```js
const SUPABASE_URL = 'https://kghzdnspdsxrheuckizp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TTNv39Gsg8o20dmCOj2lfQ_rttaEvPR';

let _sb = null;
export function sb() {
  if (!_sb) {
    if (!window.supabase) throw new Error('supabase-js not loaded');
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit', // §3.4
      },
    });
  }
  return _sb;
}
```
`net/supabase.js`'s `client()` and both call sites in `NetSession` switch to
`import { sb } from './client.js'; const client = sb;` — one instance for
the whole app (rooms + auth), no other behavior change.

### 5.2 Auth module — `net/auth.js` (sketch)

```js
import { sb } from './client.js';

export async function bootAuth() {
  const client = sb();
  const { data: { session } } = await client.auth.getSession();
  if (!session && !localStorage.getItem('limen_anon_attempted')) {
    localStorage.setItem('limen_anon_attempted', '1');
    client.auth.signInAnonymously().catch(() => {}); // §3.2 — fire and forget
  }
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') onSignedIn(session); // triggers §3.7 local->cloud migration
  });
}

export async function upgradeToEmail(email) {
  const client = sb();
  return client.auth.updateUser(
    { email },
    { emailRedirectTo: `${location.origin}${location.pathname}` }
  );
}

export async function currentUser() {
  const { data: { user } } = await sb().auth.getUser();
  return user; // null if fully offline/pre-signin
}
```

`bootAuth()` is called once from `main.js`, fire-and-forget, before the menu
wiring block — does not gate anything on its promise resolving.

### 5.3 Match-result call site — the one new line in `main.js`

Inside `checkGameOver()`, after `hud.showWin(...)`:
```js
const result = game.winner === null ? 'draw'
  : (mode === 'bot' ? game.winner === 1 : game.winner === myPlayer) ? 'win' : 'loss';
sb().rpc('record_match_result', { p_result: result })
  .then(({ data }) => hud.showUnlockReveal(data?.[0])) // §7.4 — null-safe, no-op if data empty or offline
  .catch(() => {}); // never block/alarm on failure — §3.6
```
Hotseat mode has no single "you" — result recording for hotseat is skipped
entirely (record nothing) unless/until hotseat gets its own per-seat account
binding, which is out of scope tonight. `mode === 'bot'` and `mode === 'mp'`
are the two modes that get progression.

---

## 6. Reference data (for the implementer, pulled straight from the repo)

### 6.1 Full `TILE_POOL` (24 entries) — for building the collection gallery
and the unlock-order sanity check

| type | rarity | starter count | art? |
|---|---|---|---|
| THICKET | common | 3 | yes |
| OUTCROP | common | 3 | yes |
| LANTERN | common | 2 | yes |
| PALISADE | common | 2 | yes |
| ALTAR | common | 2 | yes |
| SKIRMISHER | common | 2 | yes |
| WARDSTONE | uncommon | 1 | yes |
| ECHO | uncommon | 1 | yes |
| HERALD | uncommon | 1 | yes |
| REAVER | uncommon | 1 | yes |
| BASTION | uncommon | 0 (unlock step 1) | yes |
| RIFTWALKER | rare | 1 | yes |
| COLOSSUS | rare | 1 | yes |
| MIRRORSAINT | rare | 0 (unlock step 2) | yes |
| RIFTWARDEN | rare | 0 (unlock step 3) | yes |
| FANGWOLF | uncommon | 0 (unlock step 7) | **no** |
| LEECHSPRITE | uncommon | 0 (unlock step 8) | **no** |
| JUGGERNAUT | rare | 0 (unlock step 10) | **no** |
| VEILWISP | uncommon | 0 (unlock step 9) | **no** |
| GALEHARRIER | rare | 0 (unlock step 11) | **no** |
| DREADMAW | rare | 0 (unlock step 12) | **no** |
| SUNDER | rite/common | 0 (unlock step 4) | **no** |
| FORESIGHT | rite/common | 0 (unlock step 5) | **no** |
| RALLYING_CRY | rite/uncommon | 0 (unlock step 6) | **no** |

Starter counts sum to 20 = `CONFIG.DECK_SIZE`. Card art path convention:
`./assets/tiles/{TYPE}.jpg`.

---

## 7. Screen inventory — data contracts

For every screen: what it reads, what it writes, and the failure mode.

### 7.1 Title / menu (`#menu` in `index.html`)

- **Reads:** `currentUser()` (§5.2) for an account badge
  ("Guest" / "Signed in as {email}"). Non-blocking — badge starts blank/
  "Guest" and updates in place if a session resolves after paint.
  `localStorage['limen_deck']` already read today for the bot-mode start
  path — unchanged.
- **Writes:** none directly; routes to the account modal.
- **New UI:** one small badge/button near the existing menu buttons, e.g.
  top-right corner, not blocking the existing 5-button stack.

### 7.2 Account modal (new — e.g. `#accountOverlay`, `ui/account.js`)

- **Reads:** `currentUser()`, `profiles` row (`display_name`) via
  `sb().from('profiles').select('display_name').eq('id', uid).single()`.
- **Writes:**
  - Guest badge state needs no write (anonymous sign-in already ran at
    boot, §3.2).
  - "Save your progress" email form → `upgradeToEmail(email)` (§5.2), then
    show "check your email" state; handle the "already registered" error
    string specifically (§3.3).
  - Display name field → `sb().from('profiles').update({ display_name })
    .eq('id', uid)` (direct client write — harmless, RLS owner-scoped).
- **Failure mode:** if `currentUser()` is null (offline or pre-signin),
  show "Playing as guest — connect to save progress across devices" and
  disable the email form with a retry button that re-runs `bootAuth()`.

### 7.3 Collection gallery (new — `ui/collection.js`)

- **Reads:** `sb().from('collections').select('cards').eq('user_id', uid)
  .single()` → `{TYPE: count}`. Falls back to
  `localStorage['limen_collection']` (§3.6) if no session / offline, seeded
  with the starter 12-type set from §2.2 if that key doesn't exist yet
  either (first-ever local boot before any Supabase contact).
- **Renders:** iterate `TILE_POOL` (§6.1); owned (`count > 0`) tiles show
  `./assets/tiles/{TYPE}.jpg` at full color with the owned count; locked
  tiles (`count === 0` or type missing from the map) show the same art
  desaturated/dimmed (CSS `filter: grayscale(1) brightness(0.4)`) with a
  lock glyph overlay. For the 9 art-less types (§6.1), use a placeholder:
  a CSS gradient card face with the card name and rarity color border
  (`RARITY_COLOR` constants already exist in `ui/deckbuilder.js` — reuse
  them) instead of a broken `<img>`.
- **Writes:** none — this screen is read-only by design; unlocks only ever
  happen via the post-match reveal (§7.4).

### 7.4 Pack / unlock reveal (folds into the existing win overlay, or a new
   overlay shown right after it — implementer's call)

- **Trigger:** the `record_match_result` RPC response from §5.3
  (`{unlocked_type, unlocked_step}`).
- **Reads:** nothing further — the RPC response is the complete payload.
- **Writes:** none client-side (already written server-side by the RPC).
- **Render:** if `unlocked_type` is non-null, a reveal animation (flip/glow)
  showing that card's art (or the placeholder, §7.3) with "NEW CARD
  UNLOCKED". If `unlocked_type` is null (track exhausted past step 12, or a
  loss/draw, or offline fallback with nothing to show), skip the reveal
  entirely — don't show an empty/awkward "you unlocked nothing" state.
- **Failure mode:** RPC failed/offline → no reveal, no error toast (silent,
  per §3.6) — the match result screen (existing `showWin`) already gives the
  player their win/loss feedback; the reveal is a bonus layer, not core
  feedback.

### 7.5 Post-match reward strip (extends `ui/hud.js`'s existing `showWin`)

- **Reads:** `progress` row after the RPC resolves (or the RPC's own
  `unlocked_step` plus a follow-up `select wins, losses, streak from
  progress where user_id = uid` if the strip wants a running streak
  display — cheaper to just have `record_match_result` return those columns
  too rather than a second round trip; **recommend widening the RPC's
  return type** to `table(unlocked_type text, unlocked_step int, wins int,
  losses int, streak int)` and adding those to the final `select` — trivial
  addition to §2.2's function, saves a network call).
- **Writes:** none.
- **Render:** small strip under the existing win-box table (`Placed /
  Captured / Discarded` — already shipped) adding `Streak: N` and, if
  `unlocked_type` was non-null, `+1 {CARD_NAME}`.

### 7.6 Deckbuilder v2 (extends `ui/deckbuilder.js`)

- **Reads:**
  - `decks` table: `sb().from('decks').select('*').eq('user_id', uid)
    .order('updated_at', { ascending: false })` → deck list for a new
    "My Decks" picker above the existing single-deck grid.
  - `collections.cards` (or the local fallback, §7.3) for ownership gating:
    `add(type)` in today's `deckbuilder.js` currently checks only
    `CONFIG.COPY_CAP`/`MAX_RARE`/`MAX_UNCOMMON` — v2 adds one more guard:
    `if ((owned[type] || 0) <= (working[type] || 0)) return;` (can't add a
    copy you don't own). Ownership caps at the collection's owned count,
    **not** shared/consumed across decks — owning 2 copies lets you run 2
    in every deck simultaneously (standard digital-TCG convention: a deck is
    a decklist referencing the shared collection, not a physical pull from
    a shared pool).
  - `CONFIG.DECK_SIZE` and `validateDeck()` — unchanged, still the
    authority on legal deck shape; ownership gating is additive on top, not
    a replacement.
- **Writes:** deck save →
  `sb().from('decks').upsert({ id, user_id: uid, name, composition })` (new
  deck: omit `id`, let the default generate one); rename/delete via
  matching `update`/`delete` calls scoped by `id` (RLS already restricts to
  `user_id = auth.uid()` regardless). Also still writes
  `localStorage['limen_deck']` for the "active" deck exactly as today, so
  bot-mode's `loadSavedDeck()` call in `main.js` keeps working unchanged —
  cloud decks are an addition, not a replacement of the local active-deck
  mirror.
- **Failure mode:** no session / offline → "My Decks" list shows only a
  single local entry (today's behavior, unchanged), cloud multi-deck UI
  hidden or shown-disabled with a "sign in to save named decks" hint. Never
  block deckbuilding on a network round trip — `open()` must render
  synchronously from whatever's cached locally, same as today.

---

## 8. localStorage → cloud migration (guest progress becomes account
   progress on first sign-in)

Fires once, from the `SIGNED_IN` handler in `bootAuth()` (§5.2), guarded by
a `localStorage['limen_migrated_' + uid]` flag so an anonymous session that
churns (cleared storage, re-signed-in) doesn't repeat it:

1. Read `localStorage['limen_deck']` (today's single active deck). If
   present and the account's `decks` table is empty, insert it as a deck
   named `"My Deck"`.
2. Local collection/progress mirrors (`limen_collection`, `limen_progress`,
   only present if the offline fallback of §3.6 ever fired before this
   sign-in completed) are **not** pushed to cloud — per §3.6's "no
   retroactive reconciliation" decision, these stay local-only artifacts of
   the brief pre-auth window and are superseded by the cloud
   `collections`/`progress` rows the signup trigger already created. This
   keeps the migration one-directional and simple: local *deck* migrates up
   once; local *progress/collection* never does.
3. Set `localStorage['limen_migrated_' + uid] = '1'`.

This is intentionally the smallest migration that satisfies "the existing
localStorage deck should migrate into cloud decks on first sign-in" — it
does not attempt to reconcile progress-tracking data, which per §3.6 is
accepted as a narrow, rare edge case not worth the complexity tonight.

---

## 9. Failure modes summary (cross-reference)

| Failure | Behavior |
|---|---|
| Supabase unreachable at boot | Menu fully interactive immediately (unchanged from today); `bootAuth()` fails silently; account badge stays "Guest"; deckbuilder/collection render from localStorage only. |
| `signInAnonymously()` rate-limited (30/hr/IP) | Fails silently, retried only on next explicit account-modal open or next calendar day (§3.2's `limen_anon_attempted` gate). |
| Magic link mailer rate-limited (2/hr project) | `updateUser({email})` call itself still returns success (the request was accepted) — actual email may be delayed/dropped project-side; account modal should not falsely promise instant delivery, copy should say "check your email in a few minutes." |
| `record_match_result` RPC fails/times out | Win/loss screen (existing `showWin`) still renders normally; no unlock reveal shown; no retry, no error surfaced to the player (§5.3). |
| Player on a second device, never emailed-upgraded first device | Second device is a **new** anonymous account with its own fresh starter collection — expected, documented, this is exactly why the account modal should nudge email upgrade early (e.g. after first win) rather than leave it undiscoverable. |
| `decks` write fails (offline mid-save) | `localStorage['limen_deck']` write (existing code path, `saveDeck()`) still succeeds independently — active deck never lost even if cloud sync of the named-deck list fails. |

---

## 10. Suggested new files (implementer's call on final naming/split)

- `net/client.js` — singleton (§5.1)
- `net/auth.js` — boot/upgrade/currentUser (§5.2)
- `ui/account.js` — account modal (§7.2)
- `ui/collection.js` — collection gallery (§7.3)
- `data/unlock_track.js` — JS mirror of the SQL `unlock_track` seed rows,
  for the offline fallback (§3.6) — literal duplicate of §2.2's 12-row list,
  comment pointing back at the migration as the source of truth.
- `supabase/migrations/20260711000000_accounts_progression.sql` — §2.2 + §2.3

`ui/deckbuilder.js` and `ui/hud.js` get extended in place (§7.6, §7.5), not
replaced. `main.js` gets `bootAuth()` call + the one `record_match_result`
call site (§5.3).
