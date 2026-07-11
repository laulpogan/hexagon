// Descent campaign UI — the three screens the run loop needs: a MAP view (pick
// the next node), a REWARD/draft screen (pick a card into the run deck), and a
// RUN-SUMMARY screen. All state and rules live in core/campaign.js (pure,
// tested); this file is DOM only, reusing the deckbuilder/HUD card patterns
// (RARITY_COLOR, the ./assets/tiles/<TYPE>.jpg art path with encodeURIComponent).
//
// deps (from main.js):
//   startMatch({ node, run, onResolve })  — boot a Game match from a fight node;
//                                            onResolve(didWin) is called on end.
//   getStartDeck()                        — the player's saved deck comp, or null.
//   onRunState(run)                       — debug/state hook (window.__limen.campaign).
import { TILE_POOL, tileTemplate, KEYWORDS, RITE_INFO } from '../data/tiles.js';
import { CONFIG } from '../core/config.js';
import {
  createRun, availableNodes, completeFight, completeNonFight, applyReward, NODE_TYPE,
} from '../core/campaign.js';

const RARITY_COLOR = { common: '#8b9bb4', uncommon: '#4fa3ff', rare: '#f2c14e', capital: '#f2c14e' };

// Per-type display metadata — icon/label/color and the one-line "what happens".
const NODE_META = {
  [NODE_TYPE.SKIRMISH]:   { icon: '⚔', label: 'Skirmish',   color: '#8fd8ac', sub: 'greedy foe · win drafts a card' },
  [NODE_TYPE.WARDEN]:     { icon: '🛡', label: 'Warden',     color: '#f2c14e', sub: 'elite (policy) · win drafts a rare-lean card' },
  [NODE_TYPE.BOSS]:       { icon: '☠', label: 'Boss',       color: '#ff8a8a', sub: 'search foe · the end of the Descent' },
  [NODE_TYPE.RIFT_CACHE]: { icon: '◆', label: 'Rift-Cache', color: '#e879f9', sub: 'no fight · draft a card' },
};

