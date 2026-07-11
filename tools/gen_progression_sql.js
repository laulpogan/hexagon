// C2b (B3): generate the starter-collection + unlock_track migration from
// the LIVE data/tiles.js — never hand-copied literals. Rerun after any pool
// or starter-deck change; the output is a full migration file.
// Usage: node tools/gen_progression_sql.js [outfile]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { TILE_POOL, defaultDeckComposition } from '../data/tiles.js';

// The R3/R5 showcase keywords (analysis/pool40.json) — their locked cards are
// spaced through the track as milestone rewards rather than clumped by rarity.
const SHOWCASE_KEYWORDS = new Set(['SUREFOOT', 'TIDEBOUND', 'SUMMIT', 'SEAMBOUND']);

export function unlockTrackOrder() {
  const locked = TILE_POOL.filter(t => !((t.count || 0) > 0));
  const isShowcase = t => t.keywords.some(k => SHOWCASE_KEYWORDS.has(k));
  const commons = locked.filter(t => t.rarity === 'common' && !isShowcase(t));
  const uncommons = locked.filter(t => t.rarity === 'uncommon' && !isShowcase(t));
  const rares = locked.filter(t => t.rarity === 'rare' && !isShowcase(t));
  const showcase = locked.filter(isShowcase);
  // Commons early (free claims — quick wins for a new player), then
  // uncommons, rares late. Showcase cards inserted evenly across the
  // post-commons stretch as milestone rewards.
  const tail = [...uncommons, ...rares];
  const k = showcase.length;
  for (let i = 0; i < k; i++) {
    // even spacing: i-th showcase lands at the (i+1)/(k+1) point of the tail
    const pos = Math.floor(((i + 1) * (tail.length + k)) / (k + 1));
    tail.splice(Math.min(pos, tail.length), 0, showcase[i]);
  }
  return [...commons, ...tail].map(t => t.type);
}

export function generateSql() {
  const starter = defaultDeckComposition();
  // SQL-escape ' → '' — the pool has apostrophe types (WILL-O'-WISP) and the
  // whole jsonb payload sits inside a single-quoted SQL string literal.
  const starterJson = JSON.stringify(starter, null, 4)
    .replace(/'/g, "''")
    .split('\n').map(l => '    ' + l).join('\n').trim();
  const track = unlockTrackOrder();
  const values = track.map((type, i) => `  (${i + 1}, '${type.replace(/'/g, "''")}')`).join(',\n');

  return `-- C2b (B3): starter collection + unlock_track, GENERATED from the live
-- data/tiles.js pool by tools/gen_progression_sql.js — do not hand-edit;
-- rerun the generator after any pool or starter-deck change.
-- Pool at generation time: ${TILE_POOL.length} types, ${track.length} locked (non-starter).

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
    '${starterJson}'::jsonb
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ─── unlock_track: full refresh (reference data, server-only, no policies) ─
-- Order: commons early (free claims), uncommons, rares late; the R3/R5
-- showcase cards (${TILE_POOL.filter(t => !((t.count || 0) > 0) && t.keywords.some(k => SHOWCASE_KEYWORDS.has(k))).map(t => t.type).join(', ')}) spaced through the
-- post-commons stretch as milestone rewards.
delete from unlock_track;
insert into unlock_track (step, card_type) values
${values};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] ||
    new URL('../supabase/migrations/20260711120000_c2b_pool42_progression.sql', import.meta.url);
  const sql = generateSql();
  fs.writeFileSync(out, sql);
  console.log(`wrote ${out}`);
  console.log(`track: ${unlockTrackOrder().length} steps`);
  console.log(unlockTrackOrder().map((t, i) => `${i + 1}. ${t}`).join('\n'));
}
