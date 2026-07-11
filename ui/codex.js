// Codex — the lore browser. Self-contained: builds its own overlay + styles.
// Hookup (INTEGRATION_NOTES.md): initCodex() once, open() from a menu button.
import { LORE } from '../data/lore.js';
import { TILE_POOL } from '../data/tiles.js';

const CSS = `
#codexOverlay { position: fixed; inset: 0; z-index: 120; background: rgba(10,12,17,0.94);
  display: flex; justify-content: center; align-items: center; }
#codexPanel { width: min(920px, 94vw); height: min(640px, 92vh); display: flex;
  background: #12151e; border: 1px solid #3a4152; border-radius: 14px; overflow: hidden;
  box-shadow: 0 18px 60px rgba(0,0,0,0.7); }
#codexNav { width: 240px; overflow-y: auto; background: #0e1118; border-right: 1px solid #262b38;
  padding: 12px 0; }
#codexNav h3 { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #667;
  margin: 14px 14px 4px; }
.cdx-item { padding: 7px 14px; font-size: 13px; color: #cfd6e4; cursor: pointer; letter-spacing: 0.5px; }
.cdx-item:hover { background: #1a2030; }
.cdx-item.active { background: #1d2434; border-left: 2px solid #f2c14e; }
.cdx-lean-verdant { color: #6fe09a; } .cdx-lean-umbral { color: #b18aff; }
.cdx-lean-rift { color: #e879f9; } .cdx-lean-neutral { color: #cfd6e4; } .cdx-lean-either { color: #f2c14e; }
#codexBody { flex: 1; overflow-y: auto; padding: 26px 32px; line-height: 1.7; font-size: 14px; color: #cfd6e4; }
#codexBody h2 { margin: 0 0 4px; font-weight: 400; letter-spacing: 2px; color: #fff; }
#codexBody .cdx-epigraph { color: #f2c14e; font-style: italic; margin-bottom: 16px; }
#codexBody .cdx-note { margin-top: 16px; padding-top: 12px; border-top: 1px solid #262b38;
  color: #9aa4b8; font-style: italic; font-size: 13px; }
#codexBody .cdx-art { float: right; width: 190px; margin: 0 0 12px 18px; border-radius: 10px;
  border: 1px solid #2a2f3c; }
#codexClose { position: absolute; top: 14px; right: 18px; background: none; border: none;
  color: #99a; font-size: 26px; cursor: pointer; }
#codexClose:hover { color: #fff; }
`;

export function initCodex() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'codexOverlay';
  el.className = 'hidden';
  el.innerHTML = `<div id="codexPanel" style="position:relative">
    <button id="codexClose">×</button>
    <div id="codexNav"></div><div id="codexBody"></div></div>`;
  document.body.appendChild(el);

  const nav = el.querySelector('#codexNav');
  const body = el.querySelector('#codexBody');
  const poolTypes = new Set(TILE_POOL.map(t => t.type));

  const entries = [];
  entries.push({ id: 'act0', label: 'The Meeting', section: 'The Threshold Cycle' });
  entries.push({ id: 'act1', label: 'The Inscription War' });
  entries.push({ id: 'act2', label: 'The Listening Ground' });
  for (const key of ['verdant', 'umbral', 'rift', 'war']) {
    entries.push({ id: `cdx_${key}`, label: LORE.codices[key].title.split('—')[0].trim(), section: key === 'verdant' ? 'Codices' : undefined });
  }
  const unitTypes = Object.keys(LORE.units)
    .sort((a, b) => a.localeCompare(b));
  for (const t of unitTypes) {
    entries.push({ id: `unit_${t}`, label: t.replace(/_/g, ' '), lean: LORE.units[t].lean, section: t === unitTypes[0] ? 'Aspects' : undefined });
  }

  function artFor(type) {
    // sprite art ships for the curated pool; skip art for anything else
    if (!poolTypes.has(type) && !type.startsWith('CAPITAL')) return '';
    return `<img class="cdx-art" src="./assets/sprites/${type}_512.png"
      onerror="this.remove()" alt="">`;
  }

  // LORE prose is model-generated (tools/gen_lore_data.js). Escape every
  // free-text field before it touches innerHTML — the pipeline can regenerate
  // this data with only a human taste-pass, so treat it as untrusted at render.
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function show(id) {
    nav.querySelectorAll('.cdx-item').forEach(n => n.classList.toggle('active', n.dataset.id === id));
    if (id.startsWith('act')) {
      const a = LORE.acts[+id.slice(3)];
      body.innerHTML = `<h2>${esc(a.title)}</h2><p>${esc(a.text)}</p>`;
    } else if (id.startsWith('cdx_')) {
      const c = LORE.codices[id.slice(4)];
      body.innerHTML = `<h2>${esc(c.title)}</h2><p>${esc(c.text)}</p>`;
    } else {
      const t = id.slice(5);
      const u = LORE.units[t];
      body.innerHTML = `${artFor(t)}<h2>${esc(t.replace(/_/g, ' '))}</h2>
        <div class="cdx-epigraph">“${esc(u.epigraph)}”</div>
        <p>${esc(u.vignette)}</p>
        ${u.note ? `<div class="cdx-note">${esc(u.note)}</div>` : ''}`;
    }
    body.scrollTop = 0;
  }

  nav.innerHTML = entries.map(e =>
    `${e.section ? `<h3>${e.section}</h3>` : ''}
     <div class="cdx-item ${e.lean ? `cdx-lean-${e.lean}` : ''}" data-id="${e.id}">${e.label}</div>`).join('');
  nav.onclick = (ev) => { const it = ev.target.closest('.cdx-item'); if (it) show(it.dataset.id); };
  el.querySelector('#codexClose').onclick = () => el.classList.add('hidden');
  el.onclick = (ev) => { if (ev.target === el) el.classList.add('hidden'); };

  return {
    open() { el.classList.remove('hidden'); show('act0'); },
    close() { el.classList.add('hidden'); },
  };
}
