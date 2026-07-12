// R8/P3 sim sweep — Cascade/Vanguard arms per RULES8_P3_CASCADE.md rev 3.
// EVERY arm patches EVERY knob it depends on explicitly (P2 gate-#2 lesson —
// the ambient CONFIG default ships false). Usage: node tools/sweep_p3.mjs [n] [grid]
import { runBatch, withConfig } from './sim.js';
import { actionsPerTurn } from './metrics.js';

const n = parseInt(process.argv[2] || '300', 10);
const runGrid = process.argv.includes('grid');

const med = a => { if (!a.length) return '—'; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function p3diag(trackers) {
  const apt = actionsPerTurn(trackers);
  const firstCap = med(trackers.filter(t => t.firstCaptureTurn != null).map(t => t.firstCaptureTurn));
  // nova check: share of capture-turns that bag 2+ captures
  let capTurns = 0, burstTurns = 0;
  for (const t of trackers) {
    const byTurn = new Map();
    for (const r of t.captureRows || []) byTurn.set(r.turn, (byTurn.get(r.turn) || 0) + r.n);
    for (const total of byTurn.values()) { capTurns++; if (total >= 2) burstTurns++; }
  }
  const claims = { 1: 0, 2: 0 };
  for (const t of trackers) { claims[1] += t.bountyDraws?.[1] || 0; claims[2] += t.bountyDraws?.[2] || 0; }
  const maxHand = Math.max(0, ...trackers.map(t => t.maxHand || 0));
  const exh = trackers.filter(t => t.endTrigger === 'exhaustion').length / Math.max(1, trackers.length);
  return `apt med ${apt.median} mean ${apt.mean} multi ${(apt.multiShare * 100).toFixed(0)}%  firstCap T${firstCap}  burst ${capTurns ? (burstTurns / capTurns * 100).toFixed(0) : 0}%` +
    `  bounty ${claims[1]}/${claims[2]}  maxHand ${maxHand}  exh ${(exh * 100).toFixed(0)}%`;
}

function row(name, patch) {
  const b = withConfig(patch, () => runBatch(n, 'p2base')); // p2base seeds = pinned baseline set
  const f = b.fun;
  const trackers = b.results.map(r => r.tracker);
  const p1 = (b.p1Wins / Math.max(1, b.p1Wins + b.p2Wins) * 100).toFixed(1);
  console.log(`${name.padEnd(22)} fun ${String(f.composite).padEnd(5)} U ${f.U} K ${f.K} P ${f.P}` +
    `  capt ${b.avgCaptures}  turns ${b.avgTurns}  P1 ${p1}%  comeback ${f.diagnostics.comebackRate}%  stalls ${b.stalls}`);
  console.log(`${''.padEnd(22)} ${p3diag(trackers)}`);
  return b;
}

const OFF = { CASCADE_ON: false, VANGUARD_ON: false };
console.log(`n=${n} per arm, seed-paired ('p2base')  baseline: fun 39.1 K .541 P .880 capt 5.5 comeback 22.7%`);
console.log('-- core arms --');
row('OFF (parity)', { ...OFF });
row('CASCADE only', { CASCADE_ON: true, VANGUARD_ON: false });
row('FULL ON', { CASCADE_ON: true, VANGUARD_ON: true });

console.log('-- VANGUARD isolation (n=600: comeback floor ≥18%, firstCap ≤6 hard) --');
{
  const saved = n; // vanguard arm runs at its own n per gate arm 5
  const bigN = Math.max(600, n);
  const b = withConfig({ CASCADE_ON: false, VANGUARD_ON: true }, () => runBatch(bigN, 'p2base'));
  const f = b.fun;
  const trackers = b.results.map(r => r.tracker);
  const p1 = (b.p1Wins / Math.max(1, b.p1Wins + b.p2Wins) * 100).toFixed(1);
  console.log(`VANGUARD only (n=${bigN})   fun ${f.composite} U ${f.U} K ${f.K} P ${f.P}  capt ${b.avgCaptures}  turns ${b.avgTurns}  P1 ${p1}%  comeback ${f.diagnostics.comebackRate}%`);
  console.log(`${''.padEnd(22)} ${p3diag(trackers)}`);
}

if (runGrid) {
  console.log('-- density / cap grid (CASCADE only) --');
  for (const tiles of [2, 3, 4]) {
    row(`TILES ${tiles}`, { CASCADE_ON: true, VANGUARD_ON: false, CASCADE_TILE_COUNT: tiles });
  }
  row('MAX 2', { CASCADE_ON: true, VANGUARD_ON: false, MAX_PLACEMENTS_PER_TURN: 2 });
  console.log('-- vanguard start-holder probe (FULL ON) --');
  row('VG start P2', { CASCADE_ON: true, VANGUARD_ON: true, VANGUARD_START_HOLDER: 2 });
}
