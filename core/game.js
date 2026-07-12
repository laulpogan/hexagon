// Limen rules engine — renderer-free, headless-runnable. No DOM, no
// Math.random (seeded PRNG only), no network. Everything the board game IS.
import { CONFIG } from './config.js';
import { TILE_POOL, tileTemplate, defaultDeckComposition } from '../data/tiles.js';
import { createBoard, neighborCoords, isEdge, midRow, riftNeighborCount, ringIndex, seamDistance } from './board.js';
import { hashSeed, mulberry32, shuffleInPlace } from './rng.js';
import { captureThreshold, fireOnPlacement, modifyIncoming, RITE_EFFECTS, onTurnStart, riftStirsPulse, capitalAdjacent } from './mechanics.js';
import { refreshRoads, roadPressure } from './roads.js';

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
    this.riftStirs = null;         // R6: set by onTurnStart() once play begins
    this.seam = { ringsConsumed: 0 }; // R8/P1: Seam Advances (primitives ONLY — clone spreads it)
    // R8/P2: road network summary — initialized HERE (search clones during the
    // capital phase, before any placement ever runs refreshRoads).
    this.roads = { momentum: { 1: 0, 2: 0 }, loop: { 1: false, 2: false } };
    this.winner = null;
    this.winReason = null;         // 'capital' | 'influence' | 'draw'
    this.consecutivePasses = 0;
    this.placementsLeft = 0;
    this.discardsLeft = 0;
    // R8/P3: initialized HERE (search clones during the capital phase).
    this.placementsThisTurn = 0;       // total actions this turn (cascade cap)
    this.bountyClaimedThisRound = false; // Vanguard bounty — reset each round
    this.capitalsPlaced = { 1: false, 2: false };
    this.decks = { 1: [], 2: [] };
    this.hands = { 1: [], 2: [] };
    this.stats = {
      1: { placed: 0, captured: 0, discarded: 0, bountyDraws: 0 },
      2: { placed: 0, captured: 0, discarded: 0, bountyDraws: 0 },
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
    // R8/P3: trim CASCADE copies to the density knob — deterministic (canonical
    // pool order, pre-shuffle), keyword-only (stat bodies/counts untouched, so
    // deck composition is identical across knob values and OFF-parity holds).
    let cascades = 0;
    for (const t of deck) {
      if (t.keywords.includes('CASCADE') && ++cascades > CONFIG.CASCADE_TILE_COUNT) {
        t.keywords = t.keywords.filter(k => k !== 'CASCADE');
      }
    }
    return shuffleInPlace(deck, this.rand);
  }

  _makeTile(type, owner) {
    const tpl = tileTemplate(type);
    return {
      id: this._tileId++,
      type,
      kind: tpl.kind || 'tile',   // 'tile' | 'rite'
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

  // Base influence + FORTIFIED edge bonus + RALLY from adjacent friendlies
  // + trophy value (R4/A5 — buried ENEMY tiers only; self-stacking is free
  // height, not free influence).
  effectiveBase(col, row) {
    const cell = this.cellAt(col, row);
    const tile = cell?.tile;
    if (!tile) return 0;
    let inf = tile.influence;
    if (this.hasKeyword(tile, 'FORTIFIED') && isEdge(col, row)) {
      inf += CONFIG.FORTIFIED_BONUS;
    }
    let rally = 0;
    for (const [c, r] of neighborCoords(col, row)) {
      const nt = this.board[c][r].tile;
      if (nt && nt.owner === tile.owner && this.hasKeyword(nt, 'RALLY')) {
        rally += CONFIG.RALLY_BONUS;
      }
    }
    inf += Math.min(rally, CONFIG.RALLY_STACK_CAP); // aura stacking capped (round 2)
    inf += this.trophyValue(col, row) * CONFIG.TIER_BONUS;
    // SUMMIT (R8/R3 showcase): bonus while this cell stands tall.
    if (this.hasKeyword(tile, 'SUMMIT') && this.cellHeight(col, row) >= CONFIG.SUMMIT_HEIGHT_THRESHOLD) {
      inf += CONFIG.SUMMIT_BONUS;
    }
    // SEAMBOUND (R8/R5 showcase): bonus for garrisoning the rift hex itself.
    if (this.hasKeyword(tile, 'SEAMBOUND') && cell.rift) {
      inf += CONFIG.SEAMBOUND_BONUS;
    }
    return inf;
  }

  // R1: cell height = total stack size (any mix of owners), the terrain the
  // battle itself built. Used by R3 high-ground pressure.
  cellHeight(col, row) {
    const cell = this.cellAt(col, row);
    return cell?.tile ? cell.stack.length + 1 : 0;
  }

  // R4/A5: trophy value = ENEMY-owned tiles currently buried in the live
  // stack (crushed-out tiers, A5, have already left the array and stop
  // counting), capped at TROPHY_CAP. Self-owned buried tiles are free height,
  // not free influence.
  trophyValue(col, row) {
    const cell = this.cellAt(col, row);
    if (!cell?.tile) return 0;
    const owner = cell.tile.owner;
    let n = 0;
    for (const t of cell.stack) if (t.owner !== owner) n++;
    return Math.min(n, CONFIG.TROPHY_CAP);
  }

  // Full influence: effective base ± neighbor contributions (height-skewed,
  // R3/A4) ± rift aura ± THE RIFT STIRS pulse (R6) − road surge (R8/P2, combat
  // only — boardSummary passes withRoadPressure=false so the network never
  // deflates the influence-victory tally). A tile at ≤0 relative influence
  // (clamped to 0) is capturable by the enemy.
  relativeInfluence(col, row, withRoadPressure = true) {
    const tile = this.cellAt(col, row)?.tile;
    if (!tile) return 0;
    let total = this.effectiveBase(col, row);
    const myHeight = this.cellHeight(col, row);
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
        // R3/A4: height difference presses asymmetrically — a taller
        // neighbor presses harder, a shorter one presses weaker — composed
        // into the pressure sum BEFORE WING halves it (A4 order).
        const dH = this.cellHeight(c, r) - myHeight;
        let heightBonus = Math.max(-CONFIG.HIGH_CAP, Math.min(CONFIG.HIGH_CAP, dH));
        // SUREFOOT (R8/R3 showcase): a climber that never loses its footing —
        // the uphill penalty (attacking a taller defender) never applies to it.
        if (heightBonus < 0 && this.hasKeyword(nt, 'SUREFOOT')) heightBonus = 0;
        total -= modifyIncoming(tile, nt, contribution + siege + heightBonus); // WING halves incoming
      }
    }
    const riftN = riftNeighborCount(this.board, col, row);
    total += riftN * CONFIG.RIFT_AURA * (this.hasKeyword(tile, 'ATTUNED') ? 1 : -1);
    total += riftStirsPulse(this, tile, col, row); // R6/A7
    // R8/P2 chain-slide surge: capitals exempt as defenders (A6 — no response
    // window until P5); WING halves it (the ambient-aggression counter).
    if (withRoadPressure && !tile.capital) {
      let surge = roadPressure(this, col, row, tile.owner);
      if (surge && this.hasKeyword(tile, 'WING')) surge = Math.floor(surge / 2);
      total -= surge;
    }
    return Math.max(0, total);
  }

  isCapturable(col, row, byPlayer) {
    const tile = this.cellAt(col, row)?.tile;
    if (!tile || tile.owner === byPlayer) return false;
    // Base threshold 0; mechanics (FLANK) may loosen it via captureGate.
    return this.relativeInfluence(col, row) <= captureThreshold(this, col, row, byPlayer);
  }

  // Capital zone: your side of the seam, at least N rows from the mid line,
  // and (A8) not a corner/edge pocket with fewer than 3 neighbors — a
  // hill-king capital with almost no approach angles is a degenerate turtle.
  isLegalCapitalCell(player, col, row) {
    const cell = this.cellAt(col, row);
    if (!cell || cell.tile || cell.rift || cell.consumed) return false; // consumed: unreachable pre-play, belt+suspenders
    if (neighborCoords(col, row).length < CONFIG.CAPITAL_MIN_NEIGHBORS) return false;
    const mid = midRow();
    if (player === 1) return row <= mid - CONFIG.CAPITAL_MIN_DIST_FROM_SEAM;
    return row >= mid + CONFIG.CAPITAL_MIN_DIST_FROM_SEAM;
  }

  // Is (col,row) inside `player`'s OPPONENT's capital-zone rows?
  _inEnemyHeartland(player, row) {
    const mid = midRow();
    return player === 1
      ? row >= mid + CONFIG.CAPITAL_MIN_DIST_FROM_SEAM
      : row <= mid - CONFIG.CAPITAL_MIN_DIST_FROM_SEAM;
  }

  // R8/P1: is this cell in the doomed (next-to-fall) ring? Empty, non-aura
  // doomed cells reject placement for EVERY path incl. SCOUT — the telegraph
  // is information, not shelter. Whole inter-tick window (rev 4).
  _seamDoomed(col, row) {
    const max = CONFIG.SEAM_MAX_RINGS;
    if (!max || this.seam.ringsConsumed >= max) return false;
    if (ringIndex(col, row) !== this.seam.ringsConsumed) return false;
    const cell = this.board[col][row];
    if (cell.tile) return false;
    return !capitalAdjacent(this, col, row);
  }

  // Placement legality during normal play (capture, expansion, ascension).
  canPlace(player, tile, col, row) {
    if (this.phase !== 'play') return false;
    const cell = this.cellAt(col, row);
    if (!cell || cell.consumed) return false; // R8: consumed cells are out of play
    const adjacent = neighborCoords(col, row).some(([c, r]) => {
      const nt = this.board[c][r].tile;
      return nt && nt.owner === player;
    });
    if (cell.tile) {
      if (cell.tile.owner === player) {
        // Self-ascend: stack onto your own non-capital tile, up to TIER_MAX
        // high. A9 variant B: only legal when the tower is enemy-adjacent
        // (height earned under duress, not free in the rear).
        if (cell.tile.capital || cell.stack.length + 1 >= CONFIG.TIER_MAX) return false;
        if (CONFIG.ASCEND_VARIANT === 'B') {
          const enemyAdjacent = neighborCoords(col, row).some(([c, r]) => {
            const nt = this.board[c][r].tile;
            return nt && nt.owner !== player;
          });
          if (!enemyAdjacent) return false;
        }
        return true;
      }
      // R2: captures require adjacency to one of the attacker's own tiles —
      // to threaten you must approach. SCOUT's adjacency exemption below is
      // for empty-hex PLACEMENT only, never for captures.
      return adjacent && this.isCapturable(col, row, player);
    }
    // R8/P1: empty-cell placement below — doomed-ring cells are off limits.
    if (this._seamDoomed(col, row)) return false;
    if (adjacent) {
      if (!CONFIG.FRONTIER_ANCHOR) return true;
      // R8/P1 frontier-anchor: extend from an equal-or-rearer anchor (no
      // retreat past your line), or build beside your own capital — the
      // standing rear anchor that keeps home defense legal.
      const sd = seamDistance(row);
      return neighborCoords(col, row).some(([c, r]) => {
        const nt = this.board[c][r].tile;
        return nt && nt.owner === player && (nt.capital || seamDistance(r) >= sd);
      });
    }
    // SCOUT ignores adjacency — but not into the enemy heartland (turn-1
    // capital-rush exploit, killed 2026-07-10 balance round), and (R8/P1,
    // only while seam/frontier are live) only inside the mid-board band:
    // forward deployment, never a rear/corner garrison of doomed rings.
    if (this.hasKeyword(tile, 'SCOUT')) {
      if ((CONFIG.SEAM_MAX_RINGS > 0 || CONFIG.FRONTIER_ANCHOR) &&
          seamDistance(row) > CONFIG.CAPITAL_MIN_DIST_FROM_SEAM) return false;
      return !(CONFIG.SCOUT_HEARTLAND_BAN && this._inEnemyHeartland(player, row));
    }
    return false;
  }

  // All legal moves for the active player — drives both bot and UI hints.
  legalMoves(player) {
    const moves = [];
    if (this.phase !== 'play' || player !== this.currentPlayer) return moves;
    if (this.placementsLeft <= 0) return moves;
    this.hands[player].forEach((tile, handIndex) => {
      if (tile.kind === 'rite') return; // rites go through legalRiteTargets/castRite
      for (let c = 0; c < CONFIG.GRID_W; c++) {
        for (let r = 0; r < CONFIG.GRID_H; r++) {
          if (this.canPlace(player, tile, c, r)) {
            const t = this.board[c][r].tile;
            moves.push({
              handIndex, col: c, row: r,
              capture: !!t && t.owner !== player,
              ascend: !!t && t.owner === player,
            });
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
    refreshRoads(this); // R8/P2: capitals just landed — flags valid from ply 1
    for (const p of [1, 2]) {
      for (let i = 0; i < CONFIG.HAND_SIZE; i++) this._draw(p);
    }
    this._beginTurn();
  }

  _beginTurn() {
    this.turn++;
    onTurnStart(this); // R6/A7: THE RIFT STIRS state (active/upcoming/pulse)
    this.placementsLeft = CONFIG.PLACEMENTS_PER_TURN;
    this.discardsLeft = CONFIG.DISCARDS_PER_TURN;
    this.placementsThisTurn = 0; // R8/P3: per-turn action counter (cascade cap)
    // R8/P3: round boundary — turn is odd after ++ ⇒ a new round (P1+P2 pair)
    // starts. Reset ONLY here, never per ply (P2's turn must not wipe it).
    if (this.turn % 2 === 1) this.bountyClaimedThisRound = false;
    this._draw(this.currentPlayer);
    // All cards spent on both sides → resolve immediately, no pass theater.
    if (this.decks[1].length + this.decks[2].length +
        this.hands[1].length + this.hands[2].length === 0) {
      this.endTrigger = 'exhaustion'; // R8/P2: distinguishes the R4 metric's slice
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
    if (tile.kind === 'rite') return { ok: false, reason: 'rites are cast, not placed' };
    if (!this.canPlace(player, tile, col, row)) return { ok: false, reason: 'illegal placement' };

    const cell = this.board[col][row];
    const target = cell.tile;
    this.hands[player].splice(handIndex, 1);
    this.placementsLeft--;
    this.placementsThisTurn++; // R8/P3: one site, pre-branch — covers all 4 exits
    this.consecutivePasses = 0; // any card-spending action is a real action (incl. ward-blocked attacks)

    // Self-ascend: stacking onto your own tile. R4 — self-stacked tiers grant
    // no influence (trophy-only scoring, see trophyValue()); height alone
    // buys R3 pressure. A9 variant C taxes the action with a forced discard
    // (a real card cost, not just tempo).
    if (target && target.owner === player) {
      cell.stack.push(target);
      cell.tile = tile;
      this.stats[player].placed++;
      let paidNote = '';
      if (CONFIG.ASCEND_VARIANT === 'C' && this.hands[player].length && this.discardsLeft > 0) {
        const idx = this._weakestHandIndex(player);
        const discarded = this.hands[player].splice(idx, 1)[0];
        this.discardsLeft--;
        this.stats[player].discarded++;
        paidNote = ` (paid ${discarded.type})`;
      }
      this._log(player, `ascended at (${col},${row}) — ${tile.type} crowns a tier-${cell.stack.length + 1} stack${paidNote}`);
      fireOnPlacement(this, tile, col, row, null, 'ascend'); // R8/P3: CASCADE never fires here
      this._boardMutated(player); // R8/P2 (topology unchanged but uniform rule is the audit)
      const result = { ok: true, ascended: true, height: cell.stack.length + 1 };
      this._afterAction();
      return result;
    }

    // WARD (A3): the ONE surviving bounce in the game. The defender absorbs
    // the capture attempt entirely; the attacker's tile returns to hand —
    // once per tile.
    if (target && this.hasKeyword(target, 'WARD') && !target.wardConsumed) {
      target.wardConsumed = true;
      this.hands[player].push(tile);
      this._log(player, `attacked ${target.type} at (${col},${row}) — its Ward absorbed the attack (${tile.type} returns to hand)`);
      const result = { ok: true, wardBlocked: true, target };
      this._afterAction();
      return result;
    }

    // Capital capture = instant win. No bury — the game ends here.
    if (target && target.capital) {
      cell.tile = tile;
      this.stats[player].placed++;
      this.stats[player].captured++;
      this.winner = player;
      this.winReason = 'capital';
      this.phase = 'over';
      // R8/P2: this branch returns early (no _afterAction) — refresh here so
      // post-game readers (win screen, metrics) see correct road state.
      this._boardMutated(player);
      this._log(player, `captured the enemy capital — VICTORY`);
      return { ok: true, captured: target, won: true };
    }

    // R1: capture caps the stack. The old top is buried beneath the new
    // face — never removed, never resurfaced (A1: liberation stays dead,
    // buried tiles are permanent war strata). A5: total height is capped;
    // overflow crushes the bottom tier out to rubble (render-only).
    const captured = target || null;
    if (captured) {
      cell.stack.push(target);
      if (cell.stack.length > CONFIG.HEIGHT_CRUSH_CAP - 1) {
        cell.stack.shift();
        cell.rubble = (cell.rubble || 0) + 1; // crush-out (A5)
      }
      cell.rubble = (cell.rubble || 0) + 1; // every capture scars the ground (R7, render-only)
    }
    cell.tile = tile;
    this.stats[player].placed++;
    if (captured) {
      this.stats[player].captured++;
      this._claimBounty(player); // R8/P3: Vanguard bounty (holder's own first capture)
      this._log(player, `captured enemy ${captured.type} at (${col},${row}) — it is buried beneath the ${tile.type}, tier-${cell.stack.length + 1}`);
    } else {
      this._log(player, `placed ${tile.type} at (${col},${row})`);
    }
    fireOnPlacement(this, tile, col, row, captured, 'place'); // ETB-class hooks (SUSTAIN/TRAMPLE/CASCADE)
    this._boardMutated(player); // R8/P2: placement/capture is a topology change
    const result = { ok: true, captured, won: false };
    this._afterAction();
    return result;
  }

  // R8/P2: the ONE tail every topology mutation funnels through — any branch
  // that assigns cell.tile calls this before returning (placeFromHand ascend /
  // capital-capture / capture-plain, SUNDER). Influence-only mutators (SUSTAIN,
  // TRAMPLE, RALLYING_CRY, TIDEBOUND) need no refresh: linked/roadPower depend
  // on topology, never on influence values.
  _boardMutated(player) {
    const { prevLoop } = refreshRoads(this);
    if (player) {
      this.roadSurgeThisTurn = {
        player,
        momentum: this.roads.momentum[player],
        closedLoop: !prevLoop[player] && this.roads.loop[player],
      };
    }
  }

  // ─── R8/P3: Vanguard bounty ──────────────────────────────────────────
  // Holder alternates by round (round = ceil(turn/2), turn is a PLY counter).
  // Trigger = the HOLDER's OWN first capture of the round — independent of
  // anything the opponent does (a "round's first capture" race is won by
  // whoever moves first; killed at gate #1). Capture = ownership transfer via
  // placeFromHand only; SUNDER destroys (no transfer) and earns nothing.
  vanguardHolder() {
    if (!CONFIG.VANGUARD_ON) return 0;
    const round = Math.ceil(this.turn / 2);
    const start = CONFIG.VANGUARD_START_HOLDER;
    return round % 2 === 1 ? start : (start === 1 ? 2 : 1);
  }

  _claimBounty(player) {
    if (!CONFIG.VANGUARD_ON) return;
    if (this.bountyClaimedThisRound || this.vanguardHolder() !== player) return;
    this.bountyClaimedThisRound = true;
    const drawn = this._draw(player); // no play-time hand cap exists; deck-limited
    if (drawn) this.stats[player].bountyDraws++; // durable telemetry (claim share)
    this.vanguardBountyThisPly = player; // per-ply UI cue (reset onTurnStart)
    this._log(player, `Vanguard bounty — first strike this round${drawn ? ' draws a card' : ' (deck empty)'}`);
  }

  _weakestHandIndex(player) {
    const hand = this.hands[player];
    let idx = 0;
    for (let i = 1; i < hand.length; i++) {
      if ((hand[i].influence || 0) < (hand[idx].influence || 0)) idx = i;
    }
    return idx;
  }

  // Rites: spell-class cards cast from hand — consumes the turn's placement.
  legalRiteTargets(player, handIndex) {
    const card = this.hands[player][handIndex];
    if (!card || card.kind !== 'rite') return [];
    const effect = RITE_EFFECTS[card.type];
    if (!effect) return [];
    if (!effect.needsTarget) return [{ col: null, row: null }];
    const targets = [];
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        if (effect.isLegalTarget(this, player, c, r)) targets.push({ col: c, row: r });
      }
    }
    return targets;
  }

  castRite(player, handIndex, col = null, row = null) {
    if (this.phase !== 'play') return { ok: false, reason: 'wrong phase' };
    if (player !== this.currentPlayer) return { ok: false, reason: 'not your turn' };
    if (this.placementsLeft <= 0) return { ok: false, reason: 'no placements left' };
    const card = this.hands[player][handIndex];
    if (!card || card.kind !== 'rite') return { ok: false, reason: 'not a rite' };
    const effect = RITE_EFFECTS[card.type];
    if (!effect) return { ok: false, reason: 'unknown rite' };
    if (effect.needsTarget && !effect.isLegalTarget(this, player, col, row)) {
      return { ok: false, reason: 'illegal target' };
    }
    this.hands[player].splice(handIndex, 1);
    this.placementsLeft--;
    this.placementsThisTurn++; // R8/P3: rites count toward the action cap
    this.consecutivePasses = 0;
    const detail = effect.resolve(this, player, col, row) || {};
    const result = { ok: true, rite: card.type, ...detail };
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
    // Passing while holding playable tiles enabled a hoard-and-mop-up lock
    // (stall your own deck, then place uncontested once the opponent runs
    // dry). Pass is only for the genuinely stuck (2026-07-10 balance round).
    if (this.legalMoves(player).length > 0) {
      return { ok: false, reason: 'you have playable tiles' };
    }
    this._log(player, 'passed');
    this.consecutivePasses++;
    if (this.consecutivePasses >= 2) {
      this.endTrigger = 'double-pass'; // R8/P2: R4 bank-the-lead metric key
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
    // Home-continuity bonus: P2 structurally owns the final placement before
    // resolution (last-mover edge, 59/41 in bot mirrors). Flat P1 bonus in
    // the resolution snapshot only — never visible mid-game.
    s[1].influence += CONFIG.INFLUENCE_TIEBREAK_BONUS_P1;
    this.phase = 'over';
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
    if (this.phase !== 'play') return;
    if (this.placementsLeft <= 0) { this._endTurn(); return; }
    // R8/P3: cascade-granted placements that can't be spent expire — a turn
    // that acted is not a pass (spurious double-pass guard). Unreachable at
    // base config (placementsLeft>0 ⇒ placementsThisTurn===0), so OFF-parity
    // holds structurally.
    if (this.placementsThisTurn >= 1 && !this._anyLegalAction(this.currentPlayer)) {
      this._endTurn();
    }
  }

  // R8/P3: "no legal action" = no placement, no castable rite (legalMoves
  // skips rite cards), and no usable discard (needs discardsLeft AND a hand
  // tile — a hand emptied mid-cascade must not fall through to pass()).
  _anyLegalAction(player) {
    if (this.legalMoves(player).length > 0) return true;
    if (this.discardsLeft > 0 && this.hands[player].length > 0) return true;
    for (let i = 0; i < this.hands[player].length; i++) {
      if (this.hands[player][i].kind === 'rite' &&
          this.legalRiteTargets(player, i).length > 0) return true;
    }
    return false;
  }

  _endTurn() {
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    this._beginTurn();
  }

  _log(player, text) {
    this.log.push({ turn: this.turn, player, text });
    if (this.log.length > 200) this.log.shift();
  }

  // Deep-copy for search agents (MCTS etc.). The clone carries NO RNG — all
  // in-play rules are deterministic; rand is only used during construction.
  clone() {
    const g = Object.create(Game.prototype);
    g.seed = this.seed;
    g.rand = null;
    g.board = this.board.map(col => col.map(cell => ({
      col: cell.col, row: cell.row, rift: cell.rift,
      tile: cell.tile ? { ...cell.tile, keywords: [...cell.tile.keywords] } : null,
      stack: cell.stack.map(t => ({ ...t, keywords: [...t.keywords] })),
      rubble: cell.rubble,
      consumed: cell.consumed, // R8/P1
      // R8/P2: COPY the road flags, never recompute — clone is the search hot
      // path and the flags are correct by invariant (refreshed on mutation).
      linked: cell.linked, roadPower: cell.roadPower,
      loopside: cell.loopside, loopNear: cell.loopNear,
    })));
    g.phase = this.phase;
    g.currentPlayer = this.currentPlayer;
    g.turn = this.turn;
    g.riftStirs = this.riftStirs ? { ...this.riftStirs } : null;
    g.seam = { ...this.seam }; // R8/P1: safe — primitives only by contract
    // R8/P2: two-level copy — a one-level spread would alias the nested objects.
    g.roads = { momentum: { ...this.roads.momentum }, loop: { ...this.roads.loop } };
    g.winner = this.winner;
    g.winReason = this.winReason;
    g.consecutivePasses = this.consecutivePasses;
    g.placementsLeft = this.placementsLeft;
    g.discardsLeft = this.discardsLeft;
    g.placementsThisTurn = this.placementsThisTurn;         // R8/P3 scalar copy
    g.bountyClaimedThisRound = this.bountyClaimedThisRound; // R8/P3 scalar copy
    g.capitalsPlaced = { ...this.capitalsPlaced };
    g.decks = {
      1: this.decks[1].map(t => ({ ...t, keywords: [...t.keywords] })),
      2: this.decks[2].map(t => ({ ...t, keywords: [...t.keywords] })),
    };
    g.hands = {
      1: this.hands[1].map(t => ({ ...t, keywords: [...t.keywords] })),
      2: this.hands[2].map(t => ({ ...t, keywords: [...t.keywords] })),
    };
    g.stats = { 1: { ...this.stats[1] }, 2: { ...this.stats[2] } };
    g.log = []; // search clones don't need history
    g._tileId = this._tileId;
    return g;
  }

  // ─── Derived summaries (for HUD / win screen) ────────────────────────

  // R5/A6: Riftlight is folded in HERE ONLY — never inside relativeInfluence
  // — so rift cells never get an accidental defense buff mid-game. Every
  // rift-or-rift-adjacent cell a player holds counts toward it, flat per
  // cell, capped per player.
  boardSummary() {
    const tally = { 1: { tiles: 0, influence: 0, riftlight: 0 }, 2: { tiles: 0, influence: 0, riftlight: 0 } };
    const riftCells = { 1: 0, 2: 0 };
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const cell = this.board[c][r];
        const t = cell.tile;
        if (t && tally[t.owner]) {
          tally[t.owner].tiles++;
          // R8/P2 (A7): pressure-free — the surge is combat, not scoring; a
          // big network must not passively deflate the victory tally.
          tally[t.owner].influence += this.relativeInfluence(c, r, false);
          if (cell.rift || riftNeighborCount(this.board, c, r) > 0) riftCells[t.owner]++;
        }
      }
    }
    for (const p of [1, 2]) {
      tally[p].riftlight = Math.min(riftCells[p] * CONFIG.RIFTLIGHT_PER_CELL, CONFIG.RIFTLIGHT_CAP);
      tally[p].influence += tally[p].riftlight;
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
