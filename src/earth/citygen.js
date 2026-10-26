// Deterministic city layout. Each chunk (C x C metres) owns: the intersection at
// its south-west corner, the road leg to the north of it (west road), the road
// leg to the east of it (south road) and one urban block. Pure data, no three.js.

import { hash2, rngFor, vnoise } from './rng.js';
import { KINDS, buildingNeedR, buildingMass } from './config.js';

export const C = 64;
export const SIDEWALK = 3.6;
export const CURB = 0.14;
const mod = (a, n) => ((a % n) + n) % n;
export const isAvenue = k => mod(k, 4) === 0 || (k >= -1 && k <= 2);
export const roadWidth = k => (isAvenue(k) ? 15 : 9);
export const laneOffsets = k => (isAvenue(k) ? [1.9, 5.3] : [2.3]);
export const chunkKey = (i, j) => `${i},${j}`;
export const START_CHUNK = [3, 1];

export function blockBounds(i, j) {
  return {
    x0: i * C + roadWidth(i) / 2, x1: (i + 1) * C - roadWidth(i + 1) / 2,
    z0: j * C + roadWidth(j) / 2, z1: (j + 1) * C - roadWidth(j + 1) / 2,
  };
}

export function groundHeight(x, z) {
  const i = Math.floor(x / C), j = Math.floor(z / C);
  const b = blockBounds(i, j);
  return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 ? CURB : 0;
}

export function zoneOf(i, j) {
  if (i === START_CHUNK[0] && j === START_CHUNK[1]) return 'park';
  // Keep the start surroundings varied: residential to the east, centre to the west.
  if (i === START_CHUNK[0] + 1 && j === START_CHUNK[1]) return 'residential';
  if (i === START_CHUNK[0] && j === START_CHUNK[1] - 1) return 'downtown';
  const dens = 1.3 * Math.exp(-((i + 0.5) ** 2 + (j + 0.5) ** 2) / 16) + 0.6 * (vnoise(i / 8.5, j / 8.5, 7) - 0.45);
  const h = hash2(i, j, 31);
  if (dens > 1.0) return 'cbd';
  if (h < 0.11) return 'park';
  if (dens > 0.5) return h > 0.88 ? 'commercial' : 'downtown';
  if (h > 0.9 && dens > 0.05) return 'commercial';
  return dens > 0.28 && h > 0.5 ? 'downtown' : 'residential';
}

export function startPosition() {
  const b = blockBounds(...START_CHUNK);
  return { x: (b.x0 + b.x1) / 2 + 7, z: (b.z0 + b.z1) / 2 - 1.2 };
}

const PAL = {
  car: [0xd9d9d6, 0x1c1e22, 0x8d939b, 0xa8141d, 0x1b3f80, 0xf3f3f1, 0x4f5d41, 0x63686e, 0x2d5585, 0xbfa063, 0x721d29, 0x3a8cbc, 0xe8e2d0, 0x30353c],
  plaster: [0xf1e3c8, 0xeacfb0, 0xf4d9a6, 0xe8c2a4, 0xe9e4da, 0xdcd4c6, 0xf0d6bd, 0xefe6c6, 0xdcc5a3, 0xf2dcc9, 0xd8dcd2],
  roof: [0xb4553a, 0xa64a33, 0xc06a48, 0x8e4634, 0x6e6a66],
  awning: [0x2f6d4f, 0xa8322d, 0x26466f, 0xd88a1e, 0x5b3a6e, 0x30302f, 0x7a4a2a],
  bin: [0x3d6b43, 0x5d6266, 0x2f5f8a, 0x7a5a32],
  umbrella: [0xf0ede4, 0xb83a32, 0x2e5b78, 0x3e6e4a, 0xd9a03a],
  scooter: [0xe8e6e0, 0x9b1b1e, 0x1e3a6a, 0x2d2f33, 0x7fb0c8, 0xd8c27a],
};

const SIGNS = { BAR: 0, PIZZERIA: 1, FARMACIA: 2, MARKET: 3, TABACCHI: 4, GELATERIA: 5, BANCA: 6, HOTEL: 7, BOUTIQUE: 8, LIBRERIA: 9, PANETTERIA: 10, OTTICA: 11, SUPERMERCATO: 12, LOGISTICA: 13, CAFFE: 14, RISTORANTE: 15 };
const SHOP_SIGNS = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 14, 15];

// ---------------------------------------------------------------------------

