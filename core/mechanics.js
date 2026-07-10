// Mechanics registry — wave-1 MTG-analog hooks + the rite (spell) category.
// New mechanics land HERE + in data/tiles.js; game.js core paths stay frozen.
// Hooks: captureGate (FLANK/MENACE-class), onPlacement (ETB-class:
// SUSTAIN/TRAMPLE), targetable (UNTOUCHABLE-class). Rites: castRite targets.
import { CONFIG } from './config.js';
import { neighborCoords } from './board.js';

export const KEYWORD_HOOKS = {
  // Deathtouch analog: with ≥2 enemy neighbors incl. a FLANK attacker-side
  // tile, the capture threshold loosens from 0 to ≤ FLANK_THRESHOLD.
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
      if (hasFlank && enemies >= 2) return { thresholdOverride: CONFIG.FLANK_THRESHOLD };
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
};

// captureGate aggregation across the attacker's board (called from isCapturable)
export function captureThreshold(game, col, row, byPlayer) {
  let threshold = 0;
  const gate = KEYWORD_HOOKS.FLANK.captureGate({ game, col, row, byPlayer });
  if (gate.thresholdOverride !== undefined) threshold = gate.thresholdOverride;
  return threshold;
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

// ─── Rites (spells): played from hand as your turn's action ─────────────
// All v1 resolves are RNG-free — MP action-log replay stays deterministic.
export const RITE_EFFECTS = {
  SUNDER: {
    needsTarget: true,
    isLegalTarget(game, player, col, row) {
      const t = game.cellAt(col, row)?.tile;
      return !!t && t.owner !== player && !t.capital &&
        game.relativeInfluence(col, row) <= CONFIG.SUNDER_MAX_INF &&
        isTargetable(t, player);
    },
    resolve(game, player, col, row) {
      const t = game.board[col][row].tile;
      game.board[col][row].tile = null;
      game._log(player, `cast SUNDER — ${t.type} at (${col},${row}) is unmade`);
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
