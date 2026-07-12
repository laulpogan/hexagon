// HTML overlay UI: hand strip, turn banner, log, win screen, menu.
// Talks to main.js through callbacks; renders from game state.
import { KEYWORDS, RITE_INFO } from '../data/tiles.js';
import { CONFIG } from '../core/config.js';
import { getLocalCollection, computeMotePrices, nextUnlock } from '../net/progress.js';

const RARITY_COLOR = { common: '#8b9bb4', uncommon: '#4fa3ff', rare: '#f2c14e', capital: '#f2c14e' };

function animateCountUp(el, from, to, duration, format = (n) => String(n)) {
  if (!el) return;
  if (from === to) { el.textContent = format(to); return; }
  const start = performance.now();
  function step(t) {
    const p = Math.min(1, (t - start) / duration);
    el.textContent = format(Math.round(from + (to - from) * p));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

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
      <div id="momentumHud" class="hidden"></div>
      <div id="hudLog"></div>
      <div id="handStrip"></div>
      <div id="cascadePips" class="hidden"></div>
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
    this._renderMomentum();
    this._renderHand();
    this._renderCascadePips();
    this._renderLog();
  }

  // R8/P2: momentum HUD — small persistent per-player readout (capital-
  // connected non-capital tile count). NEW element; knob-gated so it's
  // fully absent (hidden, empty innerHTML) when ROAD_PRESSURE_ON is false —
  // the game must look exactly as before with the knob OFF.
  _renderMomentum() {
    const el = this.root.querySelector('#momentumHud');
    if (!CONFIG.ROAD_PRESSURE_ON) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const m = this.game.roads.momentum;
    el.innerHTML = `<span class="p1name">⚡ ${m[1]}</span><span class="p2name">⚡ ${m[2]}</span>`;
  }

  // R8/P3: placements-left pips near the hand — visible only while a
  // cascade has actually fired this turn (base 1-placement turns show
  // nothing, same as pre-P3). Spent pips mark placementsThisTurn; a live
  // pending grant (placementsLeft>0) lights the last one gold.
  _renderCascadePips() {
    const el = this.root.querySelector('#cascadePips');
    const g = this.game;
    if (!CONFIG.CASCADE_ON || g.phase !== 'play' || !g.cascadeFiredThisPly) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    const total = g.placementsThisTurn + g.placementsLeft;
    let pips = '';
    for (let i = 1; i <= total; i++) {
      pips += `<span class="pip ${i <= g.placementsThisTurn ? 'pip-spent' : 'pip-active'}"></span>`;
    }
    el.innerHTML = pips;
  }

  _renderBanner() {
    const g = this.game;
    const el = this.root.querySelector('#turnBanner');
    if (g.phase === 'capital') {
      el.innerHTML = `${this.playerLabel(g.currentPlayer)} — place your <b>capital</b> (highlighted hexes)`;
      el.className = `turn-p${g.currentPlayer}`;
    } else if (g.phase === 'play') {
      // THE RIFT STIRS telegraph/active banner suffix (game.riftStirs is
      // set by the core onTurnStart hook; see render/PATCH_NOTES_C3.md #4).
      const rs = g.riftStirs;
      const stirs = rs?.active
        ? ` · <span class="bt-rift"><b>THE RIFT STIRS!</b></span>`
        : rs?.upcoming
          ? ` · <span class="bt-rift">the rift stirs soon…</span>`
          : '';
      // R8/P3: Cascade — "place 1" is the exact pre-P3 copy, unchanged off
      // or idle. placementsLeft never exceeds 1 by design (each grant is
      // immediately re-armed 0→1 the same action it's spent, see
      // RULES8_P3_CASCADE.md) — placementsThisTurn + placementsLeft is the
      // only honest "how many placements this turn" running total.
      const placeText = (CONFIG.CASCADE_ON && g.cascadeFiredThisPly)
        ? `place ×${g.placementsThisTurn + g.placementsLeft}`
        : 'place 1';
      // R8/P3: Vanguard — small holder marker, relative to whoever's turn it is.
      const holder = CONFIG.VANGUARD_ON ? g.vanguardHolder() : 0;
      const vanguardTag = holder
        ? ` · <span class="bt-vanguard">⚑ ${holder === g.currentPlayer ? 'you strike first' : 'they strike first'}</span>`
        : '';
      el.innerHTML = (this.botMode && g.currentPlayer === 2
        ? `Turn ${g.turn} — ${this.playerLabel(2)} is thinking…`
        : `Turn ${g.turn} — ${this.playerLabel(g.currentPlayer)} · draw 1, ${placeText} · right-click a card to discard (1×)`) + stirs + vanguardTag;
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
        <div class="card-art" style="background-image:url('./assets/tiles/${encodeURIComponent(tile.type)}.jpg')"></div>
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

  // Post-match reward strip — the retention centerpiece (DESIGN_ROUND_7.md
  // "The shell"). Called separately from showWin, after the async
  // recordMatchResult() (net/progress.js) resolves — never blocks the
  // immediate win/loss feedback showWin already gives (SHELL_SPEC §3.6/§9).
  // `result` is 'win'|'loss'|'draw'; `prog` is recordMatchResult()'s return.
  showRewardStrip(result, prog) {
    if (!prog) return;
    const box = this.root.querySelector('#winOverlay .win-box');
    if (!box) return;
    const oldBtn = box.querySelector('#againBtn');
    if (oldBtn) oldBtn.remove(); // superseded by the strip's own buttons

    const moteGain = result === 'win' ? (prog.daily_bonus ? 2 : 1) : 0;
    const startMotes = Math.max(0, prog.motes - moteGain);
    const startStreak = result === 'win' ? Math.max(0, prog.streak - 1) : prog.streak;

    const strip = document.createElement('div');
    strip.className = 'reward-strip';
    strip.innerHTML = `
      <div class="rs-row">
        <div class="rs-stat"><span class="rs-label">Record</span><span class="rs-val">${prog.wins}W–${prog.losses}L${prog.draws ? `–${prog.draws}D` : ''}</span></div>
        <div class="rs-stat"><span class="rs-label">Streak</span><span class="rs-val" id="rsStreak">${startStreak}</span></div>
        <div class="rs-stat"><span class="rs-label">Motes</span><span class="rs-val" id="rsMotes">◆ ${startMotes}</span></div>
      </div>
      ${moteGain ? `<div class="rs-gain">+${moteGain} Mote${moteGain > 1 ? 's' : ''}${prog.daily_bonus ? ' · first win today!' : ''}</div>` : ''}
      <div class="rs-next" id="rsNext"></div>
      <div class="rs-actions">
        <button id="rsMenuBtn">Claim &amp; Menu</button>
        <button id="rsAgainBtn">Play Again</button>
      </div>`;
    box.appendChild(strip);

    animateCountUp(strip.querySelector('#rsMotes'), startMotes, prog.motes, 650, (n) => `◆ ${n}`);
    if (result === 'win') animateCountUp(strip.querySelector('#rsStreak'), startStreak, prog.streak, 650);

    const nextEl = strip.querySelector('#rsNext');
    const owned = getLocalCollection();
    const prices = computeMotePrices();
    const next = nextUnlock(owned, prices);
    if (next) {
      const remain = Math.max(0, next.price - prog.motes);
      const pct = Math.min(100, Math.round((prog.motes / next.price) * 100));
      nextEl.innerHTML = `
        <div class="rs-next-label">Next unlock: <b>${next.type.replace(/_/g, ' ')}</b>${remain > 0 ? ` — ${remain} more win${remain === 1 ? '' : 's'}` : ' — ready!'}</div>
        <div class="rs-bar"><div class="rs-bar-fill" style="width:${pct}%"></div></div>`;
    } else {
      nextEl.innerHTML = `<div class="rs-next-label">Collection complete!</div>`;
    }

    strip.querySelector('#rsMenuBtn').onclick = () => location.reload();
    strip.querySelector('#rsAgainBtn').onclick = () => this.onRestart && this.onRestart();
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
