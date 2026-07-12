// Drama Index 0-100 — the fun/interaction instrument for RULES-7 (R9 + A11).
// Design: callers (tools/sim.js, tools/arena.js) drive their own game loops
// (bot-vs-bot / agent-vs-agent) same as before; they just call recordPly()
// after each turn and finishTracker() at game end, then hand the array of
// finished trackers to dramaIndex() for the aggregate report. Rules-agnostic
// by construction (reads game.stats deltas + game.boardSummary(), both of
// which exist pre- and post-RULES-7) so the SAME instrument produces the
// "before" baseline on current rules and the "after" number once RULES-7
// lands — no baked-in assumption about which fields a rules version has.
import { riftNeighborCount } from '../core/board.js';
import { CONFIG } from '../core/config.js';
import { roadPressure } from '../core/roads.js';

export function createTracker() {
  return {
    turns: 0,
    totalCaptures: 0,
    firstCaptureTurn: null,
    placements: 0,
    ascends: 0,
    leadChanges: 0,
    lastLeadSign: 0,
    influenceSamples: [],           // [{turn, p1, p2}]
    riftTouched: { 1: false, 2: false }, // A11 mutual-turtle: ever placed rift-adjacent
    seamAdvanceTurns: [],           // R8/P1: plies where a seam tick fired (A/B narrative)
    roadSamples: [],                // R8/P2: [{turn, m1, m2, loop1, loop2, pressureActive}]
    placementRows: [],              // R8/P2: [{player, row, turn}] — R5 lateral-share input
    actionRows: [],                 // R8/P3: [{player, turn, kind}] place+rite — actions/turn
    captureRows: [],                // R8/P3: [{player, turn, n}] — nova burst distribution
    maxHand: 0,                     // R8/P3: peak hand size (bounty growth check)
    bountyDraws: { 1: 0, 2: 0 },    // R8/P3: per-player claim share (from game.stats)
    endTrigger: null,               // R8/P2: 'double-pass' | 'exhaustion' — R4 slice key
    recaptureCounts: new Map(),     // "col,row" -> capture count on that cell
    maxTrophy: 0,                   // A11: highest trophyValue() observed on any placement
    winner: null, winReason: null, stalled: false,
    comeback: false, mutualTurtle: false, riftlightMarginShare: 0, recaptureCycles: 0,
  };
}

// Call right after game.currentPlayer took their turn (player = who just
// moved, action = what takeTurn()/botTakeTurn() returned, capturedBefore =
// game.stats[player].captured read BEFORE the turn was taken).
// R8/P3: turnBefore = game.turn read by the HARNESS before dispatching the
// action. A turn-ending action runs _endTurn→_beginTurn→turn++ synchronously,
// so a post-action read tags the ply with the NEXT turn's id — under Cascade
// that would split one multi-placement turn across two ids and the per-turn
// dedupe would keep an incomplete mid-cascade state (gate-#1 round-2 C2).
export function recordPly(tracker, game, player, action, capturedBefore, turnBefore = game.turn) {
  tracker.turns = game.turn;
  // R8/P1: seamAdvance sets this transient cue when its tick fires
  if (game.seamAdvancedThisTurn > 0 &&
      tracker.seamAdvanceTurns[tracker.seamAdvanceTurns.length - 1] !== turnBefore) {
    tracker.seamAdvanceTurns.push(turnBefore);
  }
  // R8/P2: road telemetry for the sweep's committed metrics (loop-first-ply,
  // %-looped, %-plies-with-pressure). Zero-cost when the knob is off.
  if (game.roads) {
    let pressureActive = false;
    if (CONFIG.ROAD_PRESSURE_ON) {
      outer:
      for (let c = 0; c < CONFIG.GRID_W; c++) {
        for (let r = 0; r < CONFIG.GRID_H; r++) {
          const t = game.board[c][r].tile;
          if (t && !t.capital && roadPressure(game, c, r, t.owner) > 0) {
            pressureActive = true;
            break outer;
          }
        }
      }
    }
    tracker.roadSamples.push({
      turn: turnBefore,
      m1: game.roads.momentum[1], m2: game.roads.momentum[2],
      loop1: game.roads.loop[1], loop2: game.roads.loop[2],
      pressureActive,
    });
  }
  // R8/P3: rites consume placementsLeft too — charter #4 counts ACTIONS/turn
  if (action?.kind === 'place' || action?.kind === 'rite') {
    tracker.actionRows.push({ player, turn: turnBefore, kind: action.kind });
  }
  if (action?.kind === 'place') {
    tracker.placements++;
    if (action.row != null) tracker.placementRows.push({ player, row: action.row, turn: turnBefore }); // R8/P2 R5
    if (action.ascend) tracker.ascends++;
    const capturedNow = game.stats[player].captured - capturedBefore;
    if (action.col != null) {
      const cell = game.board[action.col]?.[action.row];
      const riftAdjacent = !!cell && (cell.rift || riftNeighborCount(game.board, action.col, action.row) > 0);
      if (riftAdjacent) tracker.riftTouched[player] = true;
      if (capturedNow > 0) {
        const key = `${action.col},${action.row}`;
        tracker.recaptureCounts.set(key, (tracker.recaptureCounts.get(key) || 0) + 1);
        if (game.trophyValue) tracker.maxTrophy = Math.max(tracker.maxTrophy, game.trophyValue(action.col, action.row));
      }
    }
    if (capturedNow > 0) {
      tracker.totalCaptures += capturedNow;
      if (tracker.firstCaptureTurn === null) tracker.firstCaptureTurn = turnBefore;
      tracker.captureRows.push({ player, turn: turnBefore, n: capturedNow }); // R8/P3
    }
  }
  if (game.hands) {
    tracker.maxHand = Math.max(tracker.maxHand, game.hands[1].length, game.hands[2].length);
  }
  if (game.boardSummary) {
    const s = game.boardSummary();
    const lead = s[1].influence - s[2].influence;
    const sign = Math.sign(lead);
    if (sign !== 0) {
      if (tracker.lastLeadSign !== 0 && sign !== tracker.lastLeadSign) tracker.leadChanges++;
      tracker.lastLeadSign = sign;
    }
    tracker.influenceSamples.push({ turn: turnBefore, player, p1: s[1].influence, p2: s[2].influence });
  }
}

