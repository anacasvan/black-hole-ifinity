// Pedestrians: articulated, animated people (instanced body parts) walking on
// sidewalks, crossing at zebra crossings with the walk signal, running away
// from a dangerous black hole, and getting back up if they are knocked over.
import * as THREE from 'three';
import { C, blockBounds, CURB } from './citygen.js';
import { KINDS } from './config.js';
import { walkSignal } from './traffic.js';
import { ORIGIN } from './origin.js';
import { Writer } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _root = new THREE.Matrix4(), _t = new THREE.Matrix4(), _a = new THREE.Matrix4(), _b = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

const SKIN = [0xf1d0b5, 0xe7c3a1, 0xd8a982, 0xc08a62, 0x8d5a3b, 0x6a412a];
const SHIRT = [0xf2f2ee, 0x2b3a55, 0xa8322d, 0x3f6e4a, 0xd9b44a, 0x6a4e8a, 0x22262b, 0x8fb3cf, 0xc7653a, 0x9aa0a6, 0xe8a7b5, 0x3b7a8c];
const PANTS = [0x23262b, 0x2f3b54, 0x4a4136, 0x6b6f75, 0x1d2a44, 0x8a7a5a, 0xd8d2c4];
const HAIR = [0x1a1410, 0x2b1d14, 0x5a3a22, 0x8a5a2b, 0xc9a36a, 0x9c9c9c, 0x3a2418];

function geom(build) { const w = new Writer(); build(w); return w.toGeometry(); }
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 2, 7);

