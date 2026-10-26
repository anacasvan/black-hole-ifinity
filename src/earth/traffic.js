// Road traffic: vehicles follow lanes (right-hand traffic), slow down in turns,
// stop at red lights, keep their distance from vehicles, wrecks and pedestrians,
// and brake or flee when a dangerous black hole is on their way.
import * as THREE from 'three';
import { C, roadWidth, laneOffsets, isAvenue } from './citygen.js';
import { KINDS } from './config.js';
import { hash2 } from './rng.js';
import { ORIGIN } from './origin.js';

const CYCLE = 26;
export function lightPhase(i, j, t) { return (t + hash2(i, j, 77) * CYCLE) % CYCLE; }
// axis 'z': vehicles moving along z (north-south roads)
export function carLight(i, j, axis, t) {
  const p = lightPhase(i, j, t);
  if (axis === 'z') return p < 10 ? 'green' : p < 12.5 ? 'yellow' : 'red';
  return p >= 13 && p < 23 ? 'green' : p >= 23 && p < 25.5 ? 'yellow' : 'red';
}
// Pedestrians may start crossing a road whose traffic axis is `axis`.
export function walkSignal(i, j, axis, t) {
  const p = lightPhase(i, j, t);
  return axis === 'z' ? p >= 13 && p < 20.5 : p < 7.5;
}

const right = (hx, hz) => [-hz, hx];
const STOP = 4.2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0);
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();

function crossWidth(i, j, hx) { return hx !== 0 ? roadWidth(i) : roadWidth(j); }
function lanesFor(i, j, hx) { return hx !== 0 ? laneOffsets(j) : laneOffsets(i); }

function lineSeg(i, j, hx, hz, lane) {
  const offs = lanesFor(i, j, hx);
  const o = offs[Math.min(lane, offs.length - 1)];
  const [rx, rz] = right(hx, hz);
  const i2 = i + hx, j2 = j + hz;
  const a = crossWidth(i, j, hx) / 2 + STOP, b = crossWidth(i2, j2, hx) / 2 + STOP;
  const p0 = [i * C + hx * a + rx * o, j * C + hz * a + rz * o];
  const p1 = [i2 * C - hx * b + rx * o, j2 * C - hz * b + rz * o];
  return { type: 'line', p0, p1, len: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), hx, hz, node: [i2, j2], lane: Math.min(lane, offs.length - 1) };
}

function turnSeg(i, j, hx, hz, h2x, h2z, laneIn, laneOut) {
  const oIn = lanesFor(i, j, hx)[laneIn], offsOut = lanesFor(i, j, h2x);
  const lo = Math.min(laneOut, offsOut.length - 1), oOut = offsOut[lo];
  const [rx, rz] = right(hx, hz), [r2x, r2z] = right(h2x, h2z);
  const a = crossWidth(i, j, hx) / 2 + STOP, b = crossWidth(i, j, h2x) / 2 + STOP;
  const N = [i * C, j * C];
  const p0 = [N[0] - hx * a + rx * oIn, N[1] - hz * a + rz * oIn];
  const p1 = [N[0] + h2x * b + r2x * oOut, N[1] + h2z * b + r2z * oOut];
  if (hx === h2x && hz === h2z) {
    return { type: 'line', p0, p1, len: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), hx, hz, cross: true, lane: lo, out: [h2x, h2z], from: [i, j] };
  }
  const c = [N[0] + rx * oIn + r2x * oOut, N[1] + rz * oIn + r2z * oOut];
  let len = 0, px = p0[0], pz = p0[1];
  for (let k = 1; k <= 10; k++) {
    const t = k / 10, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], z = u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1];
    len += Math.hypot(x - px, z - pz); px = x; pz = z;
  }
  const isRight = h2x === rx && h2z === rz;
  return { type: 'curve', p0, p1, c, len, hx, hz, cross: true, lane: lo, out: [h2x, h2z], from: [i, j], turn: isRight ? 'right' : 'left' };
}

