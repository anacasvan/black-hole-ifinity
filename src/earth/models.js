// Procedural 3D models (vehicles, street furniture, vegetation, litter).
// Model space: origin at the bottom centre, +z forward, +y up, metres.
// Each model is a list of parts { mat, tint, geo }; tinted parts take the
// per-instance colour (car paint, foliage shade, bin colour...).
import * as THREE from 'three';
import { Writers, mat, displace } from './geo.js';
import { makeRng } from './rng.js';

const PI = Math.PI;
const TINTED = new Set(['paint', 'matte', 'foliage']);

function finish(w, extra = {}) {
  const geos = w.build();
  return { parts: Object.entries(geos).map(([m, geo]) => ({ mat: m, tint: TINTED.has(m), geo })), ...extra };
}

const cyl = (rt, rb, h, seg = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(0, h / 2, 0);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const blob = (r, seed, amt = 0.28, detail = 1) => displace(new THREE.IcosahedronGeometry(r, detail), amt, seed, 1.9 / r);

// ---------------------------------------------------------------------------
// Vehicles

function profileShape(top, wheels, ra, yb, wy) {
  const s = new THREE.Shape();
  s.moveTo(top[0][0], top[0][1]);
  for (let k = 1; k < top.length; k++) s.lineTo(top[k][0], top[k][1]);
  const front = [...wheels].sort((a, b) => b - a);
  for (const wz of front) {
    const dy = yb - wy, dx = Math.sqrt(Math.max(0.0001, ra * ra - dy * dy));
    s.lineTo(wz + dx, yb);
    s.absarc(wz, wy, ra, Math.atan2(dy, dx), Math.atan2(dy, -dx), false);
  }
  s.lineTo(top[0][0], yb);
  s.closePath();
  return s;
}

function polyShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) s.lineTo(pts[k][0], pts[k][1]);
  s.closePath();
  return s;
}

// Extrude a side profile (z forward, y up) across the width (x).
function sideExtrude(shape, width, bevel = 0.05, curve = 8) {
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve,
  });
  g.translate(0, 0, -depth / 2);
  g.applyMatrix4(mat(0, 0, 0, 0, -PI / 2, 0));
  return g;
}

const DARK = 0x1c1d20, TRIM = 0x2a2c30, CHROME = 0xb9bec4, HEAD = 0xfff4d8, TAIL = 0xc4161c, PLATE = 0xf2f2ee;

function carDetails(w, s) {
  const { L, W, yb } = s;
  const f = w.get('fixed'), m = w.get('metal'), l = w.get('light');
  f.add(box(W * 0.84, 0.28, L * 0.8), mat(0, yb - 0.08, 0), DARK);
  f.add(box(W * 0.98, 0.22, 0.24), mat(0, yb + 0.02, L / 2 - 0.1), TRIM);
  f.add(box(W * 0.98, 0.22, 0.24), mat(0, yb + 0.02, -L / 2 + 0.1), TRIM);
  f.add(box(W * 0.46, 0.14, 0.04), mat(0, s.grilleY, L / 2 + 0.02), DARK);
  f.add(box(0.5, 0.12, 0.02), mat(0, yb + 0.1, L / 2 + 0.03), PLATE);
  f.add(box(0.5, 0.12, 0.02), mat(0, s.tailY - 0.22, -L / 2 - 0.03), PLATE);
  for (const sx of [-1, 1]) {
    l.add(box(0.34, 0.11, 0.08), mat(sx * (W / 2 - 0.27), s.headY, L / 2 - 0.02), HEAD);
    l.add(box(0.3, 0.12, 0.06), mat(sx * (W / 2 - 0.25), s.tailY, -L / 2 + 0.01), TAIL);
    w.get('paint').add(box(0.14, 0.09, 0.16), mat(sx * (W / 2 + 0.04), s.mirrorY, s.mirrorZ), 0xffffff);
    m.add(box(0.02, 0.03, 0.5), mat(sx * (W / 2 + 0.005), s.handleY, 0.25), CHROME);
  }
}

function car(s) {
  const w = new Writers();
  const wy = s.wr;
  w.get('paint').add(sideExtrude(profileShape(s.body, [s.zf, s.zr], s.wr + 0.06, s.yb, wy), s.W, 0.07), null, 0xffffff);
  w.get('glass').add(sideExtrude(polyShape(s.glass), s.W * 0.86, 0.04), null, 0x1b232c);
  w.get('paint').add(sideExtrude(polyShape(s.roof), s.W * 0.82, 0.035), null, 0xffffff);
  if (s.pillar) w.get('paint').add(box(s.W * 0.87, s.pillar[1], 0.1), mat(0, s.pillar[0], s.pillar[2]), 0xffffff);
  if (s.rails) for (const sx of [-1, 1]) w.get('metal').add(box(0.05, 0.05, s.rails[1]), mat(sx * s.W * 0.36, s.rails[0], s.rails[2]), 0x2e3034);
  carDetails(w, s);
  const wx = s.W / 2 - 0.2;
  return finish(w, {
    wheels: [[-wx, wy, s.zf], [wx, wy, s.zf], [-wx, wy, s.zr], [wx, wy, s.zr]].map(p => ({ p, r: s.wr, w: 0.22 })),
  });
}

