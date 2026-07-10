// Limen — entry point. Wires core (rules) + render (Three.js) + ui (HUD) + net.
import { Game } from './core/game.js';
import { botTakeTurn } from './core/bot.js';
import { mulberry32, hashSeed } from './core/rng.js';
import { BoardRenderer } from './render/scene.js';
import { Hud } from './ui/hud.js';
import { sound } from './ui/sound.js';
import { initDeckbuilder, loadSavedDeck } from './ui/deckbuilder.js';
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
    if (tile) {
      for (let c = 0; c < g.board.length; c++) {
        for (let r = 0; r < g.board[0].length; r++) {
          if (g.canPlace(g.currentPlayer, tile, c, r)) {
            out.push({ col: c, row: r, kind: g.board[c][r].tile ? 'capture' : 'place' });
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
  const res = g.placeFromHand(g.currentPlayer, handIndex, col, row);
  if (!res.ok) {
    sound.error();
    hud.hint(`Can't place there: ${res.reason}.`);
    return;
  }
  if (mode === 'mp') net.sendAction({ kind: 'place', handIndex, col, row });
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

function handleHover(hit) {
  const g = game;
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

  if (mode === 'mp') {
    net.onAction = applyRemoteAction;
    const badge = document.createElement('div');
    badge.id = 'mpBadge';
    badge.innerHTML = `Room <b>${net.roomCode}</b> · you are ${myPlayer === 1 ? '🌿 Verdant' : '🌌 Umbral'}`;
    document.body.appendChild(badge);
  }

  renderer.onCellClick = handleClick;
  renderer.onCellHover = handleHover;
  hud.onSelectTile = (i) => { hud.selectedIndex = i; hud.hint(''); update(); };
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
