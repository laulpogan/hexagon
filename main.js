// Limen — entry point. Wires core (rules) + render (Three.js) + ui (HUD).
import { Game } from './core/game.js';
import { botTakeTurn } from './core/bot.js';
import { mulberry32, hashSeed } from './core/rng.js';
import { BoardRenderer } from './render/scene.js';
import { Hud } from './ui/hud.js';
import { sound } from './ui/sound.js';
import { initDeckbuilder, loadSavedDeck } from './ui/deckbuilder.js';

let game, renderer, hud, botMode = false, botRand = null;

// Bot plays Umbral (P2) after a short beat, so moves read as deliberate.
function scheduleBot() {
  if (!botMode || game.phase === 'over') return;
  if (game.phase === 'play' && game.currentPlayer !== 2) return;
  if (game.phase === 'capital' && game.currentPlayer !== 2) return;
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
  if (botMode && g.currentPlayer === 2) return; // bot's turn — input locked
  if (g.phase === 'capital') {
    const res = g.placeCapital(g.currentPlayer, col, row);
    if (res.ok) { sound.place(); if (res.allCapitalsPlaced) sound.turnSwitch(); }
    else sound.error();
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
  const res = g.placeFromHand(g.currentPlayer, hud.selectedIndex, col, row);
  if (!res.ok) {
    sound.error();
    hud.hint(`Can't place there: ${res.reason}.`);
    return;
  }
  hud.selectedIndex = null;
  hud.hint('');
  if (res.wardBlocked) sound.ward();
  else if (res.won) { /* handled below */ }
  else if (res.captured) sound.capture();
  else sound.place();

  if (checkGameOver()) return;
  if (g.currentPlayer !== before) {
    sound.turnSwitch();
    if (!botMode) hud.showHandover(g.currentPlayer);
  }
  update();
  scheduleBot();
}

// Any action can end the game (capital capture, influence resolution, draw).
function checkGameOver() {
  if (game.phase !== 'over') return false;
  update();
  sound.victory();
  hud.showWin(game.winner, game.stats, game.turn, game.winReason);
  return true;
}

function handleHover(hit) {
  const g = game;
  if (hit && g.phase === 'play' && hud.selectedIndex !== null) {
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

function startGame(vsBot = false) {
  botMode = vsBot;
  document.getElementById('menu').classList.add('hidden');
  const seed = `local-${Math.random().toString(36).slice(2, 10)}`;
  // Custom deck: humans use the saved build; the bot plays the starter deck.
  const saved = loadSavedDeck();
  const decks = saved ? { 1: saved, 2: vsBot ? null : saved } : null;
  game = new Game({ seed, decks });
  botRand = mulberry32(hashSeed(seed + '-bot'));

  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  renderer = new BoardRenderer(boardEl, game);
  hud = new Hud(document.getElementById('hud'), game);
  hud.botMode = vsBot;
  if (vsBot) hud.viewPlayer = 1;
  hud.bindSound(sound);

  renderer.onCellClick = handleClick;
  renderer.onCellHover = handleHover;
  hud.onSelectTile = (i) => { hud.selectedIndex = i; hud.hint(''); update(); };
  hud.onDiscard = (i) => {
    const res = game.discardRedraw(game.currentPlayer, i);
    if (!res.ok) { sound.error(); hud.hint(`Can't discard: ${res.reason}.`); return; }
    hud.selectedIndex = null;
    update();
  };
  hud.onPass = () => {
    if (botMode && game.currentPlayer === 2) return;
    const res = game.pass(game.currentPlayer);
    if (!res.ok) return;
    hud.selectedIndex = null;
    if (checkGameOver()) return;
    sound.turnSwitch();
    if (!botMode) hud.showHandover(game.currentPlayer);
    update();
    scheduleBot();
  };
  hud.onRestart = () => location.reload();

  update();
  window.__limen = { game, renderer, hud, update, handleClick, scheduleBot }; // debug/test handle
}

document.getElementById('hotseatBtn').onclick = () => startGame(false);
document.getElementById('botBtn').onclick = () => startGame(true);

const deckbuilder = initDeckbuilder(document.getElementById('deckOverlay'));
document.getElementById('deckBtn').onclick = () => deckbuilder.open();
document.getElementById('helpBtn').onclick = () => document.getElementById('helpOverlay').classList.remove('hidden');
document.getElementById('helpCloseBtn').onclick = () => document.getElementById('helpOverlay').classList.add('hidden');
