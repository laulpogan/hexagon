// Mechanics registry — wave-1 MTG-analog hooks + the rite (spell) category.
// New mechanics land HERE + in data/tiles.js; game.js core paths stay frozen.
// Hooks: captureGate (FLANK/MENACE-class), onPlacement (ETB-class:
// SUSTAIN/TRAMPLE), targetable (UNTOUCHABLE-class). Rites: castRite targets.
import { CONFIG } from './config.js';
import { neighborCoords, riftNeighborCount } from './board.js';

export const KEYWORD_HOOKS = {
  // Deathtouch analog: with ≥ FLANK_MIN_ATTACKERS attacker-side neighbors
  // incl. a FLANK tile, the capture threshold loosens from 0 to
  // ≤ FLANK_THRESHOLD (+ FLANK_PER_ALLY per attacker beyond 2).
  FLANK: {
    captureGate({ game, col, row, byPlayer }) {
      let enemies = 0, hasFlank = false;
      for (const [c, r] of neighborCoords(col, row)) {
        const t = game.board[c][r].tile;
        if (t && t.owner === byPlayer) {
          enemies++;
          if (t.keywords.includes('FLANK')) hasFlank = true;
        }
      }
      if (hasFlank && enemies >= CONFIG.FLANK_MIN_ATTACKERS) {
        return {
          thresholdOverride: CONFIG.FLANK_THRESHOLD +
            CONFIG.FLANK_PER_ALLY * Math.max(0, enemies - 2),
        };
      }
      return {};
    },
  },
  // Lifelink analog: grows on capture.
  SUSTAIN: {
    onPlacement({ tile, captured }) {
      if (captured) tile.influence += CONFIG.SUSTAIN_BONUS;
    },
  },
  // Trample analog: a capture splashes a permanent dent onto the weakest
  // other adjacent enemy tile.
  TRAMPLE: {
    onPlacement({ game, tile, col, row, captured }) {
      if (!captured) return;
      let weakest = null, weakestRel = Infinity;
      for (const [c, r] of neighborCoords(col, row)) {
        const t = game.board[c][r].tile;
        if (t && t.owner !== tile.owner && !t.capital) {
          const rel = game.relativeInfluence(c, r);
          if (rel < weakestRel) { weakestRel = rel; weakest = t; }
        }
      }
      if (weakest) weakest.influence = Math.max(0, weakest.influence - CONFIG.TRAMPLE_SPLASH);
    },
  },
  // Hexproof analog: cannot be targeted by enemy rites.
  UNTOUCHABLE: {
    targetable() { return false; },
  },
  // R8/R5 showcase: feeds on the wound between worlds — every capture made
  // rift-or-rift-adjacent permanently grows it. SUMMIT and SEAMBOUND are
  // simple static bonuses (like RALLY/FORTIFIED) and live inline in
  // game.js's effectiveBase; SUREFOOT lives inline in relativeInfluence.
  // TIDEBOUND is onPlacement-shaped (like SUSTAIN), so it belongs here.
  TIDEBOUND: {
    onPlacement({ game, tile, col, row, captured }) {
      if (!captured) return;
      const cell = game.board[col][row];
      if (cell.rift || riftNeighborCount(game.board, col, row) > 0) {
        tile.influence += CONFIG.TIDEBOUND_BONUS;
      }
    },
  },
};

// captureGate aggregation across the attacker's board (called from isCapturable)
export function captureThreshold(game, col, row, byPlayer) {
  // MENACE (round 2): defender uncapturable with fewer than 2 attackers adjacent
  const defender = game.board[col][row].tile;
  if (defender?.keywords.includes('MENACE')) {
    let attackers = 0;
    for (const [c, r] of neighborCoords(col, row)) {
      const t = game.board[c][r].tile;
      if (t && t.owner === byPlayer) attackers++;
    }
    if (attackers < 2) return -1; // threshold below any clamped influence → never capturable
  }
  let threshold = 0;
  const gate = KEYWORD_HOOKS.FLANK.captureGate({ game, col, row, byPlayer });
  if (gate.thresholdOverride !== undefined) threshold = gate.thresholdOverride;
  return threshold;
}

// WING (round 2, flying analog): influence subtracted onto a WING tile by
// non-WING enemies is halved (round down). Called from relativeInfluence.
export function modifyIncoming(defTile, attackerTile, amount) {
  if (defTile.keywords.includes('WING') && !attackerTile.keywords.includes('WING')) {
    return Math.floor(amount / 2);
  }
  return amount;
}

export function fireOnPlacement(game, tile, col, row, captured) {
  for (const kw of tile.keywords) {
    KEYWORD_HOOKS[kw]?.onPlacement?.({ game, tile, col, row, captured });
  }
}