class Gen {
  constructor(i, j) {
    this.i = i; this.j = j;
    this.r = rngFor(i, j, 101);
    this.zone = zoneOf(i, j);
    this.items = [];
    this.decor = [];
    this.circles = [];
    this.rects = [];
    this.b = blockBounds(i, j);
    const s = SIDEWALK, b = this.b;
    this.L = { x0: b.x0 + s, x1: b.x1 - s, z0: b.z0 + s, z1: b.z1 - s };
  }
  free(x, z, rad) {
    for (const c of this.circles) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + rad) ** 2) return false;
    for (const q of this.rects) if (x + rad > q.x0 && x - rad < q.x1 && z + rad > q.z0 && z - rad < q.z1) return false;
    return true;
  }
  inLot(x, z, rad) {
    const L = this.L;
    return x - rad > L.x0 && x + rad < L.x1 && z - rad > L.z0 && z + rad < L.z1;
  }
  prop(kind, x, z, rot = 0, o = {}) {
    const it = { t: 'p', kind, x, z, rot, ...o };
    this.items.push(it);
    if (!o.noBlock) this.circles.push({ x, z, r: o.rad ?? Math.max(KINDS[kind].dims[0], KINDS[kind].dims[2]) * 0.5 });
    return it;
  }
  tryProp(kind, x, z, rot, o = {}, rad) {
    const rr = rad ?? Math.max(KINDS[kind].dims[0], KINDS[kind].dims[2]) * 0.5;
    if (!this.free(x, z, rr)) return null;
    return this.prop(kind, x, z, rot, { ...o, rad: rr });
  }
  tiny(kind, x, z) {
    const r = this.r;
    this.items.push({ t: 'p', kind, x, z, rot: r() * 6.283, v: r.int(0, 3) });
  }
  building(kind, x, z, w, d, rot, o = {}) {
    const turned = Math.abs(Math.sin(rot)) > 0.5;
    const fw = turned ? d : w, fd = turned ? w : d;
    const ew = o.footW ?? w, ed = o.footD ?? d;
    const needR = buildingNeedR(kind, ew, ed);
    const it = { t: 'b', kind, x, z, w, d, rot, needR, mass: buildingMass(needR) * (o.massMul ?? 1), seed: Math.floor(this.r() * 1e9), ...o };
    this.items.push(it);
    this.rects.push({ x0: x - fw / 2 - 0.3, x1: x + fw / 2 + 0.3, z0: z - fd / 2 - 0.3, z1: z + fd / 2 + 0.3 });
    return it;
  }
  decorRect(type, x0, z0, x1, z1, o = {}) {
    const d = { type, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), ...o };
    this.decor.push(d);
    if (o.block) this.rects.push({ x0: d.x0, z0: d.z0, x1: d.x1, z1: d.z1 });
    return d;
  }
  // A lot frame: u along the frontage (0 = centre), v depth measured from the street edge.
  frame(rect, side) {
    const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
    const f = { side };
    if (side === 'S') { f.at = (u, v) => [cx + u, rect.z0 + v]; f.rot = Math.PI; f.W = rect.x1 - rect.x0; f.D = rect.z1 - rect.z0; }
    else if (side === 'N') { f.at = (u, v) => [cx - u, rect.z1 - v]; f.rot = 0; f.W = rect.x1 - rect.x0; f.D = rect.z1 - rect.z0; }
    else if (side === 'W') { f.at = (u, v) => [rect.x0 + v, cz - u]; f.rot = -Math.PI / 2; f.W = rect.z1 - rect.z0; f.D = rect.x1 - rect.x0; }
    else { f.at = (u, v) => [rect.x1 - v, cz + u]; f.rot = Math.PI / 2; f.W = rect.z1 - rect.z0; f.D = rect.x1 - rect.x0; }
    f.rect = (type, u0, v0, u1, v1, o) => {
      const [ax, az] = f.at(u0, v0), [bx, bz] = f.at(u1, v1);
      return this.decorRect(type, ax, az, bx, bz, o);
    };
    return f;
  }
  line(kind, x0, z0, x1, z1, gaps = []) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2));
    const seg = len / n, dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const rot = Math.atan2(-dz, dx);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) * seg;
      if (gaps.some(([a, b]) => t > a - 1 && t < b + 1)) continue;
      const x = x0 + dx * t, z = z0 + dz * t;
      if (!this.free(x, z, 0.35)) continue;
      this.prop(kind, x, z, rot, { rad: 0.9, sx: seg / 2 });
    }
  }
  scatter(kind, n, x0, z0, x1, z1, avoid = true) {
    const r = this.r;
    for (let k = 0; k < n; k++) {
      const x = r.range(x0, x1), z = r.range(z0, z1);
      if (avoid && !this.free(x, z, 0.12)) continue;
      this.tiny(kind, x, z);
    }
  }
}

const carKinds = ['car_city', 'car_city', 'car_sedan', 'car_sedan', 'car_suv'];
const treeKinds = ['tree', 'tree', 'tree', 'tree_small', 'tree_pine', 'tree_birch', 'tree_cypress'];

function treeItem(g, kind, x, z) {
  const r = g.r;
  const rad = kind === 'tree_cypress' ? 1.0 : kind === 'tree_small' ? 1.4 : 2.3;
  if (!g.free(x, z, rad) || !g.inLot(x, z, rad * 0.5)) return null;
  return g.prop(kind, x, z, r() * 6.283, { v: r.int(0, 2), s: r.range(0.85, 1.15), rad });
}

function parkedCar(g, x, z, rot, kind) {
  const r = g.r;
  return g.prop(kind ?? r.pick(carKinds), x, z, rot, { col: r.pick(PAL.car), rad: 1.2 });
}

// ---------------------------------------------------------------------------
// Sidewalk furniture shared by every zone.

