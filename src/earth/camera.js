// Tilted perspective camera that follows the hole, zooms out continuously as
// it grows, fades buildings that hide it and adds a light cinematic touch
// during big collapses.
import * as THREE from 'three';
import { ORIGIN } from './origin.js';

const DEG = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 35 * DEG;
    this.pitch = 52 * DEG;
    this.dist = 10;
    this.target = new THREE.Vector3();
    this.shake = 0;
    this.focus = null;
    this.focusW = 0;
    this.menuYaw = 0;
    this.occT = 0;
    this.faded = new Set();
    this.worldPos = new THREE.Vector3();
  }

  idealDist(r, aspect) {
    const ratio = 0.14 + 0.07 * smooth(0.8, 25, r);
    const span = 2 * Math.tan((this.cam.fov * DEG) / 2) * Math.min(aspect, 1);
    return Math.max(6.5, (2 * r) / (ratio * span));
  }

  snap(hole, aspect) {
    this.dist = this.idealDist(hole.r, aspect);
    this.target.set(hole.x, hole.y, hole.z);
  }

  update(dt, hole, aspect, menu) {
    const ideal = menu ? Math.max(70, this.idealDist(hole.r, aspect) * 1.9) : this.idealDist(hole.r, aspect);
    this.dist += (ideal - this.dist) * (1 - Math.exp(-dt * (menu ? 0.6 : 1.4)));
    const lead = menu ? 0 : 0.35;
    let tx = hole.x + hole.vx * lead, tz = hole.z + hole.vz * lead;
    if (this.focus && this.focusW > 0) {
      tx += (this.focus.x - tx) * 0.18 * this.focusW;
      tz += (this.focus.z - tz) * 0.18 * this.focusW;
    }
    const k = 1 - Math.exp(-dt * (menu ? 1.5 : 5));
    this.target.x += (tx - this.target.x) * k;
    this.target.z += (tz - this.target.z) * k;
    this.target.y += (hole.y - this.target.y) * k;
    if (menu) this.menuYaw += dt * 0.045;
    const yaw = this.yaw + (menu ? Math.sin(this.menuYaw) * 0.6 : 0);
    const pitch = menu ? 40 * DEG : this.pitch + this.focusW * 3 * DEG;
    const cp = Math.cos(pitch);
    const d = this.dist;
    this.worldPos.set(this.target.x + Math.sin(yaw) * cp * d, this.target.y + Math.sin(pitch) * d, this.target.z + Math.cos(yaw) * cp * d);
    this.shake *= Math.exp(-dt * 2.5);
    const sh = this.shake * d * 0.004;
    const c = this.cam;
    c.position.set(this.worldPos.x - ORIGIN.x + (Math.random() - 0.5) * sh, this.worldPos.y + (Math.random() - 0.5) * sh, this.worldPos.z - ORIGIN.z + (Math.random() - 0.5) * sh);
    c.lookAt(this.target.x - ORIGIN.x, this.target.y, this.target.z - ORIGIN.z);
    c.near = Math.max(0.1, d * 0.03);
    c.far = d * 7 + 300;
    c.updateProjectionMatrix();
    this.focusW = Math.max(0, this.focusW - dt * 0.35);
  }

  addShake(a) { this.shake = Math.min(3, this.shake + a); }
  setFocus(x, z) { this.focus = { x, z }; this.focusW = 1; }

  // Fade buildings between the camera and the hole.
  occlusion(dt, world, hole) {
    this.occT -= dt;
    if (this.occT > 0) return;
    this.occT = 0.15;
    const hit = new Set();
    const cp = this.worldPos;
    const pts = [[hole.x, hole.y + 0.2, hole.z]];
    const dx = cp.x - hole.x, dz = cp.z - hole.z, dl = Math.hypot(dx, dz) || 1;
    pts.push([hole.x + dx / dl * hole.r, hole.y + 0.2, hole.z + dz / dl * hole.r]);
    const R = this.dist * 1.05;
    world.forEachNear((cp.x + hole.x) / 2, (cp.z + hole.z) / 2, R * 0.6, e => {
      if (!e.building || e.state !== 'rest' || e.render === 'lite') return;
      const turned = Math.abs(Math.sin(e.rot)) > 0.5;
      const hw = (turned ? e.d : e.w) / 2, hd = (turned ? e.w : e.d) / 2;
      for (const p of pts) {
        if (segBox(cp.x, cp.y, cp.z, p[0], p[1], p[2], e.x - hw, e.y, e.z - hd, e.x + hw, e.y + e.top, e.z + hd)) { hit.add(e); break; }
      }
    });
    for (const e of this.faded) if (!hit.has(e) || e.state === 'gone') { if (e.state !== 'gone') world.setFaded(e, false); this.faded.delete(e); }
    for (const e of hit) if (!this.faded.has(e)) { world.setFaded(e, true); this.faded.add(e); }
  }
}

function segBox(x0, y0, z0, x1, y1, z1, bx0, by0, bz0, bx1, by1, bz1) {
  let t0 = 0, t1 = 1;
  const d = [x1 - x0, y1 - y0, z1 - z0], o = [x0, y0, z0], mn = [bx0, by0, bz0], mx = [bx1, by1, bz1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) return false; continue; }
    let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return t1 > 0.02 && t0 < 0.98;
}