// R8/P3: collapse to the LAST sample per turn id — one sample per REAL turn.
// U/K/P/lcRate assume consecutive samples are consecutive player turns; a
// cascade turn otherwise injects same-player samples that inflate K/P and
// dilute lead-change rate mechanically. Samples are chronological, so same-
// turn runs are adjacent. Identity at 1 action/turn (OFF-parity).
function dedupeByTurn(samples) {
  const out = [];
  for (const smp of samples) {
    if (out.length && out[out.length - 1].turn === smp.turn) out[out.length - 1] = smp;
    else out.push(smp);
  }
  return out;
}

// R8/P3 gate arm 1: actions per real turn across a batch — median (the
// charter's letter), mean, and multi-action-turn share (the felt measure;
// at 3-4 cascade copies per 20-card deck the median cannot cross 1).
export function actionsPerTurn(trackers) {
  const counts = [];
  for (const t of trackers) {
    const byTurn = new Map();
    for (const a of t.actionRows || []) byTurn.set(a.turn, (byTurn.get(a.turn) || 0) + 1);
    counts.push(...byTurn.values());
  }
  if (!counts.length) return { median: 0, mean: 0, multiShare: 0 };
  counts.sort((a, b) => a - b);
  return {
    median: counts[Math.floor(counts.length / 2)],
    mean: +(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2),
    multiShare: +(counts.filter(c => c >= 2).length / counts.length).toFixed(3),
  };
}

export function actionsPerTurnMedian(trackers) {
  return actionsPerTurn(trackers).median;
}

// Call once the game loop ends (game.phase === 'over' or the ply cap hit).
export function finishTracker(tracker, game) {
  tracker.winner = game.winner;
  tracker.winReason = game.winReason;
  tracker.endTrigger = game.endTrigger || null; // R8/P2: R4 bank-the-lead slice
  if (game.stats?.[1]?.bountyDraws !== undefined) { // R8/P3
    tracker.bountyDraws = { 1: game.stats[1].bountyDraws, 2: game.stats[2].bountyDraws };
  }
  tracker.turns = game.turn;
  tracker.stalled = game.phase !== 'over';
  tracker.mutualTurtle = !tracker.riftTouched[1] && !tracker.riftTouched[2];

  if (game.boardSummary) {
    const s = game.boardSummary();
    const margin = s[1].influence - s[2].influence;
    const riftlightMargin = (s[1].riftlight || 0) - (s[2].riftlight || 0);
    tracker.riftlightMarginShare = margin !== 0 ? Math.min(1, Math.abs(riftlightMargin) / Math.abs(margin)) : 0;
  }
  if (tracker.winner && tracker.influenceSamples.length) {
    // R8/P3: percentile over REAL turns, not raw samples (cascade injects
    // multiple samples per turn and would shift the 75% cut point).
    const ded = dedupeByTurn(tracker.influenceSamples);
    const idx = Math.min(Math.floor(ded.length * 0.75), ded.length - 1);
    const sample = ded[idx];
    tracker.comeback = tracker.winner === 1 ? sample.p1 < sample.p2 : sample.p2 < sample.p1;
  }
  let cycles = 0;
  for (const n of tracker.recaptureCounts.values()) if (n >= 2) cycles++;
  tracker.recaptureCycles = cycles;
  return tracker;
}

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const clamp01 = x => Math.max(0, Math.min(1, x));