const CAR_SPECS = {
  car_sedan: {
    L: 4.65, W: 1.82, wr: 0.33, zf: 1.42, zr: -1.38, yb: 0.3,
    body: [[-2.28, 0.34], [-2.31, 0.62], [-2.2, 0.88], [-1.75, 0.94], [-1.0, 0.96], [0.95, 0.93], [1.6, 0.84], [2.18, 0.72], [2.3, 0.55], [2.26, 0.34]],
    glass: [[-1.62, 0.92], [-1.02, 1.37], [0.42, 1.4], [1.18, 0.92]],
    roof: [[-1.0, 1.35], [0.4, 1.37], [0.36, 1.43], [-0.95, 1.42]],
    pillar: [0.93, 0.44, -0.28], headY: 0.72, tailY: 0.84, grilleY: 0.58, mirrorY: 1.0, mirrorZ: 1.05, handleY: 0.86,
  },
  car_city: {
    L: 3.65, W: 1.68, wr: 0.3, zf: 1.18, zr: -1.15, yb: 0.3,
    body: [[-1.76, 0.32], [-1.8, 0.6], [-1.76, 0.98], [-1.5, 1.02], [0.6, 0.98], [1.22, 0.85], [1.72, 0.71], [1.8, 0.5], [1.76, 0.32]],
    glass: [[-1.7, 1.0], [-1.58, 1.45], [0.2, 1.48], [0.95, 0.98]],
    roof: [[-1.55, 1.43], [0.16, 1.46], [0.1, 1.52], [-1.5, 1.51]],
    pillar: [0.99, 0.46, -0.45], headY: 0.74, tailY: 0.9, grilleY: 0.55, mirrorY: 1.04, mirrorZ: 0.82, handleY: 0.88,
  },
  car_suv: {
    L: 4.75, W: 1.92, wr: 0.38, zf: 1.45, zr: -1.42, yb: 0.38,
    body: [[-2.32, 0.42], [-2.36, 0.75], [-2.31, 1.08], [-1.9, 1.12], [1.0, 1.1], [1.75, 1.0], [2.28, 0.9], [2.37, 0.62], [2.32, 0.42]],
    glass: [[-2.24, 1.1], [-2.08, 1.64], [0.48, 1.68], [1.34, 1.1]],
    roof: [[-2.0, 1.62], [0.44, 1.66], [0.4, 1.72], [-1.95, 1.71]],
    pillar: [1.1, 0.55, -0.3], rails: [1.73, 2.2, -0.75], headY: 0.92, tailY: 1.02, grilleY: 0.72, mirrorY: 1.18, mirrorZ: 1.12, handleY: 1.04,
  },
};

function van() {
  const w = new Writers();
  const s = { L: 5.3, W: 2.0, wr: 0.36, zf: 1.75, zr: -1.65, yb: 0.36, headY: 0.95, tailY: 1.2, grilleY: 0.75, mirrorY: 1.75, mirrorZ: 1.85, handleY: 1.2 };
  const body = [[-2.62, 0.4], [-2.65, 2.36], [-2.5, 2.42], [1.4, 2.42], [1.75, 2.18], [2.4, 1.3], [2.62, 1.05], [2.66, 0.6], [2.6, 0.4]];
  w.get('paint').add(sideExtrude(profileShape(body, [s.zf, s.zr], s.wr + 0.06, s.yb, s.wr), s.W, 0.07), null, 0xffffff);
  w.get('glass').add(sideExtrude(polyShape([[1.02, 1.38], [1.02, 2.16], [1.72, 2.16], [2.34, 1.38]]), s.W + 0.03, 0.0), null, 0x1b232c);
  w.get('fixed').add(box(0.03, 1.7, 0.02), mat(0, 0.55, -2.66), 0x3a3d42);
  carDetails(w, s);
  const wx = s.W / 2 - 0.22;
  return finish(w, { wheels: [[-wx, s.wr, s.zf], [wx, s.wr, s.zf], [-wx, s.wr, s.zr], [wx, s.wr, s.zr]].map(p => ({ p, r: s.wr, w: 0.24 })) });
}

function bus() {
  const w = new Writers();
  const L = 12, W = 2.55, wr = 0.5;
  const body = [[-5.98, 0.5], [-6.02, 2.85], [-5.85, 3.02], [5.7, 3.02], [5.97, 2.8], [6.02, 0.5]];
  w.get('paint').add(sideExtrude(profileShape(body, [3.6, -2.9], wr + 0.08, 0.45, wr), W, 0.08), null, 0xffffff);
  const g = w.get('glass');
  g.add(sideExtrude(polyShape([[-5.5, 1.5], [-5.5, 2.62], [5.1, 2.62], [5.1, 1.5]]), W + 0.03, 0.0), null, 0x1d2731);
  g.add(box(W * 0.88, 1.55, 0.06), mat(0, 1.2, L / 2 + 0.03), 0x1d2731);
  g.add(box(W * 0.85, 0.9, 0.05), mat(0, 1.75, -L / 2 - 0.02), 0x1d2731);
  const f = w.get('fixed');
  for (const z of [4.6, -0.4]) f.add(box(0.04, 2.25, 1.25), mat(-W / 2 - 0.01, 0.4, z), 0x2a3136);
  f.add(box(W * 0.98, 0.3, 0.3), mat(0, 0.45, L / 2 - 0.1), TRIM);
  f.add(box(W * 0.98, 0.3, 0.3), mat(0, 0.45, -L / 2 + 0.1), TRIM);
  f.add(box(1.6, 0.35, 2.6), mat(0, 3.02, -1.5), 0xc9ccce);
  w.get('light').add(box(1.4, 0.22, 0.04), mat(0, 2.72, L / 2 + 0.04), 0xffa31a);
  for (const sx of [-1, 1]) {
    w.get('light').add(box(0.3, 0.14, 0.06), mat(sx * (W / 2 - 0.3), 0.75, L / 2 + 0.02), HEAD);
    w.get('light').add(box(0.22, 0.3, 0.06), mat(sx * (W / 2 - 0.2), 1.0, -L / 2 - 0.02), TAIL);
    w.get('fixed').add(box(0.08, 0.35, 0.08), mat(sx * (W / 2 + 0.2), 2.3, L / 2 - 0.3), DARK);
  }
  const wx = W / 2 - 0.3;
  return finish(w, { wheels: [[-wx, wr, 3.6], [wx, wr, 3.6], [-wx, wr, -2.9], [wx, wr, -2.9]].map(p => ({ p, r: wr, w: 0.3 })) });
}

