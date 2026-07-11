-- Accounts, cloud collection/deck, and server-validated match recording.
-- Additive only w.r.t. limen_rooms's DATA — but see the limen_rooms RLS
-- rewrite at the bottom (B2), which is a real policy change, not additive.
--
-- Design note (C2a, 2026-07-11): this implements SHELL_SPEC.md's schema
-- shape with two binding amendments from DESIGN_ROUND_7.md's Gate #1
-- verdicts (B1, B4, B5, B6, B9):
--   - The Mote economy (B4/B5) REPLACES SHELL_SPEC §2's sequential
--     unlock_track auto-grant. Wins earn Motes (record_match_result);
--     players spend Motes explicitly on a card of their choice
--     (spend_motes) — a dopamine choice moment, not an auto-grant.
--     unlock_track ships as an empty, unreadable reference table per B3 —
--     rows are generated from the FINAL tile pool in phase C2b, not
--     hand-copied tonight.
--   - decks is single-row-per-user (B6 cut multi-deck management), owner-
--     writable directly — "your own decklist isn't an economy" (SHELL_SPEC
--     §2.1). collections/progress stay RPC-only writers (SHELL_SPEC's
--     original anti-cheat posture) — spend_motes's client-supplied price
--     is trusted, not re-derived server-side (the price ladder lives in
--     TILE_POOL/JS); this is the documented "client-authoritative,
--     cheatable by devtools, acceptable for a friendly game" trust model
--     B9 pre-approves.

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
-- deliberately no insert/update/delete policy — handle_new_user() (starter
-- grant) and spend_motes() (unlock purchase) are the only writers, both
-- SECURITY DEFINER (bypass RLS). See design note above.

-- ─── decks (single cloud-synced deck per user — B6) ────────────────────
create table if not exists decks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  composition jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table decks enable row level security;

create policy "own deck select" on decks
  for select using (auth.uid() = user_id);
create policy "own deck insert" on decks
  for insert with check (auth.uid() = user_id);
create policy "own deck update" on decks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── progress ────────────────────────────────────────────────────────────
create table if not exists progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  motes int not null default 0,               -- Mote economy (B4/B5)
  daily_first_win_at timestamptz,              -- B1/B5: daily-first-win bonus
  last_match_at timestamptz,                   -- B1: atomic cooldown guard
  updated_at timestamptz not null default now()
);

alter table progress enable row level security;

create policy "own progress select" on progress
  for select using (auth.uid() = user_id);
-- writer is record_match_result() / spend_motes() only — see design note.

-- ─── unlock_track (server-only reference data — B3) ────────────────────
-- Empty tonight. Rows generated from the FINAL data/tiles.js pool in phase
-- C2b, after the core-rules agent's pool expansion lands. Kept as an
-- unreadable table now so the C2b migration is additive (INSERT only).
create table if not exists unlock_track (
  step int primary key,
  card_type text not null
);

alter table unlock_track enable row level security;
-- no policies at all: unreadable/unwritable by anon or authenticated roles.

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
  -- Starter grant literal — mirrors data/tiles.js's defaultDeckComposition()
  -- as of 2026-07-11. Drift risk documented (SHELL_SPEC §2.1): if the base
  -- pool's starter counts change, this literal goes stale silently until
  -- the C2b generator lands.
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

-- ─── record_match_result: sole writer for progress' win/loss/Mote ledger ─
-- B1: the cooldown check and the write are ONE statement (WHERE-clause
-- guard on the UPDATE), not a separate SELECT-then-UPDATE — closes the
-- check-then-act race a client could exploit by firing concurrent calls.
create or replace function record_match_result(p_result text)
returns table(
  wins int, losses int, draws int, streak int, best_streak int,
  motes int, daily_bonus boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_new_day boolean;
  v_mote_gain int;
  v_row progress%rowtype;
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

  v_mote_gain := case when p_result = 'win'
    then 1 + case when v_new_day then 1 else 0 end
    else 0 end;

  update progress set
    wins = wins + (p_result = 'win')::int,
    losses = losses + (p_result = 'loss')::int,
    draws = draws + (p_result = 'draw')::int,
    streak = case when p_result = 'win' then streak + 1 else 0 end,
    best_streak = greatest(best_streak,
      case when p_result = 'win' then streak + 1 else 0 end),
    motes = motes + v_mote_gain,
    daily_first_win_at = case when p_result = 'win' and v_new_day
      then now() else daily_first_win_at end,
    last_match_at = now(),
    updated_at = now()
  where user_id = v_user
    and (last_match_at is null or last_match_at < now() - interval '20 seconds')
  returning * into v_row;

  if not found then
    raise exception 'cooldown: results can only be recorded once every 20s';
  end if;

  return query select v_row.wins, v_row.losses, v_row.draws, v_row.streak,
    v_row.best_streak, v_row.motes, (p_result = 'win' and v_new_day);
end;
$$;

grant execute on function record_match_result(text) to authenticated;

-- ─── spend_motes: the unlock-purchase RPC (Mote economy, B4/B5) ────────
-- Price is client-supplied — the price ladder is computed from live
-- TILE_POOL data in JS (net/progress.js), not duplicated server-side.
-- Trust model documented above (B9): honest, client-authoritative,
-- cheatable by devtools, accepted for a friendly game. The atomicity that
-- DOES matter (can't spend Motes you don't have, can't double-spend on a
-- race) is enforced here via the same WHERE-guard UPDATE pattern as
-- record_match_result.
create or replace function spend_motes(p_card_type text, p_price int)
returns table(motes int, cards jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_progress progress%rowtype;
  v_collections collections%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_price < 0 then raise exception 'invalid price'; end if;
  if p_card_type is null or length(p_card_type) = 0 then
    raise exception 'invalid card type';
  end if;

  insert into progress (user_id) values (v_user) on conflict (user_id) do nothing;
  insert into collections (user_id) values (v_user) on conflict (user_id) do nothing;

  update progress set motes = motes - p_price, updated_at = now()
  where user_id = v_user and motes >= p_price
  returning * into v_progress;

  if not found then
    raise exception 'insufficient motes';
  end if;

  update collections set
    cards = cards || jsonb_build_object(p_card_type,
      coalesce((cards->>p_card_type)::int, 0) + 1),
    updated_at = now()
  where user_id = v_user
  returning * into v_collections;

  return query select v_progress.motes, v_collections.cards;
end;
$$;

grant execute on function spend_motes(text, int) to authenticated;

-- ─── limen_rooms RLS fix (B2) ────────────────────────────────────────────
-- Anonymous-signed-in users hold the Postgres `authenticated` role (per
-- Supabase's anonymous-auth guide — anonymous is not the `anon` role).
-- Once most visitors get a silent anonymous session, all three existing
-- limen_rooms policies (anon-only) would block multiplayer for them,
-- including the live-verified SELECT policy that realtime sync depends on.
-- Live-verified exact policy set before this migration (2026-07-11):
--   "anon can create rooms"  INSERT  roles={anon}
--   "anon can read rooms"    SELECT  roles={anon}
--   "anon can update rooms"  UPDATE  roles={anon}
-- No DELETE policy exists. Rewrite all three to grant anon + authenticated.
drop policy if exists "anon can create rooms" on limen_rooms;
drop policy if exists "anon can read rooms" on limen_rooms;
drop policy if exists "anon can update rooms" on limen_rooms;

create policy "anyone can create rooms" on limen_rooms
  for insert to anon, authenticated with check (true);
create policy "anyone can read rooms" on limen_rooms
  for select to anon, authenticated using (true);
create policy "anyone can update rooms" on limen_rooms
  for update to anon, authenticated using (true) with check (true);
