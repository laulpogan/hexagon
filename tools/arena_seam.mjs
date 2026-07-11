// R8/P1 seam ON/OFF under policy/search agents. Usage: node tools/arena_seam.mjs [n].
import { playPairing, loadTrainedPolicy } from './arena.js';
import { withConfig } from './sim.js';
import { makeSearch } from '../core/agents/search.js';
import { makeGreedy } from '../core/agents/greedy.js';

const n = parseInt(process.argv[2] || '60', 10);
function arm(name, patch, mkA, mkB) {
  const r = withConfig(patch, () => playPairing(mkA(), mkB(), n, 'seamarena'));
  const d = r.drama;
  console.log(`${name.padEnd(30)} A ${r.aWins}/${r.games}  firstCap T${d.medianFirstCaptureTurn}  capt/g ${d.capturesPerGame}  comeback ${d.comebackRate}%  leadChg ${d.leadChangeCount}  ply ${r.avgTurns}  stalls ${r.stalls}`);
}
console.log('seam-aware agents — does the verdict change?');
arm('policy v greedy — OFF', { SEAM_MAX_RINGS: 0, FRONTIER_ANCHOR: false }, loadTrainedPolicy, makeGreedy);
arm('policy v greedy — ON', {}, loadTrainedPolicy, makeGreedy);
arm('policy mirror — OFF', { SEAM_MAX_RINGS: 0, FRONTIER_ANCHOR: false }, loadTrainedPolicy, loadTrainedPolicy);
arm('policy mirror — ON', {}, loadTrainedPolicy, loadTrainedPolicy);
arm('search2 mirror — OFF', { SEAM_MAX_RINGS: 0, FRONTIER_ANCHOR: false }, () => makeSearch({depth:2}), () => makeSearch({depth:2}));
arm('search2 mirror — ON', {}, () => makeSearch({depth:2}), () => makeSearch({depth:2}));
