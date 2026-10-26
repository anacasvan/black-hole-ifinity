// Small geometry writer used by every procedural model: accumulates
// non-indexed triangles with normals, uvs and vertex colours.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();

export class Writer {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.col = [1, 1, 1]; }
  get count() { return this.p.length / 3; }
  color(c) {
    if (Array.isArray(c)) this.col = c;
    else { _c.set(c); this.col = [_c.r, _c.g, _c.b]; }
    return this;
  }
  vert(x, y, z, nx, ny, nz, u, v, col = this.col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(col[0], col[1], col[2]);
  }
  tri(a, b, c, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    fn.crossVectors(e1, e2).normalize();
    this.vert(a[0], a[1], a[2], fn.x, fn.y, fn.z, ua[0], ua[1]);
    this.vert(b[0], b[1], b[2], fn.x, fn.y, fn.z, ub[0], ub[1]);
    this.vert(c[0], c[1], c[2], fn.x, fn.y, fn.z, uc[0], uc[1]);
  }
  // Counter-clockwise when looking at the front face.
  quad(a, b, c, d, ua = [0, 0], ub = [1, 0], uc = [1, 1], ud = [0, 1]) {
    this.tri(a, b, c, ua, ub, uc);
    this.tri(a, c, d, ua, uc, ud);
  }
  // Horizontal rectangle facing up at height y with world-space uv (metres).
  rectY(x0, z0, x1, z1, y, ox = 0, oz = 0) {
    const u0 = x0 + ox, u1 = x1 + ox, v0 = -(z0 + oz), v1 = -(z1 + oz);
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [u0, v1], [u1, v1], [u1, v0], [u0, v0]);
  }
  // Axis-aligned box. opt.mu/mv: uv module size for side faces; opt.fit stretches the
  // module so a whole number fits each face; opt.world: uv from absolute coords.
  box(x0, y0, z0, x1, y1, z1, opt = {}) {
    const { mu = 1, mv = 1, fit = false, world = false, ox = 0, oz = 0, top = true, bottom = false, sides = 'nsew', vBase = y0 } = opt;
    const fitU = len => (fit ? len / Math.max(1, Math.round(len / mu)) : mu);
    const fitV = len => (fit ? len / Math.max(1, Math.round(len / mv)) : mv);
    const H = y1 - y0, mvE = fitV(H);
    const va = (y0 - vBase) / mvE, vb = (y1 - vBase) / mvE;
    const side = (a, b, c, d, len, uStart) => {
      const m = fitU(len);
      const u0 = uStart / m, u1 = (uStart + len) / m;
      this.quad(a, b, c, d, [u0, va], [u1, va], [u1, vb], [u0, vb]);
    };
    const wx = world ? x0 + ox : 0, wz = world ? z0 + oz : 0;
    if (sides.includes('s')) side([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], x1 - x0, wx);
    if (sides.includes('n')) side([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], x1 - x0, world ? -(x1 + ox) : 0);
    if (sides.includes('e')) side([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], z1 - z0, world ? -(z1 + oz) : 0);
    if (sides.includes('w')) side([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], z1 - z0, wz);
    if (top) {
      const u0 = (world ? x0 + ox : 0), u1 = u0 + (x1 - x0), v0 = (world ? -(z1 + oz) : 0), v1 = v0 + (z1 - z0);
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    }
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    return this;
  }
  // Centered box convenience: centre (cx, y-bottom, cz), size (w, h, d).
  cbox(cx, y, cz, w, h, d, opt) { return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, opt); }
  // Append any three.js geometry (transformed). shade(x,y,z) -> brightness factor.
  add(geo, matrix, color, shade) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    if (color !== undefined) this.color(color);
    const base = this.col;
    if (matrix) _nm.getNormalMatrix(matrix);
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k);
      _n.fromBufferAttribute(nor, k);
      if (matrix) { _v.applyMatrix4(matrix); _n.applyMatrix3(_nm).normalize(); }
      let col = base;
      if (shade) { const s = shade(_v.x, _v.y, _v.z); col = [base[0] * s, base[1] * s, base[2] * s]; }
      this.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0, col);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// A set of writers keyed by material name.
export class Writers {
  constructor() { this.w = {}; }
  get(key) { return (this.w[key] ||= new Writer()); }
  keys() { return Object.keys(this.w).filter(k => this.w[k].count > 0); }
  build() {
    const out = {};
    for (const k of this.keys()) out[k] = this.w[k].toGeometry();
    return out;
  }
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// Deterministic per-position noise used to make blobs organic (same displacement
// for vertices shared by adjacent faces).
export function displace(src, amount, seed = 1, scale = 1.7) {
  src.deleteAttribute('uv');
  src.deleteAttribute('normal');
  const geo = mergeVertices(src);
  src.dispose();
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const h = Math.sin(x * 12.9898 * scale + y * 78.233 * scale + z * 37.719 * scale + seed) * 43758.5453;
    const f = 1 + ((h - Math.floor(h)) - 0.5) * amount;
    pos.setXYZ(k, x * f, y * f, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}
