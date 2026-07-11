// Limen tile pool — the collectible layer. Balance knobs: influence numbers,
// keyword assignments, rarity, default-deck counts. Edit here, nowhere else.

export const KEYWORDS = {
  WARD:        { name: 'Ward',         desc: 'The first time this would be captured, the attack is absorbed instead (once per game).' },
  RALLY:       { name: 'Rally',        desc: '+1 effective influence to adjacent friendly tiles.' },
  SIEGE:       { name: 'Siege',        desc: 'Adjacent enemy tiles suffer an extra −5 influence.' },
  SCOUT:       { name: 'Scout',        desc: 'May be placed on any empty hex outside the enemy heartland — no adjacency required.' },
  FORTIFIED:   { name: 'Fortified',    desc: '+2 base influence on a board edge.' },
  DOUBLESTRIKE:{ name: 'Double Strike',desc: 'Counts twice when contributing influence to adjacent tiles.' },
  ATTUNED:     { name: 'Rift-Attuned', desc: 'Gains +1 influence per adjacent rift hex instead of −1.' },
  // Wave 1 (design round 1 — MTG analogs)
  FLANK:       { name: 'Flank',        desc: 'Enemy tiles adjacent to this are capturable at 2 influence or less.' },
  WING:        { name: 'Wing',         desc: 'Influence pressed onto this tile by non-Wing enemies is halved.' },
  MENACE:      { name: 'Menace',       desc: 'Cannot be captured unless 2+ enemy tiles are adjacent.' },
  SUSTAIN:     { name: 'Sustain',      desc: 'Each capture this tile makes permanently raises its base influence by 1.' },
  TRAMPLE:     { name: 'Trample',      desc: 'When this captures, the weakest other adjacent enemy tile permanently loses 2 base influence.' },
  UNTOUCHABLE: { name: 'Untouchable',  desc: 'Cannot be targeted by enemy rites.' },
  // RULES-7 / R8 pool — showcase the height (R3) and rift (R5) systems.
  SUREFOOT:    { name: 'Surefoot',     desc: 'Never suffers the uphill penalty when pressing a taller enemy.' },
  TIDEBOUND:   { name: 'Tidebound',    desc: 'Each capture made on or beside the rift permanently raises its base influence by 1.' },
  SUMMIT:      { name: 'Summit',       desc: '+2 influence while its cell stands 3 tiers tall or higher.' },
  SEAMBOUND:   { name: 'Seambound',    desc: '+3 influence while standing directly on a rift hex.' },
};

export const RITE_INFO = {
  SUNDER:       { name: 'Sunder',       desc: 'Destroy a non-capital enemy tile at 2 influence or less — anywhere on the board.' },
  FORESIGHT:    { name: 'Foresight',    desc: 'Cycle your two weakest hand tiles for fresh draws.' },
  RALLYING_CRY: { name: 'Rallying Cry', desc: 'Friendly tiles adjacent to a target friendly tile permanently gain +1 influence.' },
};

