// Limen — Descent roguelite meta-layer (CAMPAIGN_DESIGN.md, phase-1 slice).
//
// PURE and DETERMINISTIC: everything below derives from a single run seed via
// mulberry32(hashSeed(...)) — NO Math.random, NO Date.now anywhere (same
// guarantee core/ already holds; Game.clone() is deliberately RNG-free). This
// module is renderer-free and node-testable in isolation (tests/campaign.test.js);
// the DOM screens live in ui/campaign.js, the match bootstrap in main.js.
//
// A run is a Descent: a branching DAG of nodes over the existing seeded duel.
// Each fight node wraps a Game match (chosen agent + deterministic opponent
// deck + per-node match seed); reward nodes draft a card into the run deck.
// The whole map + every opponent deck are generated UP FRONT from the seed, so
// a run seed reproduces the entire Descent (shape, opponents, board layouts) —
// shareable and replayable.
import { CONFIG } from './config.js';
import { mulberry32, hashSeed, shuffleInPlace } from './rng.js';
import { TILE_POOL, tileTemplate, defaultDeckComposition } from '../data/tiles.js';
import { validateDeck } from './game.js';

// ─── Node taxonomy (phase-1 subset — no shop/rest/event yet) ─────────────
export const NODE_TYPE = {
  SKIRMISH: 'skirmish',     // fight (greedy) → card draft
  WARDEN: 'warden',         // fight (policy, "elite") → card draft
  BOSS: 'boss',             // fight (search2) → run ends (win = Descent cleared)
  RIFT_CACHE: 'rift-cache', // no fight → card draft on entry
};

// Per-node opponent AGENT and TIER by type (structural — the balance knobs
// that shape the map live in CONFIG.CAMPAIGN). Non-fight nodes have neither.
const AGENT_FOR = { skirmish: 'greedy', warden: 'policy', boss: 'search2' };
const TIER_FOR = { skirmish: 1, warden: 2, boss: 3 };
const IS_FIGHT = { skirmish: true, warden: true, boss: true, 'rift-cache': false };

// ─── Deterministic weighted draw ─────────────────────────────────────────
// entries: [{ value, weight }]. Consumes exactly one rand() call.
function weightedDraw(rand, entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rand() * total;
  for (const e of entries) { r -= e.weight; if (r < 0) return e.value; }
  return entries[entries.length - 1].value;
}

// Pick n distinct members of list, deterministic order from a seeded shuffle.
function pickDistinct(rand, list, n) {
  return shuffleInPlace(list.slice(), rand).slice(0, n);
}

// ─── Opponent deck generation ────────────────────────────────────────────
// Builds a {TYPE: count} composition guaranteed to pass validateDeck() (exactly
// DECK_SIZE tiles, within COPY_CAP / MAX_RARE / MAX_UNCOMMON), so the Game
// constructor never silently falls back to the starter deck (game.js:38). rand
// is the node's own derived stream, so deck gen is independent of map-shape RNG.
// Rites are excluded — a greedy/search opponent never plays them, so they'd be
// dead weight in the opponent's hand.
export function buildOpponentDeck(rand, tier) {
  const size = CONFIG.DECK_SIZE;
  const pool = TILE_POOL.filter(t => (t.kind || 'tile') !== 'rite');
  const byRarity = (r) => pool.filter(t => t.rarity === r);
  const comp = {};
  let total = 0;

  // Rares + uncommons: distinct types, 1 copy each (well under every cap),
  // count scaled by the node's tier. Clamped to the deck's rarity ceilings.
  const rareBudget = Math.min(CONFIG.MAX_RARE, CONFIG.CAMPAIGN.OPP_RARES_BY_TIER[tier] || 0);
  for (const t of pickDistinct(rand, byRarity('rare'), rareBudget)) {
    if (total >= size) break;
    comp[t.type] = 1; total++;
  }
  const uncBudget = Math.min(CONFIG.MAX_UNCOMMON, CONFIG.CAMPAIGN.OPP_UNCOMMONS_BY_TIER[tier] || 0);
  for (const t of pickDistinct(rand, byRarity('uncommon'), uncBudget)) {
    if (total >= size) break;
    comp[t.type] = 1; total++;
  }

  // Commons fill the remainder, round-robin over a seeded shuffle (distinct
  // first, then extra copies up to COPY_CAP.common). The common pool is far
  // larger than DECK_SIZE, so this always reaches exactly `size`.
  const commons = shuffleInPlace(byRarity('common'), rand);
  const cap = CONFIG.COPY_CAP.common;
  let i = 0, guard = 0;
  while (total < size && guard < commons.length * cap + 10) {
    const t = commons[i % commons.length];
    const cur = comp[t.type] || 0;
    if (cur < cap) { comp[t.type] = cur + 1; total++; }
    i++; guard++;
  }
  return comp;
}