function sidewalk(g) {
  const { b, r, zone } = g;
  const edges = [
    { side: 'S', sx: b.x0, sz: b.z0, ax: 1, az: 0, len: b.x1 - b.x0, nx: 0, nz: -1, road: g.j },
    { side: 'E', sx: b.x1, sz: b.z0, ax: 0, az: 1, len: b.z1 - b.z0, nx: 1, nz: 0, road: g.i + 1 },
    { side: 'N', sx: b.x1, sz: b.z1, ax: -1, az: 0, len: b.x1 - b.x0, nx: 0, nz: 1, road: g.j + 1 },
    { side: 'W', sx: b.x0, sz: b.z1, ax: 0, az: -1, len: b.z1 - b.z0, nx: -1, nz: 0, road: g.i },
  ];
  const at = (e, t, off) => [e.sx + e.ax * t - e.nx * off, e.sz + e.az * t - e.nz * off];
  for (const e of edges) {
    const toRoad = Math.atan2(e.nx, e.nz);
    const toLot = toRoad + Math.PI;
    // Traffic light at the corner where the edge starts (one per block corner).
    {
      const [x, z] = at(e, 0.75, 0.75);
      g.prop('tlight', x, z, Math.atan2(e.nx - e.ax, e.nz - e.az), { rad: 0.4 });
    }
    if (zone === 'downtown' || zone === 'cbd') {
      for (const t of [3.4, e.len - 3.4]) { const [x, z] = at(e, t, 0.35); g.prop('bollard', x, z, 0, { rad: 0.2 }); }
    }
    const avenue = isAvenue(e.road);
    let busAt = -100;
    if (avenue && r.chance(0.55)) {
      busAt = e.len * r.range(0.4, 0.6);
      const [x, z] = at(e, busAt, 1.15);
      g.prop('busstop', x, z, toRoad, { rad: 1.9 });
    }
    let k = 0;
    for (let t = 7; t < e.len - 6; t += 4, k++) {
      if (Math.abs(t - busAt) < 4) continue;
      const slot = k % 4;
      if (slot === 1) {
        const [x, z] = at(e, t, 0.5);
        g.prop('lamp', x, z, toRoad, { rad: 0.3 });
        continue;
      }
      const roll = r();
      if (slot === 3 && (zone === 'residential' || zone === 'downtown') && roll < 0.75) {
        const [x, z] = at(e, t, 1.0);
        g.prop(r.chance(0.7) ? 'tree_small' : 'tree', x, z, r() * 6.28, { v: r.int(0, 2), s: r.range(0.8, 1.0), rad: 0.6, pit: true });
        for (let q = 0; q < 4; q++) { const [lx, lz] = at(e, t + r.range(-2, 2), r.range(0.2, 3.2)); g.tiny('leaf', lx, lz); }
        continue;
      }
      if (roll < 0.22) { const [x, z] = at(e, t, 1.55); g.prop('bench', x, z, toLot + Math.PI, { col: 0x6b4a2f }); }
      else if (roll < 0.4) { const [x, z] = at(e, t, 0.45); g.prop('bin', x, z, toLot, { col: r.pick(PAL.bin) }); }
      else if (roll < 0.48) { const [x, z] = at(e, t, 0.45); g.prop('hydrant', x, z, r() * 6.28); }
      else if (roll < 0.6 && zone !== 'residential') {
        for (let q = 0; q < r.int(2, 4); q++) {
          const [x, z] = at(e, t - 1.2 + q * 0.8, 1.05);
          g.prop('bicycle', x, z, toRoad, { col: r.pick(PAL.car), rad: 0.3 });
        }
      } else if (roll < 0.72) {
        const kind = r.chance(0.6) ? 'scooter' : 'motorbike';
        for (let q = 0; q < r.int(1, 3); q++) {
          const [x, z] = at(e, t - 1 + q * 1.0, 1.05);
          g.prop(kind, x, z, toRoad, { col: r.pick(PAL.scooter), rad: 0.4 });
        }
      } else if (roll < 0.8) { const [x, z] = at(e, t, 0.4); g.prop('sign', x, z, toRoad, { v: r.int(0, 2) }); }
      else if (roll < 0.86 && zone === 'downtown') { const [x, z] = at(e, t, 3.25); g.prop('flowerpot', x, z, 0, { col: 0xb0643c }); }
    }
    // Roadworks: a few cones on the sidewalk.
    if (r.chance(0.18)) {
      const t0 = r.range(8, e.len - 12);
      for (let q = 0; q < 4; q++) { const [x, z] = at(e, t0 + q * 1.3, 0.55); g.prop('cone', x, z, r() * 6.28, { rad: 0.2 }); }
    }
    for (let q = 0; q < 5; q++) { const [x, z] = at(e, r.range(1, e.len - 1), r.range(0.25, 3.3)); g.tiny('litter', x, z); }
    for (let q = 0; q < 3; q++) { const [x, z] = at(e, r.range(1, e.len - 1), r.range(0.2, 3.3)); g.tiny('leaf', x, z); }
  }
}

// ---------------------------------------------------------------------------
// Residential

function residential(g) {
  const { L, r } = g;
  g.decorRect('grass', L.x0, L.z0, L.x1, L.z1);
  const mx = (L.x0 + L.x1) / 2, mz = (L.z0 + L.z1) / 2;
  const lots = [];
  for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const rect = { x0: a ? mx : L.x0, x1: a ? L.x1 : mx, z0: c ? mz : L.z0, z1: c ? L.z1 : mz };
    const side = r.chance(0.5) ? (c ? 'N' : 'S') : (a ? 'E' : 'W');
    lots.push(g.frame(rect, side));
  }
  for (const f of lots) {
    const roll = r();
    if (roll < 0.5) house(g, f);
    else if (roll < 0.78) villa(g, f);
    else palazzina(g, f);
  }
  const boundary = r.chance(0.5) ? 'fence' : 'hedge';
  g.line(boundary, mx, L.z0 + 1.2, mx, L.z1 - 1.2, [[(L.z1 - L.z0) / 2 - 1.2, (L.z1 - L.z0) / 2 + 1.2]]);
  g.line(boundary, L.x0 + 1.2, mz, mx - 1, mz);
  g.line(boundary, mx + 1, mz, L.x1 - 1.2, mz);
  for (const f of lots) gardenFill(g, f);
}

