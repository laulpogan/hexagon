// Limen rules engine — renderer-free, headless-runnable. No DOM, no
// Math.random (seeded PRNG only), no network. Everything the board game IS.
import { CONFIG } from './config.js';
import { TILE_POOL, tileTemplate, defaultDeckComposition } from '../data/tiles.js';
import { createBoard, neighborCoords, isEdge, midRow, riftNeighborCount } from './board.js';
import { hashSeed, mulberry32, shuffleInPlace } from './rng.js';

export class Game {
  // seed: shared board seed (room code in MP). decks: {1: comp, 2: comp}
  // where comp = {TYPE: count}. Defaults to the starter deck.
  constructor({ seed = 'local', decks = null } = {}) {
    this.seed = String(seed);
    this.rand = mulberry32(hashSeed(this.seed));
    this.board = createBoard(this.rand);
    this.phase = 'capital';        // 'capital' | 'play' | 'over'
    this.currentPlayer = 1;
    this.turn = 0;
    this.winner = null;
    this.winReason = null;         // 'capital' | 'influence' | 'draw'
    this.consecutivePasses = 0;
    this.placementsLeft = 0;
    this.discardsLeft = 0;
    this.capitalsPlaced = { 1: false, 2: false };
    this.decks = { 1: [], 2: [] };
    this.hands = { 1: [], 2: [] };
    this.stats = {
      1: { placed: 0, captured: 0, discarded: 0 },
      2: { placed: 0, captured: 0, discarded: 0 },
    };
    this.log = [];
    this._tileId = 1;
    for (const p of [1, 2]) {
      // Tier caps enforced at the choke point: an invalid composition
      // (hand-edited localStorage, hostile MP peer) falls back to default.
      let comp = (decks && decks[p]) || defaultDeckComposition();
      if (decks && decks[p] && !validateDeck(comp).valid) comp = defaultDeckComposition();
      this.decks[p] = this._buildDeck(comp, p);
    }
  }

  // ─── Setup ────────────────────────────────────────────────────────────

  _buildDeck(composition, owner) {
    // Iterate TILE_POOL (canonical order), NOT the composition object — the
    // Fisher-Yates result depends on input order, so two multiplayer clients
    // with the same seed but differently-ordered composition keys would
    // otherwise build divergent decks and silently desync.
    const deck = [];
    for (const tpl of TILE_POOL) {
      const count = composition[tpl.type] || 0;
      for (let i = 0; i < count; i++) deck.push(this._makeTile(tpl.type, owner));
    }
    return shuffleInPlace(deck, this.rand);
  }

  _makeTile(type, owner) {
    const tpl = tileTemplate(type);
    return {
      id: this._tileId++,
      type,
      influence: tpl.influence,
      keywords: [...tpl.keywords],
      rarity: tpl.rarity,
      owner,
      capital: false,
      wardConsumed: false,
    };
  }

  _makeCapital(owner) {
    return {
      id: this._tileId++,
      type: 'CAPITAL',
      influence: CONFIG.CAPITAL_INFLUENCE,
      keywords: [],
      rarity: 'capital',
      owner,
      capital: true,
      wardConsumed: false,
    };
  }

  // ─── Queries ──────────────────────────────────────────────────────────

  cellAt(col, row) {
    return this.board[col]?.[row] || null;
  }

  hasKeyword(tile, kw) {
    return tile.keywords.includes(kw);
  }

  // Base influence + FORTIFIED edge bonus + RALLY from adjacent friendlies.
  effectiveBase(col, row) {
    const tile = this.cellAt(col, row)?.tile;
    if (!tile) return 0;
    let inf = tile.influence;
    if (this.hasKeyword(tile, 'FORTIFIED') && isEdge(col, row)) {
      inf += CONFIG.FORTIFIED_BONUS;
    }
    for (const [c, r] of neighborCoords(col, row)) {
      const nt = this.board[c][r].tile;
      if (nt && nt.owner === tile.owner && this.hasKeyword(nt, 'RALLY')) {
        inf += CONFIG.RALLY_BONUS;
      }
    }
    return inf;
  }

  // Full influence: effective base ± neighbor contributions ± rift aura.
  // A tile at ≤0 relative influence (clamped to 0) is capturable by the enemy.
  relativeInfluence(col, row) {
    const tile = this.cellAt(col, row)?.tile;
    if (!tile) return 0;
    let total = this.effectiveBase(col, row);
    for (const [c, r] of neighborCoords(col, row)) {
      const nt = this.board[c][r].tile;
      if (!nt) continue;
      const mult = this.hasKeyword(nt, 'DOUBLESTRIKE') ? 2 : 1;
      const contribution = this.effectiveBase(c, r) * mult;
      if (nt.owner === tile.owner) {
        total += contribution;
      } else {
        // SIEGE lives on the attacker: enemies adjacent to a SIEGE tile
        // suffer an extra penalty. (The original applied this to the SIEGE
        // tile itself — a bug contradicting its own description; fixed here.)
        const siege = this.hasKeyword(nt, 'SIEGE') ? CONFIG.SIEGE_BONUS : 0;
        total -= contribution + siege;
      }
    }
    const riftN = riftNeighborCount(this.board, col, row);
    total += riftN * CONFIG.RIFT_AURA * (this.hasKeyword(tile, 'ATTUNED') ? 1 : -1);
    return Math.max(0, total);
  }

