// 3D popout — spins a unit's GLB in a corner viewer on card inspect.
// Own renderer + canvas (board scene untouched); lazy loader import; LRU of 1;
// graceful skip when a model is missing. MP guard: callers should not invoke
// during an opponent's pending turn (see INTEGRATION_NOTES.md hookup).
import * as THREE from 'three';

const MODEL_DIR = './assets/models/units/';
const SIZE = 210;

let dom = null, renderer = null, scene = null, camera = null, raf = 0;
let current = null;             // { type, root }
let loaderPromise = null;
let showGen = 0;                // request generation — a stale async load drops itself
const missing = new Set();      // types confirmed absent — never re-fetch

// Available-model allow-list (manifest.json = ["RIFTWALKER", ...]). Loaded
// once; show() skips silently for any type not in it, so cards without a GLB
// (e.g. rites, unmodeled pool cards) never fire a 404. Missing manifest → the
// per-type missing-set still catches 404s, just noisier.
let available = null;           // Set<string> | null (null = not yet loaded)
let availablePromise = null;
function loadAvailable() {
  availablePromise ||= fetch(`${MODEL_DIR}manifest.json`)
    .then(r => (r.ok ? r.json() : []))
    .then(list => { available = new Set(list); })
    .catch(() => { available = new Set(); });
  return availablePromise;
}

function ensure() {
  if (dom) return;
  dom = document.createElement('div');
  dom.id = 'popout3d';
  dom.style.cssText = `position: fixed; right: 18px; bottom: 170px; width: ${SIZE}px;
    height: ${SIZE}px; z-index: 85; pointer-events: none; opacity: 0;
    transition: opacity .35s; border-radius: 12px; overflow: hidden;
    background: radial-gradient(ellipse at 50% 60%, rgba(35,40,60,0.9), rgba(13,15,22,0.95));
    border: 1px solid #3a4152; box-shadow: 0 10px 30px rgba(0,0,0,0.55);`;
  document.body.appendChild(dom);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  dom.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);
  camera.position.set(0, 0.9, 2.6);
  camera.lookAt(0, 0.45, 0);
  scene.add(new THREE.AmbientLight(0xdde4ff, 0.8));
  const key = new THREE.DirectionalLight(0xfff2d9, 1.5);
  key.position.set(2, 3, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe879f9, 1.0);
  rim.position.set(-2, 1, -2);
  scene.add(rim);
}

function disposeCurrent() {
  if (!current) return;
  scene.remove(current.root);
  current.root.traverse(o => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of ['map', 'normalMap', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'aoMap'])
        m[k]?.dispose();
      m.dispose();
    }
  });
  current = null;
}

function tick() {
  raf = requestAnimationFrame(tick);
  if (current) current.root.rotation.y += 0.012;
  renderer.render(scene, camera);
}

export const popout = {
  async show(type) {
    if (!type || missing.has(type)) return;
    const gen = ++showGen;              // this call's ticket; a newer show() supersedes it
    if (!available) await loadAvailable();
    if (gen !== showGen) return;
    if (!available.has(type)) return;   // no model for this type — silent skip
    ensure();
    if (current?.type === type) {       // already loaded — reveal + resume spin
      dom.style.opacity = '1';
      if (!raf) tick();
      return;
    }
    loaderPromise ||= import('../vendor/jsm/loaders/GLTFLoader.js');
    let gltf;
    try {
      const { GLTFLoader } = await loaderPromise;
      gltf = await new GLTFLoader().loadAsync(`${MODEL_DIR}${type}.glb`);
    } catch {
      missing.add(type);
      if (gen === showGen) this.hide();  // don't leave the prior model showing under a card that has none
      return;
    }
    if (gen !== showGen) return;         // a newer hover won the race — drop this result
    disposeCurrent();
    const root = gltf.scene;
    // normalize: fit into a unit box, feet at y=0
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = 1.1 / Math.max(size.x, size.y, size.z);
    root.scale.setScalar(s);
    box.setFromObject(root);
    root.position.y -= box.min.y;
    root.position.x -= (box.min.x + box.max.x) / 2;
    root.position.z -= (box.min.z + box.max.z) / 2;
    scene.add(root);
    current = { type, root };
    dom.style.opacity = '1';
    if (!raf) tick();
  },

  hide() {
    if (dom) dom.style.opacity = '0';
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    // keep last model resident for instant re-show; dispose on next swap
  },
};
