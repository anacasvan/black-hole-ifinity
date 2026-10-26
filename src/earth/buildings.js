// Procedural buildings with real architectural detail: facades with windows,
// plinths, cornices, balconies, shop fronts with awnings and signs, pitched or
// flat roofs with rooftop equipment. Local frame: footprint centred at the
// origin, base at y = 0, main front facing +z.
import * as THREE from 'three';
import { Writers, mat } from './geo.js';
import { makeRng } from './rng.js';

const STONE = 0xd9d2c4, DARK = 0x3a3b3d, WOOD = 0x6b4a32, METAL = 0x8c9196;

function signQuad(w, x0, x1, y0, y1, z, idx) {
  const col = idx % 2, row = Math.floor(idx / 2);
  const u0 = col * 0.5 + 0.004, u1 = (col + 1) * 0.5 - 0.004;
  const v1 = 1 - row / 8 - 0.004, v0 = 1 - (row + 1) / 8 + 0.004;
  w.get('sign').color(0xffffff).quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
}

// Roof with four slopes (ridge along the longer side) over the eave rectangle.
function hipRoof(wr, x0, x1, z0, z1, y, h, col) {
  const r = wr.get('roofT').color(col);
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (W >= D) {
    const rx0 = x0 + D / 2, rx1 = x1 - D / 2, sl = Math.hypot(D / 2, h);
    r.quad([x0, y, z1], [x1, y, z1], [rx1, y + h, cz], [rx0, y + h, cz], [0, 0], [W, 0], [W - D / 2, sl], [D / 2, sl]);
    r.quad([x1, y, z0], [x0, y, z0], [rx0, y + h, cz], [rx1, y + h, cz], [0, 0], [W, 0], [W - D / 2, sl], [D / 2, sl]);
    r.tri([x0, y, z0], [x0, y, z1], [rx0, y + h, cz], [0, 0], [D, 0], [D / 2, sl]);
    r.tri([x1, y, z1], [x1, y, z0], [rx1, y + h, cz], [0, 0], [D, 0], [D / 2, sl]);
  } else {
    const rz0 = z0 + W / 2, rz1 = z1 - W / 2, sl = Math.hypot(W / 2, h);
    r.quad([x1, y, z1], [x1, y, z0], [cx, y + h, rz0], [cx, y + h, rz1], [0, 0], [D, 0], [D - W / 2, sl], [W / 2, sl]);
    r.quad([x0, y, z0], [x0, y, z1], [cx, y + h, rz1], [cx, y + h, rz0], [0, 0], [D, 0], [D - W / 2, sl], [W / 2, sl]);
    r.tri([x0, y, z1], [x1, y, z1], [cx, y + h, rz1], [0, 0], [W, 0], [W / 2, sl]);
    r.tri([x1, y, z0], [x0, y, z0], [cx, y + h, rz0], [0, 0], [W, 0], [W / 2, sl]);
  }
  // Fascia under the eaves so the roof has visible thickness.
  wr.get('plain').color(0x5b4a3c).box(x0, y - 0.18, z0, x1, y, z1, { top: false, bottom: true });
}

// Gable roof, ridge along x; gable walls at the x ends use the facade material.
function gableRoof(wr, w, d, y, h, oh, roofCol, wallKey, wallCol) {
  const r = wr.get('roofT').color(roofCol);
  const x0 = -w / 2 - oh, x1 = w / 2 + oh, z0 = -d / 2 - oh, z1 = d / 2 + oh;
  const sl = Math.hypot(d / 2 + oh, h), L = x1 - x0;
  r.quad([x0, y, z1], [x1, y, z1], [x1, y + h, 0], [x0, y + h, 0], [0, 0], [L, 0], [L, sl], [0, sl]);
  r.quad([x1, y, z0], [x0, y, z0], [x0, y + h, 0], [x1, y + h, 0], [0, 0], [L, 0], [L, sl], [0, sl]);
  wr.get('plain').color(0x5b4a3c).box(x0, y - 0.18, z0, x1, y, z1, { top: false, bottom: true });
  const g = wr.get(wallKey).color(wallCol);
  const lift = h * oh / (d / 2 + oh);
  for (const sx of [-1, 1]) {
    const x = sx * w / 2;
    const pts = [[x, y, -d / 2], [x, y, d / 2], [x, y + lift, d / 2], [x, y + h, 0], [x, y + lift, -d / 2]];
    const P = sx > 0 ? pts.slice().reverse() : pts;
    for (let k = 1; k < P.length - 1; k++) g.tri(P[0], P[k], P[k + 1], [0, 0], [0, 0], [0, 0]);
  }
}

