// Board geometry + generation. Offset-column hex grid (odd columns shifted
// down half a hex) — same layout as the original hexagon game.
import { CONFIG } from './config.js';

// Neighbor offsets for the offset-column layout.
const EVEN_COL = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
const ODD_COL  = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];

export function neighborCoords(col, row) {
  const offsets = col % 2 === 0 ? EVEN_COL : ODD_COL;
  const out = [];
  for (const [dc, dr] of offsets) {
    const c = col + dc, r = row + dr;
    if (c >= 0 && c < CONFIG.GRID_W && r >= 0 && r < CONFIG.GRID_H) out.push([c, r]);
  }
  return out;
}

export function isEdge(col, row) {
  return col === 0 || col === CONFIG.GRID_W - 1 || row === 0 || row === CONFIG.GRID_H - 1;
}

export function midRow() {
  return Math.floor(CONFIG.GRID_H / 2);
}

// Build the board: 2D array of cells. The rift seam is one hex per column
// near the mid row, jittered by the seeded rand so every board is different
// but both multiplayer clients (same seed) agree.
export function createBoard(rand) {
  const cells = [];
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    cells[c] = [];
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      cells[c][r] = { col: c, row: r, rift: false, tile: null };
    }
  }
  const mid = midRow();
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    let r = mid;
    if (rand() < CONFIG.RIFT_JITTER_CHANCE) r += rand() < 0.5 ? -1 : 1;
    r = Math.max(0, Math.min(CONFIG.GRID_H - 1, r)); // guard against small-board configs
    cells[c][r].rift = true;
  }
  return cells;
}

// Offset (odd-q, odd columns shifted down) → cube coords → hex distance.
export function hexDistance(c1, r1, c2, r2) {
  const z1 = r1 - (c1 - (c1 & 1)) / 2;
  const z2 = r2 - (c2 - (c2 & 1)) / 2;
  const y1 = -c1 - z1, y2 = -c2 - z2;
  return Math.max(Math.abs(c1 - c2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

export function riftNeighborCount(cells, col, row) {
  let n = 0;
  for (const [c, r] of neighborCoords(col, row)) if (cells[c][r].rift) n++;
  return n;
}
