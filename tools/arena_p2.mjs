// R8/P2 arena — the 42-58% road-rush gate + tuned-agent ON/OFF pairings.
// Diagnostics are pass/fail, not just winrate (plan: capital-capture share +
// ply, rear-farm share, time-to-cap) — a degenerate line must not hide inside
// a healthy band. Usage: node tools/arena_p2.mjs [n]
import { playPairing, loadTrainedPolicy } from './arena.js';
import { makeGreedy } from '../core/agents/greedy.js';
import { makeSearch } from '../core/agents/search.js';
import { makeRoadRush } from '../core/agents/roadrush.js';
import { funIndex } from './metrics.js';
import { CONFIG } from '../core/config.js';

const n = parseInt(process.argv[2] || '120', 10);

function withConfig(patch, fn) {
  const saved = {};
  for (const k of Object.keys(patch)) { saved[k] = CONFIG[k]; CONFIG[k] = patch[k]; }
  try { return fn(); } finally { Object.assign(CONFIG, saved); }
}

function diag(trackers) {
  const decided = trackers.filter(t => t.winner);
  const capWins = decided.filter(t => t.winReason === 'capital');
  const capPlies = capWins.map(t => t.turns).sort((x, y) => x - y);
  const med = a => a.length ? a[Math.floor(a.length / 2)] : '—';
  // looped%/press% are per-ply-sample rates, not per-game "ever happened" rates
  let looped = 0, pressured = 0, samples = 0;
  const timeToCap = [];
  for (const t of trackers) {
    let capAt = null;
    for (const s of t.roadSamples || []) {
      samples++;
      if (s.loop1 || s.loop2) looped++;
      if (s.pressureActive) pressured++;
      // time-to-cap proxy: momentum ≥ DIV×CAP on either side
      const capM = CONFIG.ROAD_MOMENTUM_DIV * CONFIG.ROAD_PRESSURE_CAP;
      if (capAt === null && (s.m1 >= capM || s.m2 >= capM)) capAt = s.turn;
    }
    if (capAt !== null) timeToCap.push(capAt);
  }
  timeToCap.sort((x, y) => x - y);
  return `capWin ${(capWins.length / Math.max(1, decided.length) * 100).toFixed(0)}%@T${med(capPlies)}` +
    `  momCap T${med(timeToCap)}  looped ${samples ? (looped / samples * 100).toFixed(0) : 0}%` +
    `  press ${samples ? (pressured / samples * 100).toFixed(0) : 0}%`;
}

function pair(name, a, b, patch = {}) {
  const r = withConfig(patch, () => playPairing(a, b, n, `p2arena-${name}`));
  const aRate = (r.aWins / Math.max(1, r.aWins + r.bWins) * 100);
  const f = funIndex(r.trackers ?? []);
  console.log(
    `${name.padEnd(30)} ${r.a} ${r.aWins}–${r.bWins} ${r.b} (${aRate.toFixed(1)}%)  ` +
    `turns ${(r.turns / Math.max(1, r.games)).toFixed(1)}  capt ${(r.captures / Math.max(1, r.games)).toFixed(1)}` +
    (r.trackers ? `\n${''.padEnd(30)} ${diag(r.trackers)}  K ${f.K} P ${f.P} comeback ${f.diagnostics.comebackRate}%` : '')
  );
  return aRate;
}

console.log(`n=${n}/side per pairing, seed-paired`);
const greedy = makeGreedy();
const policy = loadTrainedPolicy();
const search2 = makeSearch({ depth: 2 });

// Every ON-labeled arm patches the knob explicitly — CONFIG's ambient default
// ships false since 9c84030, so relying on it silently runs a pressure-inert
// experiment (gate #2 reviewer finding).
console.log('-- tuned agents, roads ON vs OFF (same agent, knob flipped between arms) --');
pair('policy mirror ON', policy, policy, { ROAD_PRESSURE_ON: true });
pair('policy mirror OFF', policy, policy, { ROAD_PRESSURE_ON: false });
pair('search2 mirror ON', search2, search2, { ROAD_PRESSURE_ON: true });
pair('search2 mirror OFF', search2, search2, { ROAD_PRESSURE_ON: false });

console.log('-- THE GATE: roadrush 42–58% vs tuned greedy AND policy --');
for (const w of [2, 5, 10]) {
  const rr = makeRoadRush({ w });
  pair(`roadrush(w${w}) vs greedy`, rr, greedy, { ROAD_PRESSURE_ON: true });
  pair(`roadrush(w${w}) vs policy`, rr, policy, { ROAD_PRESSURE_ON: true });
}
console.log('-- degenerate-strategy check: roadrush mirror --');
pair('roadrush(w5) mirror', makeRoadRush({ w: 5 }), makeRoadRush({ w: 5, name: 'roadrush-b' }),
  { ROAD_PRESSURE_ON: true });
