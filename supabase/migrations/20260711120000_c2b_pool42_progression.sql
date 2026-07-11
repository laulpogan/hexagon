-- C2b (B3): starter collection + unlock_track, GENERATED from the live
-- data/tiles.js pool by tools/gen_progression_sql.js — do not hand-edit;
-- rerun the generator after any pool or starter-deck change.
-- Pool at generation time: 42 types, 28 locked (non-starter).

-- ─── handle_new_user: starter grant regenerated (replaces the C2a literal) ─
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  insert into progress (user_id) values (new.id) on conflict (user_id) do nothing;
  -- Starter grant — generated from data/tiles.js defaultDeckComposition().
  insert into collections (user_id, cards) values (new.id,
    '{
        "THICKET": 1,
        "ECHO": 1,
        "HERALD": 2,
        "COLOSSUS": 1,
        "LEECHSPRITE": 2,
        "SUNDER": 1,
        "RALLYING_CRY": 1,
        "EMBERSLINGER": 2,
        "RIFT-WALL": 1,
        "BANEBERRY": 2,
        "PETRIFIED-ROSE": 1,
        "WILL-O''-WISP": 2,
        "POLLENCLOUD": 2,
        "APEXWARDEN": 1
    }'::jsonb
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ─── unlock_track: full refresh (reference data, server-only, no policies) ─
-- Order: commons early (free claims), uncommons, rares late; the R3/R5
-- showcase cards (STONETREADER, SEAMDRINKER, SEAMKEEPER) spaced through the
-- post-commons stretch as milestone rewards.
delete from unlock_track;
insert into unlock_track (step, card_type) values
  (1, 'OUTCROP'),
  (2, 'LANTERN'),
  (3, 'PALISADE'),
  (4, 'ALTAR'),
  (5, 'SKIRMISHER'),
  (6, 'FORESIGHT'),
  (7, 'SPRITE'),
  (8, 'FLAME-LURKER'),
  (9, 'WARDSTONE'),
  (10, 'REAVER'),
  (11, 'BASTION'),
  (12, 'FANGWOLF'),
  (13, 'VEILWISP'),
  (14, 'STONETREADER'),
  (15, 'FOXGLOVE'),
  (16, 'VEILWALKER'),
  (17, 'SOUL-ENGINE'),
  (18, 'SPLINTER'),
  (19, 'SEAMDRINKER'),
  (20, 'RIFTWALKER'),
  (21, 'MIRRORSAINT'),
  (22, 'RIFTWARDEN'),
  (23, 'JUGGERNAUT'),
  (24, 'GALEHARRIER'),
  (25, 'SEAMKEEPER'),
  (26, 'DREADMAW'),
  (27, 'MAELSTONIUM'),
  (28, 'TEAR-ESSENCE');