// A fresh run seed without Math.random/Date.now (banned in campaign logic): a
// persisted run counter. The player can override it for shareable/replayable
// runs — a run seed reproduces the entire Descent.
function nextRunSeed() {
  let n = 0;
  try { n = parseInt(localStorage.getItem('limen_campaign_runs') || '0', 10) || 0; } catch {}
  n += 1;
  try { localStorage.setItem('limen_campaign_runs', String(n)); } catch {}
  return `descent-${n}`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A card face (reused by the reward screen). Mirrors the HUD/deckbuilder markup.
function cardFace(type) {
  const tpl = tileTemplate(type) || { rarity: 'common', influence: 0, keywords: [], kind: 'tile' };
  const isRite = (tpl.kind || 'tile') === 'rite';
  const kws = isRite
    ? `<span class="kw" title="${esc(RITE_INFO[type]?.desc || '')}">Rite</span>`
    : (tpl.keywords || []).map(k => `<span class="kw" title="${esc(KEYWORDS[k]?.desc || '')}">${esc(KEYWORDS[k]?.name || k)}</span>`).join('');
  return `
    <div class="card-art" style="background-image:url('./assets/tiles/${encodeURIComponent(type)}.jpg')"></div>
    <div class="db-name">${esc(type.replace(/_/g, ' '))}</div>
    <div class="db-inf">${isRite ? '✦' : (tpl.influence ?? '')}</div>
    <div class="db-kws">${kws}</div>
    <div class="db-rarity" style="color:${RARITY_COLOR[tpl.rarity]}">${esc(isRite ? 'rite · ' + tpl.rarity : tpl.rarity)}</div>`;
}

export function initCampaign(overlayEl, deps) {
  let run = null;

  function emitState() { deps.onRunState && deps.onRunState(run); }

  function deckSize(comp) {
    return Object.values(comp).reduce((s, n) => s + n, 0);
  }

  function open() {
    showStart();
    overlayEl.classList.remove('hidden');
  }

  // Return to the main menu. startGame() hides #menu (display:none) the first
  // time a match boots and nothing but a reload un-hides it — the app-wide
  // convention (hud.js/account.js/onRestart all reload) — and the board/hud DOM
  // holds stale match state after a fight. A full reload is the one path that
  // cleanly restores the menu from every campaign screen (pre-run, map, summary);
  // hiding the overlay alone stranded the player on a blank screen post-fight.
  function close() { location.reload(); }

  // ── Pre-run: pick/confirm a seed, then begin ─────────────────────────
  function showStart() {
    const suggested = nextRunSeed();
    overlayEl.innerHTML = `
      <div class="db-box cmp-box">
        <h2>The Descent</h2>
        <p class="cmp-lede">A branching run through the rift toward the Boss. Route your risk:
          a <b style="color:${NODE_META[NODE_TYPE.WARDEN].color}">Warden</b> guards a stronger reward, a
          <b style="color:${NODE_META[NODE_TYPE.RIFT_CACHE].color}">Rift-Cache</b> drafts a card with no fight.
          You carry <b>${CONFIG.CAMPAIGN.STARTING_LIVES} lives</b> — a lost duel costs one, but the run goes on.</p>
        <div class="cmp-seed-row">
          <label for="cmpSeed">Run seed</label>
          <input id="cmpSeed" value="${esc(suggested)}" maxlength="40" spellcheck="false">
          <span class="cmp-hint">same seed → the same Descent (shareable)</span>
        </div>
        <div class="db-actions">
          <button id="cmpBegin">Begin Descent</button>
          <button id="cmpBack">Back to Menu</button>
        </div>
      </div>`;
    overlayEl.querySelector('#cmpBegin').onclick = () => {
      const seed = overlayEl.querySelector('#cmpSeed').value.trim() || suggested;
      run = createRun(seed, { startDeck: deps.getStartDeck ? deps.getStartDeck() : null });
      emitState();
      showMap();
    };
    overlayEl.querySelector('#cmpBack').onclick = () => close();
  }

  // ── Map: the whole DAG, columns top→bottom; frontier nodes clickable ──
  function showMap() {
    const frontier = new Set(run.available);
    const lives = '♥'.repeat(Math.max(0, run.lives)) + '<span class="cmp-life-lost">' +
      '♡'.repeat(Math.max(0, CONFIG.CAMPAIGN.STARTING_LIVES - run.lives)) + '</span>';

    const columnsHtml = run.map.columns.map((col, ci) => {
      const chips = col.map(id => {
        const node = run.map.nodes[id];
        const meta = NODE_META[node.type];
        const cleared = run.cleared.includes(id);
        const open = frontier.has(id);
        const cls = `cmp-node ${cleared ? 'is-cleared' : ''} ${open ? 'is-open' : ''}`;
        return `
          <button class="${cls}" data-id="${id}" ${open ? '' : 'disabled'}
                  style="border-color:${meta.color}">
            <span class="cmp-node-icon" style="color:${meta.color}">${meta.icon}</span>
            <span class="cmp-node-label">${meta.label}</span>
            ${cleared ? '<span class="cmp-node-check">✓</span>' : ''}
          </button>`;
      }).join('');
      return `<div class="cmp-col"><span class="cmp-col-tag">${ci === run.map.columns.length - 1 ? 'BOSS' : 'col ' + ci}</span><div class="cmp-col-nodes">${chips}</div></div>`;
    }).join('<div class="cmp-col-arrow">↓</div>');

    overlayEl.innerHTML = `
      <div class="db-box cmp-box">
        <div class="cmp-topbar">
          <h2>The Descent</h2>
          <div class="cmp-stats">
            <span class="cmp-lives" title="Lives">${lives}</span>
            <span title="Run deck size">🂠 ${deckSize(run.runDeck)}/${CONFIG.DECK_SIZE}</span>
            <span title="Nodes cleared">✓ ${run.cleared.length}</span>
            <span class="cmp-seed-tag" title="Run seed">${esc(run.runSeed)}</span>
          </div>
        </div>
        <p class="cmp-lede">Choose your next node — its type is shown before you commit.</p>
        <div class="cmp-map">${columnsHtml}</div>
        <div class="db-actions">
          <button id="cmpAbandon">Abandon Run</button>
        </div>
      </div>`;

    for (const btn of overlayEl.querySelectorAll('.cmp-node.is-open')) {
      btn.onclick = () => chooseNode(btn.dataset.id);
    }
    overlayEl.querySelector('#cmpAbandon').onclick = () => showStart();
  }

  // ── Enter a node ─────────────────────────────────────────────────────
  function chooseNode(nodeId) {
    const node = run.map.nodes[nodeId];
    run.currentNodeId = nodeId;
    emitState();
    if (node.fight) {
      overlayEl.classList.add('hidden'); // reveal the board; the match takes over
      deps.startMatch({
        node, run,
        onResolve: (didWin) => {
          const res = completeFight(run, nodeId, didWin);
          emitState();
          overlayEl.classList.remove('hidden');
          if (run.status !== 'active') { showSummary(); return; }
          if (res.reward) showReward(node, res.reward, didWin);
          else showMap(); // a loss with lives left → straight back to the map
        },
      });
    } else {
      const draft = completeNonFight(run, nodeId); // Rift-Cache: draft, no fight
      emitState();
      if (run.status !== 'active') { showSummary(); return; }
      if (draft) showReward(node, draft, true);
      else showMap();
    }
  }

  // ── Reward: pick 1-of-N (or skip) ────────────────────────────────────
  function showReward(node, draft, didWin) {
    const meta = NODE_META[node.type];
    const cards = draft.offers.map(type => `
      <div class="db-card cmp-offer" data-type="${type}" style="border-color:${RARITY_COLOR[(tileTemplate(type) || {}).rarity] || '#555'}">
        ${cardFace(type)}
      </div>`).join('');
    overlayEl.innerHTML = `
      <div class="db-box cmp-box">
        <h2>${didWin ? `${meta.icon} ${meta.label} cleared` : `${meta.icon} ${meta.label}`}</h2>
        <p class="cmp-lede">Draft one card into your run deck — it swaps in for your weakest card,
          keeping the deck a legal ${CONFIG.DECK_SIZE}. Or skip to keep your deck lean.</p>
        <div class="db-grid cmp-offers">${cards}</div>
        <div class="db-actions">
          <button id="cmpSkip">Skip (keep deck lean)</button>
        </div>
      </div>`;
    for (const el of overlayEl.querySelectorAll('.cmp-offer')) {
      el.onclick = () => { applyReward(run, el.dataset.type); emitState(); afterReward(); };
    }
    overlayEl.querySelector('#cmpSkip').onclick = () => { applyReward(run, null); emitState(); afterReward(); };
  }

  function afterReward() {
    if (run.status !== 'active') showSummary();
    else showMap();
  }

  // ── Summary ──────────────────────────────────────────────────────────
  function showSummary() {
    const won = run.status === 'won';
    const wins = run.history.filter(h => h.result === 'win').length;
    const losses = run.history.filter(h => h.result === 'loss').length;
    overlayEl.innerHTML = `
      <div class="db-box cmp-box cmp-summary">
        <h1>${won ? '✦ Descent Cleared' : '☾ The Descent Ends'}</h1>
        <p class="cmp-lede">${won
          ? 'You reached the Meeting of Worlds and held. The rift remembers.'
          : 'The rift pushes you back to the surface. You keep what it taught you.'}</p>
        <table>
          <tr><td>Result</td><td>${won ? 'Cleared' : 'Fell'}</td></tr>
          <tr><td>Nodes cleared</td><td>${run.cleared.length}</td></tr>
          <tr><td>Duels won / lost</td><td>${wins} / ${losses}</td></tr>
          <tr><td>Lives left</td><td>${Math.max(0, run.lives)} / ${CONFIG.CAMPAIGN.STARTING_LIVES}</td></tr>
          <tr><td>Run deck size</td><td>${deckSize(run.runDeck)}</td></tr>
          <tr><td>Seed</td><td>${esc(run.runSeed)}</td></tr>
        </table>
        <div class="db-actions">
          <button id="cmpNew">New Descent</button>
          <button id="cmpMenu">Back to Menu</button>
        </div>
      </div>`;
    overlayEl.querySelector('#cmpNew').onclick = () => showStart();
    overlayEl.querySelector('#cmpMenu').onclick = () => close();
  }

  return { open };
}
