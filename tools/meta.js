// Deck-meta discovery over the (generated) card pool — PSRO-lite.
// Rounds: evaluate a deck population round-robin (policy agents, seed-paired),
// keep the winners' mixture as "the meta", breed challengers by mutating
// winners, repeat. Reports per-card and per-keyword impact + meta diversity
// (inverse-Simpson over win-share), per field-standard metrics.
// Usage: npm run meta [-- rounds popSize gamesPerPair]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { CONFIG } from '../core/config.js';
import { TILE_POOL, registerCards } from '../data/tiles.js';
import { validateDeck } from '../core/game.js';
import { mulberry32, hashSeed } from '../core/rng.js';
import { makePolicy } from '../core/agents/policy.js';
import { playGame } from './arena.js';

const GEN = new URL('../data/cards_gen.json', import.meta.url);
const REPORT = new URL('../data/meta_report.json', import.meta.url);

function pool(rarity) {
  return TILE_POOL.filter(t => t.rarity === rarity);
}

// Random legal deck: caps respected by construction.
export function randomDeck(rand) {
  const comp = {};
  const add = (tpl, n) => { comp[tpl.type] = (comp[tpl.type] || 0) + n; };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  let rares = 0, uncommons = 0, total = 0;
  const rGoal = Math.floor(rand() * (CONFIG.MAX_RARE + 1));
  const uGoal = Math.floor(rand() * (CONFIG.MAX_UNCOMMON + 1));
  while (rares < rGoal) {
    const t = pick(pool('rare'));
    if ((comp[t.type] || 0) < CONFIG.COPY_CAP.rare) { add(t, 1); rares++; total++; }
  }
  while (uncommons < uGoal) {
    const t = pick(pool('uncommon'));
    if ((comp[t.type] || 0) < CONFIG.COPY_CAP.uncommon) { add(t, 1); uncommons++; total++; }
  }
  let guard = 0;
  while (total < CONFIG.DECK_SIZE && guard++ < 500) {
    const t = pick(pool('common'));
    if ((comp[t.type] || 0) < CONFIG.COPY_CAP.common) { add(t, 1); total++; }
  }
  return comp;
}

// Mutate: swap 1-3 cards for legal alternatives.
export function mutateDeck(comp, rand) {
  const next = { ...comp };
  const swaps = 1 + Math.floor(rand() * 3);
  const types = () => Object.keys(next).filter(k => next[k] > 0);
  for (let s = 0; s < swaps; s++) {
    const out = types()[Math.floor(rand() * types().length)];
    if (!out) break;
    next[out]--;
    if (!next[out]) delete next[out];
    const rar = TILE_POOL.find(t => t.type === out)?.rarity || 'common';
    const cands = pool(rar).filter(t => (next[t.type] || 0) < CONFIG.COPY_CAP[rar]);
    const inn = cands[Math.floor(rand() * cands.length)];
    next[inn.type] = (next[inn.type] || 0) + 1;
  }
  return validateDeck(next).valid ? next : comp;
}

