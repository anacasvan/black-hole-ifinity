// Local persistence: settings and game progress (mass, position, which static
// objects have been swallowed, chunk by chunk).
const SETTINGS_KEY = 'bhi-earth-settings-v1';
const SAVE_KEY = 'bhi-earth-save-v1';

export const DEFAULT_SETTINGS = {
  control: 'A',          // A: joystick left, B: joystick right, C: custom, D: touch only
  joyX: 0.24, joyY: 0.84, // custom joystick centre (fractions of the viewport)
  joySize: 136,
  joyOpacity: 0.9,
  sensitivity: 1,
  quality: 'auto',       // auto | low | medium | high
  music: 0.55,
  sfx: 0.8,
  vibration: true,
  reduceFx: false,
  attractMode: 'hold',   // hold | toggle
};

const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };

export function loadSettings() {
  const s = read(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}
export function saveSettings(s) { return write(SETTINGS_KEY, s); }

export class Save {
  constructor() { this.reset(); }

  reset() {
    this.mass = 0;
    this.x = null; this.z = null;
    this.stats = { eaten: 0, time: 0, collapsed: 0 };
    this.eaten = new Map();
    this.dirty = false;
  }

  exists() { const d = read(SAVE_KEY); return !!(d && d.v === 1); }

  load() {
    const d = read(SAVE_KEY);
    if (!d || d.v !== 1) return false;
    this.reset();
    this.mass = Number(d.mass) || 0;
    this.x = Number.isFinite(d.x) ? d.x : null;
    this.z = Number.isFinite(d.z) ? d.z : null;
    this.stats = { ...this.stats, ...(d.stats || {}) };
    for (const [k, s] of Object.entries(d.eaten || {})) {
      this.eaten.set(k, new Set(String(s).split('.').filter(Boolean).map(t => parseInt(t, 36))));
    }
    return true;
  }

  write() {
    const eaten = {};
    for (const [k, set] of this.eaten) if (set.size) eaten[k] = [...set].map(n => n.toString(36)).join('.');
    const ok = write(SAVE_KEY, { v: 1, mass: this.mass, x: this.x, z: this.z, stats: this.stats, eaten });
    if (ok) this.dirty = false;
    return ok;
  }

  clear() { try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ } this.reset(); }

  eatenSet(key) {
    let s = this.eaten.get(key);
    if (!s) { s = new Set(); this.eaten.set(key, s); }
    return s;
  }

  markEaten(key, idx) {
    this.eatenSet(key).add(idx);
    this.dirty = true;
  }
}
