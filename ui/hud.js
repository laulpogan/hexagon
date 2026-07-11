// HTML overlay UI: hand strip, turn banner, log, win screen, menu.
// Talks to main.js through callbacks; renders from game state.
import { KEYWORDS, RITE_INFO } from '../data/tiles.js';
import { CONFIG } from '../core/config.js';

const RARITY_COLOR = { common: '#8b9bb4', uncommon: '#4fa3ff', rare: '#f2c14e', capital: '#f2c14e' };

export class Hud {
  constructor(root, game) {
    this.game = game;
    this.root = root;
    this.selectedIndex = null;
    this.viewPlayer = null;     // bot mode: always show the human's hand
    this.botMode = false;
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
        <button id="musicBtn" title="Toggle music">🎵</button>
        <button id="helpHudBtn" title="How to play">?</button>
      </div>
      <div id="hintBar"></div>
      <div id="winOverlay" class="hidden"></div>
      <div id="handoverOverlay" class="hidden"></div>
    `;
    root.querySelector('#passBtn').onclick = () => this.onPass && this.onPass();
    root.querySelector('#helpHudBtn').onclick = () =>
      document.getElementById('helpOverlay').classList.remove('hidden');
  }

  bindSound(sound) {
    const btn = this.root.querySelector('#soundBtn');
    btn.textContent = sound.enabled ? '🔊' : '🔇';
    btn.onclick = () => { btn.textContent = sound.toggle() ? '🔊' : '🔇'; };
  }

  bindMusic(music) {
    const btn = this.root.querySelector('#musicBtn');
    btn.style.opacity = music.enabled ? '1' : '0.4';
    btn.onclick = () => { btn.style.opacity = music.toggle() ? '1' : '0.4'; };
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
      el.innerHTML = this.botMode && g.currentPlayer === 2
        ? `Turn ${g.turn} — ${this.playerLabel(2)} is thinking…`
        : `Turn ${g.turn} — ${this.playerLabel(g.currentPlayer)} · draw 1, place 1 · right-click a card to discard (1×)`;
      el.className = `turn-p${g.currentPlayer}`;
    } else {
      el.innerHTML = `Game over`;
      el.className = '';
    }
    const passBtn = this.root.querySelector('#passBtn');
    passBtn.style.display = g.phase === 'play' ? 'block' : 'none';
    if (g.phase === 'play') {
      // Pass is only legal when genuinely stuck (anti-hoarding rule).
      const stuck = g.legalMoves(g.currentPlayer).length === 0;
      passBtn.disabled = !stuck;
      passBtn.title = stuck ? 'No playable tiles — pass the turn' : 'You have playable tiles — passing is not allowed';
    }
  }

  _renderHand() {
    const g = this.game;
    const strip = this.root.querySelector('#handStrip');
    if (g.phase !== 'play') { strip.innerHTML = ''; return; }
    const viewP = this.viewPlayer ?? g.currentPlayer;
    const hand = g.hands[viewP];
    strip.innerHTML = '';
    hand.forEach((tile, i) => {
      const card = document.createElement('div');
      card.className = 'card' + (i === this.selectedIndex ? ' selected' : '') + ` owner-p${viewP}`;
      card.style.borderColor = RARITY_COLOR[tile.rarity];
      const kws = tile.keywords.map(k =>
        `<span class="kw" title="${(KEYWORDS[k]?.desc || '').replace(/"/g, '&quot;')}">${KEYWORDS[k]?.name || k}</span>`).join('');
      const isRite = tile.kind === 'rite';
      card.innerHTML = `
        <div class="card-art" style="background-image:url('./assets/tiles/${tile.type}.jpg')"></div>
        <div class="card-name">${tile.type.replace(/_/g, ' ')}</div>
        <div class="card-inf">${isRite ? '✦' : tile.influence}</div>
        <div class="card-kws">${isRite ? `<span class="kw" title="${(RITE_INFO[tile.type]?.desc || '').replace(/"/g, '&quot;')}">Rite</span>` : kws}</div>
        <div class="card-rarity" style="color:${RARITY_COLOR[tile.rarity]}">${isRite ? 'rite · ' : ''}${tile.rarity}</div>
      `;
      if (isRite) card.title = RITE_INFO[tile.type]?.desc || 'A rite — cast it as your turn\'s action.';
      card.onclick = () => this.onSelectTile && this.onSelectTile(i === this.selectedIndex ? null : i);
      card.oncontextmenu = (e) => { e.preventDefault(); this.onDiscard && this.onDiscard(i); };
      card.onmouseenter = () => this.onCardHover && this.onCardHover(tile);
      card.onmouseleave = () => this.onCardHover && this.onCardHover(null);
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

  showWin(winner, stats, turns, reason) {
    const el = this.root.querySelector('#winOverlay');
    el.classList.remove('hidden');
    const s1 = stats[1], s2 = stats[2];
    const title = winner ? `${winner === 1 ? '🌿 Verdant' : '🌌 Umbral'} wins!` : '⚖️ Draw';
    const sub = reason === 'capital'
      ? `The enemy capital has fallen after ${turns} turns.`
      : reason === 'influence'
        ? `All tiles spent — the threshold yields to greater influence (${turns} turns).`
        : `The threshold holds. Neither reality prevails (${turns} turns).`;
    el.innerHTML = `
      <div class="win-box">
        <h1>${title}</h1>
        <p>${sub}</p>
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

  // Hotseat hidden-information gate: opaque screen between turns so the
  // outgoing player never sees the incoming player's hand.
  showHandover(player, onReady) {
    const el = this.root.querySelector('#handoverOverlay');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="win-box">
        <h1>${player === 1 ? '🌿 Verdant' : '🌌 Umbral'}'s turn</h1>
        <p>Pass the device. Tap when ready — your hand is hidden until then.</p>
        <button id="handoverBtn">I'm ${player === 1 ? 'Verdant' : 'Umbral'} — show my hand</button>
      </div>`;
    el.querySelector('#handoverBtn').onclick = () => {
      el.classList.add('hidden');
      if (onReady) onReady();
    };
  }
}