function flatRoof(wr, x0, x1, z0, z1, y, parapet = 0.7, parCol = STONE) {
  wr.get('roofG').color(0xffffff).rectY(x0, z0, x1, z1, y);
  if (parapet > 0) {
    const t = 0.25, p = wr.get('plain').color(parCol);
    p.box(x0, y, z0, x1, y + parapet, z0 + t);
    p.box(x0, y, z1 - t, x1, y + parapet, z1);
    p.box(x0, y, z0 + t, x0 + t, y + parapet, z1 - t);
    p.box(x1 - t, y, z0 + t, x1, y + parapet, z1 - t);
  }
}

function rooftop(wr, r, x0, x1, z0, z1, y, n = 3) {
  const p = wr.get('plain');
  const W = x1 - x0, D = z1 - z0;
  if (W > 6 && D > 6) {
    const cx = x0 + W * r.range(0.3, 0.7), cz = z0 + D * r.range(0.3, 0.7);
    p.color(0xc9c4ba).cbox(cx, y, cz, 2.6, 2.4, 2.8);
    p.color(0x8f8a82).cbox(cx, y + 2.4, cz, 2.8, 0.15, 3.0);
  }
  for (let k = 0; k < n; k++) {
    const cx = x0 + 1.2 + r() * (W - 2.4), cz = z0 + 1.2 + r() * (D - 2.4);
    p.color(0xb9bcbf).cbox(cx, y, cz, 1.1, 0.8, 0.9);
    p.color(0x55585c).cbox(cx, y + 0.8, cz, 0.7, 0.04, 0.7);
  }
  if (r() < 0.5 && W > 5) {
    const tx = x0 + 1.5 + r() * (W - 3), tz = z0 + 1.5 + r() * (D - 3);
    p.add(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 12).translate(0, 0.8 + 0.6, 0), mat(tx, y, tz), 0xa7aaa8);
    for (const [ox, oz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) p.color(0x6a6d70).cbox(tx + ox, y, tz + oz, 0.08, 0.6, 0.08);
  }
  if (r() < 0.6) {
    const ax = x0 + 1 + r() * (W - 2), az = z0 + 1 + r() * (D - 2);
    p.add(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 5).translate(0, 1.25, 0), mat(ax, y, az), 0x777a7d);
    p.add(new THREE.BoxGeometry(0.9, 0.04, 0.04), mat(ax, y + 2.1, az), 0x777a7d);
  }
}

function balconies(wr, r, w, d, floors, fh, y0, front = true, railKey = 'plain') {
  const p = wr.get('plain');
  const bays = Math.max(1, Math.round(w / 3)), bw = w / bays;
  for (let f = 1; f < floors; f++) {
    const y = y0 + (f - (y0 > 0 ? 1 : 0)) * fh;
    for (let k = 0; k < bays; k++) {
      if ((k + f) % 2 === 0 && bays > 2) continue;
      const cx = -w / 2 + (k + 0.5) * bw;
      for (const s of front ? [1, -1] : [-1]) {
        const z = s * d / 2;
        p.color(0xd6d0c4).box(cx - bw * 0.42, y - 0.15, Math.min(z, z + s * 1.0), cx + bw * 0.42, y, Math.max(z, z + s * 1.0), { bottom: true });
        const rail = wr.get(railKey).color(railKey === 'glass' ? 0x9bb5c4 : 0x3b3c3e);
        const zr = z + s * 0.97;
        rail.box(cx - bw * 0.42, y, Math.min(zr, zr + s * 0.04), cx + bw * 0.42, y + 0.95, Math.max(zr, zr + s * 0.04));
        for (const sx of [-1, 1]) rail.box(cx + sx * bw * 0.42 - 0.02, y, Math.min(z, z + s), cx + sx * bw * 0.42 + 0.02, y + 0.95, Math.max(z, z + s));
      }
    }
  }
}