const PART_GEOS = () => ({
  pelvis: geom(w => w.add(cap(0.11, 0.15).rotateZ(Math.PI / 2).scale(1, 1, 0.85), null, 0xffffff)),
  torso: geom(w => {
    w.add(new THREE.CylinderGeometry(0.185, 0.155, 0.46, 9).translate(0, 0.23, 0).scale(1, 1, 0.62), null, 0xffffff);
    w.add(cap(0.075, 0.26).rotateZ(Math.PI / 2).translate(0, 0.42, 0).scale(1, 1, 0.9), null, 0xffffff);
  }),
  head: geom(w => {
    w.add(new THREE.CylinderGeometry(0.048, 0.055, 0.1, 8).translate(0, 0.05, 0), null, 0xffffff);
    w.add(new THREE.SphereGeometry(0.105, 10, 8).scale(0.92, 1.08, 1).translate(0, 0.17, 0.005), null, 0xffffff);
    w.add(new THREE.SphereGeometry(0.03, 6, 5).translate(0, 0.16, 0.1), null, 0xf0f0f0);
  }),
  hair: geom(w => w.add(new THREE.SphereGeometry(0.115, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.185, -0.012), null, 0xffffff)),
  hairL: geom(w => {
    w.add(new THREE.SphereGeometry(0.117, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(0, 0.185, -0.012), null, 0xffffff);
    w.add(cap(0.085, 0.16).scale(1.1, 1, 0.6).translate(0, 0.1, -0.075), null, 0xffffff);
  }),
  uarm: geom(w => w.add(cap(0.05, 0.18).translate(0, -0.14, 0), null, 0xffffff)),
  farm: geom(w => { w.add(cap(0.042, 0.18).translate(0, -0.13, 0), null, 0xffffff); w.add(new THREE.SphereGeometry(0.046, 8, 6).scale(0.8, 1, 0.6).translate(0, -0.29, 0), null, 0xffffff); }),
  thigh: geom(w => w.add(cap(0.075, 0.3).translate(0, -0.22, 0), null, 0xffffff)),
  shin: geom(w => {
    w.add(cap(0.058, 0.3).translate(0, -0.2, 0), null, 0xffffff);
    w.add(new THREE.BoxGeometry(0.1, 0.07, 0.25).translate(0, -0.445, 0.04), null, 0x333333);
  }),
});

const PART_MAT = { pelvis: 'cloth', torso: 'cloth', head: 'skin', hair: 'cloth', hairL: 'cloth', uarm: 'cloth', farm: 'skin', thigh: 'cloth', shin: 'cloth' };

class PartPool {
  constructor(scene, geo, material, cap) {
    this.mesh = new THREE.InstancedMesh(geo, material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
    this.free = []; this.top = 0; this.cap = cap;
  }
  alloc() {
    if (this.free.length) return this.free.pop();
    if (this.top >= this.cap) return -1;
    const s = this.top++;
    this.mesh.count = this.top;
    return s;
  }
  release(s) { if (s < 0) return; this.mesh.setMatrixAt(s, ZERO); this.free.push(s); }
  set(s, M) { if (s >= 0) this.mesh.setMatrixAt(s, M); }
  color(s, c) { if (s >= 0) this.mesh.setColorAt(s, c); }
  flush() { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function ringCorner(i, j, k, po) {
  const b = blockBounds(i, j);
  return [[b.x0 + po, b.z0 + po], [b.x1 - po, b.z0 + po], [b.x1 - po, b.z1 - po], [b.x0 + po, b.z1 - po]][k];
}

// Crossings from block corner k: [targetBlockDi, targetBlockDj, targetCorner, node di, node dj, traffic axis crossed]
const CROSS = {
  0: [[-1, 0, 1, 0, 0, 'z'], [0, -1, 3, 0, 0, 'x']],
  1: [[1, 0, 0, 1, 0, 'z'], [0, -1, 2, 1, 0, 'x']],
  2: [[1, 0, 3, 1, 1, 'z'], [0, 1, 1, 1, 1, 'x']],
  3: [[-1, 0, 2, 0, 1, 'z'], [0, 1, 0, 0, 1, 'x']],
};

export class Peds {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.time = 0;
    this.spawnT = 0;
    this.max = 60;
    const geos = PART_GEOS();
    this.parts = {};
    for (const [k, geo] of Object.entries(geos)) this.parts[k] = new PartPool(game.scene, geo, game.mats.simple[PART_MAT[k]], k === 'uarm' || k === 'farm' || k === 'thigh' || k === 'shin' ? 256 : 128);
  }

  setDensity(q) { this.max = q === 'low' ? 30 : q === 'medium' ? 48 : 64; }

  spawn(initial) {
    const full = [...this.g.world.chunks.values()].filter(c => c.state === 'full');
    if (!full.length) return false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ch = full[Math.floor(Math.random() * full.length)];
      const po = 2.1 + Math.random() * 0.7;
      const k = Math.floor(Math.random() * 4), dir = Math.random() < 0.5 ? 1 : -1;
      const a = ringCorner(ch.i, ch.j, k, po), b = ringCorner(ch.i, ch.j, (k + dir + 4) % 4, po);
      const t = Math.random();
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (Math.hypot(x - this.g.hole.x, z - this.g.hole.z) < this.g.hole.r * 4 + 4) continue;
      if (!initial && this.g.traffic.visible(x, z, 2)) continue;
      this.add(ch.i, ch.j, k, dir, po, x, z);
      return true;
    }
    return false;
  }

  add(i, j, k, dir, po, x, z) {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const s = 0.88 + Math.random() * 0.2;
    const longHair = Math.random() < 0.4;
    const p = {
      actor: true, system: this, kind: 'ped', def: KINDS.ped, render: 'ped', state: 'rest', stress: 0,
      x, y: CURB, z, rot: 0, vx: 0, vz: 0, s, sx: s, mass: KINDS.ped.mass, needR: KINDS.ped.needR,
      bi: i, bj: j, k: (k + dir + 4) % 4, dir, po, mode: 'walk', wait: 0,
      tx: 0, tz: 0, speed: 1.15 + Math.random() * 0.4, cur: 0, phase: Math.random() * 6.28, run: 0,
      onRoad: false, getup: 0, flail: Math.random() * 6,
      slots: {}, longHair,
    };
    const col = {
      skin: new THREE.Color(pick(SKIN)), shirt: new THREE.Color(pick(SHIRT)), pants: new THREE.Color(pick(PANTS)), hair: new THREE.Color(pick(HAIR)),
    };
    const sleeves = Math.random() < 0.5;
    const add = (name, c, n = 1) => {
      const arr = [];
      for (let q = 0; q < n; q++) { const sl = this.parts[name].alloc(); this.parts[name].color(sl, c); arr.push(sl); }
      p.slots[name] = arr;
    };
    add('pelvis', col.pants); add('torso', col.shirt); add('head', col.skin);
    add(longHair ? 'hairL' : 'hair', col.hair);
    add('uarm', col.shirt, 2); add('farm', sleeves ? col.shirt : col.skin, 2);
    add('thigh', col.pants, 2); add('shin', col.pants, 2);
    const t = ringCorner(i, j, p.k, po);
    p.tx = t[0]; p.tz = t[1];
    p.rot = Math.atan2(p.tx - x, p.tz - z);
    p.onRelease = () => { p.mode = 'free'; p.onRoad = false; };
    p.onSettle = () => this.startGetup(p);
    this.list.push(p);
    return p;
  }

  remove(p) {
    for (const [name, arr] of Object.entries(p.slots)) for (const s of arr) this.parts[name].release(s);
    p.slots = {};
    p.state = 'gone';
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }

  startGetup(p) {
    const b = p.body;
    if (!b) return false;
    p.getupFrom = b.q.clone();
    p.x = b.p.x; p.z = b.p.z;
    const e = new THREE.Euler().setFromQuaternion(b.q, 'YXZ');
    p.rot = e.y;
    p.body = null;
    p.state = 'rest';
    p.mode = 'getup';
    p.getup = 0;
    this.g.physics.stressed.delete(p);
    return true; // leaves the physics simulation
  }

  // After getting up: back to the nearest sidewalk ring.
  rejoin(p) {
    const i = Math.floor(p.x / C), j = Math.floor(p.z / C);
    let best = null;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (let k = 0; k < 4; k++) {
        const c = ringCorner(i + di, j + dj, k, p.po);
        const d = Math.hypot(c[0] - p.x, c[1] - p.z);
        if (!best || d < best.d) best = { d, bi: i + di, bj: j + dj, k };
      }
    }
    p.bi = best.bi; p.bj = best.bj; p.k = best.k;
    const c = ringCorner(p.bi, p.bj, p.k, p.po);
    p.tx = c[0]; p.tz = c[1];
    p.mode = 'walk';
  }

  update(dt) {
    this.time += dt;
    const g = this.g, hole = g.hole;
    const full = g.world.fullCount();
    const max = Math.min(this.max, full * 7);
    this.spawnT -= dt;
    if (this.list.length < max && this.spawnT <= 0) { this.spawn(false); this.spawnT = 0.2; }
    const limit = (g.world.fullR + 0.7) * C;
    const danger = hole.r >= 0.55;
    // Spatial grid (2 m cells) so pedestrians can make room for each other.
    const grid = this.grid || (this.grid = new Map());
    grid.clear();
    for (const p of this.list) {
      if (p.state !== 'rest') continue;
      const k = `${Math.floor(p.x / 2)},${Math.floor(p.z / 2)}`;
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(p);
    }
    for (let n = this.list.length - 1; n >= 0; n--) {
      const p = this.list[n];
      if (p.state === 'gone') { this.list.splice(n, 1); continue; }
      if (p.state === 'free') { this.drawFree(p, dt); continue; }
      const dh = Math.hypot(p.x - hole.x, p.z - hole.z);
      if (dh > limit && !g.traffic.visible(p.x, p.z, 2)) { this.remove(p); continue; }
      this.think(p, dt, hole, dh, danger);
      this.draw(p, dt);
    }
  }

  think(p, dt, hole, dh, danger) {
    if (p.mode === 'getup') {
      p.getup += dt / 0.9;
      if (p.getup >= 1) { p.getupFrom = null; this.rejoin(p); }
      p.cur = 0;
      return;
    }
    const fleeR = hole.r * 4 + 3;
    if (danger && dh < fleeR) {
      if (p.mode !== 'flee') { p.mode = 'flee'; this.fleeTarget(p, hole); }
    } else if (p.mode === 'flee' && dh > fleeR * 1.4) {
      p.mode = 'walk';
    }
    const running = p.mode === 'flee';
    let target = running ? 3.6 + p.speed * 0.6 : p.speed;
    if (p.mode === 'wait') target = 0;
    else {
      // Someone right ahead: step aside if they come towards us, slow down if they go our way.
      const fx = Math.sin(p.rot), fz = Math.cos(p.rot);
      const gx = Math.floor(p.x / 2), gz = Math.floor(p.z / 2);
      for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iz = gz - 1; iz <= gz + 1; iz++) {
        const cell = this.grid.get(`${ix},${iz}`);
        if (!cell) continue;
        for (const q of cell) {
          if (q === p) continue;
          const dx = q.x - p.x, dz = q.z - p.z;
          const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
          if (ahead <= 0 || ahead > 1.1 || side > 0.55) continue;
          const facing = Math.sin(q.rot) * fx + Math.cos(q.rot) * fz;
          if (facing < 0) { p.latT = 0.5; p.latHold = 1.2; }
          else if (!running) target = Math.min(target, q.cur * 0.9);
        }
      }
    }
    p.latHold = Math.max(0, (p.latHold || 0) - dt);
    if (p.latHold <= 0) p.latT = 0;
    p.lat = (p.lat || 0) + ((p.latT || 0) - (p.lat || 0)) * Math.min(1, dt * 3);
    if (p.stress > 0) target *= Math.max(0.2, 1 - p.stress);
    p.cur += (target - p.cur) * Math.min(1, dt * (running ? 4 : 2.5));
    p.run += ((running ? 1 : 0) - p.run) * Math.min(1, dt * 4);
    if (p.mode === 'wait') {
      p.wait += dt;
      const c = p.pending;
      if (walkSignal(c.ni, c.nj, c.axis, this.g.traffic.time) || p.wait > 40) this.beginCross(p);
      return;
    }
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15 + p.cur * dt) {
      p.x = p.tx; p.z = p.tz;
      this.arrive(p, hole);
      return;
    }
    const step = Math.min(d, p.cur * dt);
    p.x += dx / d * step; p.z += dz / d * step;
    p.vx = dx / d * p.cur; p.vz = dz / d * p.cur;
    const want = Math.atan2(dx, dz);
    let dr = want - p.rot;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    p.rot += dr * Math.min(1, dt * 8);
    p.y = p.onRoad ? 0 : CURB;
  }

  arrive(p, hole) {
    if (p.mode === 'cross') {
      p.onRoad = false;
      p.bi = p.cross.bi; p.bj = p.cross.bj; p.k = p.cross.k;
      p.mode = 'walk';
    }
    const opts = CROSS[p.k];
    const fleeing = p.mode === 'flee';
    if (fleeing) {
      // keep running away: pick the neighbour (corner or crossing) farthest from the hole
      const cand = [];
      for (const dir of [1, -1]) {
        const k2 = (p.k + dir + 4) % 4;
        const c = ringCorner(p.bi, p.bj, k2, p.po);
        cand.push({ d: Math.hypot(c[0] - hole.x, c[1] - hole.z), walk: k2 });
      }
      for (const o of opts) {
        const bi = p.bi + o[0], bj = p.bj + o[1];
        if (!this.g.world.isFull(bi, bj)) continue;
        const c = ringCorner(bi, bj, o[2], p.po);
        cand.push({ d: Math.hypot(c[0] - hole.x, c[1] - hole.z), cross: o });
      }
      cand.sort((a, b) => b.d - a.d);
      const best = cand[0];
      if (best.cross) { this.setCross(p, best.cross); this.beginCross(p); p.mode = 'flee'; }
      else this.walkTo(p, best.walk);
      return;
    }
    if (Math.random() < 0.4) {
      const o = opts[Math.floor(Math.random() * opts.length)];
      if (this.g.world.isFull(p.bi + o[0], p.bj + o[1])) {
        this.setCross(p, o);
        p.mode = 'wait';
        p.wait = 0;
        return;
      }
    }
    if (Math.random() < 0.15) p.dir = -p.dir;
    this.walkTo(p, (p.k + p.dir + 4) % 4);
  }

  walkTo(p, k2) {
    p.k = k2;
    const c = ringCorner(p.bi, p.bj, k2, p.po);
    p.tx = c[0]; p.tz = c[1];
    if (p.mode !== 'flee') p.mode = 'walk';
  }

  setCross(p, o) {
    p.pending = { ni: p.bi + o[3], nj: p.bj + o[4], axis: o[5] };
    p.cross = { bi: p.bi + o[0], bj: p.bj + o[1], k: o[2] };
  }

  beginCross(p) {
    const c = ringCorner(p.cross.bi, p.cross.bj, p.cross.k, p.po);
    p.tx = c[0]; p.tz = c[1];
    p.mode = 'cross';
    p.onRoad = true;
  }

  fleeTarget(p, hole) {
    const a = ringCorner(p.bi, p.bj, p.k, p.po);
    const kb = (p.k - p.dir + 4) % 4;
    const b = ringCorner(p.bi, p.bj, kb, p.po);
    const da = Math.hypot(a[0] - hole.x, a[1] - hole.z), db = Math.hypot(b[0] - hole.x, b[1] - hole.z);
    if (p.onRoad) return; // finish the crossing quickly
    if (db > da) { p.dir = -p.dir; p.k = kb; p.tx = b[0]; p.tz = b[1]; }
  }

  // ---- rendering ---------------------------------------------------------
  draw(p, dt) {
    const run = p.run;
    const freq = 4.3 - run * 1.7;
    p.phase += p.cur * dt * freq;
    const ph = p.phase;
    const amp = (0.42 + run * 0.42) * Math.min(1, p.cur / 1.1);
    _q.setFromAxisAngle(UP, p.rot);
    if (p.mode === 'getup' && p.getupFrom) {
      const t = Math.min(1, p.getup);
      _q2.copy(p.getupFrom).slerp(_q, t * t * (3 - 2 * t));
      _q.copy(_q2);
    }
    // Sidestep offset to the walker's right (keeps them on the sidewalk).
    const lat = p.lat || 0;
    _p.set(p.x - ORIGIN.x - Math.cos(p.rot) * lat, p.y, p.z - ORIGIN.z + Math.sin(p.rot) * lat);
    _root.compose(_p, _q, _s.set(p.s, p.s, p.s));
    this.skeleton(p, _root, {
      bob: Math.abs(Math.sin(ph)) * 0.035 * Math.min(1, p.cur),
      lean: 0.04 + run * 0.24,
      leg: Math.sin(ph) * amp,
      knee: (0.08 + Math.max(0, Math.sin(ph + 1.0)) * (0.5 + run * 0.7)) * Math.min(1, p.cur / 0.6 + 0.2),
      knee2: (0.08 + Math.max(0, Math.sin(ph + 1.0 + Math.PI)) * (0.5 + run * 0.7)) * Math.min(1, p.cur / 0.6 + 0.2),
      arm: Math.sin(ph) * amp * 0.8,
      elbow: -(0.2 + run * 1.2),
      armUp: 0,
    });
  }

  drawFree(p, dt) {
    if (!p.body) return;
    p.flail += dt * 12;
    this.g.physics.bodyMatrix(p, this.g.hole, _root);
    const f = p.flail;
    this.skeleton(p, _root, {
      bob: 0, lean: -0.2 + Math.sin(f * 0.7) * 0.2,
      leg: Math.sin(f) * 0.6, knee: 0.6 + Math.sin(f * 1.3) * 0.4, knee2: 0.6 + Math.cos(f * 1.1) * 0.4,
      arm: Math.sin(f * 1.4) * 0.5, elbow: -0.6, armUp: -2.5,
    });
  }

  skeleton(p, root, a) {
    const P = this.parts, S = p.slots;
    // pelvis & torso
    _a.copy(root).multiply(_t.makeTranslation(0, 0.95 + a.bob, 0));
    P.pelvis.set(S.pelvis[0], _a);
    const torso = _b.copy(root).multiply(_t.makeTranslation(0, 1.0 + a.bob, 0)).multiply(_t.makeRotationX(a.lean));
    P.torso.set(S.torso[0], torso);
    _m.copy(torso).multiply(_t.makeTranslation(0, 0.46, 0)).multiply(_t.makeRotationX(-a.lean * 0.6));
    P.head.set(S.head[0], _m);
    (p.longHair ? P.hairL : P.hair).set((S.hairL || S.hair)[0], _m);
    for (let side = 0; side < 2; side++) {
      const sx = side ? 1 : -1;
      const swing = side ? -a.arm : a.arm;
      const up = a.armUp ? a.armUp + Math.sin(p.flail * (1 + side * 0.3)) * 0.4 : 0;
      _m.copy(torso).multiply(_t.makeTranslation(sx * 0.215, 0.42, 0)).multiply(_t.makeRotationX(swing + up)).multiply(_t.makeRotationZ(sx * (0.08 + (a.armUp ? 0.4 : 0))));
      P.uarm.set(S.uarm[side], _m);
      _m.multiply(_t.makeTranslation(0, -0.28, 0)).multiply(_t.makeRotationX(a.elbow));
      P.farm.set(S.farm[side], _m);
      const leg = side ? a.leg : -a.leg;
      _m.copy(root).multiply(_t.makeTranslation(sx * 0.09, 0.92 + a.bob, 0)).multiply(_t.makeRotationX(-leg));
      P.thigh.set(S.thigh[side], _m);
      _m.multiply(_t.makeTranslation(0, -0.44, 0)).multiply(_t.makeRotationX(side ? a.knee2 : a.knee));
      P.shin.set(S.shin[side], _m);
    }
  }

  flush() { for (const pp of Object.values(this.parts)) pp.flush(); }

  lod(camDist, shadowsOn) {
    for (const pp of Object.values(this.parts)) { pp.mesh.visible = camDist < 320; pp.mesh.castShadow = shadowsOn && camDist < 140; }
  }
  clear() { for (const p of [...this.list]) this.remove(p); }
}
