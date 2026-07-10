// Evolution-strategies self-play trainer for the policy agent.
// Usage: npm run train [-- generations population gamesPerEval]
// Writes data/policy_weights.json — rerun after ANY rules/mechanics change.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { makePolicy, DEFAULT_WEIGHTS, FEATURE_NAMES } from '../core/agents/policy.js';
import { makeGreedy } from '../core/agents/greedy.js';
import { playPairing } from './arena.js';
import { mulberry32, hashSeed } from '../core/rng.js';

const OUT = new URL('../data/policy_weights.json', import.meta.url);

function fitness(weights, gen, games) {
  const cand = makePolicy({ weights, name: 'cand' });
  const opponents = [makeGreedy(), makePolicy({ name: 'anchor' })];
  let wins = 0, total = 0;
  for (const opp of opponents) {
    const r = playPairing(cand, opp, games, `es-g${gen}-${opp.name}`);
    wins += r.aWins + r.draws * 0.5;
    total += r.games;
  }
  return wins / total;
}

export function train({ generations = 12, population = 16, games = 8, sigma = 0.6, lr = 0.35 } = {}) {
  let mu = [...DEFAULT_WEIGHTS];
  const rand = mulberry32(hashSeed('es-train'));
  const gauss = () => {
    const u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  let best = { weights: [...mu], fit: fitness(mu, 0, games) };
  console.log(`gen 0 baseline fitness ${best.fit.toFixed(3)}`);

  for (let g = 1; g <= generations; g++) {
    const noises = [], fits = [];
    for (let i = 0; i < population; i++) {
      const eps = mu.map(() => gauss());
      const w = mu.map((m, k) => m + sigma * eps[k]);
      noises.push(eps);
      fits.push(fitness(w, g, games));
    }
    // ES gradient step on normalized fitness
    const mean = fits.reduce((a, b) => a + b, 0) / fits.length;
    const std = Math.sqrt(fits.reduce((a, b) => a + (b - mean) ** 2, 0) / fits.length) || 1;
    mu = mu.map((m, k) => {
      let gsum = 0;
      for (let i = 0; i < population; i++) gsum += ((fits[i] - mean) / std) * noises[i][k];
      return m + (lr * sigma / population) * gsum;
    });
    mu[4] = Math.max(mu[4], 500); // capital capture stays near-lexicographic
    const muFit = fitness(mu, g, games);
    if (muFit > best.fit) best = { weights: [...mu], fit: muFit };
    console.log(`gen ${g}: pop mean ${mean.toFixed(3)} → mu fitness ${muFit.toFixed(3)} (best ${best.fit.toFixed(3)})`);
  }
  fs.writeFileSync(OUT, JSON.stringify({
    features: FEATURE_NAMES, weights: best.weights, fitness: best.fit,
    trainedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`saved data/policy_weights.json (fitness ${best.fit.toFixed(3)} vs greedy+anchor)`);
  return best;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  train({
    generations: parseInt(process.argv[2] || '12', 10),
    population: parseInt(process.argv[3] || '16', 10),
    games: parseInt(process.argv[4] || '8', 10),
  });
}