function shopFront(wr, it, w, d, gH, front = true) {
  const r = makeRng(it.seed + 5);
  const bays = Math.max(1, Math.round(w / 4));
  const bw = w / bays;
  const signBay = Math.floor(bays / 2);
  for (const s of front ? [1] : []) {
    const z = s * d / 2;
    for (let k = 0; k < bays; k++) {
      const cx = -w / 2 + (k + 0.5) * bw;
      if (k === signBay && it.sign !== undefined) {
        signQuad(wr, cx - bw * 0.42, cx + bw * 0.42, gH - 0.95, gH - 0.35, z + 0.03, it.sign);
      }
      const aw = it.awning ?? 0x2f6d4f;
      const g = new THREE.BoxGeometry(bw * 0.86, 0.05, 1.35).translate(0, 0, 0.62);
      wr.get('plain').add(g, mat(cx, gH - 1.15, z + 0.02, 0.38, 0, 0), aw);
      wr.get('plain').add(new THREE.BoxGeometry(bw * 0.86, 0.28, 0.03), mat(cx, gH - 1.55, z + 1.27), aw);
      if (r() < 0.3) wr.get('plain').color(0x2a2b2c).box(cx - 0.55, 0, z, cx + 0.55, 2.4, z + 0.06, { top: true });
    }
  }
}

// ---------------------------------------------------------------------------

function house(wr, it) {
  const { w, d, h } = it;
  const r = makeRng(it.seed);
  wr.get('plain').color(0x9d968a).box(-w / 2 - 0.06, 0, -d / 2 - 0.06, w / 2 + 0.06, 0.45, d / 2 + 0.06, { top: false });
  wr.get('resA').color(it.col).box(-w / 2, 0, -d / 2, w / 2, h, d / 2, { mu: 3, mv: 2.9, fit: true, top: false });
  const doorX = r.chance(0.5) ? -w / 2 + 1.6 : w / 2 - 1.6;
  wr.get('plain').color(WOOD).box(doorX - 0.5, 0.15, d / 2, doorX + 0.5, 2.25, d / 2 + 0.07);
  wr.get('plain').color(0xcfc8bb).box(doorX - 0.9, 2.35, d / 2, doorX + 0.9, 2.47, d / 2 + 1.0, { bottom: true });
  wr.get('plain').color(0xb5aea2).box(doorX - 0.8, 0, d / 2, doorX + 0.8, 0.18, d / 2 + 0.9);
  const oh = 0.45;
  const roofH = (it.roof === 'gable' ? d : Math.min(w, d)) * 0.3;
  if (it.roof === 'gable') gableRoof(wr, w, d, h, roofH, oh, it.roofCol, 'resA', it.col);
  else hipRoof(wr, -w / 2 - oh, w / 2 + oh, -d / 2 - oh, d / 2 + oh, h, roofH, it.roofCol);
  const cx = w * 0.22 * (r.chance(0.5) ? 1 : -1), cz = -d * 0.18;
  wr.get('brick').color(0xffffff).box(cx - 0.32, h, cz - 0.32, cx + 0.32, h + roofH + 0.4, cz + 0.32, { mu: 0.64, mv: 1 });
  wr.get('plain').color(0x505050).box(cx - 0.38, h + roofH + 0.4, cz - 0.38, cx + 0.38, h + roofH + 0.5, cz + 0.38, { bottom: true });
  return h + roofH + 0.5;
}

