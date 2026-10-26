// Gravity and simplified rigid-body physics.
// - Gravity acts only while the player holds ATTRAI (plus plain falling for
//   objects that end up over the opening).
// - Pull ~ 1/d^2, scaled by hole size and reduced for heavy objects.
// - Anchored objects accumulate "stress" (tremor, tilt) until they give way and
//   become free boxes simulated with corner contacts, friction, torque (so they
//   slide, spin and roll over), a well wall and suction inside the opening.
// - Buildings follow a scripted collapse: tremor, tilt, base failure, fall
//   toward the opening and gradual sinking.
import * as THREE from 'three';
import { groundHeight } from './citygen.js';
import { ORIGIN } from './origin.js';
import { BUILDING_ANCHOR } from './config.js';

const G = 9.81;
const KG = 4.2;
const K = 1600, CD = 48;
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _v = new THREE.Vector3(), _off = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _tb = new THREE.Vector3();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _axis = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const CORNERS = [[-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, -1], [1, 1, -1], [-1, 1, 1], [1, 1, 1]];

export class Physics {
  constructor(game) {
    this.g = game;
    this.bodies = [];
    this.stressed = new Set();
    this.collapses = [];
    this.frame = 0;
    this.time = 0;
  }

  pull(d, r, mass, holeMass) {
    const dd = Math.max(d, r * 0.55);
    return KG * G * (r / dd) ** 2 / (1 + 3 * mass / Math.max(1, holeMass));
  }

  update(dt, hole) {
    this.frame++;
    this.time += dt;
    const R = hole.r * 5 + 2;
    this.g.world.forEachNear(hole.x, hole.z, R, e => this.anchored(e, dt, hole, R));
    for (const a of this.g.actors()) {
      if (a.state !== 'rest' && a.state !== 'stress') continue;
      const dx = a.x - hole.x, dz = a.z - hole.z;
      if (dx * dx + dz * dz < R * R) this.anchored(a, dt, hole, R);
    }
    for (const e of this.stressed) {
      if (e.touchFrame === this.frame) continue;
      e.stress -= dt * 0.7;
      if (e.stress <= 0 || e.state !== 'stress') {
        e.stress = 0;
        this.stressed.delete(e);
        if (e.state === 'stress') { e.state = 'rest'; if (!e.actor) this.g.world.renderRest(e); }
      } else if (!e.actor) this.poseStress(e, hole);
    }
    const n = Math.min(6, Math.max(1, Math.ceil(dt / (1 / 240))));
    const h = dt / n;
    for (let s = 0; s < n; s++) for (const e of this.bodies) this.step(e, h, hole, R);
    for (let k = this.bodies.length - 1; k >= 0; k--) {
      const e = this.bodies[k];
      if (this.postStep(e, dt, hole)) this.bodies.splice(k, 1);
      else this.renderBody(e, hole);
    }
    for (let k = this.collapses.length - 1; k >= 0; k--) {
      if (this.updateCollapse(this.collapses[k], dt, hole)) this.collapses.splice(k, 1);
    }
  }

  anchored(e, dt, hole, R) {
    if (e.state !== 'rest' && e.state !== 'stress') return;
    const dx = hole.x - e.x, dz = hole.z - e.z;
    const d = Math.hypot(dx, dz);
    const r = hole.r;
    const fits = r >= e.needR;
    if (fits && !e.building && d < r * 0.92) { this.release(e, hole, 0); return; }
    // A building standing over the opening has lost its ground: it caves in.
    if (fits && e.building && d < r * 0.75) { this.startCollapse(e, hole); return; }
    if (!hole.attract) return;
    const ext = e.building ? Math.min(e.w, e.d) * 0.35 : 0;
    if (d > R + ext * 2) return;
    const a = this.pull(Math.max(0.01, d - ext), r, e.mass, hole.mass);
    e.touchFrame = this.frame;
    if (!fits) {
      // Too big for now: a faint tremor is the only reaction.
      if ((e.building || e.def.tall) && !e.actor && d < r * 2.2 + ext * 2) {
        e.state = 'stress';
        e.stress = Math.min(0.12, e.stress + dt * 0.25);
        this.stressed.add(e);
        this.poseStress(e, hole);
      }
      return;
    }
    const anchor = e.building ? BUILDING_ANCHOR : e.def.anchor;
    if (a <= anchor) {
      if (e.stress > 0) e.stress = Math.max(0, e.stress - dt * 0.5);
      return;
    }
    const rate = e.building ? 0.3 : e.def.tall ? 0.8 : 1.5;
    e.stress += ((a - anchor) / Math.max(anchor, 0.4) + 0.25) * dt * rate;
    e.state = 'stress';
    this.stressed.add(e);
    if (e.stress >= 1) {
      if (e.building) this.startCollapse(e, hole);
      else this.release(e, hole, Math.min(3, a * 0.12));
    } else if (!e.actor) this.poseStress(e, hole);
  }