// ─── Map generation (fully deterministic from the run seed) ──────────────
// One node. `index` is a map-global running counter; the per-node match seed
// is `${runSeed}-a${act}-n${index}` (fed straight into startGame({seed}), which
// drives board layout + deck shuffle deterministically). Opponent decks are
// generated here, up front, on their own per-node RNG stream.
function makeNode(runSeed, act, col, row, index, type) {
  const fight = IS_FIGHT[type];
  const tier = fight ? TIER_FOR[type] : 0;
  return {
    id: `a${act}-c${col}-r${row}`,
    act, col, row, index, type, fight,
    edges: [],                                            // forward edges, filled after all columns exist
    agent: fight ? AGENT_FOR[type] : null,                // string tag; main.js maps tag → agent instance
    tier,
    matchSeed: fight ? `${runSeed}-a${act}-n${index}` : null,
    oppDeck: fight
      ? buildOpponentDeck(mulberry32(hashSeed(`${runSeed}-opp-a${act}-n${index}`)), tier)
      : null,
  };
}

// Wire a DAG layer: every node in colA gets 1-2 forward edges into colB, and
// every node in colB is guaranteed at least one incoming edge (no orphans).
function connectColumns(rand, colA, colB, nodes) {
  const hasIncoming = new Set();
  for (const aId of colA) {
    const k = colB.length === 1 ? 1 : (rand() < 0.5 ? 1 : 2);
    const targets = pickDistinct(rand, colB, Math.min(k, colB.length));
    nodes[aId].edges = [...new Set([...nodes[aId].edges, ...targets])];
    for (const t of targets) hasIncoming.add(t);
  }
  for (const bId of colB) {
    if (hasIncoming.has(bId)) continue;
    const src = colA[Math.floor(rand() * colA.length)];
    nodes[src].edges = [...new Set([...nodes[src].edges, bId])];
  }
}

// Phase-1 proof map: N single-node columns, all Skirmish, chained linearly.
function linearMap(runSeed, rand, n) {
  const act = 1;
  const nodes = {};
  const columns = [];
  for (let c = 0; c < n; c++) {
    const node = makeNode(runSeed, act, c, 0, c, NODE_TYPE.SKIRMISH);
    nodes[node.id] = node;
    columns.push([node.id]);
    if (c > 0) nodes[columns[c - 1][0]].edges = [node.id];
  }
  return { runSeed, act, layout: 'linear', columns, nodes, entries: columns[0].slice() };
}

// Target map: an entry Skirmish, PRE_BOSS_COLUMNS branching columns (2-3 nodes,
// mixed types), then a single Boss sink. A small Slay-the-Spire-style DAG.
function branchingMap(runSeed, rand, opts) {
  const act = 1;
  const cc = CONFIG.CAMPAIGN;
  const nodes = {};
  const columns = [];
  let index = 0;

  // Column 0: the entry — always a single Skirmish.
  const entry = makeNode(runSeed, act, 0, 0, index++, NODE_TYPE.SKIRMISH);
  nodes[entry.id] = entry;
  columns.push([entry.id]);

  const typeEntries = Object.entries(cc.TYPE_WEIGHTS).map(([value, weight]) => ({ value, weight }));
  const preBoss = opts.preBossColumns ?? cc.PRE_BOSS_COLUMNS;
  for (let c = 1; c <= preBoss; c++) {
    const span = cc.COL_MAX_NODES - cc.COL_MIN_NODES;
    const count = cc.COL_MIN_NODES + Math.floor(rand() * (span + 1));
    const col = [];
    for (let r = 0; r < count; r++) {
      const type = weightedDraw(rand, typeEntries);
      const node = makeNode(runSeed, act, c, r, index++, type);
      nodes[node.id] = node;
      col.push(node.id);
    }
    columns.push(col);
  }

  // Final column: the Boss sink.
  const bossCol = columns.length;
  const boss = makeNode(runSeed, act, bossCol, 0, index++, NODE_TYPE.BOSS);
  nodes[boss.id] = boss;
  columns.push([boss.id]);

  // Edges: connect each adjacent column pair into a DAG.
  for (let c = 0; c < columns.length - 1; c++) {
    connectColumns(rand, columns[c], columns[c + 1], nodes);
  }
  return { runSeed, act, layout: 'branching', columns, nodes, entries: columns[0].slice() };
}

