// Deck builder — the collectible surface. Tier caps (CONFIG) are the pacing
// valve that replaced resource costs; validateDeck enforces them here and in
// the Game constructor.
import { TILE_POOL, KEYWORDS, defaultDeckComposition } from '../data/tiles.js';
import { CONFIG } from '../core/config.js';
import { validateDeck } from '../core/game.js';

const STORAGE_KEY = 'limen_deck';
const RARITY_COLOR = { common: '#8b9bb4', uncommon: '#4fa3ff', rare: '#f2c14e' };

export function loadSavedDeck() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const comp = JSON.parse(raw);
    return validateDeck(comp).valid ? comp : null;
  } catch {
    return null;
  }
}

function saveDeck(comp) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(comp)); return true; }
  catch { return false; }
}

export function initDeckbuilder(overlayEl, onClose) {
  let working = null;

  function open() {
    working = { ...(loadSavedDeck() || defaultDeckComposition()) };
    overlayEl.classList.remove('hidden');
    render();
  }

  function close() {
    overlayEl.classList.add('hidden');
    if (onClose) onClose();
  }

  function counts() {
    let total = 0, rares = 0, uncommons = 0;
    for (const tpl of TILE_POOL) {
      const n = working[tpl.type] || 0;
      total += n;
      if (tpl.rarity === 'rare') rares += n;
      if (tpl.rarity === 'uncommon') uncommons += n;
    }
    return { total, rares, uncommons };
  }

  function add(type) {
    const tpl = TILE_POOL.find(t => t.type === type);
    const { total, rares, uncommons } = counts();
    const cur = working[type] || 0;
    if (total >= CONFIG.DECK_SIZE) return;
    if (cur >= CONFIG.COPY_CAP[tpl.rarity]) return;
    if (tpl.rarity === 'rare' && rares >= CONFIG.MAX_RARE) return;
    if (tpl.rarity === 'uncommon' && uncommons >= CONFIG.MAX_UNCOMMON) return;
    working[type] = cur + 1;
    render();
  }

  function remove(type) {
    if ((working[type] || 0) <= 0) return;
    working[type]--;
    render();
  }

  function render() {
    const { total, rares, uncommons } = counts();
    const check = validateDeck(working);
    overlayEl.innerHTML = `
      <div class="db-box">
        <h2>Deck Builder</h2>
        <div class="db-stats ${check.valid ? 'ok' : 'bad'}">
          ${total} / ${CONFIG.DECK_SIZE} tiles · rares ${rares}/${CONFIG.MAX_RARE} · uncommons ${uncommons}/${CONFIG.MAX_UNCOMMON}
        </div>
        <div class="db-grid">
          ${TILE_POOL.map(tpl => {
            const n = working[tpl.type] || 0;
            const kws = tpl.keywords.map(k =>
              `<span class="kw" title="${(KEYWORDS[k]?.desc || '').replace(/"/g, '&quot;')}">${KEYWORDS[k]?.name || k}</span>`).join('');
            return `
              <div class="db-card ${n > 0 ? 'picked' : ''}" data-type="${tpl.type}"
                   style="border-color:${RARITY_COLOR[tpl.rarity]}">
                <span class="db-count">${n || ''}</span>
                <div class="db-name">${tpl.type}</div>
                <div class="db-inf">${tpl.influence}</div>
                <div class="db-kws">${kws}</div>
                <div class="db-rarity" style="color:${RARITY_COLOR[tpl.rarity]}">${tpl.rarity} · max ${CONFIG.COPY_CAP[tpl.rarity]}</div>
              </div>`;
          }).join('')}
        </div>
        <div class="db-hint">Click to add a copy · right-click to remove</div>
        <div class="db-actions">
          <button id="dbDefault">Reset to Starter</button>
          <button id="dbClear">Clear</button>
          <button id="dbSave" ${check.valid ? '' : 'disabled'}>Save &amp; Close</button>
          <button id="dbCancel">Cancel</button>
        </div>
      </div>`;

    for (const el of overlayEl.querySelectorAll('.db-card')) {
      el.onclick = () => add(el.dataset.type);
      el.oncontextmenu = (e) => { e.preventDefault(); remove(el.dataset.type); };
    }
    overlayEl.querySelector('#dbDefault').onclick = () => { working = defaultDeckComposition(); render(); };
    overlayEl.querySelector('#dbClear').onclick = () => { working = {}; render(); };
    overlayEl.querySelector('#dbSave').onclick = () => { if (saveDeck(working)) close(); };
    overlayEl.querySelector('#dbCancel').onclick = close;
  }

  return { open };
}
