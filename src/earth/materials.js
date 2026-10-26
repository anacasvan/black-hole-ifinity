// Shared materials.
// Performance: buildings, ground and every instanced prop use "uber" variants of
// MeshStandardMaterial whose roughness / metalness / emission / tint come from
// a per-vertex attribute (aMat) and whose texture comes from an atlas, so a
// whole chunk (or a whole prop pool) is a single draw call.
// Ground is masked out inside the black hole with the stencil buffer; objects
// darken as they sink below ground level.
import * as THREE from 'three';

export const SHARED = {
  uDark: { value: 1.0 },   // 1 / fade depth below ground
  uNight: { value: 0.0 },  // 0 day .. 1 night: lit windows, glowing lamps
  uTime: { value: 0.0 },   // seconds, for wind
};

// [tile key, roughness, metalness, emissive, uv scale (1 / tile size in m)]
export const BLD_PRESET = {
  resA: ['resA', 0.82, 0, 0, 1], resB: ['resB', 0.82, 0, 0, 1], resC: ['resC', 0.82, 0, 0, 1], brick: ['brick', 0.9, 0, 0, 1],
  officeD: ['officeD', 0.1, 0.65, 0, 1],
  office: ['office', 0.12, 0.55, 0, 1], officeC: ['officeC', 0.55, 0.15, 0, 1], shop: ['shop', 0.4, 0.1, 0, 1],
  panel: ['panel', 0.82, 0, 0, 1], metal: ['metal', 0.55, 0.45, 0, 1],
  roofG: ['roofG', 0.95, 0, 0, 1 / 3], roofT: ['roofT', 0.78, 0, 0, 1 / 1.6],
  plain: ['white', 0.78, 0, 0, 1], glass: ['white', 0.06, 0.9, 0, 1], sign: ['sign', 0.5, 0, 0.25, 1],
  water: ['water', 0.06, 0.1, 0, 1 / 3],
};
export const GROUND_PRESET = {
  asphalt: ['asphalt', 0.93, 0, 0, 1 / 7], sidewalk: ['pavers', 0.88, 0, 0, 1 / 2.4], grass: ['grass', 0.97, 0, 0, 1 / 5],
  plaza: ['plaza', 0.8, 0, 0, 1 / 4.5], path: ['gravel', 0.95, 0, 0, 1 / 3], drive: ['concrete', 0.9, 0, 0, 1 / 4],
  lot: ['lot', 0.92, 0, 0, 1 / 6], flowers: ['flowers', 0.95, 0, 0, 1 / 2], water: ['water', 0.08, 0.1, 0, 1 / 4],
  marking: ['white', 0.75, 0, 0, 1],
};
// [tint by instance colour, roughness, metalness, emissive]
export const OBJ_PRESET = {
  paint: [1, 0.32, 0.35, 0], matte: [1, 0.75, 0, 0], foliage: [1, 0.9, 0, -1], // emissive -1 = sways in the wind
  fixed: [0, 0.7, 0.05, 0], metal: [0, 0.35, 0.8, 0], glass: [0, 0.05, 0.9, 0], light: [0, 0.3, 0, 0.6], water: [0, 0.05, 0.1, 0],
};
const NO_REPEAT = new Set(['sign']);

const SINK_V = `
  {
    vec4 bhW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      bhW = instanceMatrix * bhW;
    #endif
    vBhY = (modelMatrix * bhW).y;
  }`;
const SINK_F = `
  gl_FragColor.rgb *= clamp(1.0 + min(vBhY, 0.0) * uBhDark, 0.0, 1.0);`;

export function patchSink(m) {
  m.onBeforeCompile = shader => {
    shader.uniforms.uBhDark = SHARED.uDark;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBhY;')
      .replace('#include <project_vertex>', `#include <project_vertex>${SINK_V}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBhY;\nuniform float uBhDark;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${SINK_F}`);
  };
  m.customProgramCacheKey = () => 'bh-sink';
  return m;
}

export function stencilOutside(m) {
  m.stencilWrite = true;
  m.stencilRef = 1;
  m.stencilFunc = THREE.NotEqualStencilFunc;
  m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp;
  return m;
}

// atlas: { texture, rects } or null (instanced props: no texture, tint flag in aMat.x)
function uber(name, atlas, tiles, { sink = true, envMapIntensity = 1.2, windows = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity });
  const uni = {};
  if (atlas) {
    uni.uAtlas = { value: atlas.texture };
    uni.uCells = { value: tiles.map(t => new THREE.Vector4(...t.rect)) };
    uni.uRepeat = { value: tiles.map(t => (t.repeat ? 1 : 0)) };
  }
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uni);
    shader.uniforms.uBhDark = SHARED.uDark;
    shader.uniforms.uNight = SHARED.uNight;
    shader.uniforms.uTime = SHARED.uTime;
    const n = atlas ? tiles.length : 1;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aMat;
uniform float uTime;
varying vec4 vMat; varying vec2 vAUv; varying float vBhY;`)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAUv = uv; vMat = aMat;')
      .replace('#include <begin_vertex>', atlas ? '#include <begin_vertex>' : `#include <begin_vertex>