function frontFence(g, f, kind, gaps) {
  const r0 = f.at(-f.W / 2 + 0.6, 0.45), r1 = f.at(f.W / 2 - 0.6, 0.45);
  const toT = u => u + f.W / 2 - 0.6;
  g.line(kind, r0[0], r0[1], r1[0], r1[1], gaps.map(([a, b]) => [toT(a), toT(b)]));
}

function house(g, f) {
  const r = g.r;
  const w = r.chance(0.5) ? 9 : 12;
  const d = r.pick([9, 10, 10.5]);
  const floors = r.chance(0.6) ? 2 : 1;
  const side = r.chance(0.5) ? 1 : -1;
  const hu = side * 2.2, hv = 5 + d / 2;
  const [x, z] = f.at(hu, hv);
  g.building('house', x, z, w, d, f.rot, {
    floors, h: floors * 2.9, col: r.pick(PAL.plaster), roofCol: r.pick(PAL.roof), roof: r.chance(0.7) ? 'gable' : 'hip',
  });
  const du = hu - side * (w / 2 + 2.3);
  f.rect('drive', du - 1.5, 0, du + 1.5, hv + d / 2 - 1);
  if (r.chance(0.7)) { const [cx, cz] = f.at(du, 3.4); parkedCar(g, cx, cz, f.rot); }
  f.rect('path', hu - 0.6, 0, hu + 0.6, 5 - 0.05);
  frontFence(g, f, r.chance(0.6) ? 'fence' : 'hedge', [[du - 1.6, du + 1.6], [hu - 0.8, hu + 0.8]]);
  const [bx, bz] = f.at(du + side * 2.4, 1.1);
  g.prop('bin', bx, bz, f.rot, { col: r.pick(PAL.bin) });
  const [b2x, b2z] = f.at(du + side * 3.1, 1.1);
  g.prop('bin', b2x, b2z, f.rot, { col: r.pick(PAL.bin) });
  for (const s of [-1, 1]) {
    const [px, pz] = f.at(hu + s * (w / 2 - 1.2), 3.6);
    g.tryProp('bush', px, pz, r() * 6.28, { s: r.range(0.7, 1.1) }, 0.6);
  }
  if (r.chance(0.4)) { const [fx, fz] = f.at(hu + side * (w / 2 - 2.5), 1.6); g.decorRect('flowers', fx - 1.2, fz - 0.6, fx + 1.2, fz + 0.6); }
  if (r.chance(0.3)) { const [kx, kz] = f.at(du, hv + d / 2 - 2.4); g.prop('bicycle', kx, kz, f.rot + 0.3, { col: r.pick(PAL.car), rad: 0.4 }); }
}

function villa(g, f) {
  const r = g.r;
  const w = 15, d = 10.5;
  const hv = 6 + d / 2;
  const [x, z] = f.at(0, hv);
  g.building('villa', x, z, w, d, f.rot, {
    floors: 2, h: 5.8, col: r.pick(PAL.plaster), roofCol: r.pick(PAL.roof), wingSide: r.chance(0.5) ? 1 : -1,
  });
  const du = r.chance(0.5) ? -(w / 2 - 1.5) : (w / 2 - 1.5);
  f.rect('drive', du - 1.6, 0, du + 1.6, 5.6);
  if (r.chance(0.75)) { const [cx, cz] = f.at(du, 3.2); parkedCar(g, cx, cz, f.rot, r.pick(['car_suv', 'car_sedan'])); }
  f.rect('path', -0.6, 0, 0.6, 6 - 0.05);
  frontFence(g, f, 'hedge', [[du - 1.7, du + 1.7], [-0.9, 0.9]]);
  const back = hv + d / 2 + 1.2;
  if (f.D - back > 6) {
    f.rect('pool', -3.6, back + 0.6, 2.4, back + 4.4, { block: true });
    f.rect('plaza', -4.4, back, 3.2, back + 5.2);
  }
  for (const s of [-1, 1]) {
    const [px, pz] = f.at(s * (w / 2 - 2.5), 4.2);
    g.tryProp('bush', px, pz, r() * 6.28, { s: r.range(0.8, 1.2) }, 0.7);
  }
  const [fx, fz] = f.at(du > 0 ? -4.5 : 4.5, 2.2);
  g.decorRect('flowers', fx - 1.5, fz - 0.7, fx + 1.5, fz + 0.7);
}

function palazzina(g, f) {
  const r = g.r;
  const w = 15, d = r.pick([12, 13.5]);
  const floors = r.int(4, 6);
  const hv = 4.5 + d / 2;
  const [x, z] = f.at(0, hv);
  g.building('palazzina', x, z, w, d, f.rot, {
    floors, h: floors * 3.0, col: r.pick(PAL.plaster), style: r.pick(['resB', 'resB', 'brick', 'resA']), balconies: r.chance(0.75),
  });
  const back = hv + d / 2 + 1.2, end = f.D - 0.8;
  if (end - back >= 5.4) {
    f.rect('drive', -f.W / 2 + 1.5, back, f.W / 2 - 1.5, end);
    for (let k = 0; k < 3; k++) {
      if (!r.chance(0.7)) continue;
      const [cx, cz] = f.at(-5 + k * 5, back + 2.7);
      parkedCar(g, cx, cz, f.rot);
    }
  }
  f.rect('path', -1, 0, 1, 4.45);
  frontFence(g, f, 'fence', [[-1.2, 1.2]]);
  for (const s of [-1, 1]) {
    const [px, pz] = f.at(s * 4.5, 2.4);
    g.tryProp('bush', px, pz, 0, { s: 0.9 }, 0.6);
  }
}

