// Deck builder — the collectible surface. Tier caps (CONFIG) are the pacing
// valve that replaced resource costs; validateDeck enforces them here and in
// the Game constructor. v2 (SHELL_SPEC.md §7.6): ownership-gated by the
// player's collection, single cloud-synced deck for signed-in users (B6 cut
// multi-deck management — one row, no picker).
import { TILE_POOL, KEYWORDS, defaultDeckComposition } from '../data/tiles.js';
import { CONFIG } from '../core/config.js';
import { validateDeck } from '../core/game.js';
import { getLocalCollection } from '../net/progress.js';
import { currentUser } from '../net/auth.js';
import { sb } from '../net/client.js';

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
    const hadLocal = !!loadSavedDeck();
    working = { ...(loadSavedDeck() || defaultDeckComposition()) };
    overlayEl.classList.remove('hidden');
    render();
    // Cloud sync (signed-in only, never blocks render — §3.6): if there was
    // no local active deck yet, adopt the cloud one if it exists.
    if (!hadLocal) {
      currentUser().then((user) => {
        if (!user) return;
        return sb().from('decks').select('composition').eq('user_id', user.id).maybeSingle();
      }).then((res) => {
        if (res?.data?.composition && validateDeck(res.data.composition).valid) {
          working = { ...res.data.composition };
          render();
        }
      }).catch(() => {});
    }
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
    const owned = getLocalCollection();
    if ((owned[type] || 0) <= cur) return; // can't run a copy you don't own
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
    const owned = getLocalCollection();
    overlayEl.innerHTML = `
      <div class="db-box">
        <h2>Deck Builder</h2>
        <div class="db-stats ${check.valid ? 'ok' : 'bad'}">
          ${total} / ${CONFIG.DECK_SIZE} tiles · rares ${rares}/${CONFIG.MAX_RARE} · uncommons ${uncommons}/${CONFIG.MAX_UNCOMMON}
        </div>
        <div class="db-grid">
          ${TILE_POOL.map(tpl => {
            const n = working[tpl.type] || 0;
            const ownedN = owned[tpl.type] || 0;
            const locked = ownedN === 0;
            const kws = tpl.keywords.map(k =>
              `<span class="kw" title="${(KEYWORDS[k]?.desc || '').replace(/"/g, '&quot;')}">${KEYWORDS[k]?.name || k}</span>`).join('');
            return `
              <div class="db-card ${n > 0 ? 'picked' : ''} ${locked ? 'db-locked' : ''}" data-type="${tpl.type}"
                   style="border-color:${RARITY_COLOR[tpl.rarity]}">
                <span class="db-count">${n || ''}</span>
                <div class="card-art" style="background-image:url('./assets/tiles/${tpl.type}.jpg')"></div>
                ${locked ? '<div class="col-lock">&#128274;</div>' : ''}
                <div class="db-name">${tpl.type}</div>
                <div class="db-inf">${tpl.influence}</div>
                <div class="db-kws">${kws}</div>
                <div class="db-rarity" style="color:${RARITY_COLOR[tpl.rarity]}">${tpl.rarity} · owned ${ownedN} · max ${CONFIG.COPY_CAP[tpl.rarity]}</div>
              </div>`;
          }).join('')}
        </div>
        <div class="db-hint">Click to add an owned copy · right-click to remove · locked cards unlock in the Collection screen</div>
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
    overlayEl.querySelector('#dbSave').onclick = () => {
      if (!saveDeck(working)) return;
      // Best-effort cloud sync for signed-in users — never blocks close()
      // (SHELL_SPEC §7.6: localStorage stays the mirror bot-mode reads).
      currentUser().then((user) => {
        if (user) sb().from('decks').upsert({ user_id: user.id, composition: working }).then(() => {});
      }).catch(() => {});
      close();
    };
    overlayEl.querySelector('#dbCancel').onclick = close;
  }

  return { open };
}