// Seated rider for two-wheelers (fixed colours chosen by seed).
function rider(w, seed, seatZ, seatY, handZ, handY, helmet) {
  const r = makeRng(seed);
  const jacket = r.pick([0x2b3440, 0x5a2c2c, 0x2e4a3a, 0x3d3d3f, 0x6b5a3c, 0x26324d]);
  const pants = r.pick([0x23262b, 0x2f3b54, 0x4a4136]);
  const skin = r.pick([0xe7c3a1, 0xc9956b, 0x8d5a3b, 0xf0d2b6]);
  const f = w.get('fixed');
  const cap = (len, rad) => new THREE.CapsuleGeometry(rad, len, 3, 8);
  const hipY = seatY + 0.12;
  f.add(cap(0.42, 0.15), mat(0, hipY + 0.32, seatZ + 0.12, 0.35, 0, 0), jacket);
  f.add(sph(0.11), mat(0, hipY + 0.72, seatZ + 0.3), helmet ? r.pick([0xf2f2f2, 0x161616, 0xb3201f, 0x1f4b8c]) : skin);
  if (!helmet) f.add(sph(0.115, 10, 6), mat(0, hipY + 0.76, seatZ + 0.27, -0.3, 0, 0, 1, 0.6, 1), r.pick([0x2b1d14, 0x5a3a22, 0x1a1a1a, 0xb08a4a]));
  for (const sx of [-1, 1]) {
    f.add(cap(0.36, 0.075), mat(sx * 0.12, hipY + 0.05, seatZ + 0.22, PI / 2 - 0.2, 0, 0), pants);
    f.add(cap(0.36, 0.06), mat(sx * 0.13, hipY - 0.2, seatZ + 0.42, 0.15, 0, 0), pants);
    const sh = [sx * 0.2, hipY + 0.5, seatZ + 0.26];
    const dz = handZ - sh[2], dy = handY - sh[1];
    const len = Math.hypot(dz, dy);
    f.add(cap(len - 0.1, 0.05), mat(sx * 0.22, (sh[1] + handY) / 2, (sh[2] + handZ) / 2, Math.atan2(dz, -dy) + PI, 0, 0), jacket);
  }
}

function twoWheel(kind, ridden, seed = 1) {
  const w = new Writers();
  const p = w.get('paint'), f = w.get('fixed'), m = w.get('metal'), l = w.get('light');
  let wheels, wtype = 'wheel';
  if (kind === 'scooter') {
    p.add(sideExtrude(polyShape([[-0.86, 0.36], [-0.9, 0.6], [-0.55, 0.8], [0.0, 0.66], [0.06, 0.36]]), 0.44, 0.06), null, 0xffffff);
    p.add(sideExtrude(polyShape([[0.42, 0.3], [0.56, 0.3], [0.72, 1.02], [0.58, 1.04]]), 0.48, 0.05), null, 0xffffff);
    f.add(box(0.34, 0.07, 0.62), mat(0, 0.28, 0.12), DARK);
    f.add(box(0.3, 0.1, 0.66), mat(0, 0.78, -0.4), 0x1e1e20);
    m.add(cyl(0.025, 0.025, 0.5), mat(0, 0.6, 0.66, -0.25, 0, 0), 0x55595e);
    m.add(box(0.62, 0.035, 0.035), mat(0, 1.1, 0.62), 0x2b2d30);
    l.add(box(0.14, 0.08, 0.05), mat(0, 0.98, 0.72), HEAD);
    l.add(box(0.12, 0.05, 0.04), mat(0, 0.62, -0.9), TAIL);
    wheels = [[0, 0.24, 0.62], [0, 0.24, -0.62]].map(q => ({ p: q, r: 0.24, w: 0.11 }));
    if (ridden) rider(w, seed, -0.38, 0.86, 0.6, 1.1, true);
  } else if (kind === 'motorbike') {
    p.add(sideExtrude(polyShape([[-0.1, 0.82], [0.1, 0.98], [0.45, 0.96], [0.55, 0.78], [0.1, 0.72]]), 0.36, 0.08), null, 0xffffff);
    p.add(sideExtrude(polyShape([[0.6, 0.7], [0.7, 1.12], [0.86, 1.1], [0.88, 0.78]]), 0.4, 0.05), null, 0xffffff);
    p.add(sideExtrude(polyShape([[-0.95, 0.78], [-0.7, 0.86], [-0.4, 0.84], [-0.45, 0.72]]), 0.2, 0.05), null, 0xffffff);
    f.add(sideExtrude(polyShape([[-0.6, 0.84], [-0.1, 0.88], [-0.05, 0.8], [-0.6, 0.76]]), 0.3, 0.03), null, 0x1b1b1d);
    m.add(box(0.32, 0.36, 0.5), mat(0, 0.36, 0.05), 0x3a3c40);
    m.add(cyl(0.05, 0.05, 0.8), mat(0.18, 0.32, -0.45, PI / 2 + 0.15, 0, 0), CHROME);
    for (const sx of [-1, 1]) m.add(cyl(0.025, 0.025, 0.75), mat(sx * 0.09, 0.33, 0.74, -0.38, 0, 0), 0x8b9096);
    m.add(box(0.7, 0.035, 0.035), mat(0, 1.08, 0.6), 0x2b2d30);
    l.add(box(0.16, 0.12, 0.06), mat(0, 0.96, 0.88), HEAD);
    l.add(box(0.12, 0.05, 0.04), mat(0, 0.8, -0.97), TAIL);
    wheels = [[0, 0.32, 0.74], [0, 0.32, -0.72]].map(q => ({ p: q, r: 0.32, w: 0.15 }));
    if (ridden) rider(w, seed, -0.3, 0.86, 0.55, 1.08, true);
  } else {
    const tube = (a, b, r = 0.022) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz);
      const g = new THREE.CylinderGeometry(r, r, len, 6);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      p.add(g, new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1)), 0xffffff);
    };
    const bb = [0, 0.32, 0], seat = [0, 0.82, -0.2], head = [0, 0.88, 0.38], rearA = [0, 0.34, -0.53], frontA = [0, 0.34, 0.53];
    tube(bb, seat); tube(bb, head); tube(seat, head); tube(bb, rearA); tube(seat, rearA); tube(head, frontA, 0.02);
    f.add(box(0.14, 0.05, 0.26), mat(0, 0.86, -0.22), 0x1b1b1d);
    m.add(box(0.56, 0.03, 0.03), mat(0, 0.98, 0.36), 0x2f3236);
    m.add(cyl(0.02, 0.02, 0.12), mat(0, 0.86, 0.38), 0x2f3236);
    wheels = [[0, 0.34, 0.53], [0, 0.34, -0.53]].map(q => ({ p: q, r: 0.34, w: 0.04 }));
    wtype = 'bikewheel';
    if (ridden) rider(w, seed, -0.22, 0.86, 0.36, 0.98, false);
  }
  return finish(w, { wheels, wheelType: wtype });
}

