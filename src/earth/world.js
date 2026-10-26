// Chunked world: loads detailed chunks near the hole, low-detail chunks further
// away, and an infinite procedural ground plane beyond. Keeps the registry of
// static entities (props, parked vehicles, buildings) and their eaten state.
import * as THREE from 'three';
import { C, generateChunk, chunkKey, blockBounds, roadWidth, isAvenue, CURB, SIDEWALK } from './citygen.js';
import { KINDS } from './config.js';
import { buildBuilding, liteColor } from './buildings.js';
import { modelKey } from './models.js';
import { Writers } from './geo.js';
import { ORIGIN } from './origin.js';
import { patchSink, stencilOutside, faded, mergeKeyed } from './materials.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const GROUND_KEY = { grass: 'grass', court: 'plaza', plaza: 'plaza', path: 'path', drive: 'drive', lot: 'lot', parking: 'asphalt', flowers: 'flowers', pool: 'water', pond: 'water' };
const BASE_DECOR = new Set(['grass', 'court', 'lot']);

export const isVehicleKind = k => KINDS[k]?.cat === 'vehicle';

export function composeRest(e, M) {
  _p.set(e.x - ORIGIN.x, e.y, e.z - ORIGIN.z);
  if (e.q) _q.copy(e.q); else _q.setFromAxisAngle(UP, e.rot);
  _s.set(e.sx, e.s, e.s);
  return M.compose(_p, _q, _s);
}

