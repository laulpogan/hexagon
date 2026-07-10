// Limen tile pool — the collectible layer. Balance knobs: influence numbers,
// keyword assignments, rarity, default-deck counts. Edit here, nowhere else.

export const KEYWORDS = {
  WARD:        { name: 'Ward',         desc: 'The first time this would be captured, the attack is absorbed instead (once per game).' },
  RALLY:       { name: 'Rally',        desc: '+1 effective influence to adjacent friendly tiles.' },
  SIEGE:       { name: 'Siege',        desc: 'Adjacent enemy tiles suffer an extra −2 influence.' },
  SCOUT:       { name: 'Scout',        desc: 'May be placed on any empty hex — no friendly adjacency required.' },
  FORTIFIED:   { name: 'Fortified',    desc: '+2 base influence on a board edge.' },
  DOUBLESTRIKE:{ name: 'Double Strike',desc: 'Counts twice when contributing influence to adjacent tiles.' },
  ATTUNED:     { name: 'Rift-Attuned', desc: 'Gains +1 influence per adjacent rift hex instead of −1.' },
};

// rarity: common (3 copies max) / uncommon (2) / rare (1).
// count: copies in the default starter deck (sums to CONFIG.DECK_SIZE).
export const TILE_POOL = [
  // ─── COMMON ─────────────────────────────────────────────────────────
  { type: 'THICKET',     influence: 2, rarity: 'common',   count: 3, keywords: [] },
  { type: 'OUTCROP',     influence: 2, rarity: 'common',   count: 3, keywords: [] },
  { type: 'LANTERN',     influence: 1, rarity: 'common',   count: 2, keywords: ['SCOUT'] },
  { type: 'PALISADE',    influence: 1, rarity: 'common',   count: 2, keywords: ['FORTIFIED'] },
  { type: 'ALTAR',       influence: 1, rarity: 'common',   count: 2, keywords: ['RALLY'] },
  { type: 'SKIRMISHER',  influence: 1, rarity: 'common',   count: 2, keywords: ['SIEGE'] },

  // ─── UNCOMMON ───────────────────────────────────────────────────────
  { type: 'WARDSTONE',   influence: 1, rarity: 'uncommon', count: 1, keywords: ['WARD'] },
  { type: 'ECHO',        influence: 2, rarity: 'uncommon', count: 1, keywords: ['DOUBLESTRIKE'] },
  { type: 'HERALD',      influence: 2, rarity: 'uncommon', count: 1, keywords: ['RALLY'] },
  { type: 'REAVER',      influence: 2, rarity: 'uncommon', count: 1, keywords: ['SIEGE'] },
  { type: 'BASTION',     influence: 2, rarity: 'uncommon', count: 0, keywords: ['FORTIFIED', 'WARD'] },

  // ─── RARE ───────────────────────────────────────────────────────────
  { type: 'RIFTWALKER',  influence: 2, rarity: 'rare',     count: 1, keywords: ['ATTUNED', 'SCOUT'] },
  { type: 'COLOSSUS',    influence: 4, rarity: 'rare',     count: 1, keywords: [] },
  { type: 'MIRRORSAINT', influence: 3, rarity: 'rare',     count: 0, keywords: ['RALLY', 'DOUBLESTRIKE'] },
  { type: 'RIFTWARDEN',  influence: 3, rarity: 'rare',     count: 0, keywords: ['ATTUNED', 'WARD'] },
];

const byType = new Map(TILE_POOL.map(t => [t.type, t]));
export function tileTemplate(type) {
  return byType.get(type) || null;
}

export function defaultDeckComposition() {
  const comp = {};
  for (const t of TILE_POOL) if (t.count > 0) comp[t.type] = t.count;
  return comp;
}
