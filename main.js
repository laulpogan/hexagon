// Limen — entry point. Wires core (rules) + render (Three.js) + ui (HUD) + net.
import { Game } from './core/game.js';
import { botTakeTurn } from './core/bot.js';
import { mulberry32, hashSeed } from './core/rng.js';
import { BoardRenderer } from './render/scene.js';
import { Hud } from './ui/hud.js';
import { sound } from './ui/sound.js';
import { music } from './ui/music.js';
import { initDeckbuilder, loadSavedDeck } from './ui/deckbuilder.js';
import { KEYWORDS, RITE_INFO } from './data/tiles.js';
import { riftNeighborCount } from './core/board.js';
import { NetSession, generateRoomCode } from './net/supabase.js';

let game, renderer, hud;
let mode = 'hotseat';          // 'hotseat' | 'bot' | 'mp'
let botRand = null;
let net = null;                // NetSession in mp mode
let myPlayer = null;           // 1|2 in mp mode; null otherwise

// The local human may act when...
function inputLocked() {
  if (mode === 'bot' && game.currentPlayer === 2) return true;
  if (mode === 'mp' && game.currentPlayer !== myPlayer) return true;
  return false;
}

// Bot plays Umbral (P2) after a short beat, so moves read as deliberate.
function scheduleBot() {
  if (mode !== 'bot' || game.phase === 'over') return;
  if (game.currentPlayer !== 2) return;
  setTimeout(() => {
    const action = botTakeTurn(game, 2, botRand);
    if (action.kind === 'place') {
      if (action.result?.captured) sound.capture();
      else if (action.result?.wardBlocked) sound.ward();
      else sound.place();
    } else if (action.kind === 'capital') {
      sound.place();
    }
    update();
    if (checkGameOver()) return;
    if (game.currentPlayer === 1) sound.turnSwitch();
    scheduleBot(); // capital phase can hand straight back to the bot's turn logic
  }, 750);
}

// Projected influence if `tile` were placed at (col,row) — for the ghost preview.
function projectedInfluence(g, tile, col, row) {
  const cell = g.board[col][row];
  const prev = cell.tile;
  cell.tile = { ...tile, owner: g.currentPlayer };
  const rel = g.relativeInfluence(col, row);
  cell.tile = prev;
  return rel;
}

function currentHighlights() {
  const g = game;
  const out = [];
  if (inputLocked()) return out;
  if (g.phase === 'capital') {
    for (let c = 0; c < g.board.length; c++) {
      for (let r = 0; r < g.board[0].length; r++) {
        if (g.isLegalCapitalCell(g.currentPlayer, c, r)) out.push({ col: c, row: r, kind: 'place' });
      }
    }
  } else if (g.phase === 'play' && hud.selectedIndex !== null) {
    const tile = g.hands[g.currentPlayer][hud.selectedIndex];
    if (tile && tile.kind === 'rite') {
      for (const t of g.legalRiteTargets(g.currentPlayer, hud.selectedIndex)) {
        if (t.col !== null) out.push({ col: t.col, row: t.row, kind: 'capture' });
      }
    } else if (tile) {
      for (let c = 0; c < g.board.length; c++) {
        for (let r = 0; r < g.board[0].length; r++) {
          if (g.canPlace(g.currentPlayer, tile, c, r)) {
            const t = g.board[c][r].tile;
            out.push({ col: c, row: r, kind: t && t.owner !== g.currentPlayer ? 'capture' : 'place' });
          }
        }
      }
    }
  }
  return out;
}

function update() {
  renderer.syncBoard();
  renderer.clearGhost();
  renderer.setHighlights(currentHighlights());
  hud.render();
}