  // Tremor + tilt toward the hole while an anchored object resists.
  poseStress(e, hole) {
    const dx = hole.x - e.x, dz = hole.z - e.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    const st = Math.min(1, e.stress);
    const tall = e.building || e.def.tall;
    const tiltMax = e.building ? 0.06 : tall ? 0.26 : 0.0;
    const tilt = st * st * tiltMax + Math.sin(this.time * 31 + e.x) * 0.006 * st * (tall ? 1 : 0);
    const size = e.building ? Math.min(e.w, e.d) : Math.max(e.def.dims[0], e.def.dims[2]) * (e.s || 1);
    const jit = (e.building ? 0.004 : 0.03) * size * st;
    const jx = Math.sin(this.time * 47 + e.z * 3) * jit, jz = Math.cos(this.time * 53 + e.x * 3) * jit;
    _axis.set(uz, 0, -ux);
    const hw = e.building ? (Math.abs(ux) * (Math.abs(Math.cos(e.rot)) > 0.5 ? e.w : e.d) + Math.abs(uz) * (Math.abs(Math.cos(e.rot)) > 0.5 ? e.d : e.w)) * 0.5 : 0;
    poseAbout(e, e.x + jx, e.y, e.z + jz, e.rot, _axis, tilt, ux * hw, uz * hw, 1, _m);
    this.g.world.setMatrix(e, _m);
  }

