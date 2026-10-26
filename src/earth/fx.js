// Lightweight particle effects: dust clouds and debris chunks (pooled, mobile friendly).
import * as THREE from 'three';
import { ORIGIN } from './origin.js';
import { groundHeight } from './citygen.js';

const DUST_VS = `
attribute float aSize; attribute float aAlpha; varying float vA; uniform float uPx;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * aSize / -mv.z; vA = aAlpha; gl_Position = projectionMatrix * mv; }`;
const DUST_FS = `
varying float vA; uniform vec3 uCol;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; gl_FragColor = vec4(uCol, a); }`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class FX {
  constructor(scene, mats) {
    this.N = 280;
    this.dustP = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.N * 3);
    this.size = new Float32Array(this.N);
    this.alpha = new Float32Array(this.N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uni = { uPx: { value: 800 }, uCol: { value: new THREE.Color(0xb9ad98) } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: DUST_VS, fragmentShader: DUST_FS, uniforms: this.uni, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    for (let k = 0; k < this.N; k++) this.dustP.push({ life: 0 });
    this.di = 0;

    this.M = 160;
    this.deb = [];
    const bg = new THREE.BoxGeometry(1, 1, 1);
    const col = new Float32Array(bg.attributes.position.count * 3).fill(1);
    bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.debMesh = new THREE.InstancedMesh(bg, mats.simple.matte, this.M);
    this.debMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.M * 3).fill(1), 3);
    this.debMesh.frustumCulled = false;
    this.debMesh.castShadow = true;
    scene.add(this.debMesh);
    for (let k = 0; k < this.M; k++) { this.deb.push({ life: 0 }); this.debMesh.setMatrixAt(k, ZERO); }
    this.bi = 0;
    this.reduce = false;
  }

  dust(x, y, z, size) {
    if (this.reduce && Math.random() < 0.6) return;
    const p = this.dustP[this.di];
    this.di = (this.di + 1) % this.N;
    Object.assign(p, { x, y, z, vx: (Math.random() - 0.5) * size, vy: 0.6 + Math.random() * size * 0.4, vz: (Math.random() - 0.5) * size, life: 1, max: 2 + Math.random() * 1.5, size: size * (1 + Math.random()) });
  }

  debris(x, y, z, size, color) {
    if (this.reduce && Math.random() < 0.5) return;
    const d = this.deb[this.bi];
    const k = this.bi;
    this.bi = (this.bi + 1) % this.M;
    Object.assign(d, {
      x, y, z, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, wx: (Math.random() - 0.5) * 8, wz: (Math.random() - 0.5) * 8,
      size: size * (0.5 + Math.random()), life: 6, rest: 0,
    });
    this.debMesh.setColorAt(k, _c.set(color).multiplyScalar(0.75 + Math.random() * 0.3));
    this.debMesh.instanceColor.needsUpdate = true;
  }

  update(dt, hole, pxScale) {
    this.uni.uPx.value = pxScale;
    for (let k = 0; k < this.N; k++) {
      const p = this.dustP[k];
      if (p.life <= 0) { this.alpha[k] = 0; continue; }
      p.life -= dt / p.max;
      const dx = hole.x - p.x, dz = hole.z - p.z, d = Math.hypot(dx, dz) || 1;
      const pull = hole.attract ? 2.5 * hole.r / Math.max(d, hole.r) : 0;
      p.vx += dx / d * pull * dt; p.vz += dz / d * pull * dt;
      p.vx *= 1 - dt * 0.6; p.vz *= 1 - dt * 0.6; p.vy *= 1 - dt * 0.8;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      this.pos[k * 3] = p.x - ORIGIN.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z - ORIGIN.z;
      this.size[k] = p.size * (1.4 - p.life * 0.6);
      this.alpha[k] = Math.max(0, Math.min(1, p.life * 1.6)) * 0.55;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;

    let dirty = false;
    for (let k = 0; k < this.M; k++) {
      const d = this.deb[k];
      if (d.life <= 0) continue;
      dirty = true;
      d.life -= dt;
      const dx = hole.x - d.x, dz = hole.z - d.z, dist = Math.hypot(dx, dz) || 1;
      const a = (hole.attract ? 30 : 6) * (hole.r / Math.max(dist, hole.r)) ** 2;
      d.vx += dx / dist * a * dt; d.vz += dz / dist * a * dt; d.vy -= 9.81 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.wx * dt; d.rz += d.wz * dt;
      const inside = dist < hole.r;
      const gh = inside ? -1e9 : groundHeight(d.x, d.z);
      if (d.y < gh + d.size * 0.5) { d.y = gh + d.size * 0.5; d.vy *= -0.2; d.vx *= 0.7; d.vz *= 0.7; d.wx *= 0.6; d.wz *= 0.6; }
      if (d.y < hole.y - hole.r * 2.5) d.life = 0;
      const sc = d.life <= 0 ? 0 : d.size * Math.min(1, d.life);
      _p.set(d.x - ORIGIN.x, d.y, d.z - ORIGIN.z);
      _q.setFromEuler(_e.set(d.rx, d.ry, d.rz));
      _m.compose(_p, _q, _s.set(sc, sc * 0.6, sc * 0.8));
      this.debMesh.setMatrixAt(k, _m);
    }
    if (dirty) this.debMesh.instanceMatrix.needsUpdate = true;
  }
}