// Aggregate a batch of finished trackers into the composite 0-100 index.
// Weighted blend, documented here (the "how" for anyone re-tuning it):
//   captures/game        20%  (more contact = more drama, saturates at 8/game)
//   median first capture 15%  (T4 or earlier = full marks, decays to 0 by T24)
//   lead changes         15%  (swingy games, saturates at 4 flips/game)
//   comeback rate        10%  (direct %)
//   NOT zero-capture     15%  (baseline's headline failure — heaviest single weight after captures)
//   NOT stall            10%  (direct % of non-stalled games)
//   NOT mutual-turtle    10%  (A11: neither side ever went near the seam)
//   recapture cycles      5%  (some tug-of-war is good texture, capped so ping-pong doesn't dominate)
export function dramaIndex(trackers) {
  const n = trackers.length;
  const capturesPerGame = avg(trackers.map(t => t.totalCaptures));
  const firstCaptureTurns = trackers.map(t => t.firstCaptureTurn).filter(x => x != null);
  const medianFirstCapture = median(firstCaptureTurns);
  const zeroCaptureRate = trackers.filter(t => t.totalCaptures === 0).length / n;
  const stallRate = trackers.filter(t => t.stalled).length / n;
  const avgLeadChanges = avg(trackers.map(t => t.leadChanges));
  const decisive = trackers.filter(t => t.winner);
  const comebackRate = decisive.length ? decisive.filter(t => t.comeback).length / decisive.length : 0;
  const mutualTurtleRate = trackers.filter(t => t.mutualTurtle).length / n;
  const avgRecaptureCycles = avg(trackers.map(t => t.recaptureCycles));
  const maxTrophyBonus = trackers.length ? Math.max(...trackers.map(t => t.maxTrophy)) : 0;
  const ascendRate = avg(trackers.map(t => t.placements ? t.ascends / t.placements : 0));
  const riftlightMarginShare = avg(trackers.map(t => t.riftlightMarginShare));

  const scores = {
    captures: clamp01(capturesPerGame / 8) * 100,
    firstCapture: medianFirstCapture == null ? 0 : clamp01(1 - Math.max(0, medianFirstCapture - 4) / 20) * 100,
    leadChanges: clamp01(avgLeadChanges / 4) * 100,
    comeback: comebackRate * 100,
    notZeroCapture: (1 - zeroCaptureRate) * 100,
    notStall: (1 - stallRate) * 100,
    notMutualTurtle: (1 - mutualTurtleRate) * 100,
    recaptureCycles: clamp01(avgRecaptureCycles / 3) * 100,
  };
  const weights = {
    captures: 0.20, firstCapture: 0.15, leadChanges: 0.15, comeback: 0.10,
    notZeroCapture: 0.15, notStall: 0.10, notMutualTurtle: 0.10, recaptureCycles: 0.05,
  };
  let composite = 0;
  for (const k of Object.keys(weights)) composite += scores[k] * weights[k];

  return {
    n, composite: +composite.toFixed(1),
    capturesPerGame: +capturesPerGame.toFixed(2),
    medianFirstCaptureTurn: medianFirstCapture,
    leadChangeCount: +avgLeadChanges.toFixed(2),
    comebackRate: +(comebackRate * 100).toFixed(1),
    zeroCaptureGameRate: +(zeroCaptureRate * 100).toFixed(1),
    stallRate: +(stallRate * 100).toFixed(1),
    mutualTurtleRate: +(mutualTurtleRate * 100).toFixed(1),
    recaptureCycleCount: +avgRecaptureCycles.toFixed(2),
    maxTrophyBonus,
    ascendRate: +(ascendRate * 100).toFixed(1),
    riftlightMarginShare: +(riftlightMarginShare * 100).toFixed(1),
    subScores: scores,
  };
}

