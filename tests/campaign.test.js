// Campaign / Descent tests (headless, seeded, deterministic) — the phase-1
// gate. Plain-node style, matching tests/core.test.js. No framework.
import assert from 'node:assert/strict';
import { CONFIG } from '../core/config.js';
import { validateDeck } from '../core/game.js';
import { tileTemplate } from '../data/tiles.js';
import {
  generateMap, createRun, buildOpponentDeck, generateDraft, applyReward,
  completeFight, completeNonFight, availableNodes, NODE_TYPE,
  snapshotConfig, restoreConfig, applyRelics, restoreRelics,
} from '../core/campaign.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Every fight node in a map carries an opponent comp — collect them.
function oppComps(map) {
  return Object.values(map.nodes).filter(n => n.fight).map(n => n.oppDeck);
}

console.log('campaign — determinism');

test('same seed → byte-identical branching map + opponent comps (twice)', () => {
  const a = generateMap('descent-alpha');
  const b = generateMap('descent-alpha');
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'map JSON differs across two calls');
  // opponent comps are embedded in the map, so the whole-map diff covers them;
  // assert the comp slice explicitly too, per the gate wording.
  assert.equal(JSON.stringify(oppComps(a)), JSON.stringify(oppComps(b)), 'opponent comps differ');
});