export function runMeta({ rounds = 3, popSize = 24, games = 3 } = {}) {
  const rand = mulberry32(hashSeed('meta-loop'));
  const agent = makePolicy({ name: 'metaAgent' });
  let popn = Array.from({ length: popSize }, () => randomDeck(rand));
  const cardGames = new Map();  // type → {games, wins}
  const bump = (comp, won) => {
    for (const [t, n] of Object.entries(comp)) {
      const e = cardGames.get(t) || { games: 0, wins: 0 };
      e.games += n; e.wins += won ? n : 0;
      cardGames.set(t, e);
    }
  };

  let winRates = [];
  for (let round = 0; round < rounds; round++) {
    const scores = popn.map(() => ({ w: 0, g: 0 }));
    for (let i = 0; i < popn.length; i++) {
      // each deck meets `games` sampled opponents, both sides
      for (let k = 0; k < games; k++) {
        const j = (i + 1 + Math.floor(rand() * (popn.length - 1))) % popn.length;
        for (const flip of [false, true]) {
          const decks = flip ? { 1: popn[j], 2: popn[i] } : { 1: popn[i], 2: popn[j] };
          const r = playGame(agent, agent, `meta-r${round}-${i}-${k}-${flip}`, decks);
          const iIsP1 = !flip;
          const iWon = r.winner !== null && ((r.winner === 1) === iIsP1);
          const jWon = r.winner !== null && !iWon;
          scores[i].w += iWon ? 1 : 0; scores[i].g++;
          scores[j].w += jWon ? 1 : 0; scores[j].g++;
          bump(popn[i], iWon); bump(popn[j], jWon);
        }
      }
    }
    winRates = scores.map((s, i) => ({ i, wr: s.w / s.g }));
    winRates.sort((a, b) => b.wr - a.wr);
    // PSRO-lite: keep top half, refill with mutations of winners + fresh blood
    const keep = winRates.slice(0, popSize / 2).map(x => popn[x.i]);
    const next = [...keep];
    while (next.length < popSize - 2) next.push(mutateDeck(keep[Math.floor(rand() * keep.length)], rand));
    while (next.length < popSize) next.push(randomDeck(rand));
    popn = next;
    console.log(`round ${round + 1}: top deck ${(winRates[0].wr * 100).toFixed(0)}%, median ${(winRates[Math.floor(popSize / 2)].wr * 100).toFixed(0)}%`);
  }

  // Per-card impact (min sample floor) + Wilson 95% CI — a card is only
  // FLAGGED when its whole interval clears 50% (over) or sits under it.
  const wilson = (w, n) => {
    const z = 1.96, p = w / n;
    const den = 1 + z * z / n;
    const centre = (p + z * z / (2 * n)) / den;
    const half = (z / den) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [Math.max(0, centre - half), Math.min(1, centre + half)];
  };
  const impacts = [];
  for (const [type, e] of cardGames) {
    if (e.games >= 30) {
      const [lo, hi] = wilson(e.wins, e.games);
      impacts.push({
        type, games: e.games, winRate: +(e.wins / e.games).toFixed(3),
        ci: [+lo.toFixed(3), +hi.toFixed(3)],
        flag: lo > 0.5 ? 'OVER' : hi < 0.5 ? 'UNDER' : null,
      });
    }
  }
  impacts.sort((a, b) => b.winRate - a.winRate);
  const kwAgg = new Map();
  for (const imp of impacts) {
    const tpl = TILE_POOL.find(t => t.type === imp.type);
    for (const kw of (tpl?.keywords?.length ? tpl.keywords : ['(vanilla)'])) {
      const e = kwAgg.get(kw) || { games: 0, wins: 0 };
      e.games += imp.games; e.wins += imp.winRate * imp.games;
      kwAgg.set(kw, e);
    }
  }
  const keywords = [...kwAgg].map(([kw, e]) => ({ kw, games: e.games, winRate: +(e.wins / e.games).toFixed(3) }))
    .sort((a, b) => b.winRate - a.winRate);

  // Meta diversity: inverse-Simpson over final-population win shares
  const shares = winRates.map(x => Math.max(x.wr, 0.001));
  const tot = shares.reduce((a, b) => a + b, 0);
  const invSimpson = 1 / shares.reduce((a, s) => a + (s / tot) ** 2, 0);

  const report = {
    rounds, popSize,
    diversityInvSimpson: +invSimpson.toFixed(1), maxDiversity: popSize,
    flaggedOver: impacts.filter(i => i.flag === 'OVER'),
    flaggedUnder: impacts.filter(i => i.flag === 'UNDER'),
    topCards: impacts.slice(0, 15), bottomCards: impacts.slice(-15).reverse(),
    keywords,
    topDecks: winRates.slice(0, 3).map(x => ({ winRate: +x.wr.toFixed(3), comp: popn[x.i] || null })),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const gen = JSON.parse(fs.readFileSync(GEN));
    console.log(`registered ${registerCards(gen)} generated cards (pool ${TILE_POOL.length})`);
  } catch { console.log('no cards_gen.json — running on base pool'); }
  const t0 = Date.now();
  const rep = runMeta({
    rounds: parseInt(process.argv[2] || '3', 10),
    popSize: parseInt(process.argv[3] || '24', 10),
    games: parseInt(process.argv[4] || '3', 10),
  });
  console.log(`\ndiversity (inv-Simpson): ${rep.diversityInvSimpson}/${rep.maxDiversity}`);
  console.log('\ntop cards:');
  for (const c of rep.topCards.slice(0, 10)) console.log(`  ${c.type.padEnd(16)} ${(c.winRate * 100).toFixed(0)}% (${c.games}g)`);
  console.log('bottom cards:');
  for (const c of rep.bottomCards.slice(0, 5)) console.log(`  ${c.type.padEnd(16)} ${(c.winRate * 100).toFixed(0)}% (${c.games}g)`);
  console.log('keywords:');
  for (const k of rep.keywords) console.log(`  ${k.kw.padEnd(14)} ${(k.winRate * 100).toFixed(1)}% (${k.games}g)`);
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s → data/meta_report.json`);
}