function gardenFill(g, f) {
  const r = g.r;
  const n = r.int(2, 4);
  for (let k = 0, tries = 0; k < n && tries < 30; tries++) {
    const [x, z] = f.at(r.range(-f.W / 2 + 2.5, f.W / 2 - 2.5), r.range(f.D * 0.55, f.D - 2.2));
    if (treeItem(g, r.pick(treeKinds), x, z)) k++;
  }
  for (let k = 0; k < 3; k++) {
    const [x, z] = f.at(r.range(-f.W / 2 + 1.5, f.W / 2 - 1.5), r.range(2, f.D - 1.5));
    g.tryProp('bush', x, z, r() * 6.28, { s: r.range(0.6, 1.1) }, 0.6);
  }
  const [x0, z0] = f.at(-f.W / 2, 0), [x1, z1] = f.at(f.W / 2, f.D);
  g.scatter('leaf', 10, Math.min(x0, x1) + 0.5, Math.min(z0, z1) + 0.5, Math.max(x0, x1) - 0.5, Math.max(z0, z1) - 0.5);
  g.scatter('litter', 2, Math.min(x0, x1) + 0.5, Math.min(z0, z1) + 0.5, Math.max(x0, x1) - 0.5, Math.max(z0, z1) - 0.5);
}

// ---------------------------------------------------------------------------
// Downtown: perimeter blocks of palazzi with shops, sometimes a small square.

function downtown(g) {
  const { L, r } = g;
  g.decorRect('court', L.x0, L.z0, L.x1, L.z1);
  const D = r.range(11.5, 13);
  const plazaSide = r.chance(0.4) ? r.pick(['S', 'N', 'E', 'W']) : null;
  const corners = [
    { rect: { x0: L.x0, z0: L.z0, x1: L.x0 + D, z1: L.z0 + D }, sides: ['S', 'W'] },
    { rect: { x0: L.x1 - D, z0: L.z0, x1: L.x1, z1: L.z0 + D }, sides: ['S', 'E'] },
    { rect: { x0: L.x1 - D, z0: L.z1 - D, x1: L.x1, z1: L.z1 }, sides: ['N', 'E'] },
    { rect: { x0: L.x0, z0: L.z1 - D, x1: L.x0 + D, z1: L.z1 }, sides: ['N', 'W'] },
  ];
  for (const c of corners) {
    const side = c.sides.filter(s => s !== plazaSide);
    const f = g.frame(c.rect, r.pick(side.length ? side : c.sides));
    palazzo(g, f, f.W, f.D, true);
  }
  const edges = {
    S: { x0: L.x0 + D, x1: L.x1 - D, z0: L.z0, z1: L.z0 + D },
    N: { x0: L.x0 + D, x1: L.x1 - D, z0: L.z1 - D, z1: L.z1 },
    W: { x0: L.x0, x1: L.x0 + D, z0: L.z0 + D, z1: L.z1 - D },
    E: { x0: L.x1 - D, x1: L.x1, z0: L.z0 + D, z1: L.z1 - D },
  };
  for (const [side, rect] of Object.entries(edges)) {
    if (side === plazaSide) { piazzetta(g, rect, side); continue; }
    const f = g.frame(rect, side);
    const n = f.W > 19 ? 2 : 1;
    const segW = f.W / n;
    for (let k = 0; k < n; k++) {
      const sub = { ...rect };
      if (side === 'S' || side === 'N') {
        const xa = side === 'S' ? rect.x0 + k * segW : rect.x1 - (k + 1) * segW;
        sub.x0 = xa; sub.x1 = xa + segW;
      } else {
        const za = side === 'E' ? rect.z0 + k * segW : rect.z1 - (k + 1) * segW;
        sub.z0 = za; sub.z1 = za + segW;
      }
      const sf = g.frame(sub, side);
      if (r.chance(0.25)) shop(g, sf); else palazzo(g, sf, sf.W, sf.D, false);
    }
  }
  // Courtyard
  const cx0 = L.x0 + D + 1, cx1 = L.x1 - D - 1, cz0 = L.z0 + D + 1, cz1 = L.z1 - D - 1;
  if (cx1 - cx0 > 6 && cz1 - cz0 > 6) {
    g.decorRect('grass', cx0 + 1, cz0 + 1, cx1 - 1, cz1 - 1);
    for (let k = 0, tries = 0; k < 3 && tries < 20; tries++) {
      if (treeItem(g, r.pick(['tree', 'tree_small', 'tree_birch']), r.range(cx0 + 2, cx1 - 2), r.range(cz0 + 2, cz1 - 2))) k++;
    }
    g.scatter('leaf', 12, cx0, cz0, cx1, cz1);
  }
}

function palazzo(g, f, W, Dp, corner) {
  const r = g.r;
  const floors = r.int(4, 7);
  const shopGround = r.chance(0.8);
  const [x, z] = f.at(0, Dp / 2);
  g.building('palazzo', x, z, W - 0.2, Dp - 0.2, f.rot, {
    floors, h: (shopGround ? 4.2 : 3.1) + (floors - 1) * 3.1, shopGround, corner,
    col: r.pick(PAL.plaster), style: r.pick(['resA', 'resB', 'brick', 'resA']), roof: r.chance(0.5) ? 'hip' : 'flat',
    roofCol: r.pick(PAL.roof), sign: r.pick(SHOP_SIGNS), awning: r.pick(PAL.awning), balconies: r.chance(0.6),
  });
}

