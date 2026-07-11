// Three.js board renderer — owns the scene, meshes, picking, and animation.
// Reads game state via syncBoard(); never mutates the game.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { CONFIG } from '../core/config.js';
import { neighborCoords } from '../core/board.js';

const R = 1;                       // hex circumradius (world units)
const SQRT3 = Math.sqrt(3);
const CELL_H = 0.22;               // board slab height
const TILE_H = 0.5;                // placed tile prism height
const CAPITAL_H = 0.85;

// Two-reality palette split
const COLORS = {
  board: 0x23262e,
  boardLine: 0x3a3f4c,
  rift: 0xc026d3,
  p1: 0x3fae6a,      // verdant
  p1Capital: 0xf2c14e,
  p2: 0x7c4dcc,      // umbral
  p2Capital: 0xe86a3a,
  ghost: 0xffffff,
  highlightPlace: 0x2e7d4f,
  highlightCapture: 0xb33939,
};

function worldPos(col, row) {
  const x = col * 1.5 * R;
  const z = (row + (col % 2) * 0.5) * SQRT3 * R;
  return { x, z };
}

function makeTextSprite(lines, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // big number
  ctx.font = `bold ${opts.numSize || 110}px Arial`;
  ctx.fillStyle = opts.numColor || '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 14;
  ctx.fillText(lines.num, 128, lines.label ? 108 : 128);
  if (lines.label) {
    ctx.font = 'bold 34px Arial';
    ctx.fillStyle = opts.labelColor || '#cfcfcf';
    ctx.fillText(lines.label, 128, 196);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.35, 1.35, 1);
  return sprite;
}

function hexGeometry(height) {
  const g = new THREE.CylinderGeometry(R * 0.96, R * 0.96, height, 6);
  g.rotateY(Math.PI / 2); // flat-top orientation to match the offset grid
  return g;
}

