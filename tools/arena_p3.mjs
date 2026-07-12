// R8/P3 arena — SkillDepth gate + cascade-rush adversarial band + full-ON
// mirrors, per RULES8_P3_CASCADE.md rev 3. EVERY arm patches EVERY knob it
// depends on explicitly (P2 gate-#2 lesson). Usage: node tools/arena_p3.mjs [n]
import { playPairing, loadTrainedPolicy } from './arena.js';
import { makeGreedy } from '../core/agents/greedy.js';
import { makeSearch } from '../core/agents/search.js';
import { makeCascadeRush } from '../core/agents/cascaderush.js';
import { funIndex, actionsPerTurn } from './metrics.js';
import { CONFIG } from '../core/config.js';

const n = parseInt(process.argv[2] || '120', 10);

function withConfig(patch, fn) {
  const saved = {};
  for (const k of Object.keys(patch)) { saved[k] = CONFIG[k]; CONFIG[k] = patch[k]; }
  try { return fn(); } finally { Object.assign(CONFIG, saved); }
}

const med = a => { if (!a.length) return '—'; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function diag(trackers) {
  const apt = actionsPerTurn(trackers);
  const firstCap = med(trackers.filter(t => t.firstCaptureTurn != null).map(t => t.firstCaptureTurn));
  let capTurns = 0, burstTurns = 0;
  for (const t of trackers) {
    const byTurn = new Map();
    for (const r of t.captureRows || []) byTurn.set(r.turn, (byTurn.get(r.turn) || 0) + r.n);
    for (const total of byTurn.values()) { capTurns++; if (total >= 2) burstTurns++; }
  }
  const claims = { 1: 0, 2: 0 };
  for (const t of trackers) { claims[1] += t.bountyDraws?.[1] || 0; claims[2] += t.bountyDraws?.[2] || 0; }
  return `apt med ${apt.median} mean ${apt.mean} multi ${(apt.multiShare * 100).toFixed(0)}%  firstCap T${firstCap}  burst ${capTurns ? (burstTurns / capTurns * 100).toFixed(0) : 0}%  bounty ${claims[1]}/${claims[2]}`;
}

function pair(name, a, b, patch) {
  const r = withConfig(patch, () => playPairing(a, b, n, `p3arena-${name}`));
  const aRate = (r.aWins / Math.max(1, r.aWins + r.bWins) * 100);
  const f = funIndex(r.trackers ?? []);
  console.log(
    `${name.padEnd(30)} ${r.a} ${r.aWins}–${r.bWins} ${r.b} (${aRate.toFixed(1)}%)  ` +
    `turns ${(r.turns / Math.max(1, r.games)).toFixed(1)}  capt ${(r.captures / Math.max(1, r.games)).toFixed(1)}` +
    `\n${''.padEnd(30)} ${diag(r.trackers)}  K ${f.K} P ${f.P} comeback ${f.diagnostics.comebackRate}%`
  );
  return aRate;
}

console.log(`n=${n}/side per pairing, seed-paired`);
const greedy = makeGreedy();
const policy = loadTrainedPolicy();
const search2 = makeSearch({ depth: 2 });
const C = { CASCADE_ON: true, VANGUARD_ON: false };
const FULL = { CASCADE_ON: true, VANGUARD_ON: true };
const OFF = { CASCADE_ON: false, VANGUARD_ON: false };

console.log('-- THE GATE arm 2: SkillDepth — search2 vs greedy pulled from ~100% into 65-85% --');
pair('search2 vs greedy OFF', search2, greedy, OFF);
pair('search2 vs greedy CASCADE', search2, greedy, C);
pair('search2 vs greedy FULL', search2, greedy, FULL);
console.log('-- policy ladder (diagnostic only — ladder broken at HEAD pre-retrain) --');
pair('policy vs greedy CASCADE', policy, greedy, C);
pair('search2 vs policy CASCADE', search2, policy, C);

console.log('-- THE GATE arm 4: cascade-rush 42-58% vs tuned greedy AND policy --');
for (const w of [2, 5, 10]) {
  const cr = makeCascadeRush({ w });
  pair(`cascrush(w${w}) vs greedy`, cr, greedy, C);
  pair(`cascrush(w${w}) vs policy`, cr, policy, C);
}
console.log('-- degenerate-strategy check: cascrush mirror (captures must hold ≥5.5) --');
pair('cascrush(w5) mirror', makeCascadeRush({ w: 5 }), makeCascadeRush({ w: 5, name: 'cascrush-b' }), C);

console.log('-- arm 3/6: full-ON mirrors (balance + nova burst + claim share) --');
pair('policy mirror FULL', policy, loadTrainedPolicy(), FULL);
pair('search2 mirror FULL', search2, makeSearch({ depth: 2 }), FULL);
pair('policy mirror OFF', policy, loadTrainedPolicy(), OFF);