// Public entry. opts.layout: 'branching' (default) | 'linear'. Same seed →
// byte-identical map (the phase-1 determinism gate asserts JSON.stringify
// equality across two calls).
export function generateMap(runSeed, opts = {}) {
  const rand = mulberry32(hashSeed(String(runSeed) + '-map'));
  if (opts.layout === 'linear') return linearMap(String(runSeed), rand, opts.nodes || 3);
  return branchingMap(String(runSeed), rand, opts);
}

// ─── Run state ───────────────────────────────────────────────────────────
// localStorage-authoritative later (net/campaign.js, a P2+ concern); phase-1
// keeps it in memory only. Fields beyond the phase-1 slice (relics, shards) are
// present as forward-compat placeholders — declared, not yet wired.
export function createRun(runSeed, opts = {}) {
  const map = generateMap(runSeed, opts);
  const startDeck = opts.startDeck && validateDeck(opts.startDeck).valid
    ? { ...opts.startDeck }
    : defaultDeckComposition();
  return {
    runSeed: String(runSeed),
    map,
    act: 1,
    currentNodeId: null,               // set while a node is being played
    available: map.entries.slice(),    // node ids the player may enter next
    cleared: [],                       // node ids resolved (win or loss)
    runDeck: startDeck,                // {TYPE: count} — stays validateDeck-valid all run
    lives: opts.lives ?? CONFIG.CAMPAIGN.STARTING_LIVES,
    banked: { partial: 0 },            // partial reward banked on losses (Motes: phase 4)
    status: 'active',                  // 'active' | 'won' | 'lost'
    history: [],                       // [{ nodeId, type, result }]
    // forward-compat placeholders (not wired in phase-1):
    relics: [],
    shards: 0,
  };
}

// Nodes the player may enter right now (resolved to full node objects).
export function availableNodes(run) {
  return run.available.map(id => run.map.nodes[id]);
}

// Mark a node cleared and advance the frontier. `didWin` only matters for the
// Boss sink (win = Descent cleared, loss = pushed back). Zero lives ends the
// Descent regardless of where you are.
function clearAndAdvance(run, node, didWin) {
  if (!run.cleared.includes(node.id)) run.cleared.push(node.id);
  if (run.lives <= 0) { run.status = 'lost'; run.available = []; return; }
  if (node.type === NODE_TYPE.BOSS) {
    run.status = didWin ? 'won' : 'lost';
    run.available = [];
    return;
  }
  run.available = node.edges.slice();
  if (run.available.length === 0) run.status = didWin ? 'won' : 'lost'; // defensive: DAG dead-end
}

// ─── Reward draft ────────────────────────────────────────────────────────
// Deterministic 1-of-N card offer for a node. Offers are drawn from the pool by
// the node's own seed. Types the run deck already holds at their COPY_CAP are
// excluded — adding one would be a no-op swap (e.g. a 2nd copy of a rare, cap 1),
// so every offer is a real change the swap in applyReward can land. (Rites are
// excluded too.) Deck-aware, so still fully reproducible from run state + seed.
export function generateDraft(run, node) {
  const rand = mulberry32(hashSeed(`${run.runSeed}-draft-a${node.act}-n${node.index}`));
  const deck = run.runDeck;
  const pool = TILE_POOL.filter(t =>
    (t.kind || 'tile') !== 'rite' && (deck[t.type] || 0) < CONFIG.COPY_CAP[t.rarity]);
  const offers = pickDistinct(rand, pool, CONFIG.CAMPAIGN.DRAFT_SIZE).map(t => t.type);
  return { nodeId: node.id, offers };
}

