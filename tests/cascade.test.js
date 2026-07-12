// R8/P3 — Cascade + Vanguard Bounty: grant/cap/branch-scoping, turn-end
// expiry, bounty semantics + round reset, clone, determinism, OFF-parity,
// deck trim, search full-turn completion, metrics keying. Per
// RULES8_P3_CASCADE.md rev 3 gate arm 8. Headless, deterministic, pins its
// own knobs (process exits after; no restore needed).
import assert from 'node:assert/strict';
import { CONFIG } from '../core/config.js';
import { Game } from '../core/game.js';
import { actionsPerTurnMedian } from '../tools/metrics.js';

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

CONFIG.CASCADE_ON = true;
CONFIG.VANGUARD_ON = true;
CONFIG.MAX_PLACEMENTS_PER_TURN = 3;
CONFIG.CASCADE_TILE_COUNT = 3;
CONFIG.VANGUARD_START_HOLDER = 1;
CONFIG.ROAD_PRESSURE_ON = false;
CONFIG.SEAM_MAX_RINGS = 0;
CONFIG.FRONTIER_ANCHOR = false;

// Capitals at the bot-default deep-central cells: P1 (6,0), P2 (6,8).
function freshGame(seed = 'cascade-test') {
  const g = new Game({ seed });
  assert.ok(g.placeCapital(1, 6, 0).ok, 'P1 capital');
  assert.ok(g.placeCapital(2, 6, CONFIG.GRID_H - 1).ok, 'P2 capital');
  return g;
}

function put(g, owner, col, row, type = 'OUTCROP') {
  g.board[col][row].tile = g._makeTile(type, owner);
  g._boardMutated(owner);
}

// Give the current player an exact hand + a clean action budget.
function arm(g, player, types) {
  g.currentPlayer = player;
  g.placementsLeft = 1;
  g.placementsThisTurn = 0;
  g.hands[player] = types.map(t => g._makeTile(t, player));
}

console.log('tests/cascade.test.js');

test('C1 CASCADE grants an extra placement without flipping the turn', () => {
  const g = freshGame();
  arm(g, 1, ['THICKET', 'OUTCROP']); // THICKET carries CASCADE
  assert.ok(g.placeFromHand(1, 0, 6, 1).ok);
  assert.equal(g.currentPlayer, 1, 'turn stays open');
  assert.equal(g.placementsLeft, 1, 'grant refunded the placement');
  assert.equal(g.placementsThisTurn, 1);
  assert.equal(g.cascadeFiredThisPly?.player, 1, 'render cue set');
  assert.ok(g.placeFromHand(1, 0, 5, 0).ok); // OUTCROP: no cascade
  assert.equal(g.currentPlayer, 2, 'turn ends after the non-cascade drop');
});

test('C2 grant capped at MAX_PLACEMENTS_PER_TURN total actions', () => {
  const g = freshGame();
  arm(g, 1, ['THICKET', 'THICKET', 'THICKET', 'OUTCROP']);
  assert.ok(g.placeFromHand(1, 0, 6, 1).ok);
  assert.ok(g.placeFromHand(1, 0, 5, 0).ok);
  assert.equal(g.currentPlayer, 1, 'second grant keeps the turn open');
  assert.ok(g.placeFromHand(1, 0, 7, 0).ok); // 3rd action: cap reached, no grant
  assert.equal(g.placementsThisTurn === 3 || g.currentPlayer === 2, true);
  assert.equal(g.currentPlayer, 2, 'turn ends at the cap despite CASCADE');
});

test('C3 no grant on self-ascend (branch-scoped)', () => {
  const g = freshGame();
  put(g, 1, 6, 1);
  arm(g, 1, ['THICKET']);
  const res = g.placeFromHand(1, 0, 6, 1);
  assert.ok(res.ok && res.ascended);
  assert.equal(g.currentPlayer, 2, 'no grant — turn ended');
});