function segPose(seg, u, out) {
  if (seg.type === 'line') {
    const t = Math.min(1, u / seg.len);
    out.x = seg.p0[0] + (seg.p1[0] - seg.p0[0]) * t; out.z = seg.p0[1] + (seg.p1[1] - seg.p0[1]) * t;
    out.hx = seg.hx; out.hz = seg.hz;
    return out;
  }
  const t = Math.min(1, u / seg.len), v = 1 - t;
  const { p0, c, p1 } = seg;
  out.x = v * v * p0[0] + 2 * v * t * c[0] + t * t * p1[0];
  out.z = v * v * p0[1] + 2 * v * t * c[1] + t * t * p1[1];
  const dx = 2 * v * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), dz = 2 * v * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
  const l = Math.hypot(dx, dz) || 1;
  out.hx = dx / l; out.hz = dz / l;
  return out;
}

const KIND_TABLE = [
  ['car_city', 26], ['car_sedan', 26], ['car_suv', 16], ['van', 10],
  ['scooter', 6], ['motorbike', 5], ['bicycle', 3], ['bus', 4],
];
const PAINT = [0xd9d9d6, 0x1c1e22, 0x8d939b, 0xa8141d, 0x1b3f80, 0xf3f3f1, 0x4f5d41, 0x63686e, 0x2d5585, 0xbfa063, 0x721d29, 0x3a8cbc, 0x30353c, 0xe5e1d5];
const BUS_PAINT = [0xe8841f, 0x2d6fb8, 0xe9e7e0, 0xc9302c];

export class Traffic {
  constructor(game) {
    this.g = game;
    this.cars = [];
    this.time = 0;
    this.spawnT = 0;
    this.target = 36;
    this._pose = { x: 0, z: 0, hx: 0, hz: 1 };
  }

  setDensity(q) { this.maxCars = q === 'low' ? 22 : q === 'medium' ? 34 : 44; }

  pickKind(avenue) {
    let total = 0;
    for (const [k, w] of KIND_TABLE) if (k !== 'bus' || avenue) total += w;
    let r = Math.random() * total;
    for (const [k, w] of KIND_TABLE) { if (k === 'bus' && !avenue) continue; r -= w; if (r <= 0) return k; }
    return 'car_sedan';
  }

  visible(x, z, rad) {
    const cam = this.g.camera;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    _sph.center.set(x - ORIGIN.x, 1, z - ORIGIN.z);
    _sph.radius = rad;
    return _frustum.intersectsSphere(_sph);
  }