function villa(wr, it) {
  const { w, d, h } = it;
  const s = it.wingSide;
  const mw = w * 0.64, ww = w - mw - 0.1;
  const mx = -s * (w / 2 - mw / 2), wx = s * (w / 2 - ww / 2);
  const wd = d * 0.78, wz = d / 2 - wd / 2;
  const p = wr.get('plain');
  p.color(0x9d968a).box(mx - mw / 2 - 0.06, 0, -d / 2 - 0.06, mx + mw / 2 + 0.06, 0.5, d / 2 + 0.06, { top: false });
  wr.get('resA').color(it.col).box(mx - mw / 2, 0, -d / 2, mx + mw / 2, h, d / 2, { mu: 3, mv: 2.9, fit: true, top: false });
  wr.get('resB').color(it.col).box(wx - ww / 2, 0, wz - wd / 2, wx + ww / 2, 3.1, wz + wd / 2, { mu: 3, mv: 3.1, fit: true, top: false });
  hipRoof(wr, mx - mw / 2 - 0.5, mx + mw / 2 + 0.5, -d / 2 - 0.5, d / 2 + 0.5, h, Math.min(mw, d) * 0.28, it.roofCol);
  hipRoof(wr, wx - ww / 2 - 0.4, wx + ww / 2 + 0.4, wz - wd / 2 - 0.4, wz + wd / 2 + 0.4, 3.1, Math.min(ww, wd) * 0.3, it.roofCol);
  p.color(WOOD).box(mx - 0.6, 0.2, d / 2, mx + 0.6, 2.4, d / 2 + 0.07);
  // Pergola / porch with columns
  p.color(0xe8e2d6);
  for (const k of [-1, 1]) p.cbox(mx + k * 1.6, 0, d / 2 + 1.8, 0.25, 2.7, 0.25);
  p.color(0xddd6c8).box(mx - 2.0, 2.7, d / 2, mx + 2.0, 2.9, d / 2 + 2.1, { bottom: true });
  return h + Math.min(mw, d) * 0.28;
}

function palazzina(wr, it) {
  const { w, d, h, floors } = it;
  const r = makeRng(it.seed);
  const style = it.style ?? 'resB';
  wr.get('plain').color(0x8f8a80).box(-w / 2 - 0.08, 0, -d / 2 - 0.08, w / 2 + 0.08, 0.7, d / 2 + 0.08, { top: false });
  wr.get(style).color(style === 'brick' ? 0xffffff : it.col).box(-w / 2, 0, -d / 2, w / 2, h, d / 2, { mu: 3, mv: 3.0, fit: true, top: false });
  wr.get('plain').color(STONE).box(-w / 2 - 0.25, h - 0.05, -d / 2 - 0.25, w / 2 + 0.25, h + 0.3, d / 2 + 0.25, { bottom: true, top: false });
  flatRoof(wr, -w / 2 - 0.25, w / 2 + 0.25, -d / 2 - 0.25, d / 2 + 0.25, h + 0.3, 0.6, STONE);
  rooftop(wr, r, -w / 2, w / 2, -d / 2, d / 2, h + 0.3, 3);
  if (it.balconies) balconies(wr, r, w, d, floors, 3.0, 0, true, r.chance(0.4) ? 'glass' : 'plain');
  wr.get('plain').color(0xcfc9bd).box(-1.4, 2.6, d / 2, 1.4, 2.75, d / 2 + 1.3, { bottom: true });
  wr.get('glass').color(0x3a4650).box(-0.9, 0, d / 2, 0.9, 2.5, d / 2 + 0.05);
  return h + 0.9;
}