function shop(g, f) {
  const r = g.r;
  const floors = r.int(1, 2);
  const [x, z] = f.at(0, f.D / 2);
  g.building('shop', x, z, f.W - 0.2, f.D - 0.2, f.rot, {
    floors, h: 4.2 + (floors - 1) * 3.1, col: r.pick(PAL.plaster), sign: r.pick(SHOP_SIGNS), awning: r.pick(PAL.awning),
  });
}

function piazzetta(g, rect, side) {
  const r = g.r;
  g.decorRect('plaza', rect.x0, rect.z0, rect.x1, rect.z1);
  const f = g.frame(rect, side);
  const [fx, fz] = f.at(0, f.D * 0.5);
  if (f.W > 14) g.prop('fountain', fx, fz, 0, { rad: 3.4, v: 1 });
  for (const s of [-1, 1]) {
    const [bx, bz] = f.at(s * (f.W / 2 - 2.2), f.D * 0.5);
    g.tryProp('tree_small', bx, bz, r() * 6.28, { v: r.int(0, 2), s: 0.9, pit: true }, 1.2);
    const [cx, cz] = f.at(s * 5.4, f.D * 0.22);
    g.tryProp('bench', cx, cz, f.rot, { col: 0x6b4a2f });
  }
  for (let k = 0; k < 4; k++) {
    const [cx, cz] = f.at(r.range(-f.W / 2 + 2, f.W / 2 - 2), r.range(f.D * 0.72, f.D - 1.2));
    g.tryProp('cafe', cx, cz, r() * 6.28, { col: r.pick(PAL.umbrella) }, 1.0);
  }
  const [kx, kz] = f.at(r.chance(0.5) ? -f.W / 2 + 2 : f.W / 2 - 2, f.D * 0.2);
  g.tryProp(r.chance(0.5) ? 'kiosk' : 'foodkiosk', kx, kz, f.rot, { col: r.pick(PAL.awning) }, 1.7);
  for (let k = 0; k < 4; k++) {
    const [px, pz] = f.at(r.range(-f.W / 2 + 1, f.W / 2 - 1), r.range(0.6, f.D - 0.6));
    g.tryProp('flowerpot', px, pz, 0, { col: 0xb0643c }, 0.3);
  }
  g.scatter('litter', 6, rect.x0, rect.z0, rect.x1, rect.z1);
  g.scatter('leaf', 6, rect.x0, rect.z0, rect.x1, rect.z1);
}

// ---------------------------------------------------------------------------
// Commercial: supermarket with car park, or warehouses.

function commercial(g) {
  const { L, r } = g;
  const side = r.pick(['S', 'N', 'E', 'W']);
  const f = g.frame(L, side);
  g.decorRect('lot', L.x0, L.z0, L.x1, L.z1);
  if (r.chance(0.55)) {
    const w = Math.min(f.W - 4, 36), d = 22;
    const [x, z] = f.at(0, f.D - d / 2 - 1.5);
    g.building('supermarket', x, z, w, d, f.rot, { h: 8, sign: SIGNS.SUPERMERCATO, col: 0xe4e2dc });
    const v0 = 1.5, rowA = v0 + 2.6, rowB = v0 + 5.2 + 6.4 + 2.6;
    const lines = [];
    for (let u = -f.W / 2 + 1.9; u < f.W / 2 - 1.8; u += 2.6) {
      for (const [va, vb] of [[v0, v0 + 5.2], [rowB - 2.6, rowB + 2.6]]) {
        const [ax, az] = f.at(u, va), [bx, bz] = f.at(u, vb);
        lines.push([ax, az, bx, bz]);
      }
    }
    f.rect('parking', -f.W / 2 + 1, v0, f.W / 2 - 1, rowB + 2.7, { lines });
    for (let u = -f.W / 2 + 3.2, k = 0; u < f.W / 2 - 3; u += 2.6, k++) {
      if (r.chance(0.55)) { const [cx, cz] = f.at(u, rowA); parkedCar(g, cx, cz, f.rot + Math.PI); }
      if (r.chance(0.6)) { const [cx, cz] = f.at(u, rowB); parkedCar(g, cx, cz, f.rot); }
      if (k % 5 === 2) { const [lx, lz] = f.at(u + 1.3, v0 + 0.3); g.prop('lamp', lx, lz, f.rot, { rad: 0.3 }); }
    }
    for (let k = 0; k < 5; k++) {
      const [cx, cz] = f.at(r.range(-8, 8), f.D - d - 2.4 + r.range(-0.4, 0.4));
      g.tryProp('cart', cx, cz, f.rot + r.range(-0.5, 0.5), {}, 0.45);
    }
    const [dx, dz] = f.at(f.W / 2 - 3, f.D - d - 2.5);
    g.tryProp('dumpster', dx, dz, f.rot, { col: 0x2f5f3a });
  } else {
    const w = (f.W - 6) / 2, d = 26;
    for (const s of [-1, 1]) {
      const [x, z] = f.at(s * (w / 2 + 1.5), f.D - d / 2 - 1.5);
      g.building('warehouse', x, z, w, d, f.rot, { h: r.range(8, 10), sign: SIGNS.LOGISTICA, col: r.pick([0x8f9aa3, 0xb7b9b4, 0x6f8592]) });
    }
    for (let k = 0; k < 4; k++) {
      if (!r.chance(0.75)) continue;
      const [vx, vz] = f.at(-f.W / 2 + 4 + k * ((f.W - 8) / 3), f.D - d - 5);
      g.tryProp('van', vx, vz, f.rot + Math.PI, { col: r.pick([0xf2f2ef, 0xe9e9e4, 0x2b5a8f, 0xd2d4d1]) }, 1.6);
    }
    for (let k = 0; k < 3; k++) {
      const [dx, dz] = f.at(r.range(-f.W / 2 + 2, f.W / 2 - 2), f.D - d - 1.6);
      g.tryProp('dumpster', dx, dz, f.rot, { col: r.pick([0x2f5f3a, 0x2c4a73, 0x77786f]) });
    }
    for (let k = 0; k < 4; k++) {
      const [cx, cz] = f.at(r.range(-6, 6), r.range(2, 8));
      g.tryProp('cone', cx, cz, 0, {}, 0.25);
    }
    for (let k = 0; k < 2; k++) { const [lx, lz] = f.at(-f.W / 4 + k * f.W / 2, 1.0); g.tryProp('lamp', lx, lz, f.rot, {}, 0.3); }
  }
  for (let k = 0; k < 4; k++) {
    const [bx, bz] = f.at(-f.W / 2 + 1.5 + k * (f.W - 3) / 3, 0.9);
    g.tryProp('bush', bx, bz, 0, { s: 0.8 }, 0.5);
  }
  g.scatter('litter', 12, L.x0, L.z0, L.x1, L.z1);
  g.scatter('leaf', 4, L.x0, L.z0, L.x1, L.z1);
}