function wheelModel() {
  const w = new Writers();
  const tire = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(PI / 2);
  w.get('fixed').add(tire, null, 0x18191b);
  w.get('metal').add(new THREE.CylinderGeometry(0.6, 0.6, 1.04, 10).rotateZ(PI / 2), null, 0xaeb3b8);
  w.get('metal').add(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 6).rotateZ(PI / 2), null, 0x5a5e63);
  return finish(w);
}

function bikeWheelModel() {
  const w = new Writers();
  w.get('fixed').add(new THREE.TorusGeometry(1, 0.09, 4, 16).rotateY(PI / 2), null, 0x1a1a1b);
  const m = w.get('metal');
  m.add(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6).rotateZ(PI / 2), null, 0x9aa0a6);
  for (let k = 0; k < 3; k++) m.add(new THREE.BoxGeometry(0.5, 1.9, 0.03), mat(0, 0, 0, k * PI / 3, 0, 0, 0.06, 1, 1), 0xb6bbc0);
  return finish(w);
}

// ---------------------------------------------------------------------------
// Street furniture

function lamp() {
  const w = new Writers();
  const f = w.get('fixed'), l = w.get('light');
  const pole = 0x3a3f43;
  f.add(cyl(0.16, 0.2, 0.5, 8), null, pole);
  f.add(cyl(0.06, 0.1, 5.4, 7), mat(0, 0.5, 0), pole);
  const arm = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 5.7, 0), new THREE.Vector3(0, 6.25, 0.2), new THREE.Vector3(0, 6.05, 1.35)), 7, 0.045, 5);
  f.add(arm, null, pole);
  f.add(box(0.34, 0.14, 0.66), mat(0, 5.92, 1.45), 0x2b2f33);
  l.add(box(0.26, 0.03, 0.52), mat(0, 5.9, 1.45), 0xfff0c8);
  return finish(w);
}

function tlight() {
  const w = new Writers();
  const f = w.get('fixed'), l = w.get('light');
  f.add(cyl(0.07, 0.08, 4.1, 7), null, 0x3a3d40);
  f.add(cyl(0.12, 0.14, 0.25, 7), null, 0x2c2e31);
  const head = (ry, y) => {
    const M = mat(0, 0, 0, 0, ry, 0);
    f.add(box(0.3, 0.92, 0.26).applyMatrix4(mat(0, y, 0.2)), M, 0x232527);
    f.add(box(0.44, 1.06, 0.03).applyMatrix4(mat(0, y - 0.07, 0.07)), M, 0x15161a);
    const cols = [0xd8231c, 0xe8a317, 0x29b84a];
    cols.forEach((c, k) => l.add(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 6).rotateX(PI / 2).applyMatrix4(mat(0, y + 0.74 - k * 0.29, 0.34)), M, new THREE.Color(c).multiplyScalar(k === 2 ? 1 : 0.45)));
  };
  head(PI / 4, 3.15);
  head(-PI / 4, 3.15);
  f.add(box(0.22, 0.4, 0.18).applyMatrix4(mat(0, 2.1, 0.12)), mat(0, 0, 0, 0, PI, 0), 0x232527);
  return finish(w);
}

function bench() {
  const w = new Writers();
  const wood = w.get('fixed'), iron = w.get('metal');
  for (let k = 0; k < 4; k++) wood.add(box(1.8, 0.045, 0.1), mat(0, 0.44, -0.18 + k * 0.12), k % 2 ? 0x8a5c36 : 0x7d5231);
  for (let k = 0; k < 3; k++) wood.add(box(1.8, 0.1, 0.035), mat(0, 0.56 + k * 0.13, -0.29 - k * 0.025, -0.18, 0, 0), 0x815533);
  for (const sx of [-0.78, 0.78]) {
    iron.add(box(0.05, 0.44, 0.06), mat(sx, 0, 0.17), 0x2a2c2e);
    iron.add(box(0.05, 0.86, 0.06), mat(sx, 0, -0.27, -0.1, 0, 0), 0x2a2c2e);
    iron.add(box(0.05, 0.05, 0.52), mat(sx, 0.4, -0.04), 0x2a2c2e);
    iron.add(box(0.05, 0.05, 0.42), mat(sx, 0.64, 0.0), 0x2a2c2e);
  }
  return finish(w);
}