#ifdef USE_INSTANCING
  if (aMat.w < -0.5) {
    // foliage sways gently in the wind (more at the top of the crown)
    float swH = max(0.0, transformed.y - 0.6);
    vec3 ip = instanceMatrix[3].xyz;
    float ph = uTime * 1.6 + ip.x * 0.31 + ip.z * 0.27;
    transformed.x += sin(ph) * swH * 0.03;
    transformed.z += cos(ph * 0.83) * swH * 0.022;
  }
#endif`)
      .replace('#include <color_vertex>', `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec3(1.0);
#endif
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor *= ${atlas ? 'instanceColor.rgb' : 'mix(vec3(1.0), instanceColor.rgb, aMat.x)'};
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>${sink ? SINK_V : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vMat; varying vec2 vAUv; varying float vBhY; uniform float uBhDark; uniform float uNight;
${atlas ? `uniform sampler2D uAtlas; uniform vec4 uCells[${n}]; uniform float uRepeat[${n}];` : ''}`)
      .replace('#include <map_fragment>', atlas ? `
  vec3 bhWin = vec3(0.0);
  {
    int ti = int(vMat.x + 0.5);
    vec4 cell = uCells[ti];
    vec2 f = uRepeat[ti] > 0.5 ? fract(vAUv) : clamp(vAUv, 0.0, 1.0);
    vec4 texel = textureGrad(uAtlas, cell.xy + f * cell.zw, dFdx(vAUv) * cell.zw, dFdy(vAUv) * cell.zw);
    diffuseColor *= texel;
    ${windows ? `
    if (uNight > 0.01) {
      // bluish dark glass = window: some of them are lit at night
      float lum = dot(texel.rgb, vec3(0.3, 0.59, 0.11));
      float glass = step(texel.r + 0.025, texel.b) * step(lum, 0.62);
      vec2 cellId = floor(vAUv);
      float h = fract(sin(dot(cellId + vMat.x * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
      float lit = step(0.5, h);
      vec3 warm = mix(vec3(1.0, 0.72, 0.4), vec3(0.85, 0.9, 1.0), step(0.85, h));
      bhWin = warm * glass * lit * (0.7 + 0.6 * fract(h * 13.0));
    }` : ''}
  }` : '')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMat.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMat.z;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * max(vMat.w, 0.0) * (1.0 + uNight * 3.5);
${atlas && windows ? 'totalEmissiveRadiance += bhWin * uNight * 1.6;' : ''}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${sink ? SINK_F : ''}`);
  };
  m.customProgramCacheKey = () => `uber-${name}`;
  m.userData.uber = true;
  return m;
}

// Tile index lists for a preset table (index order = uniform array order).
function tileTable(preset, atlas) {
  const keys = [...new Set(Object.values(preset).map(p => p[0]))];
  const tiles = keys.map(k => ({ key: k, rect: atlas.rects[k], repeat: !NO_REPEAT.has(k) }));
  const index = Object.fromEntries(keys.map((k, i) => [k, i]));
  return { tiles, index };
}

export function makeMaterials(tex) {
  const bt = tileTable(BLD_PRESET, tex.bldAtlas);
  const gt = tileTable(GROUND_PRESET, tex.groundAtlas);
  const ground = stencilOutside(uber('ground', tex.groundAtlas, gt.tiles, { sink: false, envMapIntensity: 0.9 }));
  const bld = uber('bld', tex.bldAtlas, bt.tiles, { envMapIntensity: 1.3, windows: true });
  const obj = uber('obj', null, null, { envMapIntensity: 1.2 });
  const std = o => patchSink(new THREE.MeshStandardMaterial(o));
  const simple = {
    matte: std({ vertexColors: true, roughness: 0.75 }),
    skin: std({ vertexColors: true, roughness: 0.65 }),
    cloth: std({ vertexColors: true, roughness: 0.92 }),
  };
  return {
    ground, bld, obj, simple,
    bldIndex: key => [bt.index[BLD_PRESET[key][0]], ...BLD_PRESET[key].slice(1)],
    groundIndex: key => [gt.index[GROUND_PRESET[key][0]], ...GROUND_PRESET[key].slice(1)],
  };
}

// Merge a {materialKey: geometry} map into one geometry with the aMat attribute.
// presetOf(key) -> [x, roughness, metalness, emissive, uvScale?]
export function mergeKeyed(list, presetOf) {
  let total = 0;
  for (const [, g] of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3), am = new Float32Array(total * 4);
  let off = 0;
  const ranges = [];
  for (const [key, g, tag] of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    const p = presetOf(key);
    const sc = p[4] ?? 1, src = g.attributes.uv.array;
    for (let k = 0; k < n * 2; k++) uv[off * 2 + k] = src[k] * sc;
    col.set(g.attributes.color.array, off * 3);
    for (let k = 0; k < n; k++) { const o = (off + k) * 4; am[o] = p[0]; am[o + 1] = p[1]; am[o + 2] = p[2]; am[o + 3] = p[3]; }
    ranges.push({ tag, start: off, count: n });
    off += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aMat', new THREE.BufferAttribute(am, 4));
  out.computeBoundingSphere();
  out.userData.ranges = ranges;
  return out;
}

const fadeCache = new Map();
export function faded(m) {
  let f = fadeCache.get(m);
  if (!f) {
    f = m.clone();
    f.onBeforeCompile = m.onBeforeCompile;
    f.customProgramCacheKey = m.customProgramCacheKey;
    f.transparent = true;
    f.opacity = 0.22;
    f.depthWrite = false;
    fadeCache.set(m, f);
  }
  return f;
}
