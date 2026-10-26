// Optional full-screen pass: simulated gravitational lensing around the hole
// (the surrounding image is pulled and twisted toward the rim) and a light vignette.
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = `
uniform sampler2D tDiffuse; uniform vec2 uC, uAx, uAz; uniform float uStrength, uTime, uAspect;
varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  vec2 d = vUv - uC;
  float det = uAx.x * uAz.y - uAx.y * uAz.x;
  if (abs(det) > 1e-7) {
    vec2 q = vec2((d.x * uAz.y - d.y * uAz.x) / det, (uAx.x * d.y - uAx.y * d.x) / det);
    float r = length(q);
    if (r > 1.0 && r < 3.2) {
      float f = 1.0 - smoothstep(1.0, 3.2, r);
      f *= f;
      float pull = f * uStrength * 0.32;
      float ang = f * uStrength * (0.35 + 0.1 * sin(uTime * 0.7));
      vec2 qq = q * (1.0 + pull);
      float c = cos(ang), s = sin(ang);
      qq = vec2(c * qq.x - s * qq.y, s * qq.x + c * qq.y);
      uv = uC + qq.x * uAx + qq.y * uAz;
    }
  }
  vec4 col = texture2D(tDiffuse, uv);
  vec2 v = vUv - 0.5; v.x *= uAspect;
  col.rgb *= 1.0 - smoothstep(0.55, 1.05, length(v)) * 0.28;
  gl_FragColor = col;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _v = new THREE.Vector3();

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const hf = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      samples: 4, stencilBuffer: true, depthBuffer: true, type: hf ? THREE.HalfFloatType : THREE.UnsignedByteType,
    });
    this.uni = {
      tDiffuse: { value: this.rt.texture }, uC: { value: new THREE.Vector2() }, uAx: { value: new THREE.Vector2() },
      uAz: { value: new THREE.Vector2() }, uStrength: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 },
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uni, depthTest: false, depthWrite: false }));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setSize(w, h) { this.rt.setSize(w, h); this.uni.uAspect.value = w / h; }
  project(p, camera, out) {
    _v.copy(p).project(camera);
    return out.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
  }
  render(scene, camera, holeR, holePos, strength, time) {
    const c = this.project(holePos, camera, this.uni.uC.value);
    const ax = this.project(_tmp.copy(holePos).add(_ax.set(holeR, 0, 0)), camera, _a2);
    const az = this.project(_tmp.copy(holePos).add(_ax.set(0, 0, holeR)), camera, _b2);
    this.uni.uAx.value.set(ax.x - c.x, ax.y - c.y);
    this.uni.uAz.value.set(az.x - c.x, az.y - c.y);
    this.uni.uStrength.value = strength;
    this.uni.uTime.value = time;
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
const _tmp = new THREE.Vector3(), _ax = new THREE.Vector3(), _a2 = new THREE.Vector2(), _b2 = new THREE.Vector2();