// Tile art on prism tops — lazy-loaded, cached per type, shared across meshes.
const _texLoader = new THREE.TextureLoader();
const _tileTex = new Map();
function tileTexture(name) {
  if (!_tileTex.has(name)) {
    const tex = _texLoader.load(`./assets/tiles/${name}.jpg`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    _tileTex.set(name, tex);
  }
  return _tileTex.get(name);
}

// Standing billboard sprites (PS1 cutout trick) — cached; callbacks fire when
// the alpha PNG is actually loaded so missing art degrades to no billboard.
const _spriteTex = new Map();
function spriteTexture(name, onReady) {
  let entry = _spriteTex.get(name);
  if (!entry) {
    entry = { tex: null, loaded: false, waiters: [] };
    _spriteTex.set(name, entry);
    entry.tex = _texLoader.load(
      `./assets/sprites/${name}_512.png`,
      () => { entry.loaded = true; entry.waiters.forEach(cb => cb(entry.tex)); entry.waiters = []; },
      undefined,
      () => { entry.waiters = []; } // 404 → billboard stays hidden
    );
    entry.tex.colorSpace = THREE.SRGBColorSpace;
  }
  if (entry.loaded) onReady(entry.tex);
  else entry.waiters.push(onReady);
  return entry.tex;
}

export class BoardRenderer {
  constructor(container, game) {
    this.game = game;
    this.container = container;
    this.onCellClick = null;
    this.onCellHover = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101218);
    this.scene.fog = new THREE.Fog(0x101218, 34, 80);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    // Camera: tilted view from P1's side, orbit + zoom.
    const center = this._boardCenter();
    this.center = center;
    this.camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 200);
    this.camDist = 17;
    this.camYaw = 0;
    this.camPitch = 0.95; // radians above horizon
    this._applyCamera();

    // Lights: cool ambient + warm key, subtle rift accent handled by emissive.
    this.scene.add(new THREE.AmbientLight(0x8890a8, 0.9));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.4);
    key.position.set(8, 14, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7c4dcc, 0.35);
    rim.position.set(-10, 6, -8);
    this.scene.add(rim);

    this.cellMeshes = [];     // [col][row] → board slab mesh
    this.tileMeshes = new Map(); // tile.id → group
    this.highlighted = [];    // cells currently highlighted
    this.ghost = null;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._clock = new THREE.Clock();
    this._riftMats = [];
    this._dropAnims = [];

    // Bloom postprocessing — the emissive rift, capturable pulses, and gold
    // capitals all pop through this. Cheap on a board this size.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this._bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight), 0.55, 0.5, 0.6);
    this.composer.addPass(this._bloom);
    this.composer.addPass(new OutputPass()); // restores sRGB/tonemap after bloom

    this._buildBackdrop();
    this._buildRiftMotes();
    this._buildBoard();
    this._bindEvents();
    this._animate();
  }

  // Arena environment dome (MTG-Arena/Hearthstone-style battlefield backdrop)
  _buildBackdrop() {
    const tex = _texLoader.load('../assets/backdrop.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; });
    const geo = new THREE.SphereGeometry(60, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, fog: false,
      color: 0x8890a0, // dimmed so the board stays the hero
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.position.set(this.center.x, -4, this.center.z);
    this.scene.add(dome);
  }

  // Drifting magenta motes above the rift seam (shader-free particle glow)
  _buildRiftMotes() {
    const positions = [];
    this._moteHomes = [];
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        if (!this.game.board[c][r].rift) continue;
        const { x, z } = worldPos(c, r);
        for (let i = 0; i < 5; i++) {
          const px = x + (Math.random() - 0.5) * 1.4;
          const pz = z + (Math.random() - 0.5) * 1.4;
          const py = 0.3 + Math.random() * 1.8;
          positions.push(px, py, pz);
          this._moteHomes.push({ x: px, y: py, z: pz, phase: Math.random() * Math.PI * 2 });
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xe879f9, size: 0.14, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._motes = new THREE.Points(geo, mat);
    this.scene.add(this._motes);
  }

  _boardCenter() {
    const a = worldPos(0, 0);
    const b = worldPos(CONFIG.GRID_W - 1, CONFIG.GRID_H - 1);
    return new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  }

  _applyCamera() {
    const { x, z } = this.center;
    const cx = x + this.camDist * Math.cos(this.camPitch) * Math.sin(this.camYaw);
    const cy = this.camDist * Math.sin(this.camPitch);
    const cz = z + this.camDist * Math.cos(this.camPitch) * Math.cos(this.camYaw);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.center.x, 0, this.center.z);
  }

  _buildBoard() {
    const slabGeo = hexGeometry(CELL_H);
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      this.cellMeshes[c] = [];
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const cell = this.game.board[c][r];
        let mat;
        if (cell.rift) {
          mat = new THREE.MeshStandardMaterial({
            color: 0x2a1030, emissive: COLORS.rift, emissiveIntensity: 0.55,
            roughness: 0.4, metalness: 0.1,
          });
          this._riftMats.push(mat);
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: COLORS.board, roughness: 0.9, metalness: 0.05,
          });
        }
        const mesh = new THREE.Mesh(slabGeo, mat);
        const { x, z } = worldPos(c, r);
        mesh.position.set(x, -CELL_H / 2, z);
        mesh.userData = { col: c, row: r, kind: 'cell', baseMat: mat };
        this.scene.add(mesh);
        this.cellMeshes[c][r] = mesh;

        // thin edge line for readability
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(slabGeo),
          new THREE.LineBasicMaterial({ color: COLORS.boardLine, transparent: true, opacity: 0.6 })
        );
        edge.position.copy(mesh.position);
        this.scene.add(edge);
      }
    }
  }

  _tileColor(tile) {
    if (tile.capital) return tile.owner === 1 ? COLORS.p1Capital : COLORS.p2Capital;
    return tile.owner === 1 ? COLORS.p1 : COLORS.p2;
  }

  _makeTileGroup(tile, col, row, depth = 0) {
    const group = new THREE.Group();
    const h = (tile.capital ? CAPITAL_H : TILE_H) + depth * 0.34; // stacks rise
    const geo = hexGeometry(h);
    const mat = new THREE.MeshStandardMaterial({
      color: this._tileColor(tile),
      roughness: 0.55,
      metalness: tile.capital ? 0.45 : 0.15,
      emissive: this._tileColor(tile),
      emissiveIntensity: 0.08,
    });
    // Cylinder material groups: [side, top cap, bottom cap]. Art rides the top;
    // the side keeps the owner color (and the capturable pulse). Before the
    // texture loads (or if missing) the top renders as plain owner color.
    const texName = tile.capital
      ? (tile.owner === 1 ? 'CAPITAL_VERDANT' : 'CAPITAL_UMBRAL')
      : tile.type;
    const topMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tileTexture(texName),
      roughness: 0.8,
      metalness: 0.05,
    });
    const prism = new THREE.Mesh(geo, [mat, topMat, mat]);
    prism.position.y = h / 2;
    prism.userData = { col, row, kind: 'cell' }; // picking maps back to the cell
    group.add(prism);

    if (tile.capital) {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.55, 6),
        new THREE.MeshStandardMaterial({ color: 0xffe08a, metalness: 0.7, roughness: 0.3, emissive: 0xffd700, emissiveIntensity: 0.25 })
      );
      crown.position.y = h + 0.32;
      crown.userData = { col, row, kind: 'cell' }; // crown clicks pick the capital's cell
      group.add(crown);
    }

    // Standing billboard (the PS1 sprite trick): subject rises from the tile,
    // always facing the camera, gently bobbing.
    const bbName = tile.capital ? (tile.owner === 1 ? 'CAPITAL_VERDANT' : 'CAPITAL_UMBRAL') : tile.type;
    const bb = new THREE.Sprite(new THREE.SpriteMaterial({
      transparent: true, depthWrite: false, opacity: 0.98,
    }));
    bb.center.set(0.5, 0.06); // anchored near its feet
    bb.scale.set(0.001, 0.001, 1);
    bb.position.y = h - 0.02;
    bb.visible = false;
    spriteTexture(bbName, (tex) => {
      bb.material.map = tex;
      bb.material.needsUpdate = true;
      const s = tile.capital ? 2.4 : 1.85;
      bb.scale.set(s, s, 1);
      bb.visible = true;
    });
    group.add(bb);

    const sprite = makeTextSprite({ num: '', label: '' });
    sprite.position.y = h + (tile.capital ? 2.5 : 2.0);
    group.add(sprite);
    group.userData = {
      tileId: tile.id, sprite, prism, mat, baseH: h,
      baseColor: this._tileColor(tile),
      billboard: bb, bobPhase: (tile.id * 1.7) % (Math.PI * 2), bobBase: h - 0.02,
    };

    const { x, z } = worldPos(col, row);
    group.position.set(x, 0, z);
    return group;
  }

  _updateTileSprite(group, tile, col, row) {
    const rel = this.game.relativeInfluence(col, row);
    const capturable = rel === 0;
    // Only rebuild the canvas texture when the displayed value changed —
    // syncBoard runs for every tile after every move.
    const key = `${rel}|${capturable}`;
    if (group.userData.spriteKey === key) {
      group.userData.capturable = capturable;
      return;
    }
    group.userData.spriteKey = key;
    const fresh = makeTextSprite(
      { num: String(rel), label: tile.capital ? '♛ CAPITAL' : tile.type },
      { numColor: capturable ? '#ff5555' : '#ffffff' }
    );
    fresh.position.copy(group.userData.sprite.position);
    group.remove(group.userData.sprite);
    group.userData.sprite.material.map.dispose();
    group.userData.sprite.material.dispose();
    group.add(fresh);
    group.userData.sprite = fresh;
    // capturable tiles pulse dark
    group.userData.capturable = capturable;
  }

  // Dispose every GPU resource under a group (geometry, materials, textures).
  // Shared tile-art textures (tileTexture cache) are NOT disposed — they
  // outlive individual meshes by design.
  _disposeGroup(group) {
    const shared = new Set(_tileTex.values());
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      for (const m of new Set(mats)) {
        if (m.map && !shared.has(m.map)) m.map.dispose(); // per-mesh canvas sprites only
        m.dispose();
      }
    });
  }

  // Rebuild/diff tile meshes from game state. New tiles drop in.
  syncBoard() {
    const seen = new Set();
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const cell = this.game.board[c][r];
        const tile = cell.tile;
        if (!tile) continue;
        seen.add(tile.id);
        let group = this.tileMeshes.get(tile.id);
        if (!group) {
          group = this._makeTileGroup(tile, c, r, cell.stack.length);
          this.scene.add(group);
          this.tileMeshes.set(tile.id, group);
          // drop-in animation (skipped when tab hidden — rAF is suspended there)
          if (!document.hidden) {
            group.position.y = 3;
            this._dropAnims.push({ group, start: performance.now() });
          }
        }
        this._updateTileSprite(group, tile, c, r);
      }
    }
    // Ruins: scarred ground darkens toward ember-brown as bodies pile up.
    const RUIN_COLORS = [0x23262e, 0x2d211d, 0x3a2419, 0x452718];
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const cell = this.game.board[c][r];
        if (cell.rift) continue;
        const mesh = this.cellMeshes[c][r];
        mesh.userData.baseMat.color.setHex(RUIN_COLORS[Math.min(cell.ruins, 3)]);
      }
    }
    for (const [id, group] of this.tileMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(group);
        this._disposeGroup(group); // captures happen constantly — never leak the dead tile
        this.tileMeshes.delete(id);
      }
    }
  }

  // cells: [{col,row,kind}] kind 'place' | 'capture'
  setHighlights(cells) {
    this.clearHighlights();
    for (const { col, row, kind } of cells) {
      const mesh = this.cellMeshes[col][row];
      mesh.material = mesh.material.clone();
      mesh.material.emissive = new THREE.Color(kind === 'capture' ? COLORS.highlightCapture : COLORS.highlightPlace);
      mesh.material.emissiveIntensity = 0.85;
      this.highlighted.push({ mesh, col, row });
    }
  }

  clearHighlights() {
    for (const { mesh } of this.highlighted) {
      mesh.material.dispose();
      mesh.material = mesh.userData.baseMat;
    }
    this.highlighted = [];
  }

  showGhost(col, row, projectedInfluence) {
    // Hover fires this every pointermove — skip rebuild when nothing changed.
    if (this.ghost && this.ghost.col === col && this.ghost.row === row &&
        this.ghost.influence === projectedInfluence) return;
    this.clearGhost();
    const geo = hexGeometry(TILE_H);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.ghost, transparent: true, opacity: 0.35, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const { x, z } = worldPos(col, row);
    mesh.position.set(x, TILE_H / 2, z);
    const sprite = makeTextSprite({ num: String(projectedInfluence) }, {
      numColor: projectedInfluence === 0 ? '#ff5555' : '#a5ffbf',
    });
    sprite.position.set(x, TILE_H + 1.0, z);
    this.scene.add(mesh);
    this.scene.add(sprite);
    this.ghost = { mesh, sprite, col, row, influence: projectedInfluence };
  }

  clearGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.mesh);
    this.scene.remove(this.ghost.sprite);
    this.ghost.mesh.geometry.dispose();
    this.ghost.mesh.material.dispose();
    this.ghost.sprite.material.map.dispose();
    this.ghost.sprite.material.dispose();
    this.ghost = null;
  }

  _pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const targets = [];
    for (const col of this.cellMeshes) for (const m of col) targets.push(m);
    for (const g of this.tileMeshes.values()) {
      for (const child of g.children) {
        if (child.isMesh && child.userData.kind === 'cell') targets.push(child);
      }
    }
    const hits = this._raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    const u = hits[0].object.userData;
    return { col: u.col, row: u.row };
  }

  _bindEvents() {
    const el = this.renderer.domElement;
    let dragging = false, moved = false, lastX = 0, lastY = 0;

    el.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
    });
    el.addEventListener('pointermove', (e) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (moved) {
          this.camYaw -= dx * 0.005;
          this.camPitch = Math.min(1.45, Math.max(0.35, this.camPitch + dy * 0.004));
          this._applyCamera();
          lastX = e.clientX; lastY = e.clientY;
        }
      } else if (this.onCellHover) {
        this.onCellHover(this._pick(e));
      }
    });
    el.addEventListener('pointerup', (e) => {
      dragging = false;
      if (!moved && this.onCellClick) {
        const hit = this._pick(e);
        if (hit) this.onCellClick(hit);
      }
    });
    el.addEventListener('pointerleave', () => { dragging = false; });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDist = Math.min(34, Math.max(8, this.camDist + e.deltaY * 0.02));
      this._applyCamera();
    }, { passive: false });

    window.addEventListener('resize', () => {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    });
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const t = this._clock.getElapsedTime();
    // rift glitch pulse
    const pulse = 0.45 + 0.3 * Math.sin(t * 2.4) + 0.08 * Math.sin(t * 13.7);
    for (const m of this._riftMats) m.emissiveIntensity = pulse;
    // capturable tiles breathe red; everything else back to its base glow
    for (const g of this.tileMeshes.values()) {
      if (g.userData.capturable) {
        g.userData.mat.emissive.setHex(0xff2222);
        g.userData.mat.emissiveIntensity = 0.25 + 0.2 * Math.sin(t * 5);
      } else if (g.userData.mat.emissiveIntensity !== 0.08) {
        g.userData.mat.emissive.setHex(g.userData.baseColor);
        g.userData.mat.emissiveIntensity = 0.08;
      }
    }
    // drop-in animations (time-based so frame rate never changes duration)
    const now = performance.now();
    for (const anim of this._dropAnims) {
      const p = Math.min(1, (now - anim.start) / 280);
      const e = 1 - Math.pow(1 - p, 3);
      anim.group.position.y = 3 * (1 - e);
      anim.done = p >= 1;
    }
    this._dropAnims = this._dropAnims.filter(a => !a.done);
    // billboards idle-bob (the "alive" read)
    for (const g of this.tileMeshes.values()) {
      const u = g.userData;
      if (u.billboard?.visible) {
        u.billboard.position.y = u.bobBase + 0.05 * Math.sin(t * 1.6 + u.bobPhase);
      }
    }
    // rift motes drift
    if (this._motes) {
      const pos = this._motes.geometry.attributes.position;
      for (let i = 0; i < this._moteHomes.length; i++) {
        const m = this._moteHomes[i];
        pos.setY(i, m.y + 0.25 * Math.sin(t * 0.9 + m.phase));
        pos.setX(i, m.x + 0.08 * Math.sin(t * 0.6 + m.phase * 2));
      }
      pos.needsUpdate = true;
    }
    this.composer.render();
  }
}