  isCapturable(col, row, byPlayer) {
    const tile = this.cellAt(col, row)?.tile;
    if (!tile || tile.owner === byPlayer) return false;
    return this.relativeInfluence(col, row) === 0;
  }

  // Capital zone: your side of the seam, at least N rows from the mid line.
  isLegalCapitalCell(player, col, row) {
    const cell = this.cellAt(col, row);
    if (!cell || cell.tile || cell.rift) return false;
    const mid = midRow();
    if (player === 1) return row <= mid - CONFIG.CAPITAL_MIN_DIST_FROM_SEAM;
    return row >= mid + CONFIG.CAPITAL_MIN_DIST_FROM_SEAM;
  }

  // Placement legality during normal play (capture and expansion).
  canPlace(player, tile, col, row) {
    if (this.phase !== 'play') return false;
    const cell = this.cellAt(col, row);
    if (!cell) return false;
    if (cell.tile) return this.isCapturable(col, row, player);
    if (this.hasKeyword(tile, 'SCOUT')) return true;
    return neighborCoords(col, row).some(([c, r]) => {
      const nt = this.board[c][r].tile;
      return nt && nt.owner === player;
    });
  }

  // All legal moves for the active player — drives both bot and UI hints.
  legalMoves(player) {
    const moves = [];
    if (this.phase !== 'play' || player !== this.currentPlayer) return moves;
    if (this.placementsLeft <= 0) return moves;
    this.hands[player].forEach((tile, handIndex) => {
      for (let c = 0; c < CONFIG.GRID_W; c++) {
        for (let r = 0; r < CONFIG.GRID_H; r++) {
          if (this.canPlace(player, tile, c, r)) {
            moves.push({ handIndex, col: c, row: r, capture: !!this.board[c][r].tile });
          }
        }
      }
    });
    return moves;
  }

  // ─── Actions (all return a result object; never throw on illegal input) ─

  placeCapital(player, col, row) {
    if (this.phase !== 'capital') return { ok: false, reason: 'wrong phase' };
    if (player !== this.currentPlayer) return { ok: false, reason: 'not your turn' };
    if (this.capitalsPlaced[player]) return { ok: false, reason: 'capital already placed' };
    if (!this.isLegalCapitalCell(player, col, row)) return { ok: false, reason: 'illegal capital cell' };

    const capital = this._makeCapital(player);
    this.board[col][row].tile = capital;
    this.capitalsPlaced[player] = true;
    this._log(player, `placed their capital at (${col},${row})`);

    if (this.capitalsPlaced[1] && this.capitalsPlaced[2]) {
      this._startPlay();
      return { ok: true, allCapitalsPlaced: true };
    }
    this.currentPlayer = player === 1 ? 2 : 1;
    return { ok: true, allCapitalsPlaced: false };
  }

  _startPlay() {
    this.phase = 'play';
    this.currentPlayer = 1;
    for (const p of [1, 2]) {
      for (let i = 0; i < CONFIG.HAND_SIZE; i++) this._draw(p);
    }
    this._beginTurn();
  }

  _beginTurn() {
    this.turn++;
    this.placementsLeft = CONFIG.PLACEMENTS_PER_TURN;
    this.discardsLeft = CONFIG.DISCARDS_PER_TURN;
    this._draw(this.currentPlayer);
    // All cards spent on both sides → resolve immediately, no pass theater.
    if (this.decks[1].length + this.decks[2].length +
        this.hands[1].length + this.hands[2].length === 0) {
      this._resolveInfluenceVictory();
    }
  }

  _draw(player) {
    const tile = this.decks[player].pop();
    if (tile) this.hands[player].push(tile);
    return tile || null;
  }

  placeFromHand(player, handIndex, col, row) {
    if (this.phase !== 'play') return { ok: false, reason: 'wrong phase' };
    if (player !== this.currentPlayer) return { ok: false, reason: 'not your turn' };
    if (this.placementsLeft <= 0) return { ok: false, reason: 'no placements left' };
    const tile = this.hands[player][handIndex];
    if (!tile) return { ok: false, reason: 'no such hand tile' };
    if (!this.canPlace(player, tile, col, row)) return { ok: false, reason: 'illegal placement' };

    const cell = this.board[col][row];
    const target = cell.tile;
    this.hands[player].splice(handIndex, 1);
    this.placementsLeft--;
    this.consecutivePasses = 0; // any card-spending action is a real action (incl. ward-blocked attacks)

    // WARD: the defender absorbs the attack; attacker's tile is spent.
    if (target && this.hasKeyword(target, 'WARD') && !target.wardConsumed) {
      target.wardConsumed = true;
      this._log(player, `attacked ${target.type} at (${col},${row}) but its Ward absorbed the attack`);
      const result = { ok: true, wardBlocked: true, target };
      this._afterAction();
      return result;
    }

    // Capital capture = win.
    if (target && target.capital) {
      cell.tile = tile;
      this.stats[player].placed++;
      this.stats[player].captured++;
      this.winner = player;
      this.winReason = 'capital';
      this.phase = 'over';
      this._log(player, `captured the enemy capital — VICTORY`);
      return { ok: true, captured: target, won: true };
    }

    const captured = target || null;
    cell.tile = tile;
    this.stats[player].placed++;
    if (captured) {
      this.stats[player].captured++;
      this._log(player, `captured enemy ${captured.type} at (${col},${row}) with ${tile.type}`);
    } else {
      this._log(player, `placed ${tile.type} at (${col},${row})`);
    }
    const result = { ok: true, captured, won: false };
    this._afterAction();
    return result;
  }