  release(e, hole, impulse) {
    const dims = e.def.dims;
    const s = e.s || 1, sx = e.sx || s;
    const hx = dims[0] * sx / 2, hy = dims[1] * s / 2, hz = dims[2] * s / 2;
    const dx = hole.x - e.x, dz = hole.z - e.z, d = Math.hypot(dx, dz) || 1;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, e.rot);
    const w = new THREE.Vector3();
    if (e.def.tall && e.stress > 0) {
      const tilt = Math.min(1, e.stress) ** 2 * 0.26;
      _axis.set(dz / d, 0, -dx / d);
      q.premultiply(_q.setFromAxisAngle(_axis, tilt));
      w.copy(_axis).multiplyScalar(0.9);
    }
    const p = new THREE.Vector3(0, hy, 0).applyQuaternion(q).add(_v.set(e.x, e.y, e.z));
    const v = new THREE.Vector3(e.vx || 0, 0, e.vz || 0);
    v.x += dx / d * impulse; v.z += dz / d * impulse;
    const simple = e.def.cat === 'tiny';
    if (simple) w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    e.body = {
      p, v, q, w, hx, hy, hz, simple, sleep: 0, inHole: 0,
      ix: (4 * hy * hy + 4 * hz * hz) / 12 + 1e-4, iy: (4 * hx * hx + 4 * hz * hz) / 12 + 1e-4, iz: (4 * hx * hx + 4 * hy * hy) / 12 + 1e-4,
    };
    e.state = 'free';
    e.stress = 0;
    this.stressed.delete(e);
    this.bodies.push(e);
    if (e.actor && e.onRelease) e.onRelease();
    if (e.def.cat === 'vehicle' && e.needR > 1.5) this.g.audio?.skid(Math.min(1, e.mass / 60));
  }

  step(e, h, hole, R) {
    const b = e.body;
    if (b.sleep > 1.2 && !(hole.attract && distXZ(b.p, hole) < R) && distXZ(b.p, hole) > hole.r * 1.3) return;
    const r = hole.r;
    const dx = hole.x - b.p.x, dz = hole.z - b.p.z, d = Math.hypot(dx, dz) || 1e-6;
    // Once the centre is over the opening the object is committed: it drops in.
    if (!b.captured && d < r * 0.85 && r >= e.needR) b.captured = true;
    const inside = b.captured || d < r * 0.92;
    let ax = 0, ay = -G, az = 0;
    const pulled = hole.attract && d < R;
    if (pulled && !b.captured) {
      const a = this.pull(d, r, e.mass, hole.mass);
      ax += dx / d * a - dz / d * a * 0.12;
      az += dz / d * a + dx / d * a * 0.12;
    }
    if (b.captured) {
      const damp = Math.exp(-7 * h);
      b.v.x *= damp; b.v.z *= damp;
      ax += dx * 9; az += dz * 9;
      ay -= G * 0.8;
      b.inHole += h;
      if (d > r * 0.9 && b.p.y < hole.y + b.hy) {
        // keep it inside the rim
        const k = (d - r * 0.9) / d;
        b.p.x += dx * k; b.p.z += dz * k;
      }
    }
    if (b.simple) {
      b.v.x += ax * h; b.v.y += ay * h; b.v.z += az * h;
      b.p.addScaledVector(b.v, h);
      const gh = b.captured || d < r ? -1e9 : groundHeight(b.p.x, b.p.z);
      if (b.p.y - b.hy < gh) {
        b.p.y = gh + b.hy;
        if (b.v.y < 0) b.v.y *= -0.25;
        const fr = pulled ? 1.2 : 7;
        const k = Math.max(0, 1 - fr * h);
        b.v.x *= k; b.v.z *= k;
        b.w.multiplyScalar(Math.max(0, 1 - 4 * h));
      }
      if (b.w.lengthSq() > 1e-6) {
        _q.setFromAxisAngle(_axis.copy(b.w).normalize(), b.w.length() * h);
        b.q.premultiply(_q);
      }
      b.sleep = b.v.lengthSq() < 0.002 ? b.sleep + h : 0;
      return;
    }
    _f.set(ax, ay, az);
    _t.set(0, 0, 0);
    const mu = pulled ? 0.28 : 0.65;
    const fallR = b.captured ? r * 1.3 : inside ? r * 1.15 : r * 0.995;
    let contact = false;
    for (const c of CORNERS) {
      _off.set(c[0] * b.hx, c[1] * b.hy, c[2] * b.hz).applyQuaternion(b.q);
      const px = b.p.x + _off.x, py = b.p.y + _off.y, pz = b.p.z + _off.z;
      const cdx = px - hole.x, cdz = pz - hole.z, cd = Math.hypot(cdx, cdz);
      // corner velocity
      const vx = b.v.x + (b.w.y * _off.z - b.w.z * _off.y);
      const vy = b.v.y + (b.w.z * _off.x - b.w.x * _off.z);
      const vz = b.v.z + (b.w.x * _off.y - b.w.y * _off.x);
      let fx = 0, fy = 0, fz = 0;
      if (cd >= fallR) {
        const gh = groundHeight(px, pz);
        if (py < gh) {
          if (inside && py < hole.y - 0.05) {
            // Inside the ground next to the opening: the well wall pushes inward.
            const pen = cd - fallR;
            const vr = (vx * cdx + vz * cdz) / (cd || 1);
            const fn = Math.max(0, K * pen + CD * vr);
            fx -= cdx / cd * fn; fz -= cdz / cd * fn;
          } else {
            contact = true;
            const pen = gh - py;
            const fn = Math.max(0, K * pen - CD * vy);
            fy += fn;
            const vt = Math.hypot(vx, vz);
            if (vt > 1e-5) {
              const ff = Math.min(mu * fn, vt / h * 0.15);
              fx -= vx / vt * ff; fz -= vz / vt * ff;
            }
          }
        }
      }
      if (fx || fy || fz) {
        _f.x += fx; _f.y += fy; _f.z += fz;
        // torque = off x force
        _t.x += _off.y * fz - _off.z * fy;
        _t.y += _off.z * fx - _off.x * fz;
        _t.z += _off.x * fy - _off.y * fx;
      }
    }
    b.v.addScaledVector(_f, h);
    // angular: w += R I^-1 R^T t
    _qi.copy(b.q).invert();
    _tb.copy(_t).applyQuaternion(_qi);
    _tb.set(_tb.x / b.ix, _tb.y / b.iy, _tb.z / b.iz).applyQuaternion(b.q);
    b.w.addScaledVector(_tb, h);
    const wl = b.w.length();
    if (wl > 25) b.w.multiplyScalar(25 / wl);
    b.w.multiplyScalar(1 - Math.min(0.5, (contact ? 1.2 : 0.3) * h));
    b.v.multiplyScalar(1 - 0.04 * h);
    b.p.addScaledVector(b.v, h);
    if (wl > 1e-6) {
      _q.setFromAxisAngle(_axis.copy(b.w).normalize(), b.w.length() * h);
      b.q.premultiply(_q).normalize();
    }
    b.sleep = contact && b.v.lengthSq() < 0.01 && b.w.lengthSq() < 0.01 ? b.sleep + h : 0;
  }

  // Returns true when the body leaves the simulation.
  postStep(e, dt, hole) {
    const b = e.body;
    const depth = Math.max(3, hole.r * 3.2);
    if (b.p.y < hole.y - depth * 0.75 - b.hy || b.inHole > 7) { this.g.swallow(e); return true; }
    if (b.p.y < -500) { this.g.discard(e); return true; }
    const far = distXZ(b.p, hole);
    if (b.sleep > 2.5 && far > hole.r * 1.5 && !hole.attract) {
      if (e.actor) {
        if (e.onSettle && e.onSettle()) return true;
        if (far > 260) { this.g.discard(e); return true; }
        return false;
      }
      // Static object pushed around: it becomes a resting object again.
      _off.set(0, -b.hy, 0).applyQuaternion(b.q);
      e.x = b.p.x + _off.x; e.y = b.p.y + _off.y; e.z = b.p.z + _off.z;
      e.q = b.q.clone();
      e.body = null;
      e.state = 'rest';
      this.g.world.renderRest(e);
      return true;
    }
    return false;
  }

  bodyMatrix(e, hole, M) {
    const b = e.body;
    _off.set(0, -b.hy, 0).applyQuaternion(b.q);
    _p.set(b.p.x + _off.x - ORIGIN.x, b.p.y + _off.y, b.p.z + _off.z - ORIGIN.z);
    const s = e.s || 1, sx = e.sx || s;
    let sq = 0;
    if (b.p.y < hole.y && distXZ(b.p, hole) < hole.r * 1.1) sq = Math.min(1, (hole.y - b.p.y) / (hole.r * 1.4));
    _s.set(sx * (1 - 0.32 * sq), s * (1 + 0.22 * sq), s * (1 - 0.32 * sq));
    return M.compose(_p, b.q, _s);
  }

  renderBody(e, hole) {
    if (e.render === 'ped') return; // the pedestrian system draws its own skeleton
    if (e.wheels) e.spin = (e.spin || 0) + Math.hypot(e.body.v.x, e.body.v.z) * 0.05;
    this.bodyMatrix(e, hole, _m);
    this.g.world.setMatrix(e, _m);
  }

  // ---- buildings ----------------------------------------------------------
  startCollapse(e, hole) {
    if (e.render === 'merged') this.g.world.extract(e);
    if (e.faded) this.g.world.setFaded(e, false);
    e.state = 'collapse';
    this.stressed.delete(e);
    const dx = hole.x - e.x, dz = hole.z - e.z, d = Math.hypot(dx, dz) || 1;
    const c = { e, t: 0, bx: e.x, bz: e.z, tilt: 0.06, sink: 0, sinkV: 0, ux: dx / d, uz: dz / d, dustT: 0, debrisT: 0 };
    this.collapses.push(c);
    this.g.onCollapse(e, true);
  }

  updateCollapse(c, dt, hole) {
    const e = c.e;
    c.t += dt;
    const r = hole.r;
    const dx = hole.x - c.bx, dz = hole.z - c.bz, d = Math.hypot(dx, dz);
    if (d > 0.01) {
      const k = 1 - Math.exp(-dt * 2);
      c.ux += (dx / d - c.ux) * k; c.uz += (dz / d - c.uz) * k;
      const l = Math.hypot(c.ux, c.uz) || 1; c.ux /= l; c.uz /= l;
    }
    const slide = Math.min(d, (0.12 + c.t * 0.45) * Math.max(1, r) * dt);
    if (d > 0.01) { c.bx += dx / d * slide; c.bz += dz / d * slide; }
    const aspect = e.top / Math.max(4, Math.min(e.w, e.d));
    const tmax = Math.min(0.8, 0.22 + aspect * 0.1);
    c.tilt += (tmax - c.tilt) * (1 - Math.exp(-dt * (0.25 + c.t * 0.5)));
    if (d < r * 0.75 || c.t > 2.2) {
      c.sinkV += G * 0.32 * Math.sqrt(Math.max(1, r / 5)) * dt;
      c.sink += c.sinkV * dt;
    }
    const turned = Math.abs(Math.sin(e.rot)) > 0.5;
    const hwX = (turned ? e.d : e.w) / 2, hwZ = (turned ? e.w : e.d) / 2;
    const hw = Math.abs(c.ux) * hwX + Math.abs(c.uz) * hwZ;
    _axis.set(c.uz, 0, -c.ux);
    const sq = Math.min(1, c.sink / Math.max(1, e.top));
    poseAbout(e, c.bx, e.y - c.sink, c.bz, e.rot, _axis, c.tilt, c.ux * hw, c.uz * hw, 1 - 0.22 * sq, _m);
    this.g.world.setMatrix(e, _m);
    // dust and debris at the failing base
    c.dustT -= dt; c.debrisT -= dt;
    if (c.dustT <= 0 && c.sink < e.top) {
      c.dustT = 0.06;
      const a = Math.random() * Math.PI * 2;
      this.g.fx.dust(c.bx + Math.cos(a) * hwX, e.y + 0.3, c.bz + Math.sin(a) * hwZ, Math.max(hwX, hwZ) * 0.5);
    }
    if (c.debrisT <= 0 && c.sink < e.top * 0.8) {
      c.debrisT = 0.12;
      this.g.fx.debris(c.bx - c.ux * hw, e.y + Math.random() * Math.min(e.top, 20), c.bz - c.uz * hw, Math.min(3, 0.15 + e.w * 0.03), e.it?.col ?? 0xbdb6aa);
    }
    if (c.sink > e.top + r * 0.8) { this.g.swallow(e); this.g.onCollapse(e, false); return true; }
    return false;
  }

  activeCount() { return this.bodies.length + this.collapses.length; }

  clear() {
    this.bodies.length = 0;
    this.collapses.length = 0;
    this.stressed.clear();
  }
}

function distXZ(p, h) { return Math.hypot(p.x - h.x, p.z - h.z); }

// Rest pose rotated by `tilt` about a horizontal axis through a base pivot
// (offset ox, oz from the base centre).
function poseAbout(e, x, y, z, rot, axis, tilt, ox, oz, squish, M) {
  const s = e.s || 1, sx = e.sx || s;
  _q.setFromAxisAngle(UP, rot);
  if (e.q) _q.copy(e.q);
  _m2.compose(_p.set(x - ORIGIN.x, y, z - ORIGIN.z), _q, _s.set(sx * squish, s, s * squish));
  if (tilt) {
    _q2.setFromAxisAngle(axis, tilt);
    const px = x + ox - ORIGIN.x, pz = z + oz - ORIGIN.z;
    _m3.makeTranslation(-px, -y, -pz);
    _m2.premultiply(_m3);
    _m3.makeRotationFromQuaternion(_q2);
    _m2.premultiply(_m3);
    _m3.makeTranslation(px, y, pz);
    _m2.premultiply(_m3);
  }
  return M.copy(_m2);
}