// rarity: common (3 copies max) / uncommon (2) / rare (1).
// count: copies in the default starter deck (sums to CONFIG.DECK_SIZE).
// R8 starter rebuild (2026-07-11): the old 20-card starter shipped ZERO
// rite/wave-1 copies (the tension mechanics were invisible in game one —
// tumble-dry finding). This 24-card default includes FLANK (WILL-O'-WISP),
// WING (POLLENCLOUD), SUSTAIN (LEECHSPRITE), 1 SUNDER, 1 RALLYING_CRY, and
// APEXWARDEN to put a new R3 (high-ground) showcase card in every game one.
// THICKET/OUTCROP were flagged as redundant "vanilla twins" (ARENA_PLAN) —
// OUTCROP dropped to 0, its slot given to real texture instead.
export const TILE_POOL = [
  // ─── COMMON ─────────────────────────────────────────────────────────
  { type: 'THICKET',     influence: 2, rarity: 'common',   count: 2, keywords: [] },
  { type: 'OUTCROP',     influence: 2, rarity: 'common',   count: 0, keywords: [] },
  { type: 'LANTERN',     influence: 1, rarity: 'common',   count: 0, keywords: ['SCOUT'] },
  { type: 'PALISADE',    influence: 1, rarity: 'common',   count: 0, keywords: ['FORTIFIED'] },
  { type: 'ALTAR',       influence: 1, rarity: 'common',   count: 0, keywords: ['RALLY'] },
  { type: 'SKIRMISHER',  influence: 1, rarity: 'common',   count: 0, keywords: ['SIEGE'] },

  // ─── UNCOMMON ───────────────────────────────────────────────────────
  { type: 'WARDSTONE',   influence: 1, rarity: 'uncommon', count: 0, keywords: ['WARD'] },
  { type: 'ECHO',        influence: 2, rarity: 'uncommon', count: 2, keywords: ['DOUBLESTRIKE'] },
  { type: 'HERALD',      influence: 2, rarity: 'uncommon', count: 2, keywords: ['RALLY'] },
  { type: 'REAVER',      influence: 2, rarity: 'uncommon', count: 0, keywords: ['SIEGE'] },
  { type: 'BASTION',     influence: 2, rarity: 'uncommon', count: 0, keywords: ['FORTIFIED', 'WARD'] },

  // ─── RARE ───────────────────────────────────────────────────────────
  { type: 'RIFTWALKER',  influence: 2, rarity: 'rare',     count: 0, keywords: ['ATTUNED', 'SCOUT'] },
  { type: 'COLOSSUS',    influence: 4, rarity: 'rare',     count: 1, keywords: [] },
  { type: 'MIRRORSAINT', influence: 3, rarity: 'rare',     count: 0, keywords: ['RALLY', 'DOUBLESTRIKE'] },
  { type: 'RIFTWARDEN',  influence: 3, rarity: 'rare',     count: 0, keywords: ['ATTUNED', 'WARD'] },

  // ─── WAVE 1: MTG-analog mechanics (design round 1) ──────────────────
  { type: 'FANGWOLF',    influence: 2, rarity: 'uncommon', count: 0, keywords: ['FLANK'] },
  { type: 'LEECHSPRITE', influence: 1, rarity: 'uncommon', count: 2, keywords: ['SUSTAIN'] },
  { type: 'JUGGERNAUT',  influence: 3, rarity: 'rare',     count: 0, keywords: ['TRAMPLE'] },
  { type: 'VEILWISP',    influence: 2, rarity: 'uncommon', count: 0, keywords: ['UNTOUCHABLE'] },
  // Round 2 anti-aggro pair — rare-capped training wheels
  { type: 'GALEHARRIER', influence: 2, rarity: 'rare',     count: 0, keywords: ['WING'] },
  { type: 'DREADMAW',    influence: 2, rarity: 'rare',     count: 0, keywords: ['MENACE'] },

  // ─── RITES (spells — cast as your placement) ─────────────────────────
  { type: 'SUNDER',       influence: 0, rarity: 'common',   count: 1, keywords: [], kind: 'rite' },
  { type: 'FORESIGHT',    influence: 0, rarity: 'common',   count: 0, keywords: [], kind: 'rite' },
  { type: 'RALLYING_CRY', influence: 0, rarity: 'uncommon', count: 1, keywords: [], kind: 'rite' },

  // ─── R8 POOL: 14 sim-validated promotions (analysis/pool40.json) ─────
  { type: 'EMBERSLINGER',   influence: 2, rarity: 'common',   count: 2, keywords: ['SCOUT'] },
  { type: 'SPRITE',         influence: 1, rarity: 'common',   count: 0, keywords: ['RALLY'] },
  { type: 'RIFT-WALL',      influence: 2, rarity: 'common',   count: 2, keywords: ['FORTIFIED'] },
  { type: 'FLAME-LURKER',   influence: 2, rarity: 'common',   count: 0, keywords: ['ATTUNED'] },
  { type: 'BANEBERRY',      influence: 1, rarity: 'common',   count: 2, keywords: ['SIEGE'] },
  { type: 'PETRIFIED-ROSE', influence: 1, rarity: 'common',   count: 2, keywords: ['WARD'] },
  { type: "WILL-O'-WISP",   influence: 1, rarity: 'common',   count: 2, keywords: ['FLANK'] },
  { type: 'POLLENCLOUD',    influence: 1, rarity: 'common',   count: 2, keywords: ['WING'] },
  { type: 'FOXGLOVE',       influence: 3, rarity: 'uncommon', count: 0, keywords: ['DOUBLESTRIKE'] },
  { type: 'VEILWALKER',     influence: 3, rarity: 'uncommon', count: 0, keywords: ['UNTOUCHABLE'] },
  { type: 'SOUL-ENGINE',    influence: 3, rarity: 'uncommon', count: 0, keywords: ['SUSTAIN'] },
  { type: 'SPLINTER',       influence: 1, rarity: 'uncommon', count: 0, keywords: ['DOUBLESTRIKE', 'MENACE'] },
  { type: 'MAELSTONIUM',    influence: 3, rarity: 'rare',     count: 0, keywords: ['DOUBLESTRIKE', 'FLANK'] },
  { type: 'TEAR-ESSENCE',   influence: 4, rarity: 'rare',     count: 0, keywords: ['UNTOUCHABLE', 'ATTUNED'] },

  // ─── R8 POOL: 4 new designs showcasing R3 (high ground) / R5 (Riftlight) ──
  { type: 'STONETREADER', influence: 2, rarity: 'uncommon', count: 0, keywords: ['SUREFOOT'] },
  { type: 'SEAMDRINKER',  influence: 2, rarity: 'uncommon', count: 0, keywords: ['TIDEBOUND'] },
  { type: 'APEXWARDEN',   influence: 2, rarity: 'rare',     count: 1, keywords: ['SUMMIT'] },
  { type: 'SEAMKEEPER',   influence: 1, rarity: 'uncommon', count: 0, keywords: ['SEAMBOUND'] },
];

const byType = new Map(TILE_POOL.map(t => [t.type, t]));
export function tileTemplate(type) {
  return byType.get(type) || null;
}

// Extend the pool at runtime (node meta sims load data/cards_gen.json here;
// the shipped browser game stays on the curated base pool).
export function registerCards(cards) {
  let added = 0;
  for (const c of cards) {
    if (byType.has(c.type)) continue;
    const entry = { count: 0, keywords: [], ...c };
    TILE_POOL.push(entry);
    byType.set(entry.type, entry);
    added++;
  }
  return added;
}

export function defaultDeckComposition() {
  const comp = {};
  for (const t of TILE_POOL) if (t.count > 0) comp[t.type] = t.count;
  return comp;
}
