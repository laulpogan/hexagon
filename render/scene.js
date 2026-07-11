// Three.js board renderer — owns the scene, meshes, picking, and animation.
// Reads game state via syncBoard(); never mutates the game (V3 preview is the
// one exception — it mutates a throwaway Game.clone(), never the live game).
import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '../core/config.js';
import { neighborCoords, hexDistance, riftNeighborCount } from '../core/board.js';

const R = 1;                       // hex circumradius (world units)
const SQRT3 = Math.sqrt(3);
const CELL_H = 0.22;               // board slab height
const TILE_H = 0.5;                // placed tile prism height (the live top face)
const CAPITAL_H = 0.85;
const TIER_SLICE_H = 0.34;         // V1: buried war-strata tier thickness

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

// Linear-interpolate two 0xRRGGBB hex ints — used for war-strata tinting and
// the riftlight owner/magenta blend (V5).
function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// Deterministic [0,1) hash of a cell coord + salt — V6 rubble scatter uses
// this instead of Math.random() so the same cell always scatters the same
// way (no per-frame/per-load flicker, no core/game.js RNG dependency).
function hashCoord(col, row, salt) {
  let h = (col * 374761393 + row * 668265263 + salt * 2246822519 + 12345) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function makeTextSprite(lines, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.ring) {
    // badge chip: dark disc + owner ring — HUD chrome, not debug text
    ctx.beginPath();
    ctx.arc(128, 96, 58, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,12,18,0.88)';
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = opts.ring;
    ctx.stroke();
    ctx.font = 'bold 72px Arial';
    ctx.fillStyle = opts.numColor || '#ffffff';
    ctx.fillText(lines.num, 128, 98);
    if (lines.label) {
      const w = Math.min(236, ctx.measureText(lines.label).width * 0.42 + 40);
      ctx.fillStyle = 'rgba(10,12,18,0.82)';
      ctx.beginPath();
      ctx.roundRect(128 - w / 2, 176, w, 40, 12);
      ctx.fill();
      ctx.font = 'bold 26px Arial';
      ctx.fillStyle = opts.labelColor || '#dfe5f0';
      ctx.fillText(lines.label, 128, 197);
    }
  } else {
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
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.15, 1.15, 1);
  return sprite;
}

// Small floating +N/-N chip — V3 placement-preview deltas.
function makeDeltaSprite(delta) {
  const canvas = document.createElement('canvas');
  canvas.width = 180; canvas.height = 100;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const positive = delta > 0;
  ctx.font = 'bold 68px Arial';
  ctx.fillStyle = positive ? '#5cf27a' : '#ff5f5f';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 10;
  ctx.fillText(`${positive ? '+' : ''}${delta}`, 90, 54);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.95, 0.53, 1);
  return sprite;
}

// Shared radial-gradient disc for contact shadows + owner/riftlight glow rings.
let _discTex = null;
function discTexture() {
  if (_discTex) return _discTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _discTex = new THREE.CanvasTexture(c);
  return _discTex;
}