test('C4 no grant on WARD bounce (hook unreached)', () => {
  const g = freshGame();
  put(g, 2, 6, 1, 'PETRIFIED-ROSE'); // WARD defender
  arm(g, 1, ['THICKET']);
  const res = g.placeFromHand(1, 0, 6, 1);
  assert.ok(res.ok && res.wardBlocked);
  assert.equal(g.currentPlayer, 2, 'placement consumed, no grant — turn ended');
});

test('C5 unused grant expires without consecutivePasses (hand-exhausted mid-cascade)', () => {
  const g = freshGame();
  arm(g, 1, ['THICKET']); // grant will fire into an empty hand
  g.discardsLeft = 1;     // discard budget alive but unusable (no hand tile)
  const passesBefore = g.consecutivePasses;
  assert.ok(g.placeFromHand(1, 0, 6, 1).ok);
  assert.equal(g.currentPlayer, 2, 'turn auto-ended');
  assert.equal(g.consecutivePasses, passesBefore, 'not counted as a pass');
});

test('C6 bounty: holder-own-first-capture draws 1; opponent capture earns nothing; round boundary resets', () => {
  const g = freshGame(); // turn 1 → round 1 → holder P1
  put(g, 2, 6, 2); put(g, 1, 5, 2, 'COLOSSUS'); put(g, 1, 7, 2, 'COLOSSUS');
  assert.ok(g.isCapturable(6, 2, 1), 'setup: enemy tile crushed');
  arm(g, 1, ['OUTCROP']);
  const deck1 = g.decks[1].length;
  assert.ok(g.placeFromHand(1, 0, 6, 2).ok);
  assert.equal(g.bountyClaimedThisRound, true, 'P1 (holder) claimed');
  assert.equal(g.decks[1].length, deck1 - 1, 'bounty drew a card');
  assert.equal(g.hands[1].length, 1, 'placed 1 out, drew 1 in');
  // turn 2 begins (same round) — P2's turn must NOT wipe the claim flag
  assert.equal(g.currentPlayer, 2);
  assert.equal(g.bountyClaimedThisRound, true, 'mid-round: flag survives');
  // P2 captures in the same round: non-holder, no bounty
  put(g, 1, 6, 6); put(g, 2, 5, 6, 'COLOSSUS'); put(g, 2, 7, 6, 'COLOSSUS');
  assert.ok(g.isCapturable(6, 6, 2));
  arm(g, 2, ['OUTCROP']);
  const deck2 = g.decks[2].length;
  assert.ok(g.placeFromHand(2, 0, 6, 6).ok);
  assert.equal(g.decks[2].length, deck2, 'non-holder capture drew nothing');
  // turn 3 begins → round 2 → flag reset, holder now P2
  assert.equal(g.turn, 3);
  assert.equal(g.bountyClaimedThisRound, false, 'round boundary reset');
  assert.equal(g.vanguardHolder(), 2, 'holder alternates by round');
});

test('C7 holder derivation by round; SUNDER destruction earns no bounty', () => {
  const g = freshGame();
  for (const [turn, holder] of [[1, 1], [2, 1], [3, 2], [4, 2], [5, 1]]) {
    g.turn = turn;
    assert.equal(g.vanguardHolder(), holder, `turn ${turn}`);
  }
  g.turn = 1; // P1 is holder
  put(g, 1, 6, 1);
  put(g, 2, 6, 2); // relInf: base 2 − 2 from (6,1) = 0 ≤ SUNDER_MAX_INF
  arm(g, 1, ['SUNDER']);
  const deck1 = g.decks[1].length;
  const res = g.castRite(1, 0, 6, 2);
  assert.ok(res.ok, 'SUNDER resolved');
  assert.equal(g.bountyClaimedThisRound, false, 'destruction is not a capture');
  assert.equal(g.decks[1].length, deck1, 'no draw');
});

