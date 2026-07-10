// HTML overlay UI: hand strip, turn banner, log, win screen, menu.
// Talks to main.js through callbacks; renders from game state.
import { KEYWORDS } from '../data/tiles.js';
import { CONFIG } from '../core/config.js';

const RARITY_COLOR = { common: '#8b9bb4', uncommon: '#4fa3ff', rare: '#f2c14e', capital: '#f2c14e' };

export class Hud {
  constructor(root, game) {
    this.game = game;
    this.root = root;
    this.selectedIndex = null;
    this.onSelectTile = null;   // (indexOrNull)
    this.onDiscard = null;      // (index)
    this.onPass = null;
    this.onRestart = null;

    root.innerHTML = `
      <div id="turnBanner"></div>
      <div id="hudLog"></div>
      <div id="handStrip"></div>
      <div id="hudControls">
        <button id="passBtn" title="End turn without placing">Pass</button>
        <button id="soundBtn" title="Toggle sound">🔊</button>
      </div>
      <div id="hintBar"></div>
      <div id="winOverlay" class="hidden"></div>
    `;
    root.querySelector('#passBtn').onclick = () => this.onPass && this.onPass();
  }

  bindSound(sound) {
    const btn = this.root.querySelector('#soundBtn');
    btn.textContent = sound.enabled ? '🔊' : '🔇';
    btn.onclick = () => { btn.textContent = sound.toggle() ? '🔊' : '🔇'; };
  }

  playerLabel(p) {
    return p === 1
      ? '<span class="p1name">Verdant</span>'
      : '<span class="p2name">Umbral</span>';
  }

  render() {
    this._renderBanner();
    this._renderHand();
    this._renderLog();
  }

  _renderBanner() {
    const g = this.game;
    const el = this.root.querySelector('#turnBanner');
    if (g.phase === 'capital') {
      el.innerHTML = `${this.playerLabel(g.currentPlayer)} — place your <b>capital</b> (highlighted hexes)`;
      el.className = `turn-p${g.currentPlayer}`;
    } else if (g.phase === 'play') {
      el.innerHTML = `Turn ${g.turn} — ${this.playerLabel(g.currentPlayer)} · draw 1, place 1 · right-click a card to discard (1×)`;
      el.className = `turn-p${g.currentPlayer}`;
    } else {
      el.innerHTML = `Game over`;
      el.className = '';
    }
    this.root.querySelector('#passBtn').style.display = g.phase === 'play' ? 'block' : 'none';
  }

  _renderHand() {
    const g = this.game;
    const strip = this.root.querySelector('#handStrip');
    if (g.phase !== 'play') { strip.innerHTML = ''; return; }
    const hand = g.hands[g.currentPlayer];
    strip.innerHTML = '';
    hand.forEach((tile, i) => {
      const card = document.createElement('div');
      card.className = 'card' + (i === this.selectedIndex ? ' selected' : '') + ` owner-p${g.currentPlayer}`;
      card.style.borderColor = RARITY_COLOR[tile.rarity];
      const kws = tile.keywords.map(k =>
        `<span class="kw" title="${KEYWORDS[k]?.desc || ''}">${KEYWORDS[k]?.name || k}</span>`).join('');
      card.innerHTML = `
        <div class="card-name">${tile.type}</div>
        <div class="card-inf">${tile.influence}</div>
        <div class="card-kws">${kws}</div>
        <div class="card-rarity" style="color:${RARITY_COLOR[tile.rarity]}">${tile.rarity}</div>
      `;
      card.onclick = () => this.onSelectTile && this.onSelectTile(i === this.selectedIndex ? null : i);
      card.oncontextmenu = (e) => { e.preventDefault(); this.onDiscard && this.onDiscard(i); };
      strip.appendChild(card);
    });
  }

  _renderLog() {
    const el = this.root.querySelector('#hudLog');
    const entries = this.game.log.slice(-7).reverse();
    el.innerHTML = entries.map(e =>
      `<div class="log-line log-p${e.player}">T${e.turn} · P${e.player}: ${e.text}</div>`).join('');
  }

  hint(text) {
    this.root.querySelector('#hintBar').textContent = text || '';
  }

  showWin(winner, stats, turns) {
    const el = this.root.querySelector('#winOverlay');
    el.classList.remove('hidden');
    const s1 = stats[1], s2 = stats[2];
    el.innerHTML = `
      <div class="win-box">
        <h1>${winner === 1 ? '🌿 Verdant' : '🌌 Umbral'} wins!</h1>
        <p>The enemy capital has fallen after ${turns} turns.</p>
        <table>
          <tr><th></th><th class="p1name">Verdant</th><th class="p2name">Umbral</th></tr>
          <tr><td>Placed</td><td>${s1.placed}</td><td>${s2.placed}</td></tr>
          <tr><td>Captured</td><td>${s1.captured}</td><td>${s2.captured}</td></tr>
          <tr><td>Discarded</td><td>${s1.discarded}</td><td>${s2.discarded}</td></tr>
        </table>
        <button id="againBtn">Play Again</button>
      </div>`;
    el.querySelector('#againBtn').onclick = () => this.onRestart && this.onRestart();
  }

  hideWin() {
    this.root.querySelector('#winOverlay').classList.add('hidden');
  }
}
