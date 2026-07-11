// R8/P1 seam/frontier 4-arm A/B + knob/nudge/parity sweep (the P1 gate
// instrument). Usage: node tools/sweep_seam.mjs [n]. Findings 2026-07-11:
// see RULES8_P1_SEAM.md status log (gate FAILED; knobs ship OFF).
import { runBatch, withConfig } from './sim.js';
const n = parseInt(process.argv[2] || '300', 10);
function row(name, patch) {
  const b = withConfig(patch, () => runBatch(n, 'p1sweep'));
  const f = b.fun, d = b.fun.diagnostics, g = b.fun.gates;
  console.log(
    `${name.padEnd(26)} fun ${String(f.composite).padStart(5)}  U ${f.U.toFixed(2)}  ` +
    `firstCap T${d.medianFirstCapture}${g.firstCaptureOK ? '✓' : '✗'}  zeroCap ${d.zeroCaptureRate}%  ` +
    `ply ${b.avgTurns}${g.plyBandOK ? '✓' : '✗'}  P1 ${f.p1WinRate}%${g.p1BandOK ? '✓' : '✗'}  ` +
    `stalls ${b.stalls}  capt ${b.avgCaptures}  comeback ${d.comebackRate}%`
  );
}
console.log(`n=${n} per arm, seed-paired\n-- 4 arms --`);
row('OFF/OFF (RULES-7-ish)', { SEAM_MAX_RINGS: 0, FRONTIER_ANCHOR: false });
row('seam only', { SEAM_MAX_RINGS: 2, FRONTIER_ANCHOR: false });
row('frontier only', { SEAM_MAX_RINGS: 0, FRONTIER_ANCHOR: true });
row('BOTH (shipped)', {});
console.log('-- aggressive seam --');
row('rings3 start3 cad3', { SEAM_MAX_RINGS: 3, SEAM_ADVANCE_START: 3, SEAM_ADVANCE_CADENCE: 3 });
row('rings3 start5 cad5', { SEAM_MAX_RINGS: 3 });
row('rings2 start3 cad3', { SEAM_ADVANCE_START: 3, SEAM_ADVANCE_CADENCE: 3 });
console.log('-- BOT_RIFT_NUDGE sweep (gate #10, both mechanics on) --');
for (const nudge of [0, 3, 8, 12]) row(`nudge ${nudge}`, { BOT_RIFT_NUDGE: nudge });
console.log('-- parity check: odd vs even START --');
row('start 6 (even)', { SEAM_ADVANCE_START: 6 });
row('start 7 (odd)', { SEAM_ADVANCE_START: 7 });