test('C8 clone copies the P3 scalars; per-ply cues stay transient', () => {
  const g = freshGame();
  g.placementsThisTurn = 2;
  g.bountyClaimedThisRound = true;
  g.cascadeFiredThisPly = { player: 1 };
  const c = g.clone();
  assert.equal(c.placementsThisTurn, 2);
  assert.equal(c.bountyClaimedThisRound, true);
  assert.equal(c.cascadeFiredThisPly, undefined, 'cue not cloned');
});

test('C9 determinism: identical script → identical state', () => {
  const run = () => {
    const g = freshGame('det-seed');
    arm(g, 1, ['THICKET', 'OUTCROP']);
    g.placeFromHand(1, 0, 6, 1);
    g.placeFromHand(1, 0, 5, 0);
    return JSON.stringify([g.turn, g.boardSummary(), g.roads]);
  };
  assert.equal(run(), run());
});

test('C10 OFF-parity: both knobs false = zero behavioral effect', () => {
  CONFIG.CASCADE_ON = false;
  CONFIG.VANGUARD_ON = false;
  const g = freshGame();
  arm(g, 1, ['THICKET']);
  assert.ok(g.placeFromHand(1, 0, 6, 1).ok);
  assert.equal(g.currentPlayer, 2, 'no grant when off');
  assert.equal(g.cascadeFiredThisPly, null, 'no cue when off');
  const g2 = freshGame();
  put(g2, 2, 6, 2); put(g2, 1, 5, 2, 'COLOSSUS'); put(g2, 1, 7, 2, 'COLOSSUS');
  arm(g2, 1, ['OUTCROP']);
  const deck1 = g2.decks[1].length;
  assert.ok(g2.placeFromHand(1, 0, 6, 2).ok);
  assert.equal(g2.decks[1].length, deck1, 'no bounty draw when off');
  assert.equal(g2.bountyClaimedThisRound, false);
  CONFIG.CASCADE_ON = true;
  CONFIG.VANGUARD_ON = true;
});

test('C11 deck trim: CASCADE copies capped at CASCADE_TILE_COUNT, composition unchanged', () => {
  const count = g => g.decks[1].filter(t => t.keywords.includes('CASCADE')).length +
                     g.hands[1].filter(t => t.keywords.includes('CASCADE')).length;
  const size = g => g.decks[1].length + g.hands[1].length;
  CONFIG.CASCADE_TILE_COUNT = 2;
  const g2 = new Game({ seed: 'trim' });
  CONFIG.CASCADE_TILE_COUNT = 4;
  const g4 = new Game({ seed: 'trim' });
  assert.equal(count(g2), 2);
  assert.equal(count(g4), 4, '4 promoted copies exist in the pool');
  assert.equal(size(g2), size(g4), 'deck size identical across densities');
  CONFIG.CASCADE_TILE_COUNT = 3;
});

test('C12 search2 under CASCADE_ON: full games run, deterministic', async () => {
  const { playGame } = await import('../tools/arena.js');
  const { makeSearch } = await import('../core/agents/search.js');
  const { makeGreedy } = await import('../core/agents/greedy.js');
  const a = () => playGame(makeSearch({ depth: 2 }), makeGreedy(), 'c12-seed');
  const r1 = a(), r2 = a();
  assert.equal(r1.winner, r2.winner);
  assert.equal(r1.turns, r2.turns);
  assert.ok(r1.turns > 0);
});

test('C13 metrics: actionRows keyed on pre-action turn; median actions/turn computes', async () => {
  const { playGame } = await import('../tools/arena.js');
  const { makeGreedy } = await import('../core/agents/greedy.js');
  const r = playGame(makeGreedy(), makeGreedy(), 'c13-seed');
  assert.ok(r.tracker.actionRows.length > 0);
  assert.ok(r.tracker.actionRows.every(a => Number.isInteger(a.turn) && a.turn >= 1));
  const fake = [{ actionRows: [{ turn: 1 }, { turn: 1 }, { turn: 2 }] }];
  assert.equal(actionsPerTurnMedian(fake), 2, 'counts [2,1] → median 2');
});

console.log(`cascade.test.js: ${passed} passed`);
