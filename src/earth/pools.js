// Instanced rendering pools: one InstancedMesh per model shared by the whole
// world (all the model's materials are merged into a single "uber" material),
// so thousands of objects cost a handful of draw calls.
// Each pool keeps its instances in a CPU array (indexed by slot) and every
// frame copies only the instances inside the (slightly enlarged) camera
// frustum into the GPU buffer, so off-screen objects cost nothing to draw.
import * as THREE from 'three';
import { MODELS } from './models.js';
import { mergeKeyed, OBJ_PRESET } from './materials.js';

const NO_SHADOW = new Set(['leaf', 'litter0', 'litter1', 'litter2', 'litter3']);

export class Pool {
  constructor(scene, key, model, material, capacity) {
    this.key = key;
    this.scene = scene;
    this.model = model;
    this.material = material;
    this.capacity = capacity;
    this.free = [];
    this.top = 0;
    this.geo = mergeKeyed(model.parts.map(p => [p.mat, p.geo]), k => OBJ_PRESET[k]);
    model.parts = [];
    const bs = this.geo.boundingSphere;
    this.radius = bs.center.length() + bs.radius;
    this.src = new Float32Array(capacity * 16);
    this.srcCol = new Float32Array(capacity * 3).fill(1);
    this.alive = new Uint8Array(capacity);
    this.meshes = [this.makeMesh(capacity)];
  }
  makeMesh(cap) {
    const m = new THREE.InstancedMesh(this.geo, this.material, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = !NO_SHADOW.has(this.key);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }
  grow() {
    const cap = this.capacity * 2;
    const src = new Float32Array(cap * 16); src.set(this.src); this.src = src;
    const col = new Float32Array(cap * 3).fill(1); col.set(this.srcCol); this.srcCol = col;
    const alive = new Uint8Array(cap); alive.set(this.alive); this.alive = alive;
    const old = this.meshes[0];
    const m = this.makeMesh(cap);
    m.visible = old.visible; m.castShadow = old.castShadow;
    this.scene.remove(old);
    old.dispose();
    this.meshes = [m];
    this.capacity = cap;
  }
  alloc() {
    let s;
    if (this.free.length) s = this.free.pop();
    else {
      if (this.top >= this.capacity) this.grow();
      s = this.top++;
    }
    this.alive[s] = 0;
    return s;
  }
  release(s) { this.alive[s] = 0; this.free.push(s); }
  set(s, matrix) { matrix.toArray(this.src, s * 16); this.alive[s] = 1; }
  color(s, c) { this.srcCol[s * 3] = c.r; this.srcCol[s * 3 + 1] = c.g; this.srcCol[s * 3 + 2] = c.b; }

  // Copy the visible instances into the GPU buffers.
  cull(planes, margin) {
    const m = this.meshes[0];
    if (!m.visible) { m.count = 0; return; }
    const src = this.src, col = this.srcCol, dst = m.instanceMatrix.array, dcol = m.instanceColor.array;
    const R = this.radius;
    let k = 0;
    for (let s = 0; s < this.top; s++) {
      if (!this.alive[s]) continue;
      const o = s * 16;
      const sc = Math.sqrt(src[o] * src[o] + src[o + 1] * src[o + 1] + src[o + 2] * src[o + 2]) || Math.sqrt(src[o + 4] * src[o + 4] + src[o + 5] * src[o + 5] + src[o + 6] * src[o + 6]);
      if (sc === 0) continue;
      const x = src[o + 12], y = src[o + 13], z = src[o + 14], r = R * Math.max(1, sc) + margin;
      let inside = true;
      for (let p = 0; p < 6; p++) {
        const pl = planes[p];
        if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -r) { inside = false; break; }
      }
      if (!inside) continue;
      dst.set(src.subarray(o, o + 16), k * 16);
      dcol[k * 3] = col[s * 3]; dcol[k * 3 + 1] = col[s * 3 + 1]; dcol[k * 3 + 2] = col[s * 3 + 2];
      k++;
    }
    m.count = k;
    if (k) {
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, k * 16); m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, k * 3); m.instanceColor.needsUpdate = true;
    }
  }
  visibleCount() { return this.meshes[0].count; }
}

const LOD_LIMIT = { tiny: 70, small: 280, medium: 700, large: Infinity };
const SHADOW_LIMIT = { tiny: 0, small: 70, medium: 170, large: Infinity };
const LOD_CLASS = {
  leaf: 'tiny', litter0: 'tiny', litter1: 'tiny', litter2: 'tiny', litter3: 'tiny',
  cone: 'small', bin: 'small', hydrant: 'small', bollard: 'small', sign0: 'small', sign1: 'small', sign2: 'small',
  flowerpot: 'small', cart: 'small', cafe: 'small', bicycle: 'small', bicycle_r: 'small', bikewheel: 'small', fence: 'small',
  bench: 'medium', scooter: 'medium', motorbike: 'medium', scooter_r: 'medium', motorbike_r: 'medium', lamp: 'medium', tlight: 'medium',
  bush0: 'medium', bush1: 'medium', bush2: 'medium', hedge: 'medium', dumpster: 'medium', busstop: 'medium', wheel: 'medium',
};

const CAPACITY = { leaf: 4096, litter0: 1024, litter1: 1024, litter2: 1024, litter3: 1024, wheel: 1024, fence: 1024 };
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4();

export class Pools {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.map = new Map();
  }
  get(key) {
    let p = this.map.get(key);
    if (!p) {
      const factory = MODELS[key];
      if (!factory) throw new Error(`Unknown model ${key}`);
      p = new Pool(this.scene, key, factory(), this.materials, CAPACITY[key] ?? 256);
      this.map.set(key, p);
    }
    return p;
  }

  // margin: extra metres around the view so shadows of objects just outside it remain.
  flush(camera, margin = 0) {
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    for (const p of this.map.values()) p.cull(_frustum.planes, margin);
  }

  // Distance LOD: objects that would be a few pixels wide are not drawn, and
  // small ones stop casting shadows.
  lod(camDist, shadowsOn) {
    for (const p of this.map.values()) {
      const cls = LOD_CLASS[p.key] ?? 'large';
      const lim = LOD_LIMIT[cls];
      const vis = camDist < lim;
      const shadow = shadowsOn && camDist < SHADOW_LIMIT[cls] && !NO_SHADOW.has(p.key);
      for (const m of p.meshes) { m.visible = vis; m.castShadow = shadow; }
    }
  }
  stats() {
    let instances = 0, visible = 0;
    for (const p of this.map.values()) { instances += p.top - p.free.length; visible += p.visibleCount(); }
    return { pools: this.map.size, meshes: this.map.size, instances, visible };
  }
}