test('same seed → byte-identical linear (phase-1 proof) map', () => {
  const a = generateMap('proof-1', { layout: 'linear', nodes: 3 });
  const b = generateMap('proof-1', { layout: 'linear', nodes: 3 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  // the phase-1 proof shape: 3 single-node Skirmish columns, chained linearly
  assert.equal(a.columns.length, 3);
  for (const col of a.columns) assert.equal(col.length, 1);
  assert.ok(Object.values(a.nodes).every(n => n.type === NODE_TYPE.SKIRMISH));
});

test('different seeds → different maps', () => {
  const a = generateMap('seed-A');
  const b = generateMap('seed-B');
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
});

test('per-node match seeds follow ${runSeed}-a${act}-n${index}', () => {
  const map = generateMap('descent-alpha');
  for (const n of Object.values(map.nodes)) {
    if (!n.fight) { assert.equal(n.matchSeed, null); continue; }
    assert.equal(n.matchSeed, `descent-alpha-a${n.act}-n${n.index}`);
  }
});

console.log('campaign — opponent decks');

test('every generated opponent deck passes validateDeck', () => {
  for (const seed of ['descent-alpha', 'seed-B', 'x-42', 'zzz']) {
    const map = generateMap(seed);
    for (const comp of oppComps(map)) {
      const v = validateDeck(comp);
      assert.ok(v.valid, `invalid opponent comp @ ${seed}: ${v.errors.join('; ')}`);
    }
  }
});

test('opponent deck strength scales with tier (more rares+uncommons at higher tier)', () => {
  // Count premium (rare+uncommon) copies in a tier's comp — asserting VALIDITY
  // alone would still pass if every tier silently used the tier-1 budget (a
  // lower budget is a valid subset). This asserts the scaling itself.
  const premiumOf = (tier) => {
    const comp = buildOpponentDeck(mulberryFor(`t${tier}`), tier);
    assert.ok(validateDeck(comp).valid, `tier ${tier} invalid`);
    let rares = 0, uncommons = 0;
    for (const [type, n] of Object.entries(comp)) {
      const r = tileTemplate(type).rarity;
      if (r === 'rare') rares += n;
      else if (r === 'uncommon') uncommons += n;
    }
    return { rares, uncommons, prem: rares + uncommons };
  };
  const t1 = premiumOf(1), t2 = premiumOf(2), t3 = premiumOf(3);
  assert.ok(t1.rares <= t2.rares && t2.rares <= t3.rares, `rares must not shrink with tier: ${t1.rares},${t2.rares},${t3.rares}`);
  assert.ok(t1.uncommons <= t2.uncommons && t2.uncommons <= t3.uncommons, `uncommons must not shrink with tier: ${t1.uncommons},${t2.uncommons},${t3.uncommons}`);
  assert.ok(t1.prem < t2.prem && t2.prem < t3.prem, `premium (rare+uncommon) count must rise each tier: ${t1.prem} < ${t2.prem} < ${t3.prem}`);
});

console.log('campaign — reward drafts keep the run deck valid');

test('a card-pick reward keeps runDeck validateDeck-valid (every offer)', () => {
  const map = generateMap('descent-alpha');
  const node = Object.values(map.nodes).find(n => n.fight);
  // Re-pick from a fresh run for each offer so swaps do not compound.
  for (const seedRun of ['r1', 'r2', 'r3']) {
    const run = createRun('descent-alpha');
    const draft = generateDraft(run, node);
    for (const offer of draft.offers) {
      const fresh = createRun('descent-alpha');
      assert.ok(validateDeck(fresh.runDeck).valid, 'starter run deck should be valid');
      const res = applyReward(fresh, offer);
      assert.ok(validateDeck(fresh.runDeck).valid, `deck invalid after picking ${offer}`);
      assert.equal(Object.values(fresh.runDeck).reduce((s, n) => s + n, 0), CONFIG.DECK_SIZE);
      if (res.ok && !res.skipped) assert.ok((fresh.runDeck[offer] || 0) >= 1, 'picked card should be in deck');
    }
    void seedRun;
  }
});

test('skipping a reward leaves the deck valid and unchanged', () => {
  const run = createRun('descent-alpha');
  const before = JSON.stringify(run.runDeck);
  const res = applyReward(run, null);
  assert.ok(res.skipped);
  assert.equal(JSON.stringify(run.runDeck), before);
  assert.ok(validateDeck(run.runDeck).valid);
});

console.log('campaign — lives & run termination');

test('losing a fight decrements lives; 0 lives ends the run', () => {
  const run = createRun('descent-alpha', { lives: 2 });
  const first = run.available[0];
  assert.equal(run.lives, 2);
  let r = completeFight(run, first, false); // loss 1
  assert.equal(run.lives, 1);
  assert.equal(run.status, 'active', 'still alive with 1 life');
  assert.equal(r.reward, null, 'a loss grants no card draft');
  // advance into the next available node and lose again → 0 lives → run over
  const next = run.available[0];
  r = completeFight(run, next, false); // loss 2
  assert.equal(run.lives, 0);
  assert.equal(run.status, 'lost', 'run ends at 0 lives');
  assert.equal(run.available.length, 0, 'no frontier once the run is lost');
});

test('winning a fight banks no life loss, grants a draft, and advances', () => {
  const run = createRun('descent-alpha');
  const first = run.available[0];
  const startLives = run.lives;
  const r = completeFight(run, first, true);
  assert.equal(run.lives, startLives, 'a win costs no life');
  assert.ok(r.reward && Array.isArray(r.reward.offers), 'win yields a card draft');
  assert.ok(run.cleared.includes(first));
  assert.ok(run.available.length > 0, 'frontier advanced to forward edges');
  assert.equal(run.status, 'active');
});

test('a rift-cache node grants a draft with no fight and advances', () => {
  // Find a seed whose map contains a rift-cache reachable from the entry.
  let run = null, cacheId = null;
  for (const seed of ['descent-alpha', 'seed-B', 'x-42', 'cache-hunt', 'q7']) {
    const r = createRun(seed);
    const hit = availableNodes(r).find(n => n.type === NODE_TYPE.RIFT_CACHE)
      || Object.values(r.map.nodes).find(n => n.type === NODE_TYPE.RIFT_CACHE);
    if (hit) { run = r; cacheId = hit.id; break; }
  }
  if (!run) { console.log('    (no rift-cache in sampled seeds — skipped)'); return; }
  const node = run.map.nodes[cacheId];
  assert.equal(node.fight, false);
  assert.equal(node.oppDeck, null);
  // enter it directly (only meaningful if it is on the frontier, but the reducer
  // is position-agnostic for this unit check)
  const clearedBefore = run.cleared.length;
  const draft = completeNonFight(run, cacheId);
  assert.ok(draft && Array.isArray(draft.offers), 'a rift-cache grants a draft');
  // the test name promises "and advances" — assert the reducer actually did
  assert.ok(run.cleared.includes(cacheId), 'rift-cache should be marked cleared');
  assert.equal(run.cleared.length, clearedBefore + 1, 'clearing a rift-cache advances the run');
});

console.log('campaign — CONFIG leak-safety');

test('snapshot + restore hard-resets the whole CONFIG (no leak)', () => {
  const snap = snapshotConfig();
  // simulate a relic mutation
  CONFIG.RALLY_BONUS += 5;
  CONFIG.SIEGE_BONUS = 999;
  CONFIG.__injected = true;
  restoreConfig(snap);
  assert.equal(CONFIG.RALLY_BONUS, snap.RALLY_BONUS, 'RALLY_BONUS leaked');
  assert.equal(CONFIG.SIEGE_BONUS, snap.SIEGE_BONUS, 'SIEGE_BONUS leaked');
  assert.equal('__injected' in CONFIG, false, 'injected key leaked');
});

test('applyRelics / restoreRelics compose and fully unwind', () => {
  const snap = snapshotConfig();
  const relics = [
    { id: 'ember', apply: c => { c.RALLY_BONUS += 1; }, restore: c => { c.RALLY_BONUS -= 1; } },
    { id: 'maul', apply: c => { c.SIEGE_BONUS += 2; }, restore: c => { c.SIEGE_BONUS -= 2; } },
  ];
  const baseRally = CONFIG.RALLY_BONUS, baseSiege = CONFIG.SIEGE_BONUS;
  applyRelics(CONFIG, relics);
  assert.equal(CONFIG.RALLY_BONUS, baseRally + 1);
  assert.equal(CONFIG.SIEGE_BONUS, baseSiege + 2);
  restoreRelics(CONFIG, relics);
  assert.equal(CONFIG.RALLY_BONUS, baseRally);
  assert.equal(CONFIG.SIEGE_BONUS, baseSiege);
  restoreConfig(snap); // belt-and-suspenders, mirrors the live match path
  assert.equal(JSON.stringify(CONFIG), JSON.stringify(snap));
});

// tiny local helper: a named deterministic rand stream for unit checks
import { mulberry32, hashSeed } from '../core/rng.js';
function mulberryFor(s) { return mulberry32(hashSeed(s)); }

console.log(`\n${passed} campaign tests passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