// Final grade: gentle vignette + split-tone (violet lift in shadows, faint
// warmth in highlights) — unifies the AI-generated tile art under one light.
// Runs before OutputPass so it grades ahead of tonemapping. Deliberately
// subtle: the influence badges must stay dead readable.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    gradeStrength: { value: 0.7 },  // 0 = off, 1 = full split-tone
    vignette: { value: 0.26 },      // corner darkening amount
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float gradeStrength;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 graded = col + vec3(0.030, 0.018, 0.060) * (1.0 - smoothstep(0.0, 0.5, luma));
      graded *= mix(vec3(1.0), vec3(1.035, 1.0, 0.955), smoothstep(0.5, 1.0, luma));
      col = mix(col, graded, gradeStrength);
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - vignette * smoothstep(0.38, 0.75, d);
      gl_FragColor = vec4(col, tex.a);
    }`,
};

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

// V6/V7: optional environment manifest (assets/models/env/manifest.json).
// Feature-detected — if the file 404s, every consumer below falls back to
// primitive geometry. Fetched once at module load, shared across renderer
// instances (a fresh game doesn't need to refetch it).
let _envManifestPromise = null;
function loadEnvManifest() {
  if (!_envManifestPromise) {
    _envManifestPromise = fetch('./assets/models/env/manifest.json')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return _envManifestPromise;
}
const _gltfLoader = new GLTFLoader();
const _gltfCache = new Map(); // path -> Promise<THREE.Object3D|null>
function loadGLTFModel(path) {
  if (!_gltfCache.has(path)) {
    _gltfCache.set(path, new Promise((resolve) => {
      _gltfLoader.load(path, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    }));
  }
  return _gltfCache.get(path);
}

export class BoardRenderer {
  constructor(container, game) {
    this.game = game;
    this.container = container;
    this.onCellClick = null;
    this.onCellHover = null;
    this.onWow = null; // V8 hookup spec: (kind) => void, fired on first-blood / multi-flip captures — shell wires a chime

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
    this.camDist = 19;
    this.camYaw = 0;
    this.camPitch = 0.82; // radians above horizon — low enough to see the world
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
    this._flashAnims = [];   // capture hit-flash on materials
    this._impactAnims = [];  // landing squash + shockwave rings
    this._popAnims = [];     // badge-number punch-in
    this._burstAnims = [];   // radial mote sprays on landing/capture
    this._cascadeAnims = []; // V4: distance-staggered badge ticks
    this._camKick = new THREE.Vector3();
    this._cellOwners = new Map(); // "c,r" → tileId|null from last sync (capture detection)
    this._lastOrigin = null;      // V4: cell of the most recent placement (cascade epicenter)
    this._flipCount = 0;          // V8: badges that flipped capturable=false→true this sync
    this._pendingWowFlips = 0;
    this._firstBloodFired = false;
    this._stirsWasActive = false; // V5: edge-trigger for THE RIFT STIRS eruption

    // V3 placement preview state
    this._previewTile = null;
    this._previewKey = null;
    this._previewChips = [];
    this._previewRings = [];
    this._previewResultSprite = null;
    this._lastHoverHit = null;

    // V6 rubble props + tall-tower embers
    this._rubbleGroups = new Map();
    this._towerEmbers = new Map();
    this._envManifest = null;
    loadEnvManifest().then((m) => { this._envManifest = m; });

    // Bloom postprocessing — the emissive rift, capturable pulses, and gold
    // capitals all pop through this. Cheap on a board this size.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this._bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight), 0.55, 0.5, 0.6);
    this.composer.addPass(this._bloom);
    this._grade = new ShaderPass(GradeShader);
    this.composer.addPass(this._grade);
    this.composer.addPass(new OutputPass()); // restores sRGB/tonemap after bloom

    this._buildBackdrop();
    this._buildRiftMotes();
    this._buildBoard();
    this._bindEvents();
    this._animate();
  }

  // Arena environment backdrop: a distant dome for far atmosphere, plus (V7)
  // a nearer close-up band using the crashed-worlds plate so the board reads
  // as the crack between two colliding realities, not a diorama on a shelf.
  _buildBackdrop() {
    const tex = _texLoader.load('./assets/backdrop.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; });
    const geo = new THREE.SphereGeometry(58, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.8);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, fog: false,
      color: 0xd0d4dc, // visible world — the board vignettes against it via fog
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.position.set(this.center.x, -6, this.center.z);
    this.scene.add(dome);

    // V7: close-up band (directive #6b — "two worlds really crashing
    // together"). Nearer + larger than the dome, curved partial cylinder
    // hugging the board's default viewing arc; verdant/umbral/rift plate.
    const closeTex = _texLoader.load('./assets/backdrop_close.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; });
    const bandGeo = new THREE.CylinderGeometry(32, 32, 26, 48, 1, true, -Math.PI * 0.78, Math.PI * 1.56);
    const bandMat = new THREE.MeshBasicMaterial({
      map: closeTex, side: THREE.BackSide, fog: true, transparent: true, opacity: 0.94,
    });
    this._closeBand = new THREE.Mesh(bandGeo, bandMat);
    this._closeBand.position.set(this.center.x, 5, this.center.z);
    this.scene.add(this._closeBand);
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
    this._moteBaseSize = 0.14;
    this._moteBaseOpacity = 0.85;
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
    // V7: subtle parallax — the close band drifts opposite the orbit so it
    // reads as depth, not a decal stuck to the camera.
    if (this._closeBand) this._closeBand.rotation.y = -this.camYaw * 0.15;
  }

  _buildBoard() {
    const slabGeo = hexGeometry(CELL_H);
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      this.cellMeshes[c] = [];
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const cell = this.game.board[c][r];
        let mat;
        if (cell.rift) {
          // dark fill, magenta lives on the RIM — dread, not candy
          mat = new THREE.MeshStandardMaterial({
            color: 0x160a1e, emissive: COLORS.rift, emissiveIntensity: 0.14,
            roughness: 0.45, metalness: 0.15,
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

        // thin edge line for readability; rift rims burn magenta
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(slabGeo),
          new THREE.LineBasicMaterial({
            color: cell.rift ? COLORS.rift : COLORS.boardLine,
            transparent: true, opacity: cell.rift ? 0.95 : 0.6,
          })
        );
        edge.position.copy(mesh.position);
        if (cell.rift) this._riftEdges = (this._riftEdges || []).concat(edge.material);
        this.scene.add(edge);
      }
    }
  }

  _tileColor(tile) {
    if (tile.capital) return tile.owner === 1 ? COLORS.p1Capital : COLORS.p2Capital;
    return tile.owner === 1 ? COLORS.p1 : COLORS.p2;
  }

  // R1/V1: cell.stack holds every buried tile bottom→top (capture-caps-stack,
  // no liberation — see core/game.js). Each tier renders as a thin prism
  // slice tinted by ITS OWNER (dormant war strata); the live top tile rides
  // above them at full height with its art on top. group.userData.baseH is
  // the resulting TOTAL top-surface height — everything anchored "above the
  // tile" (badge, billboard, shadow, glow) keys off it, so height (V2) and
  // capture-cap towers (V1) come free from one source of truth.
  _makeTileGroup(tile, col, row) {
    const group = new THREE.Group();
    const cell = this.game.board[col][row];
    const stackTiers = cell.stack;
    const stackH = stackTiers.length * TIER_SLICE_H;
    const topH = tile.capital ? CAPITAL_H : TILE_H;
    const h = stackH + topH;

    const tierMeshes = [];
    stackTiers.forEach((buried, i) => {
      const tierMat = new THREE.MeshStandardMaterial({
        color: mixHex(buried.owner === 1 ? COLORS.p1 : COLORS.p2, 0x0a0a0e, 0.45),
        roughness: 0.95, metalness: 0.05,
      });
      const tierMesh = new THREE.Mesh(hexGeometry(TIER_SLICE_H), tierMat);
      tierMesh.position.y = i * TIER_SLICE_H + TIER_SLICE_H / 2;
      tierMesh.userData = { col, row, kind: 'cell' };
      group.add(tierMesh);
      tierMeshes.push(tierMesh);
    });

    const geo = hexGeometry(topH);
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
    prism.position.y = stackH + topH / 2; // rests atop any buried tiers
    prism.userData = { col, row, kind: 'cell' }; // picking maps back to the cell
    group.add(prism);

    // (crown cone retired — the citadel billboard IS the capital's identity)

    // Ground contact: dark shadow disc + owner-colored glow ring under the
    // billboard — kills the "pasted-on cutout" read and doubles as the
    // side-identity color you can see from across the room.
    const ownerHex = tile.owner === 1 ? COLORS.p1 : COLORS.p2;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 24),
      new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, opacity: 0.55, color: 0x000000, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = h + 0.012;
    group.add(shadow);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 24),
      new THREE.MeshBasicMaterial({
        map: discTexture(), transparent: true, opacity: 0.5, color: ownerHex,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = h + 0.006;
    group.add(glow);

    // V5: riftlight underglow — a ground-hugging owner/magenta blended aura
    // on every rift-or-rift-adjacent cell a player holds (the +2 victory
    // stake, made visible). Separate from the owner glow above so both reads
    // stay legible at once.
    const riftAdjacent = cell.rift || riftNeighborCount(this.game.board, col, row) > 0;
    let riftGlow = null;
    if (riftAdjacent) {
      riftGlow = new THREE.Mesh(
        new THREE.CircleGeometry(1.3, 24),
        new THREE.MeshBasicMaterial({
          map: discTexture(), transparent: true, opacity: 0.32,
          color: mixHex(ownerHex, COLORS.rift, 0.45),
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      riftGlow.rotation.x = -Math.PI / 2;
      riftGlow.position.y = 0.03;
      group.add(riftGlow);
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
    // Faint owner-tinted halo behind the billboard — reads the unit's realm
    // against the backdrop without recoloring the art itself.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: discTexture(), color: ownerHex, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.renderOrder = -1; // always draws behind the billboard
    halo.visible = false;
    group.add(halo);
    spriteTexture(bbName, (tex) => {
      bb.material.map = tex;
      bb.material.needsUpdate = true;
      const s = tile.capital ? 2.4 : 1.85;
      bb.scale.set(s, s, 1);
      bb.visible = true;
      halo.scale.set(s * 1.25, s * 1.25, 1);
      // lift rides the halo itself — this callback can fire before (async
      // load) or after (cache hit) group.userData is assigned
      halo.userData.lift = s * 0.42; // halo centers on the subject's body
      halo.position.y = bb.position.y + halo.userData.lift;
      halo.visible = true;
    });
    group.add(bb);

    const sprite = makeTextSprite({ num: '', label: '' });
    sprite.position.y = h + (tile.capital ? 2.5 : 2.0);
    group.add(sprite);
    group.userData = {
      tileId: tile.id, sprite, prism, mat, baseH: h, tierMeshes,
      stackHeight: stackTiers.length + 1, // R1 cell height — tall-tower ember idle keys off this
      baseColor: this._tileColor(tile),
      billboard: bb, halo, bobPhase: (tile.id * 1.7) % (Math.PI * 2), bobBase: h - 0.02,
      riftAdjacent, riftGlow,
    };

    const { x, z } = worldPos(col, row);
    group.position.set(x, 0, z);
    return group;
  }

  // Repaints a badge's canvas texture to a specific displayed value — split
  // out of _updateTileSprite so V4's cascade can tick through intermediate
  // numbers before settling on the true relativeInfluence().
  _paintBadge(group, tile, displayVal, capturable) {
    let ringColor = capturable ? '#ff5555' : tile.owner === 1 ? '#3fae6a' : '#8a5ce0';
    // V5: riftlight-held cells get a magenta-shifted ring (badge-level echo
    // of the ground underglow) — skipped while the capturable red overrides.
    if (!capturable && group.userData.riftAdjacent) {
      ringColor = tile.owner === 1 ? '#7fd9c9' : '#c07de0';
    }
    const fresh = makeTextSprite(
      { num: String(displayVal), label: tile.capital ? '♛ CAPITAL' : tile.type.replace(/_/g, ' ') },
      { numColor: capturable ? '#ff7777' : '#ffffff', ring: ringColor }
    );
    fresh.position.copy(group.userData.sprite.position);
    group.remove(group.userData.sprite);
    group.userData.sprite.material.map.dispose();
    group.userData.sprite.material.dispose();
    group.add(fresh);
    group.userData.sprite = fresh;
    // punch-in when the number changes (the most-read pixel on screen)
    if (!document.hidden) {
      fresh.scale.set(1.9, 1.9, 1);
      this._popAnims.push({ sprite: fresh, start: performance.now() });
    }
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
    const prevRel = group.userData.rel;
    const wasCapturable = group.userData.capturable;
    group.userData.spriteKey = key;
    group.userData.rel = rel;
    group.userData.capturable = capturable;
    if (capturable && !wasCapturable) this._flipCount++;
    if (prevRel === undefined || document.hidden) {
      // first paint (tile just appeared) or tab hidden: no cascade, direct.
      this._paintBadge(group, tile, rel, capturable);
      return;
    }
    // V4: resolution cascade — stagger the tick by hex distance from this
    // action's origin cell (~60ms/ring), running number ticks toward `rel`.
    const dist = this._lastOrigin ? hexDistance(this._lastOrigin.col, this._lastOrigin.row, col, row) : 0;
    this._cascadeAnims.push({
      group, tile, fromVal: prevRel, toVal: rel, capturable,
      startAt: performance.now() + dist * 60, started: false, start: 0, lastPainted: prevRel,
    });
  }

  // Dispose every GPU resource under a group (geometry, materials, textures).
  // Shared tile-art textures (tileTexture cache) are NOT disposed — they
  // outlive individual meshes by design. GLTF template clones (V6) share
  // their source geometry/material and are also never disposed here.
  _disposeGroup(group) {
    const shared = new Set(_tileTex.values());
    if (_discTex) shared.add(_discTex); // shadow/glow/halo discs all share it
    group.traverse((obj) => {
      if (obj.userData.sharedAsset) return;
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      for (const m of new Set(mats)) {
        if (m.map && !shared.has(m.map)) m.map.dispose(); // per-mesh canvas sprites only
        m.dispose();
      }
    });
  }

  // Short-lived radial mote spray at a landing cell — same additive-disc look
  // as the rift motes. Geometry/material die with the burst; the disc texture
  // is shared and survives.
  _spawnBurst(x, z, y, colorHex, count, speed) {
    const positions = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const out = (0.4 + Math.random() * 0.6) * speed;
      vels.push({ x: Math.cos(a) * out, y: 0.8 + Math.random() * 1.6, z: Math.sin(a) * out });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: colorHex, size: 0.17, map: discTexture(), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this._burstAnims.push({ pts, vels, ox: x, oy: y, oz: z, start: performance.now() });
  }

  // V6: deterministic dark faceted shard scatter on cells that have taken a
  // capture (cell.rubble > 0). Rebuilds (rare — only on new captures) when
  // the tier bucket changes. Uses assets/models/env/manifest.json's `rubble`
  // GLB list if present (feature-detected, media may deliver it mid-session
  // — but props already scattered this session stay as-built); otherwise
  // falls back to primitive shards, tinted per-shard via a coord hash.
  _buildRubbleShards(col, row, count) {
    const group = new THREE.Group();
    // Accept both manifest shapes: the PATCH_NOTES contract {rubble:[files]}
    // and the shipped media manifest {props:[{file, kind, ...}]}.
    const manifestRubble = this._envManifest?.rubble
      || this._envManifest?.props?.filter((p) => p.kind === 'rubble').map((p) => p.file);
    for (let i = 0; i < count; i++) {
      const hx = hashCoord(col, row, i * 7 + 1), hy = hashCoord(col, row, i * 7 + 2),
            hz = hashCoord(col, row, i * 7 + 3), hs = hashCoord(col, row, i * 7 + 4),
            hrot = hashCoord(col, row, i * 7 + 5);
      const angle = hx * Math.PI * 2, dist = 0.55 + hy * 0.35, scale = 0.75 + hs * 0.7;
      if (manifestRubble && manifestRubble.length) {
        const pick = manifestRubble[Math.floor(hx * manifestRubble.length) % manifestRubble.length];
        loadGLTFModel(`./assets/models/env/${pick}`).then((tmpl) => {
          if (!tmpl || !group.parent) return; // group disposed before the GLB resolved
          const inst = tmpl.clone();
          inst.traverse((o) => { o.userData.sharedAsset = true; });
          inst.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
          inst.rotation.y = hrot * Math.PI * 2;
          inst.scale.setScalar(0.4 * scale);
          group.add(inst);
        });
      } else {
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.09 * scale, 0.22 * scale, 5),
          new THREE.MeshStandardMaterial({
            color: mixHex(0x2a1f1c, 0x4a3226, hz), roughness: 1, metalness: 0.05, flatShading: true,
          })
        );
        mesh.position.set(Math.cos(angle) * dist, 0.11 * scale, Math.sin(angle) * dist);
        mesh.rotation.set(hrot * Math.PI, hz * Math.PI * 2, hy * Math.PI);
        group.add(mesh);
      }
    }
    const { x, z } = worldPos(col, row);
    group.position.set(x, CELL_H, z);
    return group;
  }

  _syncRubble() {
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const cell = this.game.board[c][r];
        const key = `${c},${r}`;
        const existing = this._rubbleGroups.get(key);
        if (!cell.rubble || cell.rubble <= 0) {
          if (existing) {
            this.scene.remove(existing);
            this._disposeGroup(existing);
            this._rubbleGroups.delete(key);
          }
          continue;
        }
        const bucket = Math.min(3, cell.rubble); // 1-3 instances, per spec
        if (existing && existing.userData.bucket === bucket) continue;
        if (existing) { this.scene.remove(existing); this._disposeGroup(existing); }
        const group = this._buildRubbleShards(c, r, bucket);
        group.userData.bucket = bucket;
        this.scene.add(group);
        this._rubbleGroups.set(key, group);
      }
    }
  }

  // V1: tall stacks (height ≥ HEIGHT_CRUSH_CAP-1, i.e. 4-5) get a subtle
  // ambient dust/ember idle — a small looping point-sprite ring per tower.
  _syncTowerEmbers() {
    const tallFrom = CONFIG.HEIGHT_CRUSH_CAP - 1;
    const activeIds = new Set();
    for (const [id, group] of this.tileMeshes) {
      if (group.userData.stackHeight >= tallFrom) {
        activeIds.add(id);
        if (!this._towerEmbers.has(id)) this._towerEmbers.set(id, this._buildTowerEmber(group));
      }
    }
    for (const [id, emberSys] of this._towerEmbers) {
      if (!activeIds.has(id)) {
        this.scene.remove(emberSys.pts);
        emberSys.pts.geometry.dispose();
        emberSys.pts.material.dispose();
        this._towerEmbers.delete(id);
      }
    }
  }

  _buildTowerEmber(group) {
    const count = 8;
    const positions = new Float32Array(count * 3);
    const homes = [];
    const h = group.userData.baseH;
    for (let i = 0; i < count; i++) {
      homes.push({ a: (i / count) * Math.PI * 2, r: 0.5 + (i % 3) * 0.15, y0: h * 0.25 + (i % 4) * (h * 0.15), phase: i * 0.7 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff9a4d, size: 0.1, map: discTexture(), transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    return { pts, homes, group };
  }

  // V5: seam eruption — fires once on the active-window's leading edge (the
  // ply THE RIFT STIRS actually hits, per core/mechanics.js riftStirsState).
  // White-hot flash + a magenta shockwave rolling column-by-column down the
  // seam, plus a temporary mote-storm doubling.
  _triggerRiftEruption() {
    const riftCells = [];
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        if (this.game.board[c][r].rift) riftCells.push([c, r]);
      }
    }
    riftCells.sort((a, b) => a[0] - b[0]);
    riftCells.forEach(([c, r], i) => {
      setTimeout(() => {
        const { x, z } = worldPos(c, r);
        this._spawnBurst(x, z, 0.6, 0xffffff, 20, 2.2);
        this._spawnBurst(x, z, 0.4, COLORS.rift, 24, 3.2);
      }, i * 90);
    });
    if (this._motes) {
      this._motes.material.size = this._moteBaseSize * 1.8;
      this._motes.material.opacity = Math.min(1, this._moteBaseOpacity * 1.3);
      clearTimeout(this._moteStormTimer);
      this._moteStormTimer = setTimeout(() => {
        if (this._motes) {
          this._motes.material.size = this._moteBaseSize;
          this._motes.material.opacity = this._moteBaseOpacity;
        }
      }, 4000);
    }
  }

  _cellTopY(col, row) {
    const t = this.game.board[col][row].tile;
    if (!t) return 0;
    const g = this.tileMeshes.get(t.id);
    return g ? g.userData.baseH : 0;
  }

  // Rebuild/diff tile meshes from game state. New tiles drop in.
  syncBoard() {
    const seen = new Set();
    this._flipCount = 0;
    const toUpdate = [];
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const cell = this.game.board[c][r];
        const tile = cell.tile;
        if (!tile) continue;
        seen.add(tile.id);
        let group = this.tileMeshes.get(tile.id);
        if (!group) {
          group = this._makeTileGroup(tile, c, r);
          this.scene.add(group);
          this.tileMeshes.set(tile.id, group);
          this._lastOrigin = { col: c, row: r }; // V4 cascade epicenter
          // drop-in animation (skipped when tab hidden — rAF is suspended there)
          if (!document.hidden) {
            // V1: only the TOP prism falls — buried tiers/badge/billboard/
            // shadow are already correct at their resting position, so a
            // recapture doesn't visually re-drop the tiers underneath it.
            const prism = group.userData.prism;
            const restY = prism.position.y;
            const dropH = 3.2 + Math.min(2, cell.stack.length) * 0.3; // taller stacks: slightly higher slam
            prism.position.y = restY + dropH;
            const prevId = this._cellOwners.get(`${c},${r}`);
            const captured = prevId !== undefined && prevId !== null && prevId !== tile.id;
            this._dropAnims.push({ group, prism, restY, dropH, start: performance.now(), captured, owner: tile.owner });
            if (captured) {
              this._flashAnims.push({ mat: group.userData.mat, base: group.userData.baseColor, start: performance.now() });
              this._camKick.set((Math.random() - 0.5), 0.4, (Math.random() - 0.5)).multiplyScalar(0.45);
            }
          }
        }
        this._cellOwners.set(`${c},${r}`, tile.id);
        toUpdate.push({ group, tile, c, r });
      }
    }
    // Cells that emptied (sunder-to-rubble) clear their owner record.
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        if (!this.game.board[c][r].tile) this._cellOwners.set(`${c},${r}`, null);
      }
    }
    // R7: ruins decay is gone — cell.rubble (render-only) is what remains.
    // Battle scars darken the ground slab toward ember-brown as it accumulates.
    const RUIN_COLORS = [0x23262e, 0x2d211d, 0x3a2419, 0x452718];
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const cell = this.game.board[c][r];
        if (cell.rift) continue;
        const mesh = this.cellMeshes[c][r];
        mesh.userData.baseMat.color.setHex(RUIN_COLORS[Math.min(cell.rubble || 0, 3)]);
      }
    }
    // Sprite updates run AFTER every group this pass has been created, so
    // _lastOrigin is settled before any cascade-distance math uses it.
    for (const u of toUpdate) this._updateTileSprite(u.group, u.tile, u.c, u.r);
    this._pendingWowFlips = this._flipCount >= 2 ? this._flipCount : 0;
    this._syncRubble();
    this._syncTowerEmbers();
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

  // ─── V3: placement preview ────────────────────────────────────────────
  // main.js hands us the currently-selected hand tile (or null on deselect).
  // Feature-detected: if nothing ever calls this, _previewTile stays null
  // and _updatePreview is a no-op every hover, so the renderer works exactly
  // as before the hookup lands.
  setPreviewTile(tile) {
    this._previewTile = tile || null;
    this._previewKey = null; // force recompute even if the cell didn't change
    this._clearPreview();
    // re-render immediately against the last known hover cell — otherwise
    // the preview would wait for the next mousemove to catch up.
    this._updatePreview(this._lastHoverHit);
  }

  _clearPreview() {
    for (const chip of this._previewChips) {
      this.scene.remove(chip);
      chip.material.map.dispose();
      chip.material.dispose();
    }
    this._previewChips = [];
    for (const pr of this._previewRings) {
      this.scene.remove(pr.mesh);
      pr.mesh.geometry.dispose();
      pr.mesh.material.dispose();
    }
    this._previewRings = [];
    if (this._previewResultSprite) {
      this.scene.remove(this._previewResultSprite);
      this._previewResultSprite.material.map.dispose();
      this._previewResultSprite.material.dispose();
      this._previewResultSprite = null;
    }
  }

  _makePulseRing(colorHex) {
    const geo = new THREE.RingGeometry(0.75, 0.92, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  // Throttled to hover-CELL-change (keyed by tile id + coord), not per-frame.
  // Clones the live game (deterministic, cheap — Game.clone() carries no
  // RNG), applies the hypothetical placement, and diffs relativeInfluence
  // across the whole board against the pre-clone snapshot. Works uniformly
  // for capture/ascend/empty placement/ward-block/lethal, since it just
  // replays the real placeFromHand() and reads whatever actually changed.
  _updatePreview(hit) {
    const tile = this._previewTile;
    const key = hit && tile ? `${tile.id}|${hit.col},${hit.row}` : null;
    if (key === this._previewKey) return;
    this._previewKey = key;
    this._clearPreview();
    if (!key) return;
    if (tile.kind === 'rite') return; // rites cast via a different flow (legalRiteTargets/castRite)
    if (this.game.phase !== 'play') return;

    const clone = this.game.clone();
    const attacker = clone.currentPlayer;
    const handIdx = clone.hands[attacker].findIndex((t) => t.id === tile.id);
    if (handIdx < 0) return;
    if (!clone.canPlace(attacker, clone.hands[attacker][handIdx], hit.col, hit.row)) return;

    const before = new Map();
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const t = this.game.board[c][r].tile;
        if (!t) continue;
        before.set(`${c},${r}`, {
          rel: this.game.relativeInfluence(c, r),
          capB: t.owner !== attacker && this.game.isCapturable(c, r, attacker),
        });
      }
    }
    const res = clone.placeFromHand(attacker, handIdx, hit.col, hit.row);
    if (!res.ok) return;
    this._renderPreview(clone, attacker, hit, before, res);
  }

  _renderPreview(clone, attacker, hit, before, res) {
    const placedKey = `${hit.col},${hit.row}`;
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        const key = `${c},${r}`;
        if (key === placedKey) continue; // the placement cell gets its own result badge below
        const t = clone.board[c][r].tile;
        if (!t) continue;
        const b = before.get(key);
        if (!b) continue; // no prior tile here — nothing to diff (defensive; a single placement never adds a 2nd tile)
        const afterRel = clone.relativeInfluence(c, r);
        const delta = afterRel - b.rel;
        const { x, z } = worldPos(c, r);
        if (delta !== 0) {
          const chip = makeDeltaSprite(delta);
          // Above-and-beside the persistent badge (badge sits at baseH+2.0,
          // +2.5 for capitals) — overlapping it garbled both numbers
          // (gate-2 judge BLOCKER).
          chip.position.set(x + 0.55, this._cellTopY(c, r) + 3.4, z);
          chip.userData.baseY = chip.position.y;
          this.scene.add(chip);
          this._previewChips.push(chip);
        }
        const afterCapB = t.owner !== attacker && clone.isCapturable(c, r, attacker);
        if (afterCapB && !b.capB) {
          const ring = this._makePulseRing(0xff3333);
          ring.position.set(x, 0.1, z);
          ring.scale.set(1.35, 1.35, 1.35);
          this.scene.add(ring);
          this._previewRings.push({ mesh: ring });
          // Ground ring alone got lost in rubble/motes (judge MINOR) — pair
          // it with an unmissable elevated danger marker.
          const warn = makeTextSprite({ num: '⚔' }, { numColor: '#ff5555', numSize: 150 });
          warn.position.set(x - 0.55, this._cellTopY(c, r) + 3.4, z);
          warn.scale.set(0.9, 0.9, 1);
          this.scene.add(warn);
          this._previewChips.push(warn);
        }
      }
    }

    // Placement cell: the placed card's own resulting number (V3 — "show the
    // placed card's own resulting number on the hover ghost"), labeled by
    // what actually happened in the clone (place/capture/ascend/ward/lethal).
    const { x, z } = worldPos(hit.col, hit.row);
    const placedCell = clone.board[hit.col][hit.row];
    const resultRel = clone.relativeInfluence(hit.col, hit.row);
    let ringColor, numColor, label;
    if (res.won) { ringColor = '#ffd75e'; numColor = '#ffd75e'; label = 'LETHAL'; }
    else if (res.wardBlocked) { ringColor = '#66e0ff'; numColor = '#66e0ff'; label = 'WARDED'; }
    else {
      ringColor = attacker === 1 ? '#3fae6a' : '#8a5ce0';
      numColor = '#ffffff';
      label = res.captured ? 'CAPTURE' : res.ascended ? 'ASCEND' : 'PLACE';
    }
    const sprite = makeTextSprite({ num: String(resultRel), label }, { numColor, ring: ringColor });
    const topH = (placedCell.tile?.capital) ? CAPITAL_H : TILE_H;
    sprite.position.set(x, placedCell.stack.length * TIER_SLICE_H + topH + 1.7, z);
    sprite.scale.set(1.3, 1.3, 1);
    this.scene.add(sprite);
    this._previewResultSprite = sprite;
    if (res.won) {
      const ring = this._makePulseRing(0xffd75e);
      ring.position.set(x, 0.06, z);
      this.scene.add(ring);
      this._previewRings.push({ mesh: ring, lethal: true });
    }
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
      } else {
        const hit = this._pick(e);
        this._lastHoverHit = hit;
        if (this.onCellHover) this.onCellHover(hit);
        this._updatePreview(hit);
      }
    });
    el.addEventListener('pointerup', (e) => {
      dragging = false;
      if (!moved && this.onCellClick) {
        const hit = this._pick(e);
        if (hit) this.onCellClick(hit);
      }
    });
    el.addEventListener('pointerleave', () => {
      dragging = false;
      this._lastHoverHit = null;
      this._updatePreview(null);
    });
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
    const now = performance.now();
    const stirs = this.game.riftStirs; // R6/A7 — {active, upcoming, pulseStrength, ...} | null

    // V5: seam eruption fires once on the active window's leading edge.
    if (stirs?.active && !this._stirsWasActive) this._triggerRiftEruption();
    this._stirsWasActive = !!stirs?.active;

    // rift glitch pulse — rim-driven, fill stays dark. Quickens on telegraph
    // (upcoming) and spikes hard while THE RIFT STIRS is actually active.
    const stirsMul = stirs?.active ? 3.2 : stirs?.upcoming ? 1.9 : 1.0;
    const pulse = (0.12 + 0.06 * Math.sin(t * 2.4 * stirsMul) + 0.03 * Math.sin(t * 13.7)) * (stirs?.active ? 1.8 : 1);
    for (const m of this._riftMats) m.emissiveIntensity = pulse;
    if (this._riftEdges) {
      const rim = (0.75 + 0.25 * Math.sin(t * 2.4 * stirsMul)) * (stirs?.active ? 1.3 : 1);
      for (const m of this._riftEdges) m.opacity = Math.min(1, rim);
    }
    // capturable tiles breathe red; rift-adjacent tiles get a magenta warning
    // shimmer while THE RIFT STIRS is telegraphed; everything else settles.
    for (const g of this.tileMeshes.values()) {
      if (g.userData.capturable) {
        g.userData.mat.emissive.setHex(0xff2222);
        g.userData.mat.emissiveIntensity = 0.25 + 0.2 * Math.sin(t * 5);
      } else if (stirs?.upcoming && g.userData.riftAdjacent) {
        g.userData.mat.emissive.setHex(COLORS.rift);
        g.userData.mat.emissiveIntensity = 0.18 + 0.14 * Math.sin(t * 4);
      } else if (g.userData.mat.emissiveIntensity !== 0.08) {
        g.userData.mat.emissive.setHex(g.userData.baseColor);
        g.userData.mat.emissiveIntensity = 0.08;
      }
      // V5 riftlight underglow pulse
      if (g.userData.riftGlow) {
        g.userData.riftGlow.material.opacity = 0.24 + 0.14 * Math.sin(t * 2.2 * (stirs?.active ? 2.4 : stirs?.upcoming ? 1.5 : 1));
      }
    }
    // drop-in animations (time-based so frame rate never changes duration).
    // V1: only the top prism's local Y animates — buried tiers/badge/
    // billboard/shadow are already resting in their final spot.
    for (const anim of this._dropAnims) {
      const dur = anim.captured ? 300 : 240;
      const p = Math.min(1, (now - anim.start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      anim.prism.position.y = anim.restY + anim.dropH * (1 - e);
      if (p >= 1 && !anim.done) {
        anim.done = true;
        // landing payoff: squash-and-spring + expanding shockwave ring
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.2, 0.3, 32),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(anim.group.position.x, 0.05, anim.group.position.z);
        this.scene.add(ring);
        this._impactAnims.push({ prism: anim.prism, ring, start: now });
        // mote burst: hot ember spray on capture, soft owner puff on placement
        const gp = anim.group.position, gh = anim.group.userData.baseH;
        if (anim.captured) this._spawnBurst(gp.x, gp.z, gh, 0xff5f3c, 32, 3.0);
        else this._spawnBurst(gp.x, gp.z, gh * 0.6, anim.owner === 1 ? COLORS.p1 : COLORS.p2, 12, 1.3);
        // V8 hookup spec: onWow fires on first-blood, then on any capture
        // that flips ≥2 badges to capturable this action (shell wires a chime).
        if (anim.captured) {
          let kind = null;
          if (!this._firstBloodFired) { kind = 'first-blood'; this._firstBloodFired = true; }
          else if (this._pendingWowFlips >= 2) { kind = 'multi-capture'; }
          this._pendingWowFlips = 0;
          if (kind) this.onWow && this.onWow(kind);
        }
      }
    }
    this._dropAnims = this._dropAnims.filter(a => !a.done);
    for (const a of this._impactAnims) {
      const p = Math.min(1, (now - a.start) / 240);
      const squash = p < 0.4 ? 1 - 0.3 * (p / 0.4) : 0.7 + 0.3 * ((p - 0.4) / 0.6);
      a.prism.scale.set(2 - squash, squash, 2 - squash);
      const s = 0.3 + p * 5;
      a.ring.scale.set(s, s, 1);
      a.ring.material.opacity = 0.9 * (1 - p);
      if (p >= 1) {
        a.prism.scale.set(1, 1, 1);
        this.scene.remove(a.ring);
        a.ring.geometry.dispose(); a.ring.material.dispose();
        a.done = true;
      }
    }
    this._impactAnims = this._impactAnims.filter(a => !a.done);
    for (const a of this._burstAnims) {
      const p = Math.min(1, (now - a.start) / 600);
      const e = 1 - Math.pow(1 - p, 2);
      const pos = a.pts.geometry.attributes.position;
      for (let i = 0; i < a.vels.length; i++) {
        const v = a.vels[i];
        // radial fling with a gravity droop; clamp so motes never sink below deck
        pos.setXYZ(i, a.ox + v.x * e, Math.max(0.05, a.oy + v.y * e - 2.2 * p * p), a.oz + v.z * e);
      }
      pos.needsUpdate = true;
      a.pts.material.opacity = 0.95 * (1 - p);
      if (p >= 1) {
        this.scene.remove(a.pts);
        a.pts.geometry.dispose(); a.pts.material.dispose(); // map is the shared disc — lives on
        a.done = true;
      }
    }
    this._burstAnims = this._burstAnims.filter(a => !a.done);
    for (const a of this._flashAnims) {
      const p = Math.min(1, (now - a.start) / 220);
      a.mat.emissive.setHex(0xffffff);
      a.mat.emissiveIntensity = 1.4 * (1 - p);
      if (p >= 1) { a.mat.emissive.setHex(a.base); a.mat.emissiveIntensity = 0.08; a.done = true; }
    }
    this._flashAnims = this._flashAnims.filter(a => !a.done);
    for (const a of this._popAnims) {
      const p = Math.min(1, (now - a.start) / 220);
      const over = 1.15 + (1.9 - 1.15) * (1 - p) * Math.cos(p * 5);
      a.sprite.scale.set(Math.max(1.15, over), Math.max(1.15, over), 1);
      if (p >= 1) { a.sprite.scale.set(1.15, 1.15, 1); a.done = true; }
    }
    this._popAnims = this._popAnims.filter(a => !a.done);
    // V4: resolution cascade — badges tick from fromVal→toVal, staggered by
    // hex distance from the action's origin (scheduled via startAt).
    for (const a of this._cascadeAnims) {
      if (now < a.startAt) continue;
      if (!a.started) { a.started = true; a.start = now; }
      const p = Math.min(1, (now - a.start) / 260);
      const cur = Math.round(a.fromVal + (a.toVal - a.fromVal) * p);
      if (cur !== a.lastPainted) {
        a.lastPainted = cur;
        this._paintBadge(a.group, a.tile, cur, p >= 1 ? a.capturable : cur === 0);
      }
      if (p >= 1) a.done = true;
    }
    this._cascadeAnims = this._cascadeAnims.filter(a => !a.done);
    // V1: tall-tower ember idle — embers rise in a loose ring and loop.
    for (const emberSys of this._towerEmbers.values()) {
      emberSys.pts.position.copy(emberSys.group.position);
      const pos = emberSys.pts.geometry.attributes.position;
      for (let i = 0; i < emberSys.homes.length; i++) {
        const hm = emberSys.homes[i];
        const cycle = (t * 0.5 + hm.phase) % 1;
        pos.setXYZ(i, Math.cos(hm.a) * hm.r * (1 - cycle * 0.3), hm.y0 + cycle * 0.6, Math.sin(hm.a) * hm.r * (1 - cycle * 0.3));
      }
      pos.needsUpdate = true;
      emberSys.pts.material.opacity = 0.5 + 0.2 * Math.sin(t * 3);
    }
    // billboards idle-bob (the "alive" read); halo tracks its subject
    for (const g of this.tileMeshes.values()) {
      const u = g.userData;
      if (u.billboard?.visible) {
        u.billboard.position.y = u.bobBase + 0.05 * Math.sin(t * 1.6 + u.bobPhase);
        if (u.halo?.visible) u.halo.position.y = u.billboard.position.y + u.halo.userData.lift;
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
    // V3: preview rings pulse; delta chips bob gently.
    for (const pr of this._previewRings) {
      const s = 0.9 + 0.15 * Math.sin(t * (pr.lethal ? 7 : 6));
      pr.mesh.scale.set(s, s, 1);
      pr.mesh.material.opacity = pr.lethal ? (0.55 + 0.35 * Math.sin(t * 7)) : (0.45 + 0.3 * Math.sin(t * 5));
    }
    for (const chip of this._previewChips) {
      chip.position.y = chip.userData.baseY + 0.08 * Math.sin(t * 2.4);
    }
    // Win moment: one-time trigger into a slow cinematic orbit, drifting the
    // look-at toward the winner's capital (board center on a draw) while the
    // bloom eases up. Orbits until the restart reload.
    if (this.game.phase === 'over' && !this._winCine) {
      const focus = this._boardCenter();
      if (this.game.winner) {
        outer: for (let c = 0; c < CONFIG.GRID_W; c++) {
          for (let r = 0; r < CONFIG.GRID_H; r++) {
            const tl = this.game.board[c][r].tile;
            if (tl && tl.capital && tl.owner === this.game.winner) {
              const { x, z } = worldPos(c, r);
              focus.lerp(new THREE.Vector3(x, 0, z), 0.45); // drift toward, don't center on
              break outer;
            }
          }
        }
      }
      this._winCine = { focus, from: this.center.clone(), pitchFrom: this.camPitch, start: now, lastNow: now };
    }
    if (this._winCine) {
      const wc = this._winCine;
      const p = Math.min(1, (now - wc.start) / 2600);
      const e = 1 - Math.pow(1 - p, 3);
      this.center.lerpVectors(wc.from, wc.focus, e);
      if (p < 1) this.camPitch = wc.pitchFrom + (0.62 - wc.pitchFrom) * e;
      this._bloom.strength = 0.55 + (0.8 - 0.55) * e;
      this.camYaw += (now - wc.lastNow) * 0.00016; // ~40s per lap
      wc.lastNow = now;
      this._applyCamera();
    }
    // Decaying camera kick (capture punch) — applied only for this frame's
    // render, then removed. A persistent position.add would displace the
    // camera a little more with every capture and drift the board off-frame.
    const kicking = this._camKick.lengthSq() > 0.00001;
    if (kicking) this.camera.position.add(this._camKick);
    this.composer.render();
    if (kicking) {
      this.camera.position.sub(this._camKick);
      this._camKick.multiplyScalar(0.8);
    }
  }
}