// ---------------------------------------------------------------------------
// Central business district: towers and public plazas.

function cbd(g) {
  const { L, r } = g;
  g.decorRect('plaza', L.x0, L.z0, L.x1, L.z1);
  const side = r.pick(['S', 'N', 'E', 'W']);
  const f = g.frame(L, side);
  const style = r.pick(['office', 'office', 'officeC']);
  if (r.chance(0.5)) {
    const p = Math.min(28, f.W - 8);
    const [x, z] = f.at(0, f.D - p / 2 - 1.5);
    const t = r.range(19, 23);
    g.building('tower', x, z, p, p, f.rot, { h: r.range(80, 150), podium: 8.4, tw: t, td: t, style, setback: r.chance(0.6), crown: r.int(0, 2) });
    const fv = (f.D - p - 1.5) / 2;
    for (const s of [-1, 1]) {
      const [tx, tz] = f.at(s * 9, fv);
      g.tryProp('tree_small', tx, tz, 0, { v: r.int(0, 2), s: 1, pit: true }, 1.3);
      const [bx, bz] = f.at(s * 4.5, fv);
      g.tryProp('bench', bx, bz, f.rot, { col: 0x5c5e60 });
    }
    const [kx, kz] = f.at(f.W / 2 - 3, fv);
    g.tryProp('foodkiosk', kx, kz, f.rot, { col: r.pick(PAL.awning) }, 1.7);
  } else {
    const tw = 16, td = 17;
    for (const s of [-1, 1]) {
      const [x, z] = f.at(s * (tw / 2 + 2), f.D - td / 2 - 2);
      g.building('tower', x, z, tw, td, f.rot, { h: r.range(55, 115), podium: 0, tw, td, style, setback: r.chance(0.5), crown: r.int(0, 2) });
    }
    const fv = (f.D - td - 2) / 2;
    const [fx, fz] = f.at(0, fv);
    g.prop('fountain', fx, fz, 0, { rad: 3.4, v: 0 });
    for (const s of [-1, 1]) {
      for (const q of [-1, 1]) {
        const [tx, tz] = f.at(s * 12, fv + q * 4);
        g.tryProp('tree_small', tx, tz, 0, { v: r.int(0, 2), s: 1, pit: true }, 1.3);
      }
      const [bx, bz] = f.at(s * 6, fv - 4.6);
      g.tryProp('bench', bx, bz, f.rot + Math.PI, { col: 0x5c5e60 });
    }
    for (let k = 0; k < 2; k++) { const [lx, lz] = f.at(-7 + k * 14, fv + 4.5); g.tryProp('lamp', lx, lz, f.rot, {}, 0.3); }
  }
  for (let k = 0; k < 4; k++) {
    const [px, pz] = f.at(r.range(-f.W / 2 + 1, f.W / 2 - 1), r.range(0.8, 4));
    g.tryProp('flowerpot', px, pz, 0, { col: 0x7a7d80 }, 0.3);
  }
  g.scatter('litter', 10, L.x0, L.z0, L.x1, L.z1);
}

// ---------------------------------------------------------------------------
// Park