export class World {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.pools = game.pools;
    this.mats = game.mats;
    this.chunks = new Map();
    this.genCache = new Map();
    this.queue = [];
    this.accum = 1;
    this.fullR = 1;
    this.liteR = 3;
    this.center = [0, 0];
    this.makeLite();
    this.makeGroundPlane();
  }

  // ---- shared low-detail renderers --------------------------------------
  makeLite() {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uBhDark = this.g.shared.uDark;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLiteP; varying vec3 vLiteN; varying float vBhY;')
        .replace('#include <project_vertex>', `#include <project_vertex>
  vec3 liteS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vLiteP = position * liteS; vLiteN = normal;
  vBhY = (modelMatrix * instanceMatrix * vec4(position, 1.0)).y;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLiteP; varying vec3 vLiteN; varying float vBhY; uniform float uBhDark;')
        .replace('#include <color_fragment>', `#include <color_fragment>
  if (abs(vLiteN.y) < 0.5) {
    float u = abs(vLiteN.x) > 0.5 ? vLiteP.z : vLiteP.x;
    float fu = fract(u / 3.0), fv = fract(vLiteP.y / 3.2);
    float win = step(0.2, fu) * step(fu, 0.8) * step(0.3, fv) * step(fv, 0.82) * step(1.0, vLiteP.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.28), win * 0.75);
  } else { diffuseColor.rgb *= 0.72; }`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.rgb *= clamp(1.0 + min(vBhY, 0.0) * uBhDark, 0.0, 1.0);`);
    };
    m.customProgramCacheKey = () => 'lite-box';
    this.litePool = makeSimplePool(this.scene, boxGeo, m, 2048);
    const treeGeo = new THREE.IcosahedronGeometry(1, 0).scale(1, 1.15, 1);
    const tm = patchSink(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }));
    this.liteTreePool = makeSimplePool(this.scene, treeGeo, tm, 4096);
    // Block surfaces of low-detail chunks (grass, courtyards, car parks...).
    const gm = stencilOutside(new THREE.MeshStandardMaterial({ roughness: 0.95 }));
    this.liteGroundPool = makeSimplePool(this.scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), gm, 1024);
    this.liteGroundPool.mesh.castShadow = false;
    this.liteGroundPool.mesh.renderOrder = -4;
  }

  makeGroundPlane() {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.95, color: 0xffffff });
    const uni = { uOriginK: { value: new THREE.Vector2() } };
    this.planeUniforms = uni;
    m.onBeforeCompile = sh => {
      sh.uniforms.uOriginK = uni.uOriginK;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvGP = (modelMatrix * vec4(position, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vGP; uniform vec2 uOriginK;
float bhHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
bool bhAve(float k) { float m = mod(k, 4.0); return m < 0.5 || (k >= -1.0 && k <= 2.0); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 p = vGP / ${C.toFixed(1)};
    vec2 kc = floor(p + 0.5);
    vec2 kAbs = kc + uOriginK;
    vec2 d = abs(vGP - kc * ${C.toFixed(1)});
    float wx = bhAve(kAbs.x) ? 7.5 : 4.5;
    float wz = bhAve(kAbs.y) ? 7.5 : 4.5;
    vec3 col;
    vec2 blk = floor(p) + uOriginK;
    float h = bhHash(blk);
    vec3 blockCol = h < 0.25 ? vec3(0.3, 0.4, 0.2) : (h < 0.55 ? vec3(0.42, 0.41, 0.38) : vec3(0.36, 0.43, 0.27));
    if (d.x < wx || d.y < wz) col = vec3(0.24, 0.25, 0.27);
    else if (d.x < wx + ${SIDEWALK.toFixed(1)} || d.y < wz + ${SIDEWALK.toFixed(1)}) col = vec3(0.6, 0.59, 0.56);
    else col = blockCol;
    diffuseColor.rgb = col;
  }`);
    };
    m.customProgramCacheKey = () => 'ground-plane';
    stencilOutside(m);
    this.plane = new THREE.Mesh(geo, m);
    this.plane.receiveShadow = true;
    this.plane.position.y = -0.03;
    this.plane.renderOrder = -5;
    this.scene.add(this.plane);
  }

  // ---- chunk lifecycle ----------------------------------------------------
  gen(i, j) {
    const k = chunkKey(i, j);
    let g = this.genCache.get(k);
    if (!g) {
      g = generateChunk(i, j);
      this.genCache.set(k, g);
      if (this.genCache.size > 900) this.genCache.delete(this.genCache.keys().next().value);
    }
    return g;
  }

  chunkAt(x, z) { return this.chunks.get(chunkKey(Math.floor(x / C), Math.floor(z / C))); }
  isFull(i, j) { return this.chunks.get(chunkKey(i, j))?.state === 'full'; }
  fullCount() {
    if (this.fullCache?.v !== this.version) { let n = 0; for (const c of this.chunks.values()) if (c.state === 'full') n++; this.fullCache = { v: this.version, n }; }
    return this.fullCache.n;
  }

  setView(hx, hz, camDist, quality) {
    const view = camDist * 1.0;
    this.fullR = Math.max(1, Math.min(quality === 'low' ? 1 : 2, Math.ceil(view / C)));
    this.liteR = Math.max(this.fullR + 1, Math.min(quality === 'low' ? 7 : 11, Math.ceil((camDist * 2.6) / C) + 1));
    this.center = [Math.floor(hx / C), Math.floor(hz / C)];
  }

  desiredState(i, j) {
    const [ci, cj] = this.center;
    const di = Math.abs(i - ci), dj = Math.abs(j - cj);
    if (di <= this.fullR && dj <= this.fullR) return 'full';
    if (Math.hypot(di, dj) <= this.liteR + 0.5) return 'lite';
    return null;
  }

  update(dt, budgetMs = 5) {
    this.accum += dt;
    if (this.accum > 0.25) {
      this.accum = 0;
      this.plan();
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const job = this.queue.shift();
      this.apply(job.i, job.j);
    }
  }

  plan() {
    const [ci, cj] = this.center;
    const R = this.liteR + 1;
    for (const ch of [...this.chunks.values()]) {
      const want = this.desiredState(ch.i, ch.j);
      if (want !== ch.state && !this.queue.some(q => q.i === ch.i && q.j === ch.j)) this.queue.push({ i: ch.i, j: ch.j, d: Math.hypot(ch.i - ci, ch.j - cj) });
    }
    for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
      const want = this.desiredState(i, j);
      if (!want) continue;
      const ch = this.chunks.get(chunkKey(i, j));
      if ((!ch || ch.state !== want) && !this.queue.some(q => q.i === i && q.j === j)) this.queue.push({ i, j, d: Math.hypot(i - ci, j - cj) });
    }
    this.queue.sort((a, b) => (a.d - b.d));
  }

  // Build everything required right now (used at start-up / teleports).
  syncAll() {
    this.plan();
    while (this.queue.length) { const j = this.queue.shift(); this.apply(j.i, j.j); }
  }

  apply(i, j) {
    const key = chunkKey(i, j);
    const ch = this.chunks.get(key);
    const want = this.desiredState(i, j);
    if (ch && ch.state === want) return;
    if (ch && ch.entities.some(e => e.state !== 'rest' && e.state !== 'gone')) {
      return; // something is being pulled: retry on the next planning pass
    }
    let next = null;
    if (want === 'full') next = this.buildFull(i, j);
    else if (want === 'lite') next = this.buildLite(i, j);
    if (ch) this.unload(ch);
    if (next) this.chunks.set(key, next);
    else this.chunks.delete(key);
    this.version = (this.version || 0) + 1;
  }

  placeLiteGround(ch) {
    const L = ch.gen.L;
    ch.groundMatrix.makeScale(L.x1 - L.x0, 1, L.z1 - L.z0).setPosition((L.x0 + L.x1) / 2 - ORIGIN.x, CURB, (L.z0 + L.z1) / 2 - ORIGIN.z);
    this.liteGroundPool.set(ch.groundSlot, ch.groundMatrix);
  }

  unload(ch) {
    if (ch.groundSlot !== undefined) { this.liteGroundPool.release(ch.groundSlot); ch.groundSlot = undefined; }
    for (const e of ch.entities) this.releaseEntity(e);
    if (ch.group) {
      this.scene.remove(ch.group);
      ch.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    ch.entities.length = 0;
  }

  releaseEntity(e) {
    if (e.render === 'pool' && e.slot >= 0) {
      e.pool.release(e.slot);
      if (e.wheels) { const wp = this.pools.get(e.pool.model.wheelType ?? 'wheel'); for (const s of e.wheels) wp.release(s); }
      e.slot = -1;
    } else if (e.render === 'lite' && e.slot >= 0) {
      (e.tree ? this.liteTreePool : this.litePool).release(e.slot);
      e.slot = -1;
    } else if (e.mesh) {
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh = null;
    }
  }

  // ---- full detail ----------------------------------------------------------
  buildFull(i, j) {
    const gen = this.gen(i, j);
    const key = chunkKey(i, j);
    const X0 = i * C, Z0 = j * C;
    const ch = { i, j, key, state: 'full', zone: gen.zone, gen, entities: [], X0, Z0 };
    const group = new THREE.Group();
    group.position.set(X0 - ORIGIN.x, 0, Z0 - ORIGIN.z);
    ch.group = group;
    ch.originVersion = ORIGIN.version;

    const ground = this.buildGround(i, j, gen);
    group.add(ground);

    const eaten = this.g.save.eatenSet(key);
    const bldList = [];
    gen.items.forEach((it, idx) => {
      if (eaten.has(idx)) return;
      if (it.t === 'b') bldList.push([it, idx]);
      else this.spawnProp(ch, it, idx);
    });
    if (bldList.length) group.add(this.buildBuildings(ch, bldList));
    this.scene.add(group);
    group.updateMatrixWorld(true);
    return ch;
  }

  spawnProp(ch, it, idx) {
    const def = KINDS[it.kind];
    const model = modelKey(it.kind, it.v ?? 0, false);
    const pool = this.pools.get(model);
    const e = {
      id: `${ch.key}:${idx}`, key: ch.key, idx, kind: it.kind, def, chunk: ch,
      x: it.x, y: CURB, z: it.z, rot: it.rot ?? 0, s: it.s ?? 1, sx: (it.sx ?? 1) * (it.s ?? 1),
      render: 'pool', pool, slot: pool.alloc(), model, state: 'rest', stress: 0,
      mass: def.mass * (it.s ?? 1) ** 3 * (it.sx ?? 1), needR: def.needR * Math.max(it.s ?? 1, it.sx ?? 1) ** 0.5,
    };
    if (it.col !== undefined && pool.meshes.some(m => m.instanceColor)) pool.color(e.slot, _c.set(it.col));
    else if (def.cat === 'tree' || it.kind === 'bush' || it.kind === 'hedge' || it.kind === 'flowerpot') pool.color(e.slot, foliageColor(it, _c));
    else if (it.kind === 'leaf') pool.color(e.slot, leafColor(idx, _c));
    else if (it.kind === 'litter') pool.color(e.slot, _c.set([0xc4161c, 0x1f58a8, 0xb9bec4, 0x2c8c3a][idx % 4]));
    else pool.color(e.slot, _c.set(0xffffff));
    if (pool.model.wheels) {
      const wp = this.pools.get(pool.model.wheelType ?? 'wheel');
      e.wheels = pool.model.wheels.map(() => wp.alloc());
      e.spin = 0;
    }
    this.renderRest(e);
    ch.entities.push(e);
    return e;
  }

  renderRest(e) {
    composeRest(e, _m);
    this.setMatrix(e, _m);
  }

  // M: render-space transform of the entity's model origin.
  setMatrix(e, M) {
    if (e.render === 'pool') {
      if (e.slot < 0) return;
      e.pool.set(e.slot, M);
      if (e.wheels) {
        const model = e.pool.model, bike = model.wheelType === 'bikewheel';
        const wp = this.pools.get(model.wheelType ?? 'wheel');
        for (let k = 0; k < model.wheels.length; k++) {
          const w = model.wheels[k];
          _m2.makeRotationX(e.spin || 0);
          _m2.scale(_s.set(bike ? w.r : w.w, w.r, w.r));
          _m2.setPosition(w.p[0], w.p[1], w.p[2]);
          wp.set(e.wheels[k], _m2.premultiply(M));
        }
      }
    } else if (e.render === 'lite') {
      if (e.slot < 0) return;
      _m2.copy(M).multiply(e.liteScale);
      (e.tree ? this.liteTreePool : this.litePool).set(e.slot, _m2);
    } else if (e.mesh) {
      e.mesh.matrix.copy(M);
      e.mesh.matrixWorld.copy(M);
    }
  }

  // All buildings of a chunk in one mesh / one draw call; each building keeps
  // the vertex range it occupies so it can be detached later.
  buildBuildings(ch, list) {
    const parts = [];
    for (const [it, idx] of list) {
      const { geos, top } = buildBuilding(it);
      const M = new THREE.Matrix4().compose(_p.set(it.x - ch.X0, CURB, it.z - ch.Z0), _q.setFromAxisAngle(UP, it.rot), _s.set(1, 1, 1));
      const e = {
        id: `${ch.key}:${idx}`, key: ch.key, idx, kind: it.kind, def: KINDS[it.kind], chunk: ch, it,
        x: it.x, y: CURB, z: it.z, rot: it.rot, s: 1, sx: 1, top, w: it.w, d: it.d,
        render: 'merged', ranges: [], state: 'rest', stress: 0, mass: it.mass, needR: it.needR, building: true,
      };
      for (const [k, g] of Object.entries(geos)) {
        g.applyMatrix4(M);
        parts.push([k, g, e]);
      }
      ch.entities.push(e);
    }
    const geo = mergeKeyed(parts, this.mats.bldIndex);
    for (const r of geo.userData.ranges) r.tag.ranges.push(r);
    const mesh = new THREE.Mesh(geo, this.mats.bld);
    mesh.castShadow = mesh.receiveShadow = true;
    ch.bldMesh = mesh;
    return mesh;
  }

  // Detach a building from its chunk mesh into its own mesh (for collapse or fading).
  extract(e) {
    if (e.render !== 'merged') return e;
    const ch = e.chunk;
    const attr = ch.bldMesh.geometry.attributes.position;
    for (const r of e.ranges) {
      attr.array.fill(0, r.start * 3, (r.start + r.count) * 3);
      attr.addUpdateRange(r.start * 3, r.count * 3);
    }
    attr.needsUpdate = true;
    const { geos } = buildBuilding(e.it);
    const merged = mergeKeyed(Object.entries(geos), this.mats.bldIndex);
    const mesh = new THREE.Mesh(merged, this.mats.bld);
    mesh.userData.baseMats = mesh.material;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    e.render = 'mesh';
    e.mesh = mesh;
    this.renderRest(e);
    return e;
  }

  setFaded(e, on) {
    if (on && e.render === 'merged') this.extract(e);
    if (!e.mesh) return;
    if (!!e.faded === on) return;
    e.faded = on;
    e.mesh.material = on ? faded(e.mesh.userData.baseMats) : e.mesh.userData.baseMats;
    e.mesh.castShadow = !on;
  }

  // ---- low detail -------------------------------------------------------------
  buildLite(i, j) {
    const gen = this.gen(i, j);
    const key = chunkKey(i, j);
    const ch = { i, j, key, state: 'lite', zone: gen.zone, gen, entities: [], X0: i * C, Z0: j * C };
    ch.groundSlot = this.liteGroundPool.alloc();
    this.liteGroundPool.color(ch.groundSlot, _c.set(LITE_GROUND[gen.zone]));
    ch.groundMatrix = new THREE.Matrix4();
    this.placeLiteGround(ch);
    const eaten = this.g.save.eatenSet(key);
    gen.items.forEach((it, idx) => {
      if (eaten.has(idx)) return;
      if (it.t === 'b') {
        const top = liteTop(it);
        const e = {
          id: `${key}:${idx}`, key, idx, kind: it.kind, def: KINDS[it.kind], chunk: ch, it,
          x: it.x, y: CURB, z: it.z, rot: it.rot, s: 1, sx: 1, top, w: it.w, d: it.d,
          render: 'lite', slot: this.litePool.alloc(), liteScale: new THREE.Matrix4().makeScale(it.w, top, it.d),
          state: 'rest', stress: 0, mass: it.mass, needR: it.needR, building: true,
        };
        this.litePool.color(e.slot, _c.set(liteColor(it)));
        this.renderRest(e);
        ch.entities.push(e);
      } else if (KINDS[it.kind].cat === 'tree') {
        const def = KINDS[it.kind];
        const sc = it.s ?? 1;
        const h = def.dims[1] * sc, cr = def.dims[0] * 0.5 * sc;
        const e = {
          id: `${key}:${idx}`, key, idx, kind: it.kind, def, chunk: ch, tree: true,
          x: it.x, y: CURB, z: it.z, rot: 0, s: 1, sx: 1,
          render: 'lite', slot: this.liteTreePool.alloc(),
          liteScale: new THREE.Matrix4().makeTranslation(0, h - cr * 1.1, 0).multiply(new THREE.Matrix4().makeScale(cr, cr * (it.kind === 'tree_cypress' ? 3 : 1), cr)),
          state: 'rest', stress: 0, mass: def.mass * sc ** 3, needR: def.needR * sc ** 0.5, liteOnly: true,
        };
        this.liteTreePool.color(e.slot, foliageColor(it, _c));
        this.renderRest(e);
        ch.entities.push(e);
      }
    });
    return ch;
  }

  // ---- ground -----------------------------------------------------------------
  buildGround(i, j, gen) {
    const W = new Writers();
    const X = i * C, Z = j * C;
    const wi = roadWidth(i), wj = roadWidth(j), wi1 = roadWidth(i + 1), wj1 = roadWidth(j + 1);
    const L = (x) => x - X, Lz = (z) => z - Z;
    const a = W.get('asphalt');
    const rect = (w, x0, z0, x1, z1, y) => w.rectY(L(x0), Lz(z0), L(x1), Lz(z1), y, X, Z);
    rect(a, X - wi / 2, Z - wj / 2, X + wi / 2, Z + wj / 2, 0);
    rect(a, X - wi / 2, Z + wj / 2, X + wi / 2, Z + C - wj1 / 2, 0);
    rect(a, X + wi / 2, Z - wj / 2, X + C - wi1 / 2, Z + wj / 2, 0);
    // Sidewalk ring + curb stones
    const b = gen.b, s = SIDEWALK;
    const sw = W.get('sidewalk');
    const sbox = (x0, z0, x1, z1) => sw.box(L(x0), 0, Lz(z0), L(x1), CURB, Lz(z1), { world: true, ox: X, oz: Z, mu: 1, mv: 1 });
    sbox(b.x0, b.z0, b.x1, b.z0 + s);
    sbox(b.x0, b.z1 - s, b.x1, b.z1);
    sbox(b.x0, b.z0 + s, b.x0 + s, b.z1 - s);
    sbox(b.x1 - s, b.z0 + s, b.x1, b.z1 - s);
    const curb = W.get('drive');
    const cw = 0.2;
    curb.box(L(b.x0), 0, Lz(b.z0), L(b.x1), CURB + 0.008, Lz(b.z0 + cw), { world: true, ox: X, oz: Z });
    curb.box(L(b.x0), 0, Lz(b.z1 - cw), L(b.x1), CURB + 0.008, Lz(b.z1), { world: true, ox: X, oz: Z });
    curb.box(L(b.x0), 0, Lz(b.z0), L(b.x0 + cw), CURB + 0.008, Lz(b.z1), { world: true, ox: X, oz: Z });
    curb.box(L(b.x1 - cw), 0, Lz(b.z0), L(b.x1), CURB + 0.008, Lz(b.z1), { world: true, ox: X, oz: Z });
    // Lots and decor
    let k = 0;
    for (const d of gen.decor) {
      const key = GROUND_KEY[d.type];
      const y = CURB + (BASE_DECOR.has(d.type) ? 0 : 0.01 + 0.006 * (k++ % 5));
      if (d.type === 'pool' || d.type === 'pond') {
        const c = W.get('drive');
        const bw = d.type === 'pool' ? 0.35 : 0.5;
        c.box(L(d.x0 - bw), CURB, Lz(d.z0 - bw), L(d.x1 + bw), CURB + 0.07, Lz(d.z0), { world: true, ox: X, oz: Z });
        c.box(L(d.x0 - bw), CURB, Lz(d.z1), L(d.x1 + bw), CURB + 0.07, Lz(d.z1 + bw), { world: true, ox: X, oz: Z });
        c.box(L(d.x0 - bw), CURB, Lz(d.z0), L(d.x0), CURB + 0.07, Lz(d.z1), { world: true, ox: X, oz: Z });
        c.box(L(d.x1), CURB, Lz(d.z0), L(d.x1 + bw), CURB + 0.07, Lz(d.z1), { world: true, ox: X, oz: Z });
        rect(W.get('water'), d.x0, d.z0, d.x1, d.z1, CURB + 0.02);
        continue;
      }
      if (d.type === 'flowers') {
        W.get('drive').box(L(d.x0 - 0.12), CURB, Lz(d.z0 - 0.12), L(d.x1 + 0.12), CURB + 0.12, Lz(d.z1 + 0.12), { world: true, ox: X, oz: Z, top: false });
        rect(W.get('flowers'), d.x0, d.z0, d.x1, d.z1, CURB + 0.1);
        continue;
      }
      rect(W.get(key), d.x0, d.z0, d.x1, d.z1, y);
      if (d.lines) {
        const mk = W.get('marking').color(0xe8e8e2);
        for (const [x0, z0, x1, z1] of d.lines) line(mk, L(x0), Lz(z0), L(x1), Lz(z1), 0.12, y + 0.008);
      }
    }
    for (const it of gen.items) {
      if (it.pit) rect(W.get('flowers'), it.x - 0.6, it.z - 0.6, it.x + 0.6, it.z + 0.6, CURB + 0.012);
    }
    this.roadMarkings(W.get('marking'), i, j);
    const geo = mergeKeyed(Object.entries(W.build()), this.mats.groundIndex);
    const mesh = new THREE.Mesh(geo, this.mats.ground);
    mesh.receiveShadow = true;
    mesh.renderOrder = -4;
    return mesh;
  }

  roadMarkings(w, i, j) {
    const X = i * C, Z = j * C;
    const wi = roadWidth(i), wj = roadWidth(j), wj1 = roadWidth(j + 1), wi1 = roadWidth(i + 1);
    const y = 0.012, white = 0xeeeeea;
    w.color(white);
    // Centre / lane lines on the west road (along z, local x = 0)
    const zA = wj / 2 + 4.6, zB = C - wj1 / 2 - 4.6;
    const xA = wi / 2 + 4.6, xB = C - wi1 / 2 - 4.6;
    if (isAvenue(i)) {
      line(w, -0.18, zA, -0.18, zB, 0.14, y); line(w, 0.18, zA, 0.18, zB, 0.14, y);
      for (const o of [-3.6, 3.6]) dashed(w, o, zA, o, zB, 0.12, y, 3, 4);
    } else dashed(w, 0, zA, 0, zB, 0.14, y, 3, 3);
    if (isAvenue(j)) {
      line(w, xA, -0.18, xB, -0.18, 0.14, y); line(w, xA, 0.18, xB, 0.18, 0.14, y);
      for (const o of [-3.6, 3.6]) dashed(w, xA, o, xB, o, 0.12, y, 3, 4);
    } else dashed(w, xA, 0, xB, 0, 0.14, y, 3, 3);
    // Zebra crossings on the four legs of this intersection
    for (const s of [-1, 1]) {
      const z0 = s * (wj / 2 + 0.5), z1 = s * (wj / 2 + 3.5);
      for (let x = -wi / 2 + 0.6; x < wi / 2 - 0.4; x += 1.0) line(w, x + 0.25, Math.min(z0, z1), x + 0.25, Math.max(z0, z1), 0.5, y);
      const x0 = s * (wi / 2 + 0.5), x1 = s * (wi / 2 + 3.5);
      for (let z = -wj / 2 + 0.6; z < wj / 2 - 0.4; z += 1.0) line(w, Math.min(x0, x1), z + 0.25, Math.max(x0, x1), z + 0.25, 0.5, y);
    }
    // Stop lines (right-hand traffic)
    const sz = wj / 2 + 4.1, sx = wi / 2 + 4.1;
    line(w, 0.2, sz, wi / 2 - 0.3, sz, 0.4, y);       // southbound arriving from north
    line(w, -wi / 2 + 0.3, -sz, -0.2, -sz, 0.4, y);    // northbound arriving from south
    line(w, sx, -wj / 2 + 0.3, sx, -0.2, 0.4, y);      // westbound arriving from east
    line(w, -sx, 0.2, -sx, wj / 2 - 0.3, 0.4, y);      // eastbound arriving from west
  }

  // ---- queries ----------------------------------------------------------------
  forEachNear(x, z, R, fn) {
    const i0 = Math.floor((x - R) / C), i1 = Math.floor((x + R) / C);
    const j0 = Math.floor((z - R) / C), j1 = Math.floor((z + R) / C);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const ch = this.chunks.get(chunkKey(i, j));
      if (!ch) continue;
      const list = ch.entities;
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.state === 'gone' || e.liteOnly) continue;
        const dx = e.x - x, dz = e.z - z;
        const reach = R + (e.building ? Math.max(e.w, e.d) * 0.5 : 0);
        if (dx * dx + dz * dz < reach * reach) fn(e);
      }
    }
  }

  removeEntity(e, eaten) {
    if (e.state === 'gone') return;
    e.state = 'gone';
    this.releaseEntity(e);
    if (eaten && e.key) this.g.save.markEaten(e.key, e.idx);
    const ch = e.chunk;
    if (ch) {
      ch.dead = (ch.dead || 0) + 1;
      if (ch.dead > 32 && ch.dead > ch.entities.length * 0.3) {
        ch.entities = ch.entities.filter(x => x.state !== 'gone');
        ch.dead = 0;
      }
    }
  }

  // Re-render everything at rest after a floating-origin shift.
  onRebase() {
    for (const ch of this.chunks.values()) {
      if (ch.group) ch.group.position.set(ch.X0 - ORIGIN.x, 0, ch.Z0 - ORIGIN.z);
      if (ch.group) ch.group.updateMatrixWorld(true);
      if (ch.groundSlot !== undefined) this.placeLiteGround(ch);
      for (const e of ch.entities) if (e.state === 'rest') this.renderRest(e);
    }
  }

  updatePlane(cx, cz, size) {
    const snap = C;
    const px = Math.round(cx / snap) * snap, pz = Math.round(cz / snap) * snap;
    this.plane.position.set(px - ORIGIN.x, -0.03, pz - ORIGIN.z);
    this.plane.scale.set(size, 1, size);
    this.planeUniforms.uOriginK.value.set(ORIGIN.x / C, ORIGIN.z / C);
  }

  flush() { this.litePool.flush(); this.liteTreePool.flush(); this.liteGroundPool.flush(); }

  stats() {
    let full = 0, lite = 0, ents = 0;
    for (const ch of this.chunks.values()) { if (ch.state === 'full') full++; else lite++; ents += ch.entities.length; }
    return { full, lite, entities: ents, queue: this.queue.length };
  }
}

// ---------------------------------------------------------------------------

const LITE_GROUND = { park: 0x55783a, residential: 0x5b7a3d, downtown: 0x9a948a, commercial: 0x77787a, cbd: 0xaea697 };

function liteTop(it) {
  if (it.kind === 'tower') return it.h + 6;
  if (it.kind === 'house' || it.kind === 'villa') return it.h + 2;
  return it.h + 0.8;
}

function foliageColor(it, c) {
  const h = (Math.sin((it.x * 12.9898 + it.z * 78.233)) * 43758.5453) % 1;
  const t = Math.abs(h);
  const pal = it.kind === 'tree_pine' || it.kind === 'tree_cypress' ? [0x2f5a2c, 0x35602f, 0x2a4f2a]
    : it.kind === 'tree_birch' ? [0x7f9a3e, 0x8aa648, 0x93a84a]
      : it.kind === 'hedge' ? [0x3d6a32, 0x456f36]
        : [0x5a8a3a, 0x4f7f34, 0x6b9442, 0x5f7f2f, 0x77954a, 0x4a7a3c];
  return c.set(pal[Math.floor(t * pal.length) % pal.length]);
}

function leafColor(idx, c) {
  const pal = [0xc8892a, 0xd9a43a, 0xa5552a, 0x8a6a2a, 0x7f8c34, 0xb8742e];
  return c.set(pal[idx % pal.length]);
}

function line(w, x0, z0, x1, z1, width, y) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len * width / 2, nz = dx / len * width / 2;
  const a = [x0 - nx, y, z0 - nz], b = [x1 - nx, y, z1 - nz], c = [x1 + nx, y, z1 + nz], d = [x0 + nx, y, z0 + nz];
  // ensure upward normal
  const cross = (b[0] - a[0]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[0] - a[0]);
  if (cross > 0) w.quad(a, d, c, b); else w.quad(a, b, c, d);
}

function dashed(w, x0, z0, x1, z1, width, y, dash, gap) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
  for (let t = 0; t < len; t += dash + gap) {
    const t1 = Math.min(len, t + dash);
    line(w, x0 + dx * t, z0 + dz * t, x0 + dx * t1, z0 + dz * t1, width, y);
  }
}

export function makeSimplePool(scene, geo, material, cap) {
  const parts = [{ geo, mat: 'x', tint: true }];
  const pool = {
    model: { parts }, free: [], top: 0, capacity: cap, dirty: false, colorDirty: false,
    mesh: null,
    make(c) {
      const m = new THREE.InstancedMesh(geo, material, c);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c * 3).fill(1), 3);
      m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      return m;
    },
    alloc() {
      if (this.free.length) return this.free.pop();
      if (this.top >= this.capacity) {
        const old = this.mesh;
        this.capacity *= 2;
        this.mesh = this.make(this.capacity);
        this.mesh.instanceMatrix.array.set(old.instanceMatrix.array);
        this.mesh.instanceColor.array.set(old.instanceColor.array);
        scene.remove(old); old.dispose();
      }
      const s = this.top++;
      this.mesh.count = this.top;
      return s;
    },
    release(s) { this.mesh.setMatrixAt(s, ZERO); this.free.push(s); this.dirty = true; },
    set(s, M) { this.mesh.setMatrixAt(s, M); this.dirty = true; },
    color(s, c) { this.mesh.setColorAt(s, c); this.colorDirty = true; },
    flush() {
      if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
      if (this.colorDirty) { this.mesh.instanceColor.needsUpdate = true; this.colorDirty = false; }
    },
  };
  pool.mesh = pool.make(cap);
  return pool;
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