function bin() {
  const w = new Writers();
  w.get('matte').add(cyl(0.23, 0.21, 0.82, 10), mat(0, 0.03, 0), 0xffffff);
  w.get('matte').add(new THREE.SphereGeometry(0.235, 10, 4, 0, PI * 2, 0, PI / 2), mat(0, 0.85, 0, 0, 0, 0, 1, 0.45, 1), 0xffffff);
  w.get('fixed').add(cyl(0.245, 0.245, 0.06, 10), mat(0, 0.82, 0), 0x2a2b2d);
  w.get('fixed').add(box(0.2, 0.08, 0.05), mat(0, 0.74, 0.22), 0x111111);
  w.get('fixed').add(cyl(0.2, 0.2, 0.03, 8), null, 0x2a2b2d);
  return finish(w);
}

function cone() {
  const w = new Writers();
  const f = w.get('fixed');
  f.add(box(0.36, 0.04, 0.36), null, 0x1d1d1f);
  f.add(cyl(0.1, 0.15, 0.26, 14), mat(0, 0.04, 0), 0xff5a14);
  f.add(cyl(0.075, 0.1, 0.17, 14), mat(0, 0.3, 0), 0xf4f4f0);
  f.add(cyl(0.012, 0.075, 0.24, 14), mat(0, 0.47, 0), 0xff5a14);
  return finish(w);
}

function hydrant() {
  const w = new Writers();
  const f = w.get('fixed');
  const red = 0xb9241d;
  f.add(cyl(0.15, 0.16, 0.07, 12), null, red);
  f.add(cyl(0.105, 0.11, 0.56, 12), mat(0, 0.06, 0), red);
  f.add(new THREE.SphereGeometry(0.11, 12, 6, 0, PI * 2, 0, PI / 2), mat(0, 0.62, 0), red);
  f.add(cyl(0.03, 0.03, 0.06, 8), mat(0, 0.72, 0), 0x8c8f93);
  for (const sx of [-1, 1]) f.add(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8).rotateZ(PI / 2), mat(sx * 0.13, 0.42, 0), 0x8c8f93);
  return finish(w);
}

function bollard() {
  const w = new Writers();
  const f = w.get('fixed');
  f.add(cyl(0.08, 0.09, 0.88, 12), null, 0x34373b);
  f.add(cyl(0.083, 0.083, 0.08, 12), mat(0, 0.66, 0), 0xe8e8e2);
  f.add(new THREE.SphereGeometry(0.082, 12, 5, 0, PI * 2, 0, PI / 2), mat(0, 0.88, 0), 0x34373b);
  return finish(w);
}

function sign(v) {
  const w = new Writers();
  const f = w.get('fixed'), m = w.get('metal');
  m.add(cyl(0.032, 0.032, 2.45, 8), null, 0x9ba0a5);
  const disc = (r, c, z, seg = 24) => f.add(new THREE.CylinderGeometry(r, r, 0.025, seg).rotateX(PI / 2), mat(0, 2.2, z), c);
  if (v === 0) { disc(0.3, 0xc4161c, 0.04); disc(0.24, 0x1f58a8, 0.055); f.add(box(0.06, 0.4, 0.01), mat(0, 2.0, 0.07, 0, 0, PI / 4), 0xc4161c); }
  else if (v === 1) {
    f.add(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 3).rotateX(PI / 2).rotateZ(PI / 2), mat(0, 2.25, 0.04), 0xc4161c);
    f.add(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 3).rotateX(PI / 2).rotateZ(PI / 2), mat(0, 2.24, 0.055), 0xf4f2ec);
  } else {
    f.add(box(0.5, 0.5, 0.025), mat(0, 1.95, 0.04), 0x1f58a8);
    f.add(box(0.12, 0.3, 0.01), mat(-0.04, 2.05, 0.06), 0xf4f2ec);
    f.add(box(0.14, 0.12, 0.01), mat(0.04, 2.23, 0.06), 0xf4f2ec);
  }
  f.add(box(0.06, 0.05, 0.06), mat(0, 2.44, 0), 0x6b6f73);
  return finish(w);
}

function flowerpot(seed) {
  const w = new Writers();
  const r = makeRng(seed);
  const pts = [[0.0, 0.0], [0.17, 0.0], [0.22, 0.38], [0.25, 0.4], [0.25, 0.44], [0.2, 0.44]].map(([x, y]) => new THREE.Vector2(x, y));
  w.get('fixed').add(new THREE.LatheGeometry(pts, 14), null, 0xa95f3b);
  w.get('fixed').add(cyl(0.2, 0.2, 0.02, 14), mat(0, 0.4, 0), 0x3b2a1e);
  for (let k = 0; k < 4; k++) w.get('foliage').add(blob(0.13 + r() * 0.06, seed + k, 0.4, 0), mat((r() - 0.5) * 0.22, 0.52 + r() * 0.12, (r() - 0.5) * 0.22), 0xffffff);
  for (let k = 0; k < 8; k++) w.get('fixed').add(sph(0.03, 5, 4), mat((r() - 0.5) * 0.3, 0.6 + r() * 0.12, (r() - 0.5) * 0.3), r.pick([0xe8364a, 0xf4c430, 0xfaf4f0, 0xb35ac8]));
  return finish(w);
}

function busstop() {
  const w = new Writers();
  const m = w.get('metal'), g = w.get('glass'), f = w.get('fixed');
  for (const x of [-1.7, 1.7]) for (const z of [-0.7, 0.55]) m.add(box(0.07, 2.45, 0.07), mat(x, 0, z), 0x5f656b);
  f.add(box(3.7, 0.1, 1.65), mat(0, 2.45, -0.05), 0x30353a);
  g.add(box(3.35, 1.95, 0.03), mat(0, 0.35, -0.7), 0x6f8a99);
  for (const x of [-1.7, 1.7]) g.add(box(0.03, 1.95, 1.15), mat(x, 0.35, -0.1), 0x6f8a99);
  m.add(box(2.2, 0.05, 0.4), mat(0, 0.46, -0.45), 0x8a8f94);
  m.add(box(0.05, 0.46, 0.05), mat(-0.9, 0, -0.45), 0x5f656b);
  m.add(box(0.05, 0.46, 0.05), mat(0.9, 0, -0.45), 0x5f656b);
  f.add(box(0.06, 2.7, 0.06), mat(2.2, 0, 0.6), 0x5f656b);
  w.get('light').add(box(0.5, 0.36, 0.06), mat(2.2, 2.35, 0.6), 0xf2c230);
  f.add(box(1.2, 1.6, 0.04), mat(-1.0, 0.55, -0.66), 0x2a4a6b);
  return finish(w);
}

