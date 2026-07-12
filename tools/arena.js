// Agent arena — round-robin matchup matrix over seed-paired games.
// Usage: npm run arena [-- N [deckA deckB]]     (N games per side per pairing)
// Modular by construction: agents implement takeTurn(game, player, rand);
// rules changes never touch this file.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Game } from '../core/game.js';
import { mulberry32, hashSeed } from '../core/rng.js';
import { makeGreedy } from '../core/agents/greedy.js';
import { makeSearch } from '../core/agents/search.js';
import { makePolicy, DEFAULT_WEIGHTS, FEATURE_NAMES } from '../core/agents/policy.js';
import { createTracker, recordPly, finishTracker, dramaIndex, formatDramaIndex } from './metrics.js';

const PLY_CAP = 400;

export function loadTrainedPolicy() {
  try {
    const w = JSON.parse(fs.readFileSync(new URL('../data/policy_weights.json', import.meta.url)));
    if (!Array.isArray(w.weights) || w.weights.length !== FEATURE_NAMES.length) {
      throw new Error('stale weights file (feature count changed — retrain)');
    }
    return makePolicy({ weights: w.weights, name: 'policy*' });
  } catch {
    return makePolicy({ name: 'policy0' }); // untrained defaults
  }
}

export function defaultAgents() {
  return [makeGreedy(), makeSearch({ depth: 2 }), loadTrainedPolicy()];
}

// One game: agentA plays P1, agentB plays P2.
export function playGame(agentA, agentB, seed, decks = null) {
  const game = new Game({ seed, decks });
  const rand = mulberry32(hashSeed(seed + '-arena'));
  const byPlayer = { 1: agentA, 2: agentB };
  const tracker = createTracker();
  let plies = 0;
  while (game.phase !== 'over' && plies < PLY_CAP) {
    const p = game.currentPlayer;
    const before = game.stats[p].captured;
    const turnBefore = game.turn; // R8/P3: pre-action id (turn++ is synchronous)
    const action = byPlayer[p].takeTurn(game, p, rand);
    recordPly(tracker, game, p, action, before, turnBefore);
    plies++;
  }
  finishTracker(tracker, game);
  return {
    winner: game.winner, winReason: game.winReason, turns: game.turn,
    captures: game.stats[1].captured + game.stats[2].captured,
    tracker,
  };
}

// Seed-paired pairing: each seed is played twice with sides swapped.
export function playPairing(agentA, agentB, n, prefix, decks = null) {
  const out = { a: agentA.name, b: agentB.name, aWins: 0, bWins: 0, draws: 0, stalls: 0, turns: 0, captures: 0, games: 0 };
  const trackers = [];
  for (let i = 0; i < n; i++) {
    for (const flip of [false, true]) {
      const r = flip
        ? playGame(agentB, agentA, `${prefix}-${i}`, decks)
        : playGame(agentA, agentB, `${prefix}-${i}`, decks);
      const aIsP1 = !flip;
      if (r.winner === null) (r.winReason === 'draw' ? out.draws++ : out.stalls++);
      else if ((r.winner === 1) === aIsP1) out.aWins++;
      else out.bWins++;
      out.turns += r.turns; out.captures += r.captures; out.games++;
      trackers.push(r.tracker);
    }
  }
  out.avgTurns = +(out.turns / out.games).toFixed(1);
  out.avgCaptures = +(out.captures / out.games).toFixed(1);
  out.drama = dramaIndex(trackers);
  out.trackers = trackers; // R8/P2: arena_p2 reads per-game road diagnostics
  return out;
}

export function runArena(agents, n = 20, prefix = 'arena', decks = null) {
  const results = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      results.push(playPairing(agents[i], agents[j], n, `${prefix}-${i}v${j}`, decks));
    }
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const n = parseInt(process.argv[2] || '20', 10);
  const agents = defaultAgents();
  console.log(`arena: ${agents.map(a => a.name).join(' vs ')} — ${n} seed-pairs per pairing (${n * 2} games each)\n`);
  const t0 = Date.now();
  for (const r of runArena(agents, n)) {
    console.log(`${r.a.padEnd(9)} vs ${r.b.padEnd(9)} → ${r.aWins}-${r.bWins}` +
      `${r.draws ? ` (${r.draws} draws)` : ''}${r.stalls ? ` [${r.stalls} STALLS]` : ''}` +
      `  avg ${r.avgTurns}t ${r.avgCaptures}cap  drama ${r.drama.composite}/100`);
    console.log('  ' + formatDramaIndex(r.drama).split('\n').join('\n  '));
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
