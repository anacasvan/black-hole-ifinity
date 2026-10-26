// Instanced rendering pools: one InstancedMesh per model shared by the whole
// world (all the model's materials are merged into a single "uber" material),
// so thousands of objects cost a handful of draw calls.
import * as THREE from 'three';
import { MODELS } from './models.js';
import { mergeKeyed, OBJ_PRESET } from './materials.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
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
    this.dirty = false;
    this.colorDirty = false;
    this.geo = mergeKeyed(model.parts.map(p => [p.mat, p.geo]), k => OBJ_PRESET[k]);
    model.parts = [];
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
    this.meshes = this.meshes.map(old => {
      const m = this.makeMesh(cap);
      m.instanceMatrix.array.set(old.instanceMatrix.array);
      if (old.instanceColor) m.instanceColor.array.set(old.instanceColor.array);
      m.count = old.count;
      this.scene.remove(old);
      old.dispose();
      return m;
    });
    this.capacity = cap;
  }
  alloc() {
    let s;
    if (this.free.length) s = this.free.pop();
    else {
      if (this.top >= this.capacity) this.grow();
      s = this.top++;
      for (const m of this.meshes) m.count = this.top;
    }
    return s;
  }
  release(s) {
    for (const m of this.meshes) m.setMatrixAt(s, ZERO);
    this.free.push(s);
    this.dirty = true;
  }
  set(s, matrix) {
    for (const m of this.meshes) m.setMatrixAt(s, matrix);
    this.dirty = true;
  }
  color(s, c) {
    for (const m of this.meshes) if (m.instanceColor) m.setColorAt(s, c);
    this.colorDirty = true;
  }
  flush() {
    if (this.dirty) { for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; this.dirty = false; }
    if (this.colorDirty) { for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true; this.colorDirty = false; }
  }
  setShadows(on) { for (const m of this.meshes) m.castShadow = on && !NO_SHADOW.has(this.key); }
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
  flush() { for (const p of this.map.values()) p.flush(); }
  setShadows(on) { for (const p of this.map.values()) p.setShadows(on); }

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
    let instances = 0, meshes = 0;
    for (const p of this.map.values()) { instances += p.top - p.free.length; meshes += p.meshes.length; }
    return { pools: this.map.size, meshes, instances };
  }
}