  spawn(initial) {
    const w = this.g.world;
    const full = [...w.chunks.values()].filter(c => c.state === 'full');
    if (!full.length) return false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ch = full[Math.floor(Math.random() * full.length)];
      const alongZ = Math.random() < 0.5;
      const dir = Math.random() < 0.5 ? 1 : -1;
      let i = ch.i, j = ch.j, hx = 0, hz = 0;
      if (alongZ) { hz = dir; if (dir < 0) j = ch.j + 1; } else { hx = dir; if (dir < 0) i = ch.i + 1; }
      const avenue = alongZ ? isAvenue(ch.i) : isAvenue(ch.j);
      const lanes = alongZ ? laneOffsets(ch.i).length : laneOffsets(ch.j).length;
      const seg = lineSeg(i, j, hx, hz, Math.floor(Math.random() * lanes));
      const u = Math.random() * seg.len;
      const pose = segPose(seg, u, {});
      if (this.cars.some(c => Math.hypot(c.x - pose.x, c.z - pose.z) < 12)) continue;
      if (Math.hypot(pose.x - this.g.hole.x, pose.z - this.g.hole.z) < this.g.hole.r * 3 + 6) continue;
      if (!initial && this.visible(pose.x, pose.z, 6)) continue;
      this.add(this.pickKind(avenue), seg, u, pose);
      return true;
    }
    return false;
  }

  add(kind, seg, u, pose) {
    const def = KINDS[kind];
    const ridden = kind === 'scooter' || kind === 'motorbike' || kind === 'bicycle';
    const model = ridden ? `${kind}_r` : kind;
    const pool = this.g.pools.get(model);
    const car = {
      actor: true, system: this, kind, def, model, pool, slot: pool.alloc(), render: 'pool', state: 'rest', stress: 0,
      x: pose.x, y: 0, z: pose.z, rot: Math.atan2(pose.hx, pose.hz), vx: 0, vz: 0, s: 1, sx: 1,
      mass: def.mass, needR: def.needR, seg, u, speed: 4 + Math.random() * 3,
      cruise: kind === 'bicycle' ? 5 : kind === 'bus' ? 8.5 : (isAvenue(seg.hx !== 0 ? seg.node[1] : seg.node[0]) ? 12 : 9) * (0.85 + Math.random() * 0.3),
      len: def.dims[2], blocked: 0, pitch: 0, spin: 0, honkT: 0,
      next: null,
    };
    if (pool.meshes.some(m => m.instanceColor)) pool.color(car.slot, new THREE.Color(kind === 'bus' ? BUS_PAINT[Math.floor(Math.random() * BUS_PAINT.length)] : PAINT[Math.floor(Math.random() * PAINT.length)]));
    if (pool.model.wheels) {
      const wp = this.g.pools.get(pool.model.wheelType ?? 'wheel');
      car.wheels = pool.model.wheels.map(() => wp.alloc());
    }
    car.onRelease = () => { car.vx = 0; car.vz = 0; };
    car.onSettle = () => !this.visible(car.body.p.x, car.body.p.z, 6);
    this.chooseNext(car);
    this.cars.push(car);
    this.render(car, 0);
    return car;
  }

  chooseNext(car) {
    const seg = car.seg;
    if (seg.type === 'line' && !seg.cross) {
      const [i, j] = seg.node;
      const r = Math.random();
      const { hx, hz } = seg;
      let h2 = [hx, hz];
      const [rx, rz] = right(hx, hz);
      if (car.kind !== 'bus' && r < 0.22) h2 = [rx, rz];
      else if (car.kind !== 'bus' && r < 0.42) h2 = [-rx, -rz];
      const offs = lanesFor(i, j, h2[0]);
      const laneOut = h2[0] === rx && h2[1] === rz ? offs.length - 1 : h2[0] === -rx && h2[1] === -rz ? 0 : seg.lane;
      car.next = turnSeg(i, j, hx, hz, h2[0], h2[1], seg.lane, laneOut);
    } else {
      const [i, j] = seg.from;
      const [h2x, h2z] = seg.out;
      car.next = lineSeg(i, j, h2x, h2z, seg.lane);
    }
  }

  update(dt) {
    this.time += dt;
    const g = this.g, hole = g.hole;
    const max = Math.min(this.maxCars ?? 36, g.world.fullCount() * 3);
    this.spawnT -= dt;
    if (this.cars.length < max && this.spawnT <= 0) { this.spawn(false); this.spawnT = 0.25; }
    const limit = (g.world.fullR + 0.7) * C;
    const peds = g.peds.list;
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const car = this.cars[k];
      if (car.state === 'free') continue;
      if (car.state === 'gone') { this.cars.splice(k, 1); continue; }
      const dh = Math.hypot(car.x - hole.x, car.z - hole.z);
      if (dh > limit && !this.visible(car.x, car.z, 8)) { this.remove(car); continue; }
      if (car.blocked > 30 && !this.visible(car.x, car.z, 8)) { this.remove(car); continue; }
      this.drive(car, dt, hole, dh, peds);
    }
  }

  drive(car, dt, hole, dh, peds) {
    const seg = car.seg;
    const pose = segPose(seg, car.u, this._pose);
    const hx = pose.hx, hz = pose.hz;
    let vDes = seg.type === 'curve' ? (seg.turn === 'right' ? 4.6 : 6.2) : car.cruise;
    const remain = seg.len - car.u;
    if (seg.type === 'line' && !seg.cross) {
      const [ni, nj] = seg.node;
      const light = carLight(ni, nj, seg.hx !== 0 ? 'x' : 'z', this.time);
      const stopDist = remain - 0.6;
      if (light !== 'green') {
        const canStop = car.speed * car.speed / (2 * 5) < stopDist + 1;
        if (light === 'red' || canStop) vDes = Math.min(vDes, Math.sqrt(Math.max(0, 2 * 4 * Math.max(0, stopDist))));
      }
      if (car.next && car.next.type === 'curve') {
        const vt = car.next.turn === 'right' ? 4.6 : 6.2;
        vDes = Math.min(vDes, Math.sqrt(vt * vt + 2 * 3 * Math.max(0, remain)));
      }
    }
    // Obstacles ahead: vehicles, wrecks, pedestrians on the road.
    const look = 7 + car.speed * 1.7;
    let gap = Infinity;
    const test = (ox, oz, olen, lat) => {
      const dx = ox - car.x, dz = oz - car.z;
      const along = dx * hx + dz * hz;
      if (along <= 0 || along > look + olen) return;
      if (Math.abs(dx * -hz + dz * hx) > lat) return;
      gap = Math.min(gap, along - car.len / 2 - olen / 2);
    };
    for (const o of this.cars) {
      if (o === car) continue;
      if (o.state === 'free' && o.body) test(o.body.p.x, o.body.p.z, o.len, 2.0);
      else if (o.state !== 'gone') test(o.x, o.z, o.len, 1.5);
    }
    for (const p of peds) if (p.onRoad || p.state === 'free') test(p.x, p.z, 0.6, 1.4);
    for (const b of this.g.physics.bodies) if (!b.actor && b.def.needR > 0.6) test(b.body.p.x, b.body.p.z, 1, 1.8);
    if (gap < Infinity) vDes = Math.min(vDes, Math.sqrt(Math.max(0, 2 * 5 * (gap - 2.2))));
    car.blocked = vDes < 0.3 && car.speed < 0.3 ? car.blocked + dt : 0;
    // Black hole hazard
    const danger = hole.r >= car.needR * 0.6 && dh < hole.r * 3 + 9;
    if (danger) {
      const ahead = ((hole.x - car.x) * hx + (hole.z - car.z) * hz) > 0;
      if (ahead) {
        vDes = 0;
        car.honkT -= dt;
        if (car.honkT <= 0) { car.honkT = 3 + Math.random() * 4; if (dh < hole.r * 3 + 6) this.g.audio?.honk(); }
      } else vDes = Math.max(vDes, car.cruise * 1.35);
    }
    if (car.stress > 0) vDes *= Math.max(0, 1 - car.stress);
    const acc = vDes > car.speed ? 2.6 : -7;
    const prev = car.speed;
    car.speed = vDes > car.speed ? Math.min(vDes, car.speed + acc * dt) : Math.max(vDes, car.speed + acc * dt);
    car.pitch += (((car.speed - prev) / Math.max(dt, 1e-3)) * -0.006 - car.pitch) * Math.min(1, dt * 6);
    car.u += car.speed * dt;
    while (car.u >= car.seg.len) {
      car.u -= car.seg.len;
      car.seg = car.next;
      this.chooseNext(car);
    }
    segPose(car.seg, car.u, this._pose);
    car.vx = this._pose.hx * car.speed; car.vz = this._pose.hz * car.speed;
    car.x = this._pose.x; car.z = this._pose.z;
    car.rot = Math.atan2(this._pose.hx, this._pose.hz);
    this.render(car, dt);
  }

  render(car, dt) {
    const wr = car.pool.model.wheels ? car.pool.model.wheels[0].r : 0.3;
    car.spin = (car.spin + car.speed * dt / wr) % (Math.PI * 2);
    const jx = car.stress > 0 ? Math.sin(this.time * 40) * 0.05 * car.stress : 0;
    _q.setFromAxisAngle(UP, car.rot);
    _q2.setFromAxisAngle(XA, car.pitch);
    _q.multiply(_q2);
    _p.set(car.x - ORIGIN.x + jx, 0, car.z - ORIGIN.z);
    _m.compose(_p, _q, _s);
    this.g.world.setMatrix(car, _m);
  }

  remove(car) {
    if (car.slot >= 0) {
      car.pool.release(car.slot);
      if (car.wheels) { const wp = this.g.pools.get(car.pool.model.wheelType ?? 'wheel'); for (const s of car.wheels) wp.release(s); }
      car.slot = -1;
    }
    car.state = 'gone';
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  clear() { for (const c of [...this.cars]) this.remove(c); }
  onRebase() { for (const c of this.cars) if (c.state === 'rest') this.render(c, 0); }
}