function cafe() {
  const w = new Writers();
  const m = w.get('metal'), f = w.get('fixed');
  m.add(cyl(0.03, 0.03, 0.72, 8), null, 0x2e3034);
  m.add(cyl(0.2, 0.22, 0.03, 10), null, 0x2e3034);
  f.add(cyl(0.38, 0.38, 0.03, 18), mat(0, 0.72, 0), 0xe9e7e1);
  for (const a of [0, PI]) {
    const M = mat(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62, 0, a + PI, 0);
    m.add(box(0.42, 0.04, 0.42).applyMatrix4(mat(0, 0.45, 0)), M, 0x3b3e42);
    m.add(box(0.42, 0.42, 0.04).applyMatrix4(mat(0, 0.47, -0.2)), M, 0x3b3e42);
    for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) m.add(box(0.03, 0.45, 0.03).applyMatrix4(mat(lx, 0, lz)), M, 0x3b3e42);
  }
  m.add(cyl(0.025, 0.025, 2.2, 6), null, 0xd5d5d0);
  w.get('matte').add(new THREE.ConeGeometry(1.15, 0.45, 8, 1, true), mat(0, 2.2, 0), 0xffffff);
  w.get('matte').add(new THREE.ConeGeometry(1.15, 0.45, 8, 1, true).rotateX(PI), mat(0, 2.199, 0, 0, 0, 0, 1, 0.02, 1), 0xd8d8d8);
  return finish(w);
}

function cart() {
  const w = new Writers();
  const m = w.get('metal');
  const c = 0xb6bcc2;
  m.add(box(0.5, 0.02, 0.8), mat(0, 0.45, 0), c);
  for (const [x, z] of [[-0.25, -0.4], [0.25, -0.4], [-0.25, 0.4], [0.25, 0.4]]) {
    m.add(box(0.025, 0.5, 0.025), mat(x, 0.45, z), c);
    w.get('fixed').add(cyl(0.05, 0.05, 0.04, 8).rotateZ(PI / 2), mat(x, 0.05, z), 0x1c1c1c);
    m.add(box(0.02, 0.45, 0.02), mat(x, 0.05, z), 0x6d7378);
  }
  for (const y of [0.7, 0.95]) {
    m.add(box(0.52, 0.02, 0.02), mat(0, y, -0.4), c); m.add(box(0.52, 0.02, 0.02), mat(0, y, 0.4), c);
    m.add(box(0.02, 0.02, 0.8), mat(-0.25, y, 0), c); m.add(box(0.02, 0.02, 0.8), mat(0.25, y, 0), c);
  }
  w.get('fixed').add(box(0.56, 0.05, 0.05), mat(0, 1.0, -0.5), 0xc4161c);
  return finish(w);
}

function dumpster() {
  const w = new Writers();
  w.get('matte').add(new THREE.CylinderGeometry(0.95, 0.85, 1.1, 4, 1).rotateY(PI / 4).scale(1, 1, 0.58).translate(0, 0.7, 0), null, 0xffffff);
  w.get('fixed').add(box(1.86, 0.08, 1.1), mat(0, 1.25, 0, -0.06, 0, 0), 0x2b2d2f);
  for (const [x, z] of [[-0.7, -0.38], [0.7, -0.38], [-0.7, 0.38], [0.7, 0.38]]) w.get('fixed').add(cyl(0.07, 0.07, 0.06, 8).rotateZ(PI / 2), mat(x, 0.08, z), 0x1a1a1a);
  return finish(w);
}

function fence() {
  const w = new Writers();
  const p = w.get('matte');
  for (const x of [-0.98, 0.98]) p.add(box(0.08, 1.0, 0.08), mat(x, 0, 0), 0xe2ded4);
  for (const y of [0.28, 0.72]) p.add(box(2.0, 0.06, 0.03), mat(0, y, -0.04), 0xd9d5ca);
  for (let k = 0; k < 8; k++) p.add(box(0.09, 0.88, 0.025), mat(-0.84 + k * 0.24, 0.04, 0.0), 0xf2f0ea);
  return finish(w);
}

function hedge(seed) {
  const w = new Writers();
  const g = displace(new THREE.BoxGeometry(2.0, 1.25, 0.82, 5, 3, 2), 0.16, seed, 2.2);
  w.get('foliage').add(g, mat(0, 0.64, 0), 0xffffff, (x, y) => 0.62 + 0.38 * Math.min(1, y / 1.25));
  return finish(w);
}

function bush(seed) {
  const w = new Writers();
  const r = makeRng(seed);
  const n = 3 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const rad = 0.32 + r() * 0.22, a = (k / n) * PI * 2;
    w.get('foliage').add(blob(rad, seed * 7 + k, 0.35), mat(Math.cos(a) * 0.3, 0.32 + r() * 0.25, Math.sin(a) * 0.3), 0xffffff, (x, y) => 0.55 + 0.45 * Math.min(1, y / 0.9));
  }
  return finish(w);
}

