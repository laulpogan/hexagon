// Balance simulator: bot-vs-bot headless matches. Usage: npm run sim [-- N]
// This is the tuning instrument for tiles.js/config.js knobs (phase 6).
import { fileURLToPath } from 'node:url';
import { Game } from '../core/game.js';
import { botTakeTurn } from '../core/bot.js';
import { mulberry32, hashSeed } from '../core/rng.js';
import { createTracker, recordPly, finishTracker, dramaIndex, formatDramaIndex, funIndex, formatFunIndex } from './metrics.js';

const PLY_CAP = 400;

// A/B harness: run a batch with CONFIG knobs temporarily patched.
// Usage: withConfig({ SIEGE_BONUS: 3 }, () => runBatch(100, 'exp'))
import { CONFIG } from '../core/config.js';
export function withConfig(patch, fn) {
  const saved = {};
  for (const k of Object.keys(patch)) { saved[k] = CONFIG[k]; CONFIG[k] = patch[k]; }
  try { return fn(); }
  finally { for (const k of Object.keys(saved)) CONFIG[k] = saved[k]; }
}

export function runMatch(seed) {
  const game = new Game({ seed });
  const rand = mulberry32(hashSeed(seed + '-bot'));
  const tracker = createTracker();
  botTakeTurn(game, 1, rand);
  botTakeTurn(game, 2, rand);
  let plies = 0;
  while (game.phase === 'play' && plies < PLY_CAP) {
    const p = game.currentPlayer;
    const before = game.stats[p].captured;
    const turnBefore = game.turn; // R8/P3: pre-action id (turn++ is synchronous)
    const action = botTakeTurn(game, p, rand);
    recordPly(tracker, game, p, action, before, turnBefore);
    plies++;
  }
  finishTracker(tracker, game);
  return {
    seed,
    winner: game.winner,
    winReason: game.winReason,    // null = true stall (hit ply cap)
    turns: game.turn,
    stats: game.stats,
    tracker,
  };
}

export function runBatch(n, prefix = 'sim') {
  const results = [];
  for (let i = 0; i < n; i++) results.push(runMatch(`${prefix}-${i}`));
  const wins = { 1: 0, 2: 0, draw: 0, stall: 0 };
  const reasons = { capital: 0, influence: 0 };
  let totalTurns = 0, totalCaptures = 0;
  for (const r of results) {
    if (r.winner) { wins[r.winner]++; reasons[r.winReason]++; }
    else if (r.winReason === 'draw') wins.draw++;
    else wins.stall++;
    totalTurns += r.turns;
    totalCaptures += r.stats[1].captured + r.stats[2].captured;
  }
  return {
    n,
    p1Wins: wins[1],
    p2Wins: wins[2],
    draws: wins.draw,
    stalls: wins.stall,
    byCapital: reasons.capital,
    byInfluence: reasons.influence,
    avgTurns: +(totalTurns / n).toFixed(1),
    avgCaptures: +(totalCaptures / n).toFixed(1),
    drama: dramaIndex(results.map(r => r.tracker)),
    fun: funIndex(results.map(r => r.tracker)),
    results,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const n = parseInt(process.argv[2] || '50', 10);
  const b = runBatch(n);
  console.log(`matches: ${b.n}`);
  console.log(`P1 wins: ${b.p1Wins}  P2 wins: ${b.p2Wins}  draws: ${b.draws}  stalls: ${b.stalls}`);
  console.log(`by capital: ${b.byCapital}  by influence: ${b.byInfluence}`);
  console.log(`avg turns: ${b.avgTurns}  avg captures/match: ${b.avgCaptures}`);
  console.log(formatFunIndex(b.fun));
  console.log(formatDramaIndex(b.drama));
}