// Apply a card-pick to the run deck. IMPORTANT (phase-1 gate): the run deck must
// stay validateDeck-valid, so the pick is a SWAP, not a grow — validateDeck
// requires exactly DECK_SIZE tiles, and the deck already sits at DECK_SIZE. We
// add one copy of the picked type and remove one copy of a deterministically
// chosen existing card such that the result still validates (commons trimmed
// first; if the pick is a rare and both rare slots are full, a rare is swapped
// out so MAX_RARE holds). Deck-growth + the validateDeck bypass the spec's
// Rift-Cache describes (§4) are a later phase. `pickedType === null` = skip.
export function applyReward(run, pickedType) {
  if (!pickedType) return { ok: true, skipped: true };
  if (!tileTemplate(pickedType)) return { ok: false, reason: 'unknown tile' };
  const deck = run.runDeck;

  // Removal candidates in a deterministic priority order: commons before
  // uncommons before rares (keep the good cards), then lower influence, then
  // higher current count (trim redundancy), then type name for a stable tie.
  const RANK = { common: 0, uncommon: 1, rare: 2, capital: 3 };
  const order = Object.keys(deck).filter(t => (deck[t] || 0) > 0).sort((a, b) => {
    const ta = tileTemplate(a), tb = tileTemplate(b);
    return (RANK[ta.rarity] - RANK[tb.rarity])
      || ((ta.influence || 0) - (tb.influence || 0))
      || ((deck[b] || 0) - (deck[a] || 0))
      || (a < b ? -1 : a > b ? 1 : 0);
  });

  for (const rem of order) {
    const trial = { ...deck };
    trial[rem] -= 1;
    if (trial[rem] <= 0) delete trial[rem];
    trial[pickedType] = (trial[pickedType] || 0) + 1;
    if (validateDeck(trial).valid) {
      run.runDeck = trial;
      return { ok: true, added: pickedType, removed: rem };
    }
  }
  // No legal swap (e.g. picked a rare with no removable rare) — leave the deck
  // untouched so it stays valid; caller treats this like a skip.
  return { ok: false, reason: 'no legal swap' };
}

// ─── Match resolution reducers ───────────────────────────────────────────
// A fight node's match ended. Mutates run (lives, cleared, frontier, status).
// Returns the reward draft on a win (null on loss). checkGameOver() in main.js
// calls this from the campaign game-over path.
export function completeFight(run, nodeId, didWin) {
  const node = run.map.nodes[nodeId];
  run.history.push({ nodeId, type: node.type, result: didWin ? 'win' : 'loss' });
  if (!didWin) {
    run.lives -= 1;
    run.banked.partial += CONFIG.CAMPAIGN.LOSS_PARTIAL_BANK;
  }
  clearAndAdvance(run, node, didWin);
  const reward = didWin && run.status === 'active' ? generateDraft(run, node) : null;
  return { didWin, reward, lives: run.lives, status: run.status };
}

// A non-fight node (Rift-Cache): entering it grants a card draft directly.
export function completeNonFight(run, nodeId) {
  const node = run.map.nodes[nodeId];
  run.history.push({ nodeId, type: node.type, result: 'visited' });
  clearAndAdvance(run, node, true);
  return run.status === 'active' ? generateDraft(run, node) : null;
}

// ─── CONFIG leak-safety (the design's highest-risk seam, §10) ────────────
// Phase-1 ships no relics, but the safe pattern is established NOW: a per-match
// CONFIG mutation (a relic knob, later) must never leak into the next match,
// hotseat, or MP. The backstop is a snapshot of the WHOLE CONFIG taken before
// any mutation and a HARD restore from it afterward — not per-key deltas, so a
// buffed knob is always fully undone. main.js closes every exit path:
// (1) a throw during apply → try/catch restores + rethrows; (2) natural match
// end (win/loss/draw) → restore in checkGameOver; (3) the next startGame →
// defensive restore before anything new boots; (4) an exception mid-turn (where
// game.phase never reaches 'over') → a global error/unhandledrejection watchdog
// force-restores. The determinism gate (run a seeded match twice, diff) is the
// acceptance test once relics land (phase 3).
export function snapshotConfig() {
  return JSON.parse(JSON.stringify(CONFIG)); // CONFIG is primitives + plain nested objects
}
export function restoreConfig(snapshot) {
  for (const k of Object.keys(CONFIG)) if (!(k in snapshot)) delete CONFIG[k];
  for (const k of Object.keys(snapshot)) CONFIG[k] = snapshot[k];
}

// Relic apply/restore seam. A relic is { id, apply(cfg), restore(cfg) }; deltas
// compose. Phase-1 passes empty lists — the functions exist so the match
// bootstrap wires the seam today and phase 3 only supplies the relic objects.
export function applyRelics(cfg, relics = []) {
  for (const r of relics) if (typeof r.apply === 'function') r.apply(cfg);
}
export function restoreRelics(cfg, relics = []) {
  for (const r of [...relics].reverse()) if (typeof r.restore === 'function') r.restore(cfg);
}