function park(g) {
  const { L, r } = g;
  g.decorRect('grass', L.x0, L.z0, L.x1, L.z1);
  const cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
  const pw = 2.6;
  g.decorRect('path', cx - pw / 2, L.z0, cx + pw / 2, L.z1);
  g.decorRect('path', L.x0, cz - pw / 2, L.x1, cz + pw / 2);
  const ring = 9;
  g.decorRect('path', L.x0 + ring - pw / 2, L.z0 + ring - pw / 2, L.x1 - ring + pw / 2, L.z0 + ring + pw / 2);
  g.decorRect('path', L.x0 + ring - pw / 2, L.z1 - ring - pw / 2, L.x1 - ring + pw / 2, L.z1 - ring + pw / 2);
  g.decorRect('path', L.x0 + ring - pw / 2, L.z0 + ring, L.x0 + ring + pw / 2, L.z1 - ring);
  g.decorRect('path', L.x1 - ring - pw / 2, L.z0 + ring, L.x1 - ring + pw / 2, L.z1 - ring);
  g.decorRect('plaza', cx - 6, cz - 6, cx + 6, cz + 6);
  // Paths are walkable: block them for trees and bushes.
  g.rects.push({ x0: cx - pw / 2 - 0.4, x1: cx + pw / 2 + 0.4, z0: L.z0, z1: L.z1 });
  g.rects.push({ x0: L.x0, x1: L.x1, z0: cz - pw / 2 - 0.4, z1: cz + pw / 2 + 0.4 });
  for (const [x0, z0, x1, z1] of [
    [L.x0 + ring - 1.8, L.z0 + ring - 1.8, L.x1 - ring + 1.8, L.z0 + ring + 1.8],
    [L.x0 + ring - 1.8, L.z1 - ring - 1.8, L.x1 - ring + 1.8, L.z1 - ring + 1.8],
    [L.x0 + ring - 1.8, L.z0 + ring, L.x0 + ring + 1.8, L.z1 - ring],
    [L.x1 - ring - 1.8, L.z0 + ring, L.x1 - ring + 1.8, L.z1 - ring],
  ]) g.rects.push({ x0, z0, x1, z1 });

  g.prop('fountain', cx, cz, 0, { rad: 3.6, v: 0 });
  for (const [dx, dz] of [[-4.6, -4.6], [4.6, -4.6], [4.6, 4.6], [-4.6, 4.6]]) {
    g.decorRect('flowers', cx + dx - 1, cz + dz - 1, cx + dx + 1, cz + dz + 1);
    g.prop('flowerpot', cx + dx * 0.72, cz + dz * 1.18, 0, { col: 0xa95f3b, rad: 0.3 });
  }
  // Benches facing the paths
  for (const [bx, bz, rot] of [
    [cx - 2.4, cz - 8.5, Math.PI / 2], [cx + 2.4, cz + 8.5, -Math.PI / 2], [cx + 8.5, cz - 2.4, 0], [cx - 8.5, cz + 2.4, Math.PI],
    [cx - 2.4, cz + 14, Math.PI / 2], [cx + 2.4, cz - 14, -Math.PI / 2],
  ]) {
    g.tryProp('bench', bx, bz, rot, { col: 0x6b4a2f });
    if (r.chance(0.6)) g.tryProp('bin', bx + (Math.abs(Math.sin(rot)) > 0.5 ? 0 : 1.4), bz + (Math.abs(Math.sin(rot)) > 0.5 ? 1.4 : 0), 0, { col: PAL.bin[0] }, 0.3);
  }
  for (const [lx, lz] of [[cx - 2.2, cz - 12], [cx + 2.2, cz + 12], [cx - 12, cz + 2.2], [cx + 12, cz - 2.2], [cx + 2.2, cz - 19], [cx - 2.2, cz + 19]]) {
    g.tryProp('lamp', lx, lz, Math.atan2(cx - lx, cz - lz), {}, 0.3);
  }
  const kioskSpot = [cx + 6.2, cz + 9.5];
  g.tryProp(r.chance(0.6) ? 'foodkiosk' : 'kiosk', kioskSpot[0], kioskSpot[1], Math.PI, { col: r.pick(PAL.awning) }, 1.7);
  for (let k = 0; k < 3; k++) g.tryProp('cafe', kioskSpot[0] - 3 + k * 2.3, kioskSpot[1] + 3.2, r() * 6.28, { col: r.pick(PAL.umbrella) }, 1.0);
  if (r.chance(0.45)) {
    const qx = r.chance(0.5) ? -1 : 1, qz = r.chance(0.5) ? -1 : 1;
    const px = cx + qx * 15, pz = cz + qz * 15;
    g.decorRect('pond', px - 4, pz - 3, px + 4, pz + 3, { block: true });
  }
  // Trees: mixed species and sizes.
  for (let k = 0, tries = 0; k < 26 && tries < 260; tries++) {
    const kind = r.pick(['tree', 'tree', 'tree', 'tree_pine', 'tree_birch', 'tree_small', 'tree_cypress']);
    if (treeItem(g, kind, r.range(L.x0 + 1.5, L.x1 - 1.5), r.range(L.z0 + 1.5, L.z1 - 1.5))) k++;
  }
  for (let k = 0, tries = 0; k < 14 && tries < 120; tries++) {
    if (g.tryProp('bush', r.range(L.x0 + 1, L.x1 - 1), r.range(L.z0 + 1, L.z1 - 1), r() * 6.28, { s: r.range(0.6, 1.2) }, 0.7)) k++;
  }
  // Lots of small things: the very first meals of the black hole.
  for (let k = 0; k < 150; k++) {
    const onPath = r.chance(0.45);
    let x, z;
    if (onPath) {
      if (r.chance(0.5)) { x = cx + r.range(-pw / 2, pw / 2); z = r.range(L.z0, L.z1); }
      else { x = r.range(L.x0, L.x1); z = cz + r.range(-pw / 2, pw / 2); }
    } else { x = r.range(L.x0 + 0.5, L.x1 - 0.5); z = r.range(L.z0 + 0.5, L.z1 - 0.5); }
    if ((x - cx) ** 2 + (z - cz) ** 2 < 3.4 ** 2) continue;
    g.tiny(r.chance(0.7) ? 'leaf' : 'litter', x, z);
  }
  for (let k = 0; k < 4; k++) g.tryProp('cone', cx + 4 + k * 0.9, cz - 7.2, 0, {}, 0.2);
}

// ---------------------------------------------------------------------------

const ZONES = { residential, downtown, commercial, cbd, park };

export function generateChunk(i, j) {
  const g = new Gen(i, j);
  ZONES[g.zone](g);
  sidewalk(g);
  return { i, j, zone: g.zone, items: g.items, decor: g.decor, b: g.b, L: g.L };
}