function palazzo(wr, it) {
  const { w, d, h, floors } = it;
  const r = makeRng(it.seed);
  const style = it.style ?? 'resA';
  const gH = it.shopGround ? 4.2 : 3.1;
  const wallCol = style === 'brick' ? 0xffffff : it.col;
  if (it.shopGround) wr.get('shop').color(0xffffff).box(-w / 2, 0, -d / 2, w / 2, gH, d / 2, { mu: 4, mv: gH, fit: true, top: false });
  else wr.get(style).color(wallCol).box(-w / 2, 0, -d / 2, w / 2, gH, d / 2, { mu: 3, mv: gH, fit: true, top: false });
  wr.get(style).color(wallCol).box(-w / 2, gH, -d / 2, w / 2, h, d / 2, { mu: 3, mv: 3.1, fit: true, top: false, vBase: gH });
  wr.get('plain').color(STONE).box(-w / 2 - 0.12, gH - 0.05, -d / 2 - 0.12, w / 2 + 0.12, gH + 0.28, d / 2 + 0.12, { bottom: true });
  wr.get('plain').color(STONE).box(-w / 2 - 0.4, h - 0.1, -d / 2 - 0.4, w / 2 + 0.4, h + 0.35, d / 2 + 0.4, { bottom: true, top: it.roof !== 'flat' });
  let top = h + 0.35;
  if (it.roof === 'hip') {
    const rh = Math.min(w, d) * 0.26;
    hipRoof(wr, -w / 2 - 0.45, w / 2 + 0.45, -d / 2 - 0.45, d / 2 + 0.45, h + 0.35, rh, it.roofCol);
    top += rh;
  } else {
    flatRoof(wr, -w / 2 - 0.4, w / 2 + 0.4, -d / 2 - 0.4, d / 2 + 0.4, h + 0.35, 0.55, STONE);
    rooftop(wr, r, -w / 2, w / 2, -d / 2, d / 2, h + 0.35, 2);
  }
  if (it.shopGround) shopFront(wr, it, w, d, gH, true);
  if (it.balconies) balconies(wr, r, w, d, floors, 3.1, gH, false, 'plain');
  return top;
}

function shop(wr, it) {
  const { w, d, h } = it;
  const r = makeRng(it.seed);
  const gH = 4.2;
  wr.get('shop').color(0xffffff).box(-w / 2, 0, -d / 2, w / 2, gH, d / 2, { mu: 4, mv: gH, fit: true, top: false });
  if (h > gH + 0.5) wr.get('resB').color(it.col).box(-w / 2, gH, -d / 2, w / 2, h, d / 2, { mu: 3, mv: 3.1, fit: true, top: false, vBase: gH });
  wr.get('plain').color(STONE).box(-w / 2 - 0.15, gH - 0.05, -d / 2 - 0.15, w / 2 + 0.15, gH + 0.25, d / 2 + 0.15, { bottom: true, top: h <= gH + 0.5 });
  const y = Math.max(h, gH + 0.25);
  flatRoof(wr, -w / 2, w / 2, -d / 2, d / 2, y, 0.6, it.col);
  rooftop(wr, r, -w / 2, w / 2, -d / 2, d / 2, y, 2);
  shopFront(wr, it, w, d, gH, true);
  return y + 0.6;
}

function supermarket(wr, it) {
  const { w, d, h } = it;
  const r = makeRng(it.seed);
  wr.get('panel').color(it.col).box(-w / 2, 0, -d / 2, w / 2, h, d / 2, { mu: 6, mv: h, fit: true, top: false });
  wr.get('plain').color(0xc81f2d).box(-w / 2 - 0.05, h - 0.9, -d / 2 - 0.05, w / 2 + 0.05, h - 0.3, d / 2 + 0.05, { top: false });
  wr.get('glass').color(0x30404c).box(-w * 0.32, 0, d / 2, w * 0.32, 3.4, d / 2 + 0.06);
  const p = wr.get('plain');
  p.color(0xe9e7e2).box(-w * 0.36, 3.5, d / 2, w * 0.36, 3.85, d / 2 + 3.0, { bottom: true });
  for (const x of [-w * 0.34, -w * 0.12, w * 0.12, w * 0.34]) p.color(0x8d9296).cbox(x, 0, d / 2 + 2.8, 0.22, 3.5, 0.22);
  signQuad(wr, -w * 0.25, w * 0.25, h - 3.3, h - 1.4, d / 2 + 0.04, it.sign ?? 12);
  flatRoof(wr, -w / 2, w / 2, -d / 2, d / 2, h, 0.5, 0xd6d4ce);
  for (let k = 0; k < 8; k++) p.color(0xbfc2c4).cbox(-w / 2 + 3 + r() * (w - 6), h, -d / 2 + 3 + r() * (d - 6), 1.8, 1.0, 1.2);
  for (let k = 0; k < 4; k++) wr.get('glass').color(0x8fb0c2).cbox(-w / 2 + (k + 1) * w / 5, h, 0, 2.2, 0.4, d * 0.5);
  for (let k = 0; k < 2; k++) p.color(0x3c3f43).box(-w / 2 + 4 + k * 5, 0, -d / 2 - 0.06, -w / 2 + 7.5 + k * 5, 3.8, -d / 2);
  return h + 1.0;
}