export function formatDramaIndex(d) {
  return `Drama Index: ${d.composite}/100  (n=${d.n})\n` +
    `  captures/game ${d.capturesPerGame}  medianFirstCapture T${d.medianFirstCaptureTurn ?? '—'}  leadChanges ${d.leadChangeCount}  comebackRate ${d.comebackRate}%\n` +
    `  zeroCaptureRate ${d.zeroCaptureGameRate}%  stallRate ${d.stallRate}%  mutualTurtleRate ${d.mutualTurtleRate}%\n` +
    `  recaptureCycles/game ${d.recaptureCycleCount}  maxTrophyBonus ${d.maxTrophyBonus}  ascendRate ${d.ascendRate}%  riftlightMarginShare ${d.riftlightMarginShare}%`;
}

// ---- Fun Index (RULES-8 gate instrument, analysis/fun_metric_spec.md) ----------
// Browne (2008) empirical predictors of human-perceived game quality, computed from
// the deterministic per-ply influence log. REPLACES the dramaIndex composite as the
// gate (dramaIndex stays callable as a legacy diagnostic). Seed-paired A/B-able since
// the rng is fully seeded. LEAD_CHANGE_TARGET is the one constant to CALIBRATE against
// the RULES-7 baseline distribution in phase 0 (Browne fit his empirically; so do we).
const LEAD_CHANGE_TARGET = 0.25; // P0 calibration knob — Limen's lead is sticky
const M_PREF = 35;               // midpoint of the 25-45 ply target band (duration)

// Per-game quality terms from one tracker's influenceSamples. Returns null if too short.
function perGameFun(t) {
  const s = dedupeByTurn(t.influenceSamples); // R8/P3: one sample per real turn
  const M = s.length;
  if (M < 2) return null;
  const lead = s.map(x => x.p1 - x.p2);      // signed P1-perspective lead per ply
  let L = 1;
  for (const d of lead) L = Math.max(L, Math.abs(d)); // per-game peak |lead|, guards /0
  const w = t.winner;                         // 1 | 2 | null

  // U (Uncertainty-Late) + K (Killer Moves) — winner-perspective, decided games only.
  let U = null, K = null;
  if (w === 1 || w === 2) {
    const nwl = lead.map(d => (w === 1 ? d : -d) / L); // winner lead, normalized [-1,1]
    let num = 0, den = 0;
    for (let n = 0; n < M; n++) {
      const frac = M > 1 ? n / (M - 1) : 0;
      const e = (nwl[n] + 1) / 2;             // winner lead mapped to [0,1]
      const wt = frac * frac;                 // Browne late-weighting, k=2
      num += wt * Math.min(1, Math.abs(frac - e));
      den += wt;
    }
    U = den > 0 ? num / den : 0;
    let k = 0;
    for (let n = 1; n < M; n++) k = Math.max(k, Math.abs(nwl[n] - nwl[n - 1]));
    K = k;
  }

  // P (Permanence) — a strong move should stick, not be immediately traded back.
  let P = null;
  if (M >= 3) {
    let sum = 0, cnt = 0;
    for (let n = 1; n <= M - 2; n++) {
      const sgnN = s[n].player === 1 ? 1 : -1;
      const sgnN1 = s[n + 1].player === 1 ? 1 : -1;
      const mDeltaN = sgnN * (lead[n] - lead[n - 1]);       // mover's self-improvement
      const mDeltaN1 = sgnN1 * (lead[n + 1] - lead[n]);     // next mover's self-improvement
      const R = clamp01(Math.min(Math.max(0, mDeltaN), Math.max(0, mDeltaN1)) / L);
      sum += R; cnt++;
    }
    P = cnt > 0 ? 1 - sum / cnt : 1;
  }

  // Lead-change rate (per game) — ties carry the prior sign.
  let flips = 0, prev = 0;
  for (let n = 0; n < M; n++) {
    let sg = Math.sign(lead[n]);
    if (sg === 0) sg = prev;
    if (n > 0 && sg !== 0 && prev !== 0 && sg !== prev) flips++;
    prev = sg;
  }
  const lcRate = M > 1 ? flips / (M - 1) : 0;

  const dur = t.turns || M;                    // real game length (charter's 25-45 band)
  const durDev = clamp01(Math.abs(M_PREF - dur) / M_PREF);

  return { U, K, P, lcRate, durDev };
}