function handleClick({ col, row }) {
  const g = game;
  if (inputLocked()) return;
  if (g.phase === 'capital') {
    const res = g.placeCapital(g.currentPlayer, col, row);
    if (res.ok) {
      sound.place();
      if (res.allCapitalsPlaced) sound.turnSwitch();
      if (mode === 'mp') net.sendAction({ kind: 'capital', col, row });
    } else {
      sound.error();
    }
    update();
    scheduleBot();
    return;
  }
  if (g.phase !== 'play') return;
  if (hud.selectedIndex === null) {
    hud.hint('Select a tile from your hand first.');
    return;
  }
  const before = g.currentPlayer;
  const handIndex = hud.selectedIndex;
  const selected = g.hands[g.currentPlayer][handIndex];
  const isRite = selected?.kind === 'rite';
  const res = isRite
    ? g.castRite(g.currentPlayer, handIndex, col, row)
    : g.placeFromHand(g.currentPlayer, handIndex, col, row);
  if (!res.ok) {
    sound.error();
    hud.hint(isRite ? `Can't cast there: ${res.reason}.` : `Can't place there: ${res.reason}.`);
    return;
  }
  if (mode === 'mp') net.sendAction(isRite ? { kind: 'rite', handIndex, col, row } : { kind: 'place', handIndex, col, row });
  if (isRite) sound.rift();
  hud.selectedIndex = null;
  hud.hint('');
  if (res.wardBlocked) sound.ward();
  else if (res.won) { /* handled below */ }
  else if (res.captured) sound.capture();
  else sound.place();

  if (checkGameOver()) return;
  if (g.currentPlayer !== before) {
    sound.turnSwitch();
    if (mode === 'hotseat') hud.showHandover(g.currentPlayer);
  }
  update();
  scheduleBot();
}

// Remote peer's action arrives via the room's action log — replay it.
function applyRemoteAction(action) {
  const p = action.p;
  let res;
  if (action.kind === 'capital') res = game.placeCapital(p, action.col, action.row);
  else if (action.kind === 'place') res = game.placeFromHand(p, action.handIndex, action.col, action.row);
  else if (action.kind === 'rite') res = game.castRite(p, action.handIndex, action.col, action.row);
  else if (action.kind === 'discard') res = game.discardRedraw(p, action.handIndex);
  else if (action.kind === 'pass') res = game.pass(p);
  if (!res?.ok) {
    console.error('Desync replaying remote action', action, res);
    hud.hint('Sync error — refresh to leave the room.');
    return;
  }
  if (res.wardBlocked) sound.ward();
  else if (res.captured) sound.capture();
  else if (action.kind === 'capital' || action.kind === 'place') sound.place();
  update();
  if (checkGameOver()) return;
  if (game.phase === 'play' && game.currentPlayer === myPlayer) sound.turnSwitch();
}

// Any action can end the game (capital capture, influence resolution, draw).
function checkGameOver() {
  if (game.phase !== 'over') return false;
  update();
  sound.victory();
  hud.showWin(game.winner, game.stats, game.turn, game.winReason);
  if (mode === 'mp' && net) net.finish().catch(() => {});
  return true;
}

// ─── Board reminder tooltip ─────────────────────────────────────────────
const boardTip = document.getElementById('boardTip');
document.addEventListener('mousemove', (e) => {
  if (boardTip.style.display !== 'none') {
    const pad = 18;
    const x = Math.min(e.clientX + pad, window.innerWidth - 290);
    const y = Math.min(e.clientY + pad, window.innerHeight - 160);
    boardTip.style.left = x + 'px';
    boardTip.style.top = y + 'px';
  }
});

function ownerLabel(p) {
  return p === 1 ? '<span class="bt-owner1">Verdant</span>' : '<span class="bt-owner2">Umbral</span>';
}

function updateBoardTip(hit) {
  const g = game;
  if (!hit || g.phase === 'over') { boardTip.style.display = 'none'; return; }
  const cell = g.board[hit.col][hit.row];
  const tile = cell.tile;
  if (!tile) {
    if (cell.rift) {
      boardTip.innerHTML = `
        <div class="bt-title bt-rift">◆ Rift Hex</div>
        <div>Drains <b>1 influence</b> from every adjacent tile — both players.
        <i>Rift-attuned</i> tiles feed on it instead. You may build here, at your peril.</div>`;
      boardTip.style.display = 'block';
    } else {
      boardTip.style.display = 'none';
    }
    return;
  }
  const rel = g.relativeInfluence(hit.col, hit.row);
  const enemy = g.currentPlayer === tile.owner ? (tile.owner === 1 ? 2 : 1) : g.currentPlayer;
  const capturable = g.isCapturable(hit.col, hit.row, enemy);
  const tiers = cell.stack.length;
  const riftN = riftNeighborCount(g.board, hit.col, hit.row);
  const kwHtml = tile.keywords.length
    ? `<div class="bt-kw">${tile.keywords.map(k =>
        `<div><b>${KEYWORDS[k]?.name || k}</b> — ${KEYWORDS[k]?.desc || ''}</div>`).join('')}</div>`
    : '';
  const stackHtml = tiers
    ? `<div class="bt-stack">Tier-${tiers + 1} tower · buried: ${cell.stack.slice().reverse().map(t =>
        `${t.type}${t.owner !== tile.owner ? ' (subjugated)' : ''}`).join(', ')}<br>
        <i>Buried keywords are dormant. Capturing peels one tier; buried tiles return to their owner.</i></div>`
    : '';
  boardTip.innerHTML = `
    <div class="bt-title">${tile.capital ? '♛ CAPITAL' : tile.type.replace(/_/g, ' ')}</div>
    <div>${ownerLabel(tile.owner)} · influence <span class="bt-inf">${rel}</span>
      (base ${tile.influence}${tiers ? ` +${tiers} tier` : ''}${riftN ? `, rift ${tile.keywords.includes('ATTUNED') ? '+' : '−'}${riftN}` : ''}, ± neighbors)</div>
    ${capturable ? '<div class="bt-cap">⚠ In revolt — can be taken by placement!</div>' : ''}
    ${kwHtml}
    ${stackHtml}
    ${tile.capital ? '<div class="bt-stack"><i>Lose this and the game ends. Cannot be stacked on or targeted by rites.</i></div>' : ''}`;
  boardTip.style.display = 'block';
}