function warehouse(wr, it) {
  const { w, d, h } = it;
  wr.get('metal').color(it.col).box(-w / 2, 0, -d / 2, w / 2, h, d / 2, { mu: 2, mv: h, fit: true, top: false });
  const rh = 1.4;
  const g = wr.get('metal').color(0xd0d3d5);
  const x0 = -w / 2 - 0.3, x1 = w / 2 + 0.3, z0 = -d / 2 - 0.3, z1 = d / 2 + 0.3;
  g.quad([x1, h, z0], [x0, h, z0], [x0, h + rh, 0], [x1, h + rh, 0], [0, 0], [w, 0], [w, 6], [0, 6]);
  g.quad([x0, h, z1], [x1, h, z1], [x1, h + rh, 0], [x0, h + rh, 0], [0, 0], [w, 0], [w, 6], [0, 6]);
  const gw = wr.get('metal').color(it.col);
  for (const sx of [-1, 1]) {
    const x = sx * w / 2;
    const P = sx > 0 ? [[x, h, d / 2], [x, h, -d / 2], [x, h + rh * (d / 2) / (d / 2 + 0.3), 0]] : [[x, h, -d / 2], [x, h, d / 2], [x, h + rh * (d / 2) / (d / 2 + 0.3), 0]];
    gw.tri(P[0], P[1], P[2]);
  }
  const p = wr.get('plain');
  const doors = Math.max(1, Math.floor(w / 6));
  for (let k = 0; k < doors; k++) {
    const cx = -w / 2 + (k + 0.5) * (w / doors);
    p.color(0x4a4f55).box(cx - 1.8, 0, d / 2, cx + 1.8, 4.2, d / 2 + 0.06);
    p.color(0xe0b020).box(cx - 1.9, 4.2, d / 2, cx + 1.9, 4.35, d / 2 + 0.08);
  }
  signQuad(wr, -w * 0.3, w * 0.3, h - 2.2, h - 0.8, d / 2 + 0.04, it.sign ?? 13);
  return h + rh;
}

