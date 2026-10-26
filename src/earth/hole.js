// Black hole visuals: a perfectly circular opening in the ground (stencil mask
// that removes the ground), a dark well below it, a crisp rim with a soft
// gravitational halo, and particles spiralling into the centre.
import * as THREE from 'three';

const RIM_VS = `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const RIM_FS = `
varying vec2 vP; uniform float uTime, uAttract, uReduce, uPulse;
void main(){
  float d = length(vP);
  float ang = atan(vP.y, vP.x);
  float shadow = (1.0 - smoothstep(1.0, 1.55, d)) * 0.62;
  float edge = 1.0 - smoothstep(1.0, 1.035, d);
  float glow = exp(-pow((d - 1.045) * 16.0, 2.0)) * (0.5 + 0.5 * uAttract + 1.2 * uPulse);
  float sw = 0.5 + 0.5 * sin(ang * 6.0 + d * 10.0 - uTime * (1.2 + uAttract * 4.5));
  float halo = (1.0 - smoothstep(1.05, 2.7, d)) * (0.04 + 0.16 * uAttract) * (0.5 + 0.5 * sw) * (1.0 - uReduce * 0.7);
  vec3 col = vec3(0.62, 0.68, 1.0) * (glow * 0.9 + halo);
  float a = clamp(shadow + edge * 0.35 + glow * 0.6 + halo, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`;

const WELL_VS = `varying vec3 vL; void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const WELL_FS = `
varying vec3 vL; uniform float uTime, uAttract;
void main(){
  float t = clamp(-vL.y, 0.0, 1.0);
  float ang = atan(vL.z, vL.x);
  float bands = 0.5 + 0.5 * sin(ang * 5.0 - t * 18.0 + uTime * (1.5 + uAttract * 5.0));
  vec3 c = mix(vec3(0.018, 0.017, 0.03), vec3(0.0), smoothstep(0.0, 0.12, t));
  c += vec3(0.22, 0.26, 0.7) * bands * (1.0 - smoothstep(0.0, 0.07, t)) * (0.015 + 0.12 * uAttract);
  gl_FragColor = vec4(c, 1.0);
}`;

const PART_VS = `
attribute vec3 seed; uniform float uTime, uStrength, uPx, uR;
varying float vA;
void main(){
  float speed = 0.18 + seed.z * 0.3 + uStrength * 0.55;
  float ph = fract(seed.x + uTime * speed);
  float rad = mix(2.5, 0.96, pow(ph, 1.25));
  float ang = seed.y * 6.2831 + ph * (2.5 + seed.z * 2.5);
  float y = 0.02 + (1.0 - ph) * 0.04 - smoothstep(0.82, 1.0, ph) * 0.5;
  vec4 mv = modelViewMatrix * vec4(cos(ang) * rad, y, sin(ang) * rad, 1.0);
  gl_PointSize = max(1.0, uPx * (0.035 + 0.035 * seed.z) * uR / -mv.z);
  vA = sin(ph * 3.1416) * (0.18 + uStrength * 0.82);
  gl_Position = projectionMatrix * mv;
}`;
const PART_FS = `
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vA;
  gl_FragColor = vec4(vec3(0.75, 0.8, 1.0) * a, a);
}`;

export class HoleVisual {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;

    const disk = new THREE.CircleGeometry(1, 128).rotateX(-Math.PI / 2);
    const maskMat = new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, depthTest: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp,
    });
    this.mask = new THREE.Mesh(disk, maskMat);
    this.mask.renderOrder = -10;
    this.mask.frustumCulled = false;

    const inside = m => {
      m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.EqualStencilFunc;
      m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp;
      return m;
    };
    this.uni = { uTime: { value: 0 }, uAttract: { value: 0 }, uReduce: { value: 0 }, uPulse: { value: 0 } };
    const wellGeo = new THREE.CylinderGeometry(1, 0.5, 1, 96, 6, true).translate(0, -0.5, 0);
    this.well = new THREE.Mesh(wellGeo, inside(new THREE.ShaderMaterial({ vertexShader: WELL_VS, fragmentShader: WELL_FS, uniforms: this.uni, side: THREE.BackSide })));
    this.well.renderOrder = -3;
    this.well.frustumCulled = false;
    this.bottom = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), inside(new THREE.MeshBasicMaterial({ color: 0x000000 })));
    this.bottom.renderOrder = -3;
    this.bottom.frustumCulled = false;

    const rimMat = new THREE.ShaderMaterial({
      vertexShader: RIM_VS, fragmentShader: RIM_FS, uniforms: this.uni,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    rimMat.stencilWrite = true; rimMat.stencilRef = 1; rimMat.stencilFunc = THREE.NotEqualStencilFunc;
    rimMat.stencilFail = rimMat.stencilZFail = rimMat.stencilZPass = THREE.KeepStencilOp;
    this.rim = new THREE.Mesh(new THREE.RingGeometry(1, 2.7, 128, 1).rotateX(-Math.PI / 2), rimMat);
    this.rim.renderOrder = 2;
    this.rim.frustumCulled = false;

    const N = 220;
    const seeds = new Float32Array(N * 3);
    for (let k = 0; k < N * 3; k++) seeds[k] = Math.random();
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    pg.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    this.puni = { uTime: this.uni.uTime, uStrength: { value: 0 }, uPx: { value: 800 }, uR: { value: 1 } };
    this.particles = new THREE.Points(pg, new THREE.ShaderMaterial({
      vertexShader: PART_VS, fragmentShader: PART_FS, uniforms: this.puni,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 3;
    this.partCount = N;

    this.group.add(this.mask, this.well, this.bottom, this.rim, this.particles);
    this.attract = 0;
  }

  setQuality(q, reduce) {
    const n = reduce ? 50 : q === 'low' ? 90 : this.partCount;
    this.particles.geometry.setDrawRange(0, n);
    this.uni.uReduce.value = reduce ? 1 : 0;
  }

  // Brief brightening of the rim when something is swallowed.
  pulse(a) { this.uni.uPulse.value = Math.min(1.5, this.uni.uPulse.value + a); }

  update(dt, rx, y, rz, r, attracting, pxScale) {
    this.time += dt;
    this.uni.uPulse.value *= Math.exp(-dt * 5);
    this.uni.uTime.value = this.time;
    this.attract += ((attracting ? 1 : 0) - this.attract) * (1 - Math.exp(-dt * 6));
    this.uni.uAttract.value = this.attract;
    this.puni.uStrength.value = this.attract;
    this.puni.uPx.value = pxScale;
    this.puni.uR.value = r;
    const depth = Math.max(3, r * 3.2);
    this.mask.position.set(rx, y + 0.003, rz);
    this.mask.scale.set(r, 1, r);
    this.well.position.set(rx, y, rz);
    this.well.scale.set(r, depth, r);
    this.bottom.position.set(rx, y - depth + 0.01, rz);
    this.bottom.scale.set(r * 0.5, 1, r * 0.5);
    this.rim.position.set(rx, y + 0.006, rz);
    this.rim.scale.set(r, 1, r);
    this.particles.position.set(rx, y, rz);
    this.particles.scale.set(r, r, r);
    return depth;
  }
}