// Hand-card reminder tooltip (same panel, card-flavored content)
function showCardTip(tile) {
  if (!tile) { boardTip.style.display = 'none'; return; }
  const isRite = tile.kind === 'rite';
  const kwHtml = isRite
    ? `<div class="bt-kw"><b>✦ Rite</b> — ${RITE_INFO[tile.type]?.desc || 'Cast as your turn\'s action.'}<br>
       <i>Casting consumes your placement for the turn.</i></div>`
    : tile.keywords.length
      ? `<div class="bt-kw">${tile.keywords.map(k =>
          `<div><b>${KEYWORDS[k]?.name || k}</b> — ${KEYWORDS[k]?.desc || ''}</div>`).join('')}</div>`
      : '<div class="bt-kw"><i>No keywords — pure influence.</i></div>';
  boardTip.innerHTML = `
    <div class="bt-title">${tile.type.replace(/_/g, ' ')}</div>
    <div>${isRite ? 'rite' : `influence <span class="bt-inf">${tile.influence}</span>`} · ${tile.rarity}</div>
    ${kwHtml}
    ${!isRite ? '<div class="bt-stack"><i>Place next to your tiles — or on one of your own to Ascend.</i></div>' : ''}`;
  boardTip.style.display = 'block';
}

function handleHover(hit) {
  const g = game;
  updateBoardTip(hit);
  if (hit && !inputLocked() && g.phase === 'play' && hud.selectedIndex !== null) {
    const tile = g.hands[g.currentPlayer][hud.selectedIndex];
    const cell = tile && g.board[hit.col][hit.row];
    if (cell && !cell.tile && g.canPlace(g.currentPlayer, tile, hit.col, hit.row)) {
      // showGhost dedupes same-cell hovers internally — no rebuild churn
      renderer.showGhost(hit.col, hit.row, projectedInfluence(g, tile, hit.col, hit.row));
      return;
    }
  }
  renderer.clearGhost();
}

