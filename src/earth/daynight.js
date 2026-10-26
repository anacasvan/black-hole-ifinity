// Day / sunset / night cycle: sun path and colour, sky and fog colour, ambient
// light, and the night factor that lights windows, street lamps and headlights.
import * as THREE from 'three';
import { SHARED } from './materials.js';

const DAY_FOG = new THREE.Color(0xc8d3dc), DUSK_FOG = new THREE.Color(0xe2b393), NIGHT_FOG = new THREE.Color(0x1a2335);
const SUN_DAY = new THREE.Color(0xfff0dc), SUN_LOW = new THREE.Color(0xffa36b), MOON = new THREE.Color(0x9fb4ff);
const HEMI_DAY = new THREE.Color(0xd6e6ff), HEMI_NIGHT = new THREE.Color(0x5a6fa8);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _c = new THREE.Color();

export const DAY_LENGTH = 16 * 60; // seconds for a full day

export class DayNight {
  constructor(game) {
    this.g = game;
    this.t = 0.36;           // 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset
    this.dir = new THREE.Vector3(-0.5, 0.8, 0.35).normalize();
    this.night = 0;
  }

  update(dt, enabled) {
    if (enabled) this.t = (this.t + dt / DAY_LENGTH) % 1;
    const t = enabled ? this.t : 0.4;
    const elev = Math.sin((t - 0.25) * Math.PI * 2);           // -1..1
    const az = t * Math.PI * 2;
    const night = smooth(0.06, -0.22, elev);
    const low = 1 - smooth(0.05, 0.4, Math.abs(elev));          // near the horizon
    this.night = night;
    SHARED.uNight.value = night;
    const g = this.g;
    // Light direction: the sun by day, the moon (higher, opposite side) at night.
    const e = night > 0.5 ? 0.75 : Math.max(0.28, elev);
    const a = night > 0.5 ? az + Math.PI : az;
    this.dir.set(-Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e) * 0.8 + 0.3).normalize();
    const dayI = 2.7 * smooth(-0.04, 0.22, elev);
    g.sun.intensity = Math.max(dayI, 0.55 * night);
    g.sun.color.copy(night > 0.5 ? MOON : _c.copy(SUN_DAY).lerp(SUN_LOW, low * (elev > 0 ? 1 : 0)));
    g.hemi.intensity = 0.85 - 0.45 * night;
    g.hemi.color.copy(HEMI_DAY).lerp(HEMI_NIGHT, night);
    const fog = _c.copy(DAY_FOG).lerp(DUSK_FOG, low * (1 - night)).lerp(NIGHT_FOG, night);
    g.scene.fog.color.copy(fog);
    g.scene.background.copy(fog);
    g.scene.environmentIntensity = 0.6 - 0.4 * night;
    g.renderer.toneMappingExposure = 1.05 + 0.3 * night;
    return t;
  }

  label() {
    const h = Math.floor(this.t * 24), m = Math.floor((this.t * 24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