function kiosk() {
  const w = new Writers();
  const f = w.get('fixed');
  w.get('matte').add(box(2.6, 2.4, 2.2), null, 0xffffff);
  f.add(box(3.0, 0.14, 2.6), mat(0, 2.4, 0), 0x223d2e);
  f.add(box(2.7, 0.35, 2.3), mat(0, 2.54, 0), 0x2e5a3f);
  f.add(box(2.2, 1.3, 0.04), mat(0, 0.75, 1.11), 0x1b1d1f);
  const r = makeRng(7);
  for (let k = 0; k < 18; k++) f.add(box(0.2, 0.27, 0.02), mat(-0.95 + (k % 9) * 0.24, 0.85 + Math.floor(k / 9) * 0.5, 1.14), new THREE.Color().setHSL(r(), 0.6, 0.55));
  f.add(box(1.6, 0.06, 0.6), mat(0, 2.15, 1.35, 0.25, 0, 0), 0x2e5a3f);
  return finish(w);
}

function foodkiosk() {
  const w = new Writers();
  const f = w.get('fixed');
  f.add(box(2.6, 2.3, 2.4), null, 0xeae3d4);
  f.add(box(2.7, 0.14, 2.5), mat(0, 2.3, 0), 0x6b4a2f);
  f.add(box(2.2, 0.9, 0.05), mat(0, 1.05, 1.21), 0x2b2622);
  f.add(box(2.4, 0.08, 0.5), mat(0, 1.0, 1.4), 0x8a6a48);
  for (let k = 0; k < 6; k++) w.get(k % 2 ? 'fixed' : 'matte').add(box(0.5, 0.04, 1.0), mat(-1.25 + k * 0.5, 2.05, 1.55, 0.35, 0, 0), k % 2 ? 0xf6f4ee : 0xffffff);
  f.add(box(1.2, 0.5, 0.06), mat(0, 2.45, 1.0), 0x2b2b2b);
  return finish(w);
}