function startGame(opts) {
  mode = opts.mode;
  net = opts.net || null;
  myPlayer = opts.myPlayer || null;
  document.getElementById('menu').classList.add('hidden');

  const seed = opts.seed || `local-${Math.random().toString(36).slice(2, 10)}`;
  game = new Game({ seed, decks: opts.decks || null });
  botRand = mulberry32(hashSeed(seed + '-bot'));

  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  renderer = new BoardRenderer(boardEl, game);
  hud = new Hud(document.getElementById('hud'), game);
  hud.botMode = mode === 'bot';
  if (mode === 'bot') hud.viewPlayer = 1;
  if (mode === 'mp') hud.viewPlayer = myPlayer;
  hud.bindSound(sound);
  hud.bindMusic(music);
  // your reality's theme: Umbral when you're P2 online, Verdant otherwise
  music.play(mode === 'mp' && myPlayer === 2 ? 'umbral' : 'verdant');

  if (mode === 'mp') {
    net.onAction = applyRemoteAction;
    const badge = document.createElement('div');
    badge.id = 'mpBadge';
    badge.innerHTML = `Room <b>${net.roomCode}</b> · you are ${myPlayer === 1 ? '🌿 Verdant' : '🌌 Umbral'}`;
    document.body.appendChild(badge);
  }

  renderer.onCellClick = handleClick;
  renderer.onCellHover = handleHover;
  hud.onCardHover = showCardTip;
  hud.onSelectTile = (i) => {
    hud.selectedIndex = i;
    const card = i !== null && game.hands[game.currentPlayer][i];
    if (card && card.kind === 'rite') {
      const targets = game.legalRiteTargets(game.currentPlayer, i);
      hud.hint(targets.length && targets[0].col !== null
        ? `✦ ${card.type.replace(/_/g, ' ')} — click a highlighted hex to cast`
        : targets.length
          ? `✦ ${card.type.replace(/_/g, ' ')} — click anywhere on the board to cast`
          : `✦ No legal targets for ${card.type.replace(/_/g, ' ')} right now`);
    } else if (card) {
      hud.hint('Green: place · red: capture · your own tiles: ascend (stack)');
    } else {
      hud.hint('');
    }
    update();
  };
  hud.onDiscard = (i) => {
    if (inputLocked()) return;
    const res = game.discardRedraw(game.currentPlayer, i);
    if (!res.ok) { sound.error(); hud.hint(`Can't discard: ${res.reason}.`); return; }
    if (mode === 'mp') net.sendAction({ kind: 'discard', handIndex: i });
    hud.selectedIndex = null;
    update();
  };
  hud.onPass = () => {
    if (inputLocked()) return;
    const res = game.pass(game.currentPlayer);
    if (!res.ok) return;
    if (mode === 'mp') net.sendAction({ kind: 'pass' });
    hud.selectedIndex = null;
    if (checkGameOver()) return;
    sound.turnSwitch();
    if (mode === 'hotseat') hud.showHandover(game.currentPlayer);
    update();
    scheduleBot();
  };
  hud.onRestart = () => location.reload();

  update();
  window.__limen = { game, renderer, hud, update, handleClick, scheduleBot, net, myPlayer }; // debug/test handle
}

// ─── Menu wiring ────────────────────────────────────────────────────────

// Menu theme starts on the first user gesture anywhere in the menu
document.getElementById('menu').addEventListener('pointerdown', () => {
  if (!game) music.play('menu');
}, { once: false });

document.getElementById('hotseatBtn').onclick = () => startGame({ mode: 'hotseat' });
document.getElementById('botBtn').onclick = () => {
  const saved = loadSavedDeck();
  startGame({ mode: 'bot', decks: saved ? { 1: saved, 2: null } : null });
};

const deckbuilder = initDeckbuilder(document.getElementById('deckOverlay'));
document.getElementById('deckBtn').onclick = () => deckbuilder.open();
document.getElementById('helpBtn').onclick = () => document.getElementById('helpOverlay').classList.remove('hidden');
document.getElementById('helpCloseBtn').onclick = () => document.getElementById('helpOverlay').classList.add('hidden');

// Multiplayer modal
const mpOverlay = document.getElementById('mpOverlay');
const mpStatus = document.getElementById('mpStatus');
document.getElementById('mpBtn').onclick = () => { mpOverlay.classList.remove('hidden'); mpStatus.textContent = ''; };
document.getElementById('mpCancelBtn').onclick = () => mpOverlay.classList.add('hidden');

document.getElementById('mpHostBtn').onclick = async () => {
  const code = (document.getElementById('mpHostCode').value.trim().toUpperCase()) || generateRoomCode();
  mpStatus.textContent = `Creating room ${code}…`;
  try {
    const session = await NetSession.host(code, loadSavedDeck());
    mpStatus.innerHTML = `Room <b style="font-size:22px; letter-spacing:4px; color:#f2c14e;">${code}</b><br>Share the code. Waiting for your opponent…`;
    session.onGuestJoined = (guestDeck) => {
      mpOverlay.classList.add('hidden');
      startGame({
        mode: 'mp', net: session, myPlayer: 1, seed: session.seed,
        decks: { 1: session.hostDeck, 2: guestDeck }, // row values only — never local state
      });
    };
  } catch (err) {
    mpStatus.textContent = err.message;
  }
};

document.getElementById('mpJoinBtn').onclick = async () => {
  const code = document.getElementById('mpJoinCode').value.trim().toUpperCase();
  if (!code) { mpStatus.textContent = 'Enter a room code.'; return; }
  mpStatus.textContent = `Joining ${code}…`;
  try {
    const { session, seed } = await NetSession.join(code, loadSavedDeck());
    mpOverlay.classList.add('hidden');
    startGame({
      mode: 'mp', net: session, myPlayer: 2, seed,
      decks: { 1: session.hostDeck, 2: session.guestDeck }, // row values only
    });
  } catch (err) {
    mpStatus.textContent = err.message;
  }
};
