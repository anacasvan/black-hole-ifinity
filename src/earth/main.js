// Black Hole Infinity — Earth Edition: bootstrap, main loop and game state.
import './style.css';
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { makeMaterials, SHARED, faded } from './materials.js';
import { Pools } from './pools.js';
import { MODELS } from './models.js';
import { World } from './world.js';
import { HoleVisual } from './hole.js';
import { Physics } from './physics.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { FX } from './fx.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { UI, formatMass } from './ui.js';
import { CameraRig } from './camera.js';
import { Post } from './post.js';
import { Save, loadSettings, saveSettings } from './save.js';
import { radiusForMass, progressInfo } from './config.js';
import { groundHeight, startPosition, C } from './citygen.js';
import { ORIGIN, needsRebase, rebase } from './origin.js';

const FOG = 0xc8d3dc;

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.ui = new UI(this);
    this.audio = new GameAudio();
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
    } catch (err) {
      this.ui.fatal('Questo dispositivo non supporta WebGL 2, necessario per la grafica 3D del gioco.');
      throw err;
    }
    if (!renderer.capabilities.isWebGL2) {
      this.ui.fatal('Questo dispositivo non supporta WebGL 2, necessario per la grafica 3D del gioco.');
      throw new Error('WebGL2 not available');
    }
    this.renderer = renderer;
    renderer.info.autoReset = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = new THREE.Fog(FOG, 60, 220);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.rig = new CameraRig(this.camera);

    this.makeLights();
    this.makeEnvironment();

    this.shared = SHARED;
    this.tex = makeTextures(renderer);
    this.mats = makeMaterials(this.tex);
    this.pools = new Pools(this.scene, this.mats.obj);
    this.settings = loadSettings();
    this.save = new Save();
    this.hasSave = this.save.load() && this.save.mass > 0;

    this.world = new World(this);
    this.holeVis = new HoleVisual(this.scene);
    this.physics = new Physics(this);
    this.traffic = new Traffic(this);
    this.peds = new Peds(this);
    this.fx = new FX(this.scene, this.mats);
    this.post = new Post(renderer);

    const start = startPosition();
    this.hole = { x: start.x, z: start.z, y: groundHeight(start.x, start.z), vx: 0, vz: 0, mass: 0, r: radiusForMass(0), attract: false };
    this.applySave();

    this.input = new Input(document.getElementById('controls'), document.getElementById('joy'), document.querySelector('#joy .joy-knob'), document.getElementById('btn-attract'), document.getElementById('touch-ind'));
    this.input.onAttractChange = on => { if (on) this.haptic(8); };
    this.state = 'menu';
    this.time = 0;
    this.saveT = 0;
    this.fps = { acc: 0, n: 0, avg: 60, t: 0 };
    this.dynPR = 1;
    this.tierIndex = progressInfo(this.hole.mass).current.index;
    this.actorList = [];
    this.lastHaptic = 0;
    this.prof = {};

    this.applySettings(this.settings, true);
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.state === 'play') this.pause(); this.persist(); this.audio.pause(); }
      else if (this.state !== 'menu') this.audio.resume();
    });
    window.addEventListener('pagehide', () => this.persist());
    this.resize();
  }

  makeLights() {
    this.hemi = new THREE.HemisphereLight(0xd6e6ff, 0x6a6352, 0.85);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0dc, 2.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.sunTarget = new THREE.Object3D();
    sun.target = this.sunTarget;
    this.scene.add(sun, this.sunTarget);
  }

  makeEnvironment() {
    const sky = new THREE.Scene();
    const geo = new THREE.SphereGeometry(100, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; void main(){
        float h = vD.y;
        vec3 top = vec3(0.35, 0.55, 0.85), hor = vec3(0.85, 0.88, 0.9), bot = vec3(0.32, 0.3, 0.27);
        vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor, bot, pow(-h, 0.5));
        vec3 sd = normalize(vec3(-0.45, 0.75, 0.35));
        c += vec3(1.0, 0.92, 0.8) * pow(max(dot(vD, sd), 0.0), 220.0) * 18.0;
        gl_FragColor = vec4(c, 1.0); }`,
    });
    sky.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(sky, 0.02).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();
  }

  applySave() {
    const s = this.save;
    this.hole.mass = s.mass;
    this.hole.r = radiusForMass(s.mass);
    if (s.x !== null && s.z !== null) { this.hole.x = s.x; this.hole.z = s.z; }
    this.hole.y = groundHeight(this.hole.x, this.hole.z);
    rebase(this.hole.x, this.hole.z);
  }

  // ---- settings & quality ---------------------------------------------------
  applySettings(s, transient = false) {
    const prevQ = this.settings?.quality;
    this.settings = s;
    if (!transient) saveSettings(s);
    this.audio.setVolumes(s.music, s.sfx);
    this.layoutControls();
    const q = this.effectiveQuality();
    if (q !== this.appliedQuality || prevQ !== s.quality || this.reduceApplied !== s.reduceFx) this.applyQuality(q);
  }

  effectiveQuality() {
    if (this.settings.quality !== 'auto') return this.settings.quality;
    return this.autoQ || 'medium';
  }

  applyQuality(q) {
    this.appliedQuality = q;
    this.reduceApplied = this.settings.reduceFx;
    const dpr = window.devicePixelRatio || 1;
    this.basePR = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.dynPR = 1;
    const shadows = q !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    this.sun.castShadow = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.usePost = q !== 'low' && !this.settings.reduceFx;
    this.holeVis.setQuality(q, this.settings.reduceFx);
    this.fx.reduce = this.settings.reduceFx || q === 'low';
    this.traffic.setDensity(q);
    this.peds.setDensity(q);
    this.resize();
  }

  autoTune(dt) {
    const f = this.fps;
    f.acc += dt; f.n++; f.t += dt;
    if (f.acc < 2) return;
    f.avg = f.n / f.acc;
    f.acc = 0; f.n = 0;
    if (this.settings.quality !== 'auto' || this.state !== 'play') return;
    if (f.avg < 42 && this.dynPR > 0.7) { this.dynPR = Math.max(0.7, this.dynPR - 0.15); this.resize(); }
    else if (f.avg < 32 && this.appliedQuality !== 'low') { this.autoQ = 'low'; this.applyQuality('low'); }
    else if (f.avg > 57 && this.dynPR < 1) { this.dynPR = Math.min(1, this.dynPR + 0.1); this.resize(); }
  }

  safeArea() {
    if (!this.probe) {
      this.probe = document.createElement('div');
      this.probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(this.probe);
    }
    const cs = getComputedStyle(this.probe);
    return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  }

  layoutControls() {
    if (!this.input) return { joy: null, btn: { x: 0, y: 0, w: 0, h: 0 } };
    return this.input.layout(this.settings, window.innerWidth, window.innerHeight, this.safeArea());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = (this.basePR || 1) * this.dynPR;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.pxScale = (h * pr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.layoutControls();
  }

  // ---- flow -------------------------------------------------------------------
  boot() {
    this.rig.snap(this.hole, window.innerWidth / window.innerHeight);
    this.world.setView(this.hole.x, this.hole.z, this.rig.dist, this.effectiveQuality());
    this.world.syncAll();
    for (let k = 0; k < 30; k++) this.traffic.spawn(true);
    for (let k = 0; k < 50; k++) this.peds.spawn(true);
    // Warm-up: create every instanced pool and compile all shader variants now,
    // so nothing stalls the first time an object type or a faded building appears.
    for (const k of Object.keys(MODELS)) this.pools.get(k);
    const warm = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), faded(this.mats.bld));
    warm.position.set(this.hole.x - ORIGIN.x, -50, this.hole.z - ORIGIN.z);
    this.scene.add(warm);
    this.renderer.compile(this.scene, this.camera);
    this.scene.remove(warm);
    // The menu shows the city from higher up; further chunks stream in behind the menu.
    this.rig.dist = Math.max(70, this.rig.dist * 1.9);
    this.ui.showMenu(this.hasSave);
    this.ui.loaded();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  play() {
    this.audio.start();
    this.state = 'play';
    this.ui.showGame();
    this.input.setEnabled(true);
    this.layoutControls();
    if (!this.hasSave) this.ui.toast('Tieni premuto ATTRAI per attivare la gravità', 4.5);
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.input.setEnabled(false);
    this.hole.attract = false;
    this.persist();
    const s = this.save.stats;
    const mins = Math.floor(s.time / 60);
    this.ui.showPause(`Massa <b>${formatMass(this.hole.mass)}</b> · raggio <b>${this.hole.r.toFixed(2)} m</b><br>Oggetti inghiottiti <b>${s.eaten}</b> · edifici crollati <b>${s.collapsed}</b><br>Tempo di gioco <b>${mins} min</b>`);
  }

  resume() {
    this.state = 'play';
    this.ui.showGame();
    this.input.setEnabled(true);
    this.audio.resume();
  }

  toMenu() {
    this.persist();
    this.state = 'menu';
    this.input.setEnabled(false);
    this.hasSave = this.hole.mass > 0;
    this.ui.showMenu(this.hasSave);
  }

  newGame() {
    this.save.clear();
    this.physics.clear();
    this.traffic.clear();
    this.peds.clear();
    for (const ch of [...this.world.chunks.values()]) this.world.unload(ch);
    this.world.chunks.clear();
    this.world.version = (this.world.version || 0) + 1;
    this.world.queue.length = 0;
    const s = startPosition();
    Object.assign(this.hole, { x: s.x, z: s.z, vx: 0, vz: 0, mass: 0, r: radiusForMass(0), attract: false });
    this.hole.y = groundHeight(s.x, s.z);
    rebase(s.x, s.z);
    this.world.onRebase();
    this.tierIndex = 1;
    this.rig.snap(this.hole, window.innerWidth / window.innerHeight);
    this.world.setView(this.hole.x, this.hole.z, this.rig.dist, this.effectiveQuality());
    this.world.syncAll();
    for (let k = 0; k < 30; k++) this.traffic.spawn(true);
    for (let k = 0; k < 50; k++) this.peds.spawn(true);
    this.hasSave = false;
    this.persist();
    this.play();
  }

  persist() {
    const s = this.save;
    s.mass = this.hole.mass; s.x = this.hole.x; s.z = this.hole.z;
    s.write();
  }

  // ---- gameplay hooks -------------------------------------------------------
  actors() {
    const a = this.actorList;
    a.length = 0;
    for (const c of this.traffic.cars) a.push(c);
    for (const p of this.peds.list) a.push(p);
    return a;
  }

  swallow(e) {
    if (e.state === 'gone') return;
    const m = e.mass || 0;
    this.hole.mass += m;
    this.save.stats.eaten++;
    this.audio.swallow(m);
    this.ui.pulse();
    if (m > 0.5) this.haptic(Math.min(35, 5 + Math.cbrt(m) * 3));
    if (e.actor) e.system.remove(e);
    else this.world.removeEntity(e, true);
    e.state = 'gone';
    const info = progressInfo(this.hole.mass);
    if (info.current.index > this.tierIndex) {
      this.tierIndex = info.current.index;
      this.ui.toast(`Ora puoi inghiottire: ${info.current.name}`);
      this.audio.chime();
      this.haptic(25);
    }
  }

  discard(e) {
    if (e.actor) e.system.remove(e);
    else this.world.removeEntity(e, false);
    e.state = 'gone';
  }

  onCollapse(e, start) {
    if (start) {
      this.audio.collapse(e.top);
      this.rig.addShake(Math.min(2.5, 0.5 + e.top / 40));
      this.rig.setFocus(e.x, e.z);
      this.haptic(40);
      this.save.stats.collapsed++;
    }
  }

  haptic(ms) {
    if (!this.settings.vibration || !navigator.vibrate) return;
    const now = performance.now();
    if (now - this.lastHaptic < 90) return;
    this.lastHaptic = now;
    try { navigator.vibrate(Math.round(ms)); } catch { /* not supported */ }
  }

  // ---- main loop ------------------------------------------------------------
  frame() {
    // An exception must never stop the animation loop: log it once and go on.
    try { this.step(); } catch (err) {
      if (!this.loggedError) { console.error(err); this.loggedError = true; }
    }
  }

  step() {
    this.renderer.info.reset();
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.autoTune(dt);
    const playing = this.state === 'play';
    const sim = this.state !== 'pause';
    const hole = this.hole;

    if (playing) {
      this.save.stats.time += dt;
      const inp = this.input.read();
      const yaw = this.rig.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const wx = rx * inp.x - fx * inp.y, wz = rz * inp.x - fz * inp.y;
      const speed = (2.4 + hole.r * 2.1) * this.settings.sensitivity;
      const k = 1 - Math.exp(-dt * 6);
      hole.vx += (wx * speed - hole.vx) * k;
      hole.vz += (wz * speed - hole.vz) * k;
      hole.x += hole.vx * dt;
      hole.z += hole.vz * dt;
      hole.attract = this.input.attract;
      this.saveT += dt;
      if (this.saveT > 8) { this.saveT = 0; this.persist(); }
    } else {
      hole.vx *= 0.8; hole.vz *= 0.8;
      hole.attract = false;
    }
    // The radius follows the absorbed mass smoothly (physics uses the same value).
    const rT = radiusForMass(hole.mass);
    hole.r += (rT - hole.r) * (1 - Math.exp(-dt * 1.5));
    hole.y += (groundHeight(hole.x, hole.z) - hole.y) * (1 - Math.exp(-dt * 10));

    if (needsRebase(hole.x, hole.z)) {
      rebase(hole.x, hole.z);
      this.world.onRebase();
      this.traffic.onRebase();
    }

    const aspect = window.innerWidth / window.innerHeight;
    this.rig.update(dt, hole, aspect, this.state === 'menu');
    this.world.setView(hole.x, hole.z, this.rig.dist, this.effectiveQuality());
    let tp = performance.now();
    const lap = k => { const n = performance.now(); this.prof[k] = Math.max(this.prof[k] || 0, n - tp); tp = n; };
    this.world.update(dt, this.state === 'play' ? 5 : 8); lap('world');

    if (sim) {
      this.traffic.update(dt); lap('traffic');
      this.peds.update(dt); lap('peds');
      this.physics.update(dt, hole); lap('physics');
      this.fx.update(dt, hole, this.pxScale); lap('fx');
    }
    this.rig.occlusion(dt, this.world, hole); lap('occlusion');

    const depth = this.holeVis.update(dt, hole.x - ORIGIN.x, hole.y, hole.z - ORIGIN.z, hole.r, hole.attract, this.pxScale);
    SHARED.uDark.value = 1 / Math.max(0.6, depth * 0.45);

    // Sun and shadow frustum follow the camera target.
    const t = this.rig.target, d = this.rig.dist;
    const span = Math.min(420, Math.max(14, d * 0.95));
    this.sunTarget.position.set(t.x - ORIGIN.x, 0, t.z - ORIGIN.z);
    this.sun.position.set(t.x - ORIGIN.x - span * 0.9, span * 1.6, t.z - ORIGIN.z + span * 0.7);
    const sc = this.sun.shadow.camera;
    if (sc.right !== span) {
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.near = 1; sc.far = span * 5;
      sc.updateProjectionMatrix();
    }
    this.scene.fog.near = d * 1.6;
    this.scene.fog.far = d * 4.2 + 120;
    this.world.updatePlane(t.x, t.z, Math.max(800, d * 14));

    this.audio.update(dt, { attract: hole.attract, r: hole.r, playing, cars: this.traffic.cars.length, park: this.world.chunkAt(hole.x, hole.z)?.zone === 'park' });
    if (playing || this.state === 'pause') this.ui.updateHUD(hole.mass, progressInfo(hole.mass), dt);

    this.pools.lod(d, this.renderer.shadowMap.enabled);
    this.peds.lod(d, this.renderer.shadowMap.enabled);
    this.pools.flush();
    this.world.flush();
    this.peds.flush();
    lap('update');

    if (this.usePost) {
      _hp.set(hole.x - ORIGIN.x, hole.y, hole.z - ORIGIN.z);
      this.post.render(this.scene, this.camera, hole.r, _hp, 0.22 + this.holeVis.attract * 0.78, this.time);
    } else this.renderer.render(this.scene, this.camera);
    lap('render');
  }

  // ---- debug / test hooks ---------------------------------------------------
  debugState() {
    const h = this.hole;
    return {
      state: this.state, x: h.x, z: h.z, y: h.y, r: h.r, mass: h.mass, attract: h.attract,
      vx: h.vx, vz: h.vz, fps: this.fps.avg, quality: this.appliedQuality, origin: { ...ORIGIN },
      world: this.world.stats(), pools: this.pools.stats(), cars: this.traffic.cars.length, peds: this.peds.list.length,
      bodies: this.physics.bodies.length, collapses: this.physics.collapses.length, stressed: this.physics.stressed.size,
      eaten: this.save.stats.eaten, collapsed: this.save.stats.collapsed, camDist: this.rig.dist,
      drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      tier: progressInfo(h.mass).current.name, next: progressInfo(h.mass).next.name,
    };
  }
}

const _hp = new THREE.Vector3();

function startGame() {
  let game;
  try {
    game = new Game();
  } catch (err) {
    console.error(err);
    return;
  }
  window.__bhi = {
    game,
    state: () => game.debugState(),
    setMass: m => { game.hole.mass = m; game.hole.r = radiusForMass(m); game.tierIndex = progressInfo(m).current.index; },
    teleport: (x, z) => { game.hole.x = x; game.hole.z = z; game.hole.vx = game.hole.vz = 0; },
    nearest: (kind, maxD = 200, fitting = false) => {
      let best = null;
      game.world.forEachNear(game.hole.x, game.hole.z, maxD, e => {
        if (e.kind !== kind || e.state !== 'rest') return;
        if (fitting && e.needR > radiusForMass(game.hole.mass)) return;
        const d = Math.hypot(e.x - game.hole.x, e.z - game.hole.z);
        if (!best || d < best.d) best = { d, x: e.x, z: e.z, id: e.id, w: e.w, dd: e.d, needR: e.needR, top: e.top };
      });
      return best;
    },
    entityState: id => {
      let st = 'missing';
      for (const ch of game.world.chunks.values()) for (const e of ch.entities) if (e.id === id) st = e.state;
      return st;
    },
    chunkSize: C,
    // Renders a top-down view of the hole off-screen and measures the dark opening.
    holeShape: (withImage = false) => {
      const g = game, h = g.hole, N = 256;
      const rt = new THREE.WebGLRenderTarget(N, N, { stencilBuffer: true, depthBuffer: true });
      const cam = new THREE.PerspectiveCamera(30, 1, 0.5, 4000);
      const height = (h.r * 3) / Math.tan((15 * Math.PI) / 180);
      cam.position.set(h.x - ORIGIN.x, h.y + height, h.z - ORIGIN.z);
      cam.up.set(0, 0, -1);
      cam.lookAt(h.x - ORIGIN.x, h.y, h.z - ORIGIN.z);
      cam.updateMatrixWorld();
      g.renderer.setRenderTarget(rt);
      g.renderer.render(g.scene, cam);
      const px = new Uint8Array(N * N * 4);
      g.renderer.readRenderTargetPixels(rt, 0, 0, N, N, px);
      g.renderer.setRenderTarget(null);
      rt.dispose();
      // Flood fill the dark region connected to the centre.
      const dark = i => px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] < 10;
      const seen = new Uint8Array(N * N);
      const stack = [(N / 2) * N + N / 2];
      let area = 0, x0 = N, x1 = 0, y0 = N, y1 = 0;
      while (stack.length) {
        const i = stack.pop();
        if (seen[i] || !dark(i)) continue;
        seen[i] = 1; area++;
        const x = i % N, y = (i / N) | 0;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        if (x > 0) stack.push(i - 1);
        if (x < N - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - N);
        if (y < N - 1) stack.push(i + N);
      }
      const w = x1 - x0 + 1, hh = y1 - y0 + 1;
      const out = { area, w, h: hh, aspect: w / hh, fill: area / (Math.PI * w * hh / 4), expectedDiameterPx: N / 3 };
      if (withImage) {
        const cv = document.createElement('canvas'); cv.width = cv.height = N;
        const cx = cv.getContext('2d'), img = cx.createImageData(N, N);
        for (let y = 0; y < N; y++) img.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);
        cx.putImageData(img, 0, 0);
        out.image = cv.toDataURL();
      }
      return out;
    },
    // Every driving vehicle is on the road surface, every walking pedestrian on a sidewalk or crossing.
    placementCheck: () => {
      const g = game;
      let carsOff = 0, pedsOff = 0, stoppedAtRed = 0;
      for (const c of g.traffic.cars) {
        if (c.state !== 'rest') continue;
        if (groundHeight(c.x, c.z) !== 0) carsOff++;
        if (c.speed < 0.3 && c.seg.type === 'line' && !c.seg.cross && c.seg.len - c.u < 3) stoppedAtRed++;
      }
      for (const p of g.peds.list) {
        if (p.state !== 'rest' || p.mode === 'getup') continue;
        if (!p.onRoad && groundHeight(p.x, p.z) === 0) pedsOff++;
      }
      return { cars: g.traffic.cars.length, carsOff, peds: g.peds.list.length, pedsOff, stoppedAtRed };
    },
    audioState: () => game.audio.ctx?.state ?? 'none',
    prof: (reset = false) => { const p = { ...game.prof }; if (reset) game.prof = {}; return p; },
  };
  // Defer the heavy world build so the loading screen is painted first.
  requestAnimationFrame(() => setTimeout(() => game.boot(), 30));
}

startGame();

// Installed web app: keep every file on the device so the game also runs offline.
// (Only in production builds; the dev server is excluded.)
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker non registrato', err)));
}