function fountain(v) {
  const w = new Writers();
  const f = w.get('fixed');
  const R = v === 0 ? 2.9 : 2.2;
  const stone = 0xc8c0b2;
  const wall = [[R - 0.35, 0], [R, 0], [R, 0.5], [R + 0.05, 0.55], [R - 0.4, 0.55], [R - 0.4, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
  f.add(new THREE.LatheGeometry(wall, 36), null, stone);
  w.get('water').add(cyl(R - 0.36, R - 0.36, 0.02, 36), mat(0, 0.42, 0), 0x6fb4c8);
  f.add(cyl(0.25, 0.35, 1.3, 12), null, stone);
  const bowl = [[0.1, 0], [0.9, 0.25], [1.0, 0.35], [0.95, 0.38], [0.1, 0.2]].map(([x, y]) => new THREE.Vector2(x, y));
  f.add(new THREE.LatheGeometry(bowl, 24), mat(0, 1.25, 0), stone);
  w.get('water').add(cyl(0.88, 0.88, 0.02, 24), mat(0, 1.55, 0), 0x7cc0d2);
  f.add(cyl(0.08, 0.12, 0.6, 10), mat(0, 1.5, 0), stone);
  w.get('water').add(cyl(0.05, 0.12, 0.7, 8, true), mat(0, 2.0, 0), 0xcfeaf2);
  w.get('water').add(new THREE.ConeGeometry(0.9, 0.5, 16, 1, true).rotateX(PI), mat(0, 1.8, 0, 0, 0, 0, 1, 1, 1), 0xbfe3ee);
  return finish(w);
}

// ---------------------------------------------------------------------------
// Trees: trunk + organic foliage clusters (not single spheres).

function trunkWithBranches(w, seed, h, r0, bark, nBranch = 3) {
  const r = makeRng(seed);
  w.get('fixed').add(cyl(r0 * 0.65, r0, h, 8), null, bark, (x, y) => 0.75 + 0.25 * Math.min(1, y / h));
  const ends = [];
  for (let k = 0; k < nBranch; k++) {
    const a = (k / nBranch) * PI * 2 + r() * 0.8, tilt = 0.6 + r() * 0.35, len = h * (0.35 + r() * 0.2);
    const y0 = h * (0.7 + r() * 0.2);
    const M = mat(0, y0, 0, 0, a, tilt);
    w.get('fixed').add(cyl(r0 * 0.25, r0 * 0.4, len, 6), M, bark);
    const end = new THREE.Vector3(0, len, 0).applyMatrix4(M);
    ends.push(end);
  }
  return ends;
}

function treeBroad(seed, opts = {}) {
  const w = new Writers();
  const r = makeRng(seed);
  const h = opts.h ?? 3.2, crown = opts.crown ?? 2.2;
  const ends = trunkWithBranches(w, seed, h, opts.trunk ?? 0.2, opts.bark ?? 0x5a4636, opts.branches ?? 3);
  const shade = (x, y) => 0.5 + 0.5 * Math.min(1, Math.max(0, (y - h * 0.7) / (crown * 1.8)));
  w.get('foliage').add(blob(crown, seed, 0.3), mat(0, h + crown * 0.6, 0, 0, 0, 0, 1, 0.82, 1), 0xffffff, shade);
  for (const e of ends) {
    const rad = crown * (0.55 + r() * 0.2);
    w.get('foliage').add(blob(rad, seed + e.x * 10, 0.32), mat(e.x * 1.15, Math.max(h * 0.85, e.y + rad * 0.1), e.z * 1.15), 0xffffff, shade);
  }
  for (let k = 0; k < 3; k++) {
    const a = r() * PI * 2, d = crown * 0.75;
    w.get('foliage').add(blob(crown * (0.4 + r() * 0.15), seed * 3 + k, 0.35), mat(Math.cos(a) * d, h + crown * (0.8 + r() * 0.6), Math.sin(a) * d), 0xffffff, shade);
  }
  return finish(w);
}

function treePine(seed) {
  const w = new Writers();
  const r = makeRng(seed);
  w.get('fixed').add(cyl(0.12, 0.2, 3.0, 8), null, 0x4b3628);
  const tiers = 5;
  for (let k = 0; k < tiers; k++) {
    const rad = 1.7 * (1 - k / (tiers + 0.6)), y = 1.8 + k * 1.45;
    const g = displace(new THREE.ConeGeometry(rad, 2.4, 10, 2), 0.16, seed + k, 1.3);
    w.get('foliage').add(g, mat((r() - 0.5) * 0.15, y + 1.2, (r() - 0.5) * 0.15, 0, r() * 6, 0), 0xffffff, (x, yy) => 0.5 + 0.5 * Math.min(1, (yy - 1.5) / 8));
  }
  return finish(w);
}

function treeCypress(seed) {
  const w = new Writers();
  w.get('fixed').add(cyl(0.09, 0.14, 1.2, 7), null, 0x4b3628);
  const g = displace(new THREE.SphereGeometry(1, 12, 10), 0.22, seed, 3.5);
  w.get('foliage').add(g, mat(0, 4.7, 0, 0, 0, 0, 0.72, 4.1, 0.72), 0xffffff, (x, y) => 0.55 + 0.45 * Math.min(1, y / 8.5));
  return finish(w);
}

export const MODELS = {
  car_city: () => car(CAR_SPECS.car_city),
  car_sedan: () => car(CAR_SPECS.car_sedan),
  car_suv: () => car(CAR_SPECS.car_suv),
  van, bus,
  scooter: () => twoWheel('scooter', false), motorbike: () => twoWheel('motorbike', false), bicycle: () => twoWheel('bicycle', false),
  scooter_r: () => twoWheel('scooter', true, 3), motorbike_r: () => twoWheel('motorbike', true, 5), bicycle_r: () => twoWheel('bicycle', true, 9),
  wheel: wheelModel, bikewheel: bikeWheelModel,
  lamp, tlight, bench, bin, cone, hydrant, bollard, busstop, cafe, cart, dumpster, fence, kiosk, foodkiosk,
  sign0: () => sign(0), sign1: () => sign(1), sign2: () => sign(2),
  flowerpot: () => flowerpot(3),
  hedge: () => hedge(5),
  bush0: () => bush(11), bush1: () => bush(23), bush2: () => bush(37),
  fountain0: () => fountain(0), fountain1: () => fountain(1),
  tree0: () => treeBroad(101), tree1: () => treeBroad(202, { h: 3.6, crown: 2.0, branches: 4 }), tree2: () => treeBroad(303, { h: 2.8, crown: 2.4 }),
  tree_small0: () => treeBroad(404, { h: 2.2, crown: 1.05, trunk: 0.1, branches: 2 }),
  tree_small1: () => treeBroad(505, { h: 2.5, crown: 0.95, trunk: 0.09, branches: 3 }),
  tree_small2: () => treeBroad(606, { h: 2.0, crown: 1.15, trunk: 0.11, branches: 2 }),
  tree_birch0: () => treeBroad(707, { h: 4.0, crown: 1.45, trunk: 0.13, branches: 4, bark: 0xe6e2d8 }),
  tree_birch1: () => treeBroad(808, { h: 4.4, crown: 1.3, trunk: 0.12, branches: 3, bark: 0xe6e2d8 }),
  tree_birch2: () => treeBroad(909, { h: 3.7, crown: 1.5, trunk: 0.13, branches: 4, bark: 0xe6e2d8 }),
  tree_pine0: () => treePine(1), tree_pine1: () => treePine(2), tree_pine2: () => treePine(3),
  tree_cypress0: () => treeCypress(1), tree_cypress1: () => treeCypress(2), tree_cypress2: () => treeCypress(3),
  leaf: () => { const w = new Writers(); w.get('matte').add(new THREE.CylinderGeometry(0.08, 0.08, 0.008, 7).scale(1, 1, 0.62).translate(0, 0.006, 0), null, 0xffffff); return finish(w); },
  litter0: () => { const w = new Writers(); w.get('paint').add(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10).rotateZ(PI / 2).translate(0, 0.033, 0), null, 0xffffff); w.get('metal').add(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 10).rotateZ(PI / 2).translate(0.062, 0.033, 0), null, 0xc8ccd0); return finish(w); },
  litter1: () => { const w = new Writers(); w.get('fixed').add(blob(0.065, 5, 0.6, 1), mat(0, 0.055, 0), 0xf1efe8); return finish(w); },
  litter2: () => { const w = new Writers(); w.get('glass').add(new THREE.CylinderGeometry(0.035, 0.038, 0.2, 10).rotateZ(PI / 2).translate(0, 0.037, 0), null, 0x2f6b3a); w.get('glass').add(new THREE.CylinderGeometry(0.014, 0.022, 0.07, 8).rotateZ(PI / 2).translate(0.13, 0.037, 0), null, 0x2f6b3a); return finish(w); },
  litter3: () => { const w = new Writers(); w.get('fixed').add(new THREE.CylinderGeometry(0.045, 0.032, 0.11, 10).rotateZ(PI / 2 - 0.1).translate(0, 0.045, 0), null, 0xf6f3ec); w.get('fixed').add(new THREE.CylinderGeometry(0.047, 0.047, 0.012, 10).rotateZ(PI / 2).translate(0.058, 0.05, 0), null, 0x7a4a2b); return finish(w); },
};

// Pick the model key for a kind/variant.
export function modelKey(kind, v = 0, ridden = false) {
  switch (kind) {
    case 'litter': return `litter${v % 4}`;
    case 'sign': return `sign${v % 3}`;
    case 'bush': return `bush${v % 3}`;
    case 'fountain': return `fountain${v % 2}`;
    case 'tree': case 'tree_small': case 'tree_birch': case 'tree_pine': case 'tree_cypress': return `${kind}${v % 3}`;
    case 'scooter': case 'motorbike': case 'bicycle': return ridden ? `${kind}_r` : kind;
    default: return kind;
  }
}
