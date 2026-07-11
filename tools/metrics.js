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
    recaptureCounts: new Map(),     // "col,row" -> capture count on that cell
    maxTrophy: 0,                   // A11: highest trophyValue() observed on any placement
    winner: null, winReason: null, stalled: false,
    comeback: false, mutualTurtle: false, riftlightMarginShare: 0, recaptureCycles: 0,
  };
}

// Call right after game.currentPlayer took their turn (player = who just
// moved, action = what takeTurn()/botTakeTurn() returned, capturedBefore =
// game.stats[player].captured read BEFORE the turn was taken).
export function recordPly(tracker, game, player, action, capturedBefore) {
  tracker.turns = game.turn;
  if (action?.kind === 'place') {
    tracker.placements++;
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
      if (tracker.firstCaptureTurn === null) tracker.firstCaptureTurn = game.turn;
    }
  }
  if (game.boardSummary) {
    const s = game.boardSummary();
    const lead = s[1].influence - s[2].influence;
    const sign = Math.sign(lead);
    if (sign !== 0) {
      if (tracker.lastLeadSign !== 0 && sign !== tracker.lastLeadSign) tracker.leadChanges++;
      tracker.lastLeadSign = sign;
    }
    tracker.influenceSamples.push({ turn: game.turn, p1: s[1].influence, p2: s[2].influence });
  }
}

// Call once the game loop ends (game.phase === 'over' or the ply cap hit).
export function finishTracker(tracker, game) {
  tracker.winner = game.winner;
  tracker.winReason = game.winReason;
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
    const idx = Math.min(Math.floor(tracker.influenceSamples.length * 0.75), tracker.influenceSamples.length - 1);
    const sample = tracker.influenceSamples[idx];
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
