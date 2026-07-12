// R8/P3 measurement retrain — knobs patched EXPLICITLY (P2 gate-#2 lesson:
// never rely on the ambient CONFIG default; train.js reads whatever is set).
// Usage: node tools/train_p3.mjs [on|off]  (default: on — full-ON training so
// f[20]/f[21] see live signal; rerun with `off` before shipping if the gate
// fails and the knobs stay false).
import { CONFIG } from '../core/config.js';

const mode = (process.argv[2] || 'on').toLowerCase();
CONFIG.CASCADE_ON = mode === 'on';
CONFIG.VANGUARD_ON = mode === 'on';
console.log(`train_p3: CASCADE_ON=${CONFIG.CASCADE_ON} VANGUARD_ON=${CONFIG.VANGUARD_ON}`);

const { train } = await import('./train.js');
train();
