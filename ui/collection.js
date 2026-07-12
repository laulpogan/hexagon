// Collection gallery — every TILE_POOL type as a card, owned vs locked,
// click-to-unlock with a single-card flip reveal (C3v: no multi-pack
// ceremony). SHELL_SPEC.md §7.3, Mote economy per DESIGN_ROUND_7.md B4/B5.
import { TILE_POOL, KEYWORDS, RITE_INFO, visibleKeywords } from '../data/tiles.js';
import { CONFIG } from '../core/config.js';
import { getLocalCollection, getLocalProgress, computeMotePrices, unlockCard } from '../net/progress.js';
import { sound } from './sound.js';

const RARITY_COLOR = { common: '#8b9bb4', uncommon: '#4fa3ff', rare: '#f2c14e' };

export function initCollection(overlayEl) {
  function close() { overlayEl.classList.add('hidden'); }
  function open() { overlayEl.classList.remove('hidden'); render(); }

  function render() {
    const owned = getLocalCollection();
    const progress = getLocalProgress();
    const prices = computeMotePrices();
    const ownedCount = TILE_POOL.filter(t => (owned[t.type] || 0) > 0).length;

    overlayEl.innerHTML = `
      <div class="db-box col-box">
        <h2>Collection</h2>
        <div class="col-stats">
          <span class="col-progress">${ownedCount} / ${TILE_POOL.length} cards</span>
          <span class="col-motes">◆ ${progress.motes} Motes</span>
        </div>
        <div class="db-grid col-grid">
          ${TILE_POOL.map(tpl => renderCard(tpl, owned, prices)).join('')}
        </div>
        <div class="db-hint">Click a locked card to spend Motes and unlock it.</div>
        <div class="db-actions">
          <button id="colCloseBtn">Back</button>
        </div>
      </div>
      <div id="revealOverlay" class="hidden"></div>`;

    for (const btn of overlayEl.querySelectorAll('.col-unlock-btn')) {
      btn.onclick = () => doUnlock(btn.dataset.type, Number(btn.dataset.price));
    }
    overlayEl.querySelector('#colCloseBtn').onclick = close;
  }

  function renderCard(tpl, owned, prices) {
    const n = owned[tpl.type] || 0;
    const isOwned = n > 0;
    const isRite = tpl.kind === 'rite';
    const price = prices[tpl.type] || 0;
    const kwHtml = isRite
      ? `<span class="kw" title="${(RITE_INFO[tpl.type]?.desc || '').replace(/"/g, '&quot;')}">Rite</span>`
      : visibleKeywords(tpl.keywords, CONFIG).map(k =>
          `<span class="kw" title="${(KEYWORDS[k]?.desc || '').replace(/"/g, '&quot;')}">${KEYWORDS[k]?.name || k}</span>`).join('');
    return `
      <div class="db-card col-card ${isOwned ? 'picked owned' : 'locked'}" style="border-color:${RARITY_COLOR[tpl.rarity]}">
        <div class="col-art-wrap">
          <img class="card-art col-art" src="./assets/tiles/${tpl.type}.jpg" alt=""
               onerror="this.closest('.col-art-wrap').classList.add('no-art')">
          <div class="col-art-fallback" style="background:linear-gradient(160deg, ${RARITY_COLOR[tpl.rarity]}44, #171b26 75%);">
            <span>${tpl.type.replace(/_/g, ' ')}</span>
          </div>
          ${!isOwned ? '<div class="col-lock">&#128274;</div>' : ''}
        </div>
        <div class="db-name">${tpl.type.replace(/_/g, ' ')}</div>
        <div class="db-kws">${kwHtml}</div>
        <div class="db-rarity" style="color:${RARITY_COLOR[tpl.rarity]}">${isRite ? 'rite · ' : ''}${tpl.rarity}</div>
        ${isOwned
          ? `<div class="col-owned-count">owned ×${n}</div>`
          : `<button class="col-unlock-btn" data-type="${tpl.type}" data-price="${price}">
               ${price > 0 ? `Unlock — ${price} ◆` : 'Unlock — Free'}
             </button>`}
      </div>`;
  }

  async function doUnlock(type, price) {
    const progress = getLocalProgress();
    if (progress.motes < price) return; // button shouldn't be reachable here, but guard anyway
    const btn = overlayEl.querySelector(`.col-unlock-btn[data-type="${type}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Unlocking…'; }
    const res = await unlockCard(type, price);
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = `Unlock — ${price > 0 ? price + ' ◆' : 'Free'}`; }
      return;
    }
    sound.unlock();
    showReveal(type, () => render());
  }

  function showReveal(type, onDone) {
    const tpl = TILE_POOL.find(t => t.type === type);
    const revealEl = overlayEl.querySelector('#revealOverlay');
    if (!revealEl) { onDone(); return; }
    revealEl.classList.remove('hidden');
    revealEl.innerHTML = `
      <div class="reveal-stage">
        <div class="reveal-card" id="revealCard">
          <div class="reveal-face reveal-back"><div class="reveal-sigil">◆</div></div>
          <div class="reveal-face reveal-front" style="border-color:${RARITY_COLOR[tpl.rarity]}">
            <img class="card-art" src="./assets/tiles/${type}.jpg" alt=""
                 onerror="this.closest('.reveal-front').classList.add('no-art')">
            <div class="col-art-fallback" style="background:linear-gradient(160deg, ${RARITY_COLOR[tpl.rarity]}44, #171b26 75%);">
              <span>${type.replace(/_/g, ' ')}</span>
            </div>
            <div class="reveal-name">${type.replace(/_/g, ' ')}</div>
            <div class="reveal-rarity" style="color:${RARITY_COLOR[tpl.rarity]}">${tpl.rarity}</div>
          </div>
        </div>
        <div class="reveal-label">NEW CARD UNLOCKED</div>
        <button id="revealContinueBtn">Continue</button>
      </div>`;
    const card = revealEl.querySelector('#revealCard');
    requestAnimationFrame(() => setTimeout(() => card.classList.add('flipped'), 150));
    revealEl.querySelector('#revealContinueBtn').onclick = () => {
      revealEl.classList.add('hidden');
      onDone();
    };
  }

  return { open, close };
}