// Aggregate the batch into the composite + viability gates + charter-gate PASS/FAIL.
// skillDepthNorm is filled from an arena batch (see tools/arena.js), null from the sim.
export function funIndex(trackers, { skillDepthNorm = null } = {}) {
  const G = trackers.length;
  const per = trackers.map(perGameFun).filter(Boolean);
  const winsP1 = trackers.filter(t => t.winner === 1).length;
  const winsP2 = trackers.filter(t => t.winner === 2).length;
  const decidedN = winsP1 + winsP2;
  const draws = trackers.filter(t => t.winner == null && !t.stalled).length;
  const stalls = trackers.filter(t => t.stalled).length;

  const U = avg(per.filter(p => p.U != null).map(p => p.U));
  const K = avg(per.filter(p => p.K != null).map(p => p.K));
  const P = avg(per.filter(p => p.P != null).map(p => p.P));
  const C = G ? decidedN / G : 0;
  const meanLcRate = avg(per.map(p => p.lcRate));
  const LC_excess = clamp01(Math.abs(meanLcRate - LEAD_CHANGE_TARGET) / LEAD_CHANGE_TARGET);
  const Dur_dev = avg(per.map(p => p.durDev));

  const composite = clamp01(0.30 * U + 0.20 * K + 0.15 * P + 0.15 * C - 0.10 * LC_excess - 0.10 * Dur_dev) * 100;

  const balance = decidedN ? 1 - Math.abs(winsP1 - winsP2) / decidedN : 0;
  const drawishness = G ? draws / G : 0;
  const p1Rate = decidedN ? winsP1 / decidedN : 0;

  const capturesPerGame = avg(trackers.map(t => t.totalCaptures));
  const firstCaps = trackers.map(t => t.firstCaptureTurn).filter(x => x != null);
  const medianFirstCapture = median(firstCaps);
  const zeroCaptureRate = trackers.filter(t => t.totalCaptures === 0).length / G;
  const decided = trackers.filter(t => t.winner);
  const comebackRate = decided.length ? decided.filter(t => t.comeback).length / decided.length : 0;
  const avgPlies = avg(trackers.map(t => t.turns));

  return {
    n: G, composite: +composite.toFixed(1),
    U: +U.toFixed(3), K: +K.toFixed(3), P: +P.toFixed(3), C: +C.toFixed(3),
    LC_excess: +LC_excess.toFixed(3), Dur_dev: +Dur_dev.toFixed(3),
    meanLeadChangeRate: +meanLcRate.toFixed(3),
    balance: +balance.toFixed(3), completion: +C.toFixed(3), drawishness: +drawishness.toFixed(3),
    p1WinRate: +(p1Rate * 100).toFixed(1),
    skillDepthNorm,
    gates: {
      balanceOK: balance >= 0.80,
      completionOK: C >= 0.90,
      drawishnessOK: drawishness <= 0.05,
      firstCaptureOK: medianFirstCapture != null && medianFirstCapture <= 6,
      zeroCaptureOK: zeroCaptureRate <= 0.05,
      plyBandOK: avgPlies >= 25 && avgPlies <= 45,
      p1BandOK: p1Rate >= 0.48 && p1Rate <= 0.52,
    },
    diagnostics: {
      capturesPerGame: +capturesPerGame.toFixed(2),
      medianFirstCapture,
      zeroCaptureRate: +(zeroCaptureRate * 100).toFixed(1),
      comebackRate: +(comebackRate * 100).toFixed(1),
      avgPlies: +avgPlies.toFixed(1),
      stalls, draws,
    },
  };
}

export function formatFunIndex(f) {
  const g = f.gates, d = f.diagnostics;
  const mark = b => (b ? 'PASS' : 'FAIL');
  return `Fun Index: ${f.composite}/100  (n=${f.n})\n` +
    `  U ${f.U}  K ${f.K}  P ${f.P}  C ${f.C}  -LC ${f.LC_excess}  -Dur ${f.Dur_dev}  (leadChangeRate ${f.meanLeadChangeRate})\n` +
    `  viability: balance ${f.balance} ${mark(g.balanceOK)}  completion ${f.completion} ${mark(g.completionOK)}  drawishness ${f.drawishness} ${mark(g.drawishnessOK)}\n` +
    `  charter gates: firstCap<=6 ${mark(g.firstCaptureOK)} (T${d.medianFirstCapture ?? '—'})  zeroCap<=5% ${mark(g.zeroCaptureOK)} (${d.zeroCaptureRate}%)  ply25-45 ${mark(g.plyBandOK)} (${d.avgPlies})  P1 48-52% ${mark(g.p1BandOK)} (${f.p1WinRate}%)\n` +
    `  skillDepth(arena): ${f.skillDepthNorm == null ? 'n/a — run arena' : f.skillDepthNorm}  ·  comeback ${d.comebackRate}%`;
}
