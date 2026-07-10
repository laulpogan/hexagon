// Limen — entry point. Wires core (rules) + render (Three.js) + ui (HUD).
import { Game } from './core/game.js';
import { BoardRenderer } from './render/scene.js';
import { Hud } from './ui/hud.js';
import { sound } from './ui/sound.js';

let game, renderer, hud;

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
  if (g.phase === 'capital') {
    const res = g.placeCapital(g.currentPlayer, col, row);
    if (res.ok) { sound.place(); if (res.allCapitalsPlaced) sound.turnSwitch(); }
    else sound.error();
    update();
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

  if (res.won) {
    update();
    sound.victory();
    hud.showWin(g.winner, g.stats, g.turn);
    return;
  }
  if (g.currentPlayer !== before) sound.turnSwitch();
  update();
}

function handleHover(hit) {
  const g = game;
  renderer.clearGhost();
  if (!hit || g.phase !== 'play' || hud.selectedIndex === null) return;
  const tile = g.hands[g.currentPlayer][hud.selectedIndex];
  if (!tile) return;
  const cell = g.board[hit.col][hit.row];
  if (!cell.tile && g.canPlace(g.currentPlayer, tile, hit.col, hit.row)) {
    renderer.showGhost(hit.col, hit.row, projectedInfluence(g, tile, hit.col, hit.row));
  }
}

function startGame() {
  document.getElementById('menu').classList.add('hidden');
  const seed = `local-${Math.random().toString(36).slice(2, 10)}`;
  game = new Game({ seed });

  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  renderer = new BoardRenderer(boardEl, game);
  hud = new Hud(document.getElementById('hud'), game);
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
    const res = game.pass(game.currentPlayer);
    if (res.ok) { sound.turnSwitch(); hud.selectedIndex = null; update(); }
  };
  hud.onRestart = () => location.reload();

  update();
  window.__limen = { game, renderer, hud, update }; // debug/test handle
}

document.getElementById('hotseatBtn').onclick = startGame;