function tower(wr, it) {
  const { w, d, h } = it;
  const r = makeRng(it.seed);
  const style = it.style ?? 'office';
  const pH = it.podium ?? 0;
  const tw = it.tw ?? w, td = it.td ?? d;
  const fh = 3.6;
  if (pH > 0) {
    wr.get('shop').color(0xffffff).box(-w / 2, 0, -d / 2, w / 2, pH, d / 2, { mu: 4, mv: 4.2, fit: true, top: false });
    wr.get('plain').color(0xd5d2cb).box(-w / 2 - 0.15, pH - 0.2, -d / 2 - 0.15, w / 2 + 0.15, pH + 0.3, d / 2 + 0.15, { bottom: true, top: false });
    flatRoof(wr, -w / 2 - 0.15, w / 2 + 0.15, -d / 2 - 0.15, d / 2 + 0.15, pH + 0.3, 1.1, 0x9fb3bf);
    for (let k = 0; k < 4; k++) wr.get('plain').color(0x5e8d4a).cbox(-w / 2 + 2.5 + r() * (w - 5), pH + 0.3, (r() < 0.5 ? -1 : 1) * (td / 2 + 1.5), 1.6, 0.5, 1.6);
  } else {
    wr.get('glass').color(0x35505f).box(-tw / 2 + 0.6, 0, td / 2 - 0.6, tw / 2 - 0.6, 5.5, td / 2);
  }
  const split = it.setback ? h * 0.7 : h;
  const y0 = pH > 0 ? pH + 0.3 : 0;
  const key = style;
  const col = style === 'officeC' ? 0xffffff : 0xf2f6f8;
  wr.get(key).color(col).box(-tw / 2, y0, -td / 2, tw / 2, split, td / 2, { mu: 3, mv: fh, fit: true, top: false, vBase: y0 });
  let top = split;
  let sw = tw, sd = td;
  if (it.setback) {
    sw = tw * 0.8; sd = td * 0.8;
    flatRoof(wr, -tw / 2, tw / 2, -td / 2, td / 2, split, 1.0, 0xcfd6da);
    wr.get(key).color(col).box(-sw / 2, split, -sd / 2, sw / 2, h, sd / 2, { mu: 3, mv: fh, fit: true, top: false, vBase: split });
    top = h;
  }
  const fins = wr.get('plain').color(style === 'office' ? 0xc9d1d6 : 0xb9b3a8);
  for (const [x, z, hh, yb] of [[-tw / 2, -td / 2, split, y0], [tw / 2, -td / 2, split, y0], [-tw / 2, td / 2, split, y0], [tw / 2, td / 2, split, y0]]) {
    fins.box(x - 0.35, yb, z - 0.35, x + 0.35, hh + 0.6, z + 0.35);
  }
  for (let y = y0 + fh * 6; y < top - 2; y += fh * 6) fins.box(-sw / 2 - 0.12, y - 0.15, -sd / 2 - 0.12, sw / 2 + 0.12, y + 0.15, sd / 2 + 0.12, { bottom: true });
  const crown = it.crown ?? 0;
  if (crown === 0) {
    flatRoof(wr, -sw / 2, sw / 2, -sd / 2, sd / 2, top, 1.2, 0xc9d1d6);
    wr.get('plain').color(0x4d545a).cbox(0, top, 0, sw * 0.55, 4.5, sd * 0.55);
    wr.get('plain').add(new THREE.CylinderGeometry(0.12, 0.25, 14, 8).translate(0, 7, 0), mat(0, top + 4.5, 0), 0xb8bdc2);
    top += 18.5;
  } else if (crown === 1) {
    wr.get(key).color(col).box(-sw * 0.35, top, -sd * 0.35, sw * 0.35, top + 7, sd * 0.35, { mu: 3, mv: fh, fit: true, vBase: top });
    wr.get('plain').add(new THREE.ConeGeometry(Math.min(sw, sd) * 0.3, 10, 4).rotateY(Math.PI / 4).translate(0, 5, 0), mat(0, top + 7, 0), 0x9aa6ae);
    flatRoof(wr, -sw / 2, sw / 2, -sd / 2, sd / 2, top, 1.0, 0xc9d1d6);
    top += 17;
  } else {
    flatRoof(wr, -sw / 2, sw / 2, -sd / 2, sd / 2, top, 1.0, 0xc9d1d6);
    wr.get('plain').add(new THREE.CylinderGeometry(Math.min(sw, sd) * 0.36, Math.min(sw, sd) * 0.36, 0.35, 28).translate(0, 0.17, 0), mat(0, top, 0), 0x3f4448);
    wr.get('plain').add(new THREE.TorusGeometry(Math.min(sw, sd) * 0.27, 0.18, 4, 28).rotateX(Math.PI / 2), mat(0, top + 0.37, 0), 0xf2f2ea);
    top += 1;
  }
  return top;
}

const BUILDERS = { house, villa, palazzina, palazzo, shop, supermarket, warehouse, tower };

// Returns { geos: {materialKey: BufferGeometry}, top } in local building space.
export function buildBuilding(it) {
  const wr = new Writers();
  const top = BUILDERS[it.kind](wr, it);
  return { geos: wr.build(), top };
}

// Representative colour for distant low-detail boxes.
export function liteColor(it) {
  switch (it.kind) {
    case 'tower': return it.style === 'officeC' ? 0xc5c1b8 : 0x7fa3b8;
    case 'warehouse': return it.col;
    case 'supermarket': return 0xe4e2dc;
    default: return it.col ?? 0xd8d0c0;
  }
}
