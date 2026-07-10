// Bot + full-game integration tests (headless, seeded, deterministic).
import assert from 'node:assert/strict';
import { runMatch, runBatch } from '../tools/sim.js';
import { hexDistance, neighborCoords } from '../core/board.js';

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

console.log('hex distance');

test('all six neighbors are at distance 1', () => {
  for (const [c0, r0] of [[4, 4], [5, 4], [0, 0], [7, 3]]) {
    for (const [c, r] of neighborCoords(c0, r0)) {
      assert.equal(hexDistance(c0, r0, c, r), 1, `(${c0},${r0})→(${c},${r})`);
    }
  }
  assert.equal(hexDistance(3, 3, 3, 3), 0);
  assert.equal(hexDistance(0, 0, 0, 5), 5);
});

console.log('bot vs bot');

test('deterministic: same seed → same outcome', () => {
  const a = runMatch('det-check');
  const b = runMatch('det-check');
  assert.equal(a.winner, b.winner);
  assert.equal(a.turns, b.turns);
});

test('games finish decisively (10-match batch)', () => {
  const b = runBatch(10, 'test');
  console.log(`    → P1 ${b.p1Wins} / P2 ${b.p2Wins} / stalls ${b.stalls}, avg ${b.avgTurns} turns, ${b.avgCaptures} captures`);
  assert.equal(b.stalls, 0, `stalled games: ${b.stalls}/10 — endgame resolution broken`);
  assert.ok(b.avgTurns >= 4, 'games should not end instantly');
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