  discardRedraw(player, handIndex) {
    if (this.phase !== 'play') return { ok: false, reason: 'wrong phase' };
    if (player !== this.currentPlayer) return { ok: false, reason: 'not your turn' };
    if (this.discardsLeft <= 0) return { ok: false, reason: 'no discards left' };
    const tile = this.hands[player][handIndex];
    if (!tile) return { ok: false, reason: 'no such hand tile' };
    this.hands[player].splice(handIndex, 1);
    this.discardsLeft--;
    this.stats[player].discarded++;
    const drawn = this._draw(player);
    this._log(player, `discarded ${tile.type}${drawn ? ` and drew a tile` : ' (deck empty)'}`);
    return { ok: true, drawn };
  }

  pass(player) {
    if (this.phase !== 'play') return { ok: false, reason: 'wrong phase' };
    if (player !== this.currentPlayer) return { ok: false, reason: 'not your turn' };
    this._log(player, 'passed');
    this.consecutivePasses++;
    if (this.consecutivePasses >= 2) {
      this._resolveInfluenceVictory();
      return { ok: true, gameEnded: true };
    }
    this._endTurn();
    return { ok: true };
  }

  // Nobody can act anymore → the reality with more influence claims the
  // threshold. Capital capture is the knockout; this is the decision.
  _resolveInfluenceVictory() {
    const s = this.boardSummary();
    this.phase = 'over';
    s[1].influence += 6; // EXPERIMENT: P1 tiebreak equalizer
    if (s[1].influence !== s[2].influence) {
      this.winner = s[1].influence > s[2].influence ? 1 : 2;
      this.winReason = 'influence';
    } else if (s[1].tiles !== s[2].tiles) {
      this.winner = s[1].tiles > s[2].tiles ? 1 : 2;
      this.winReason = 'influence';
    } else {
      this.winner = null;
      this.winReason = 'draw';
    }
    this._log(this.winner || 0, this.winner
      ? `influence victory — ${s[this.winner].influence} vs ${s[this.winner === 1 ? 2 : 1].influence}`
      : 'the threshold holds — draw');
  }

  _afterAction() {
    if (this.phase === 'play' && this.placementsLeft <= 0) this._endTurn();
  }

  _endTurn() {
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    this._beginTurn();
  }

  _log(player, text) {
    this.log.push({ turn: this.turn, player, text });
    if (this.log.length > 200) this.log.shift();
  }

  // ─── Derived summaries (for HUD / win screen) ────────────────────────

  boardSummary() {
    const tally = { 1: { tiles: 0, influence: 0 }, 2: { tiles: 0, influence: 0 } };
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const t = this.board[c][r].tile;
        if (t && tally[t.owner]) {
          tally[t.owner].tiles++;
          tally[t.owner].influence += this.relativeInfluence(c, r);
        }
      }
    }
    return tally;
  }
}

// Deck construction validator — the tier caps are the pacing valve.
export function validateDeck(composition) {
  const errors = [];
  let total = 0, rares = 0, uncommons = 0;
  for (const [type, count] of Object.entries(composition)) {
    if (count === 0) continue;
    const tpl = tileTemplate(type);
    if (!tpl) { errors.push(`unknown tile: ${type}`); continue; }
    total += count;
    const cap = CONFIG.COPY_CAP[tpl.rarity];
    if (count > cap) errors.push(`${type}: max ${cap} copies (${tpl.rarity})`);
    if (tpl.rarity === 'rare') rares += count;
    if (tpl.rarity === 'uncommon') uncommons += count;
  }
  if (total !== CONFIG.DECK_SIZE) errors.push(`deck must be exactly ${CONFIG.DECK_SIZE} tiles (has ${total})`);
  if (rares > CONFIG.MAX_RARE) errors.push(`max ${CONFIG.MAX_RARE} rare tiles (has ${rares})`);
  if (uncommons > CONFIG.MAX_UNCOMMON) errors.push(`max ${CONFIG.MAX_UNCOMMON} uncommon tiles (has ${uncommons})`);
  return { valid: errors.length === 0, errors };
}
