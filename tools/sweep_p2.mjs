// R8/P2 roads gate instrument — 6-arm A/B + knob grid, seed-paired greedy
// mirror. Committed metrics per RULES8_P2_ROADS.md: funIndex block, captures,
// K/P vs baseline, R4 bank-the-lead (double-pass leader-win share), R5
// placement-row distribution, R6 per-tick parity (seam arms), loop-first-ply,
// %-looped, %-plies-pressure≥1, capital-capture share+ply.
// Usage: node tools/sweep_p2.mjs [n] [grid]  ('grid' also runs the knob grid)
import { runBatch, withConfig } from './sim.js';
import { seamDistance } from '../core/board.js';

const n = parseInt(process.argv[2] || '300', 10);
const runGrid = process.argv.includes('grid');

function roadStats(batch) {
  const ts = batch.results.map(r => r.tracker);
  // R4: of double-pass endings with a winner, share won by the pre-pass leader
  let dp = 0, dpLeaderWins = 0;
  for (const r of batch.results) {
    const t = r.tracker;
    if (t.endTrigger !== 'double-pass' || !r.winner) continue;
    const s = t.influenceSamples;
    if (s.length < 3) continue;
    const pre = s[s.length - 3];
    const leader = pre.p1 > pre.p2 ? 1 : pre.p1 < pre.p2 ? 2 : 0;
    if (!leader) continue;
    dp++;
    if (leader === r.winner) dpLeaderWins++;
  }
  // R5: placement-row distribution (mean seam distance + rear share)
  let rows = 0, sdSum = 0, rear = 0;
  for (const t of ts) for (const p of t.placementRows) {
    rows++; const sd = seamDistance(p.row); sdSum += sd; if (sd >= 3) rear++;
  }
  // R6: per-tick parity — winrate split of games where a seam tick fired
  const tick = batch.results.filter(r => r.tracker.seamAdvanceTurns.length && r.winner);
  const tickP1 = tick.filter(r => r.winner === 1).length;
  // loops + pressure
  let loopFirst = [], looped = 0, pressured = 0, samples = 0;
  for (const t of ts) {
    let first = null;
    for (const s of t.roadSamples) {
      samples++;
      if (s.loop1 || s.loop2) { looped++; if (first === null) first = s.turn; }
      if (s.pressureActive) pressured++;
    }
    if (first !== null) loopFirst.push(first);
  }
  loopFirst.sort((a, b) => a - b);
  const capWins = batch.results.filter(r => r.winReason === 'capital');
  const capPlies = capWins.map(r => r.turns).sort((a, b) => a - b);
  const med = a => a.length ? a[Math.floor(a.length / 2)] : null;
  return {
    r4: dp ? `${(dpLeaderWins / dp * 100).toFixed(0)}% of ${dp}` : 'n/a',
    r5: rows ? `sd ${(sdSum / rows).toFixed(2)} rear ${(rear / rows * 100).toFixed(0)}%` : 'n/a',
    r6: tick.length ? `${(tickP1 / tick.length * 100).toFixed(0)}%P1 of ${tick.length}` : 'n/a',
    loopFirst: med(loopFirst) != null ? `T${med(loopFirst)}` : '—',
    loopedPct: samples ? +(looped / samples * 100).toFixed(1) : 0,
    pressurePct: samples ? +(pressured / samples * 100).toFixed(1) : 0,
    capShare: +(capWins.length / batch.n * 100).toFixed(1),
    capPly: med(capPlies) ?? '—',
  };
}

function row(name, patch) {
  const b = withConfig(patch, () => runBatch(n, 'p2base'));
  const f = b.fun, d = f.diagnostics, g = f.gates;
  const rs = roadStats(b);
  console.log(
    `${name.padEnd(22)} fun ${String(f.composite).padStart(5)}  K ${f.K.toFixed(3)}  P ${f.P.toFixed(3)}  ` +
    `capt ${b.avgCaptures}  comeback ${d.comebackRate}%  firstCap T${d.medianFirstCapture}  ` +
    `ply ${b.avgTurns}${g.plyBandOK ? '✓' : '✗'}  P1 ${f.p1WinRate}%${g.p1BandOK ? '✓' : '✗'}  LC ${f.LC_excess}\n` +
    `${''.padEnd(22)} loop1st ${rs.loopFirst} looped ${rs.loopedPct}% press ${rs.pressurePct}% ` +
    `capWin ${rs.capShare}%@T${rs.capPly}  R4 ${rs.r4}  R5 ${rs.r5}  R6 ${rs.r6}`
  );
}

console.log(`n=${n} per arm, seed-paired ('p2base')  baseline: fun 39.1 K .541 P .880 capt 5.5 comeback 22.7%`);
console.log('-- 6 arms --');
row('OFF (parity)', { ROAD_PRESSURE_ON: false });
row('ROADS', {});
row('ROADS sev-off', { _SEV_OFF: true });
row('ROADS+SEAM', { SEAM_MAX_RINGS: 2 });
row('ROADS+SEAM+FRONTIER', { SEAM_MAX_RINGS: 2, FRONTIER_ANCHOR: true });
row('ROADS+FRONTIER', { FRONTIER_ANCHOR: true });

if (runGrid) {
  console.log('-- knob grid (CAP=3 MULT=2): REACH × DIV --');
  for (const reach of [2, 3, 4]) {
    for (const div of [2, 3, 4]) {
      row(`R${reach} D${div}`, { ROAD_CHAINSLIDE_REACH: reach, ROAD_MOMENTUM_DIV: div });
    }
  }
  console.log('-- CAP + MULT probes at defaults --');
  row('CAP 2', { ROAD_PRESSURE_CAP: 2 });
  row('CAP 4', { ROAD_PRESSURE_CAP: 4 });
  row('MULT 1', { LOOP_CLOSURE_MULT: 1 });
}