export function isTargetable(tile, byPlayer) {
  if (tile.owner !== byPlayer) {
    for (const kw of tile.keywords) {
      if (KEYWORD_HOOKS[kw]?.targetable && KEYWORD_HOOKS[kw].targetable() === false) return false;
    }
  }
  return true;
}

// ─── R6/A7: THE RIFT STIRS — onTurnStart hook ────────────────────────────
// Called once per _beginTurn() (game.js stays thin: one assignment). Fires
// every RIFT_STIRS_INTERVAL plies, active for the firing ply + the next (a
// 2-ply window — each side gets exactly one turn under the pulse), and
// telegraphed exactly 2 plies before it fires so the HUD/renderer can warn.
export function onTurnStart(game) {
  game.riftStirs = riftStirsState(game.turn);
}

export function riftStirsState(turn) {
  const interval = CONFIG.RIFT_STIRS_INTERVAL;
  const lastFire = Math.floor(turn / interval) * interval;
  const active = lastFire > 0 && (turn - lastFire) < 2;
  const nextFireTurn = lastFire + interval;
  const upcoming = (nextFireTurn - turn) === 2;
  const firingIndex = lastFire / interval; // 1st firing = 1, 2nd = 2, ...
  const pulseStrength = active ? 1 + CONFIG.RIFT_STIRS_ESCALATION * (firingIndex - 1) : 0;
  return { active, upcoming, pulseStrength, nextFireTurn, firedAtTurn: active ? lastFire : null };
}

// Called from relativeInfluence: the seam pulse, only while active, only for
// rift-adjacent tiles. ATTUNED inverts (feeds instead of drains).
export function riftStirsPulse(game, tile, col, row) {
  if (!game.riftStirs?.active) return 0;
  if (riftNeighborCount(game.board, col, row) <= 0) return 0;
  const mag = game.riftStirs.pulseStrength;
  return tile.keywords.includes('ATTUNED') ? mag : -mag;
}

// ─── Rites (spells): played from hand as your turn's action ─────────────
// All v1 resolves are RNG-free — MP action-log replay stays deterministic.
export const RITE_EFFECTS = {
  SUNDER: {
    needsTarget: true,
    // A2: SUNDER may only target a tile adjacent to one of the caster's own
    // tiles — otherwise it re-opens the anywhere-snipe R2 closes.
    isLegalTarget(game, player, col, row) {
      const t = game.cellAt(col, row)?.tile;
      if (!t || t.owner === player || t.capital) return false;
      if (game.relativeInfluence(col, row) > CONFIG.SUNDER_MAX_INF) return false;
      if (!isTargetable(t, player)) return false;
      return neighborCoords(col, row).some(([c, r]) => {
        const nt = game.board[c][r].tile;
        return nt && nt.owner === player;
      });
    },
    resolve(game, player, col, row) {
      const cell = game.board[col][row];
      const t = cell.tile;
      // A1: no resurface path — SUNDER unmakes the whole cell (top face +
      // everything buried beneath it) rather than popping one tier and
      // exposing whatever's under it, which would be a liberation in
      // disguise. The ground goes to rubble, not back to any prior owner.
      cell.tile = null;
      cell.stack = [];
      cell.rubble = (cell.rubble || 0) + 1;
      game._log(player, `cast SUNDER — ${t.type} at (${col},${row}) is unmade, its stack with it`);
      return { destroyed: t };
    },
  },
  FORESIGHT: {
    needsTarget: false,
    isLegalTarget() { return true; },
    resolve(game, player) {
      // burst redraw: toss the two worst-by-influence tiles, draw that many
      const hand = game.hands[player];
      let drawn = 0;
      for (let k = 0; k < 2 && hand.length; k++) {
        let idx = 0;
        for (let i = 1; i < hand.length; i++) {
          if ((hand[i].influence || 0) < (hand[idx].influence || 0)) idx = i;
        }
        hand.splice(idx, 1);
        if (game._draw(player)) drawn++;
      }
      game._log(player, `cast FORESIGHT — cycled ${drawn} tiles`);
      return { drawn };
    },
  },
  RALLYING_CRY: {
    needsTarget: true,
    isLegalTarget(game, player, col, row) {
      const t = game.cellAt(col, row)?.tile;
      return !!t && t.owner === player;
    },
    resolve(game, player, col, row) {
      let boosted = 0;
      for (const [c, r] of neighborCoords(col, row)) {
        const t = game.board[c][r].tile;
        if (t && t.owner === player && !t.capital) { t.influence += 1; boosted++; }
      }
      game._log(player, `cast RALLYING CRY — ${boosted} tiles rise`);
      return { boosted };
    },
  },
};
