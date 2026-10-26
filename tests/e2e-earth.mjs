// End-to-end test in a real browser (installed Microsoft Edge or Chrome, headless)
// driving the game through touch events and the window.__bhi debug hooks.
// Usage: node tests/e2e-earth.mjs [--shots dir]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const shotDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : 'docs/screenshots';
fs.mkdirSync(shotDir, { recursive: true });

const results = [];
const errors = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];

let browser;
for (const channel of ['msedge', 'chrome']) {
  try {
    browser = await chromium.launch({ channel, headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    console.log(`browser: ${channel}`);
    break;
  } catch { /* try next */ }
}
if (!browser) { console.error('No Edge/Chrome installation found'); process.exit(2); }

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const cdp = await ctx.newCDPSession(page);

const state = () => page.evaluate(() => window.__bhi.state());
const shot = async name => { await page.screenshot({ path: path.join(shotDir, `${name}.png`) }); };
const frames = n => page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function touch(type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p[0], y: p[1], id: p[2] ?? id, radiusX: 4, radiusY: 4, force: 1 })) });
}

async function rect(sel) { return page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel); }
const center = r => [r.x + r.w / 2, r.y + r.h / 2];
const overlap = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function setSettings(patch) {
  await page.evaluate(p => { const g = window.__bhi.game; g.applySettings({ ...g.settings, ...p }); }, patch);
  await frames(2);
}

const T0 = Date.now();
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__bhi && document.getElementById('loading').classList.contains('done'), null, { timeout: 120000 });
  await frames(30);
  const gl = await page.evaluate(() => window.__bhi.game.renderer.capabilities.isWebGL2);
  record('WebGL2 renderer available', gl);
  await wait(1500);
  await shot('01-menu');
  let s = await state();
  record('menu is shown at start', s.state === 'menu');

  await page.tap('#btn-play');
  await frames(20);
  s = await state();
  record('play starts the game', s.state === 'play');
  record('portrait viewport', (await page.evaluate(() => innerHeight > innerWidth)));
  await wait(2500);
  await shot('02-gameplay-start');
  record('audio engine running after the first tap', (await page.evaluate(() => window.__bhi.audioState())) === 'running');
  const shape0 = await page.evaluate(() => window.__bhi.holeShape());
  record('black hole is circular from above (small)', Math.abs(shape0.aspect - 1) < 0.05 && shape0.fill > 0.93, JSON.stringify(shape0));
  const sizeErr = Math.abs(shape0.w - shape0.expectedDiameterPx) / shape0.expectedDiameterPx;
  record('visible size matches physical radius', sizeErr < 0.1, `${shape0.w}px vs ${shape0.expectedDiameterPx.toFixed(0)}px`);
  await wait(4000);
  const pl = await page.evaluate(() => window.__bhi.placementCheck());
  record('vehicles drive on roads, pedestrians on sidewalks/crossings', pl.carsOff === 0 && pl.pedsOff === 0 && pl.cars > 10 && pl.peds > 20, JSON.stringify(pl));
  const planets = await page.evaluate(() => { let n = 0; window.__bhi.game.scene.traverse(o => { if (o.isMesh && o.geometry?.type === 'SphereGeometry' && (o.geometry.parameters.radius * o.scale.x) > 20) n++; }); return n; });
  record('no planets or spheres floating over the city', planets === 0);

  // Gravity must not start by itself
  const m0 = s.mass;
  await frames(90);
  s = await state();
  record('gravity is off unless ATTRAI is pressed', s.attract === false && s.stressed === 0);
  const r0 = s.r;
  record('hole starts small (only light objects)', r0 < 0.42, `r=${r0.toFixed(2)}`);

  // Joystick (mode A): drag upward
  const joy = await rect('#joy');
  const [jx, jy] = center(joy);
  const before = await state();
  await touch('touchStart', [[jx, jy]]);
  for (let k = 1; k <= 6; k++) { await touch('touchMove', [[jx, jy - k * 8]]); await frames(2); }
  await frames(40);
  const mid = await state();
  // Multitouch: keep the joystick and press ATTRAI with a second finger
  const btn = await rect('#btn-attract');
  const [bx, by] = center(btn);
  await touch('touchMove', [[jx, jy - 48, 0], [bx, by, 1]]);
  await frames(30);
  const both = await state();
  await touch('touchEnd', []);
  await frames(10);
  const moved = Math.hypot(mid.x - before.x, mid.z - before.z);
  record('joystick moves the hole', moved > 0.3, `moved ${moved.toFixed(2)} m`);
  record('multitouch: move + ATTRAI together', both.attract === true && Math.hypot(both.vx, both.vz) > 0.3);
  const after = await state();
  record('releasing ATTRAI turns gravity off', after.attract === false);

  // Toggle mode for the ATTRAI button
  await setSettings({ attractMode: 'toggle' });
  await touch('touchStart', [[bx, by]]); await frames(3); await touch('touchEnd', []); await frames(5);
  const tg1 = (await state()).attract;
  await touch('touchStart', [[bx, by]]); await frames(3); await touch('touchEnd', []); await frames(5);
  const tg2 = (await state()).attract;
  record('ATTRAI toggle mode (tap on / tap off)', tg1 === true && tg2 === false);
  await setSettings({ attractMode: 'hold' });

  // Control overlap on a small screen, all modes
  for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(vp);
    await frames(5);
    for (const mode of ['A', 'B', 'C', 'D']) {
      await setSettings({ control: mode, joyX: 0.85, joyY: 0.92 });
      const j = mode === 'D' ? null : await rect('#joy');
      const b = await rect('#btn-attract');
      const p = await rect('#btn-pause');
      const inside = b.x >= 0 && b.y >= 0 && b.x + b.w <= vp.width && b.y + b.h <= vp.height && (!j || (j.x >= 0 && j.y >= 0 && j.x + j.w <= vp.width && j.y + j.h <= vp.height));
      record(`controls do not overlap (${vp.width}x${vp.height}, mode ${mode})`, !overlap(j, b) && !overlap(j, p) && !overlap(b, p) && inside);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await setSettings({ control: 'A' });

  // Touch-only mode: drag on the scene
  await setSettings({ control: 'D' });
  const t1 = await state();
  await touch('touchStart', [[195, 420]]);
  for (let k = 1; k <= 8; k++) { await touch('touchMove', [[195 + k * 10, 420]]); await frames(2); }
  await frames(40);
  await touch('touchEnd', []);
  const t2 = await state();
  record('touch-only drag moves the hole', Math.hypot(t2.x - t1.x, t2.z - t1.z) > 0.3);
  await setSettings({ control: 'A' });

  // Eat small objects with gravity (keyboard Space = ATTRAI): go next to a leaf and pull.
  for (let round = 0; round < 3; round++) {
    const leaf = await page.evaluate(() => window.__bhi.nearest('leaf', 120, true) || window.__bhi.nearest('litter', 120, true));
    if (!leaf) break;
    await page.evaluate(l => window.__bhi.teleport(l.x + 0.9, l.z), leaf);
    await frames(20);
    await page.keyboard.down('Space');
    await wait(1200);
    if (round === 0) await shot('03-attract-small');
    await wait(1200);
    await page.keyboard.up('Space');
  }
  s = await state();
  record('absorbing objects increases mass', s.mass > m0, `mass ${m0.toFixed(3)} -> ${s.mass.toFixed(3)}, eaten ${s.eaten}`);
  record('radius grows with mass', s.r >= r0);

  // Pedestrians run away from a hole big enough to swallow them
  await page.evaluate(() => window.__bhi.setMass(6));
  await frames(20);
  const ped = await page.evaluate(() => { const g = window.__bhi.game; const p = g.peds.list.find(q => q.state === 'rest' && q.mode === 'walk'); window.__testPed = p; return p && { x: p.x, z: p.z }; });
  if (ped) {
    await page.evaluate(p => window.__bhi.teleport(p.x + 1.6, p.z + 1.6), ped);
    await wait(700);
    const fl = await page.evaluate(() => { const p = window.__testPed; return p && { mode: p.mode, run: p.run, speed: p.cur, state: p.state }; });
    record('pedestrians flee (running) from a dangerous hole', !!fl && (((fl.mode === 'flee' || fl.mode === 'cross') && fl.speed > 2) || fl.state !== 'rest'), JSON.stringify(fl));
  } else record('pedestrians flee (running) from a dangerous hole', false, 'no pedestrian');

  // Custom joystick position is saved with the settings
  await setSettings({ control: 'C', joyX: 0.3, joyY: 0.7, joySize: 150 });

  // Save / reload
  await page.evaluate(() => { window.__bhi.game.persist(); });
  const savedMass = (await state()).mass;
  await page.reload();
  await page.waitForFunction(() => window.__bhi && document.getElementById('loading').classList.contains('done'), null, { timeout: 120000 });
  const playLabel = await page.textContent('#btn-play');
  s = await state();
  record('save restores progress after reload', Math.abs(s.mass - savedMass) < 1e-6 && playLabel.trim() === 'Continua', `mass ${s.mass.toFixed(3)}, button "${playLabel.trim()}"`);
  const savedSettings = await page.evaluate(() => window.__bhi.game.settings);
  record('settings (custom joystick) persist', savedSettings.control === 'C' && savedSettings.joyX === 0.3 && savedSettings.joySize === 150);
  await setSettings({ control: 'A' });
  await page.tap('#btn-play');
  await frames(10);

  // Growth: car scale. Find a parked car and pull it.
  await page.evaluate(() => window.__bhi.setMass(700));
  await frames(120);
  s = await state();
  record('camera zooms out as the hole grows', s.camDist > 20, `camDist ${s.camDist.toFixed(1)}`);
  const car = await page.evaluate(() => window.__bhi.nearest('car_sedan', 400, true) || window.__bhi.nearest('car_city', 400, true));
  if (car) {
    await page.evaluate(c => window.__bhi.teleport(c.x + 5, c.z + 5), car);
    await frames(90);
    await page.keyboard.down('Space');
    await wait(500);
    await shot('04-car-pulled');
    await wait(2500);
    await page.keyboard.up('Space');
    const st = await page.evaluate(id => window.__bhi.entityState(id), car.id);
    record('a car gets dragged into the hole', st === 'gone' || st === 'free', `state ${st}`);
  } else record('a car gets dragged into the hole', false, 'no car found');

  // Building collapse: house scale
  await page.evaluate(() => window.__bhi.setMass(9000));
  await frames(200);
  const house = await page.evaluate(() => window.__bhi.nearest('house', 600, true) || window.__bhi.nearest('shop', 600, true) || window.__bhi.nearest('villa', 600, true));
  if (house) {
    await page.evaluate(h => window.__bhi.teleport(h.x + 7, h.z + 7), house);
    await frames(150);
    await page.keyboard.down('Space');
    const states = [];
    for (let k = 0; k < 14; k++) {
      await wait(600);
      states.push(await page.evaluate(id => window.__bhi.entityState(id), house.id));
      if (k === 3) await shot('05-building-tilting');
      if (k === 7) await shot('06-building-sinking');
    }
    await page.keyboard.up('Space');
    record('a building tilts, collapses and sinks into the hole', states.includes('stress') && states.includes('collapse') && ['gone', 'missing'].includes(states[states.length - 1]), states.join(','));
  } else record('a building tilts, collapses and sinks into the hole', false, 'no house found');
  s = await state();
  record('growth continues (no cap)', s.r > 6, `r=${s.r.toFixed(2)}`);

  // Large scale and distant areas: teleport far, chunks load without stalls
  await page.evaluate(() => window.__bhi.setMass(2e6));
  await frames(60);
  const t0 = Date.now();
  await page.evaluate(() => window.__bhi.teleport(9000, -7000));
  await frames(240);
  s = await state();
  record('far areas stream in (floating origin rebased)', s.world.full > 0 && s.world.lite > 0 && s.origin.version > 1, `full ${s.world.full}, lite ${s.world.lite}, origin v${s.origin.version}, ${Date.now() - t0} ms`);
  await shot('07-large-scale');
  record('huge radius still grows', s.r > 30, `r=${s.r.toFixed(1)}`);
  // Measure once nothing is falling through the opening any more.
  for (let k = 0; k < 40; k++) { const q = await state(); if (q.bodies === 0 && q.collapses === 0) break; await wait(250); }
  await frames(10);
  const shape1 = await page.evaluate(() => window.__bhi.holeShape());
  record('black hole is circular from above (huge)', Math.abs(shape1.aspect - 1) < 0.05 && shape1.fill > 0.9, JSON.stringify(shape1));
  record('camera keeps the hole centred', Math.hypot(s.x - (await page.evaluate(() => window.__bhi.game.rig.target.x)), s.z - (await page.evaluate(() => window.__bhi.game.rig.target.z))) < s.r);

  // Day / night: lit windows and lamps at night
  await page.evaluate(() => { window.__bhi.game.daynight.t = 0.02; });
  await frames(10);
  const night = await page.evaluate(() => window.__bhi.game.shared.uNight.value);
  await shot('10-night');
  await page.evaluate(() => { window.__bhi.game.daynight.t = 0.45; });
  await frames(10);
  const day = await page.evaluate(() => window.__bhi.game.shared.uNight.value);
  record('day/night cycle (night lights on, day off)', night > 0.9 && day < 0.05, `night ${night.toFixed(2)}, day ${day.toFixed(2)}`);

  // Missions progress and statistics
  const ms = await page.evaluate(() => ({ done: window.__bhi.game.save.missions.length, byKind: Object.keys(window.__bhi.game.save.stats.byKind).length }));
  record('missions completed and per-type statistics recorded', ms.done > 0 && ms.byKind > 3, JSON.stringify(ms));
  const culled = await page.evaluate(() => window.__bhi.state().pools);
  record('off-screen instances are not drawn (frustum culling)', culled.visible < culled.instances * 0.8, JSON.stringify(culled));

  // Pause menu and settings screen
  await page.tap('#btn-pause');
  await wait(700);
  await shot('08-pause');
  await page.tap('#btn-pause-stats');
  await wait(700);
  const statsText = await page.textContent('#stats-body');
  await shot('11-stats');
  record('statistics screen', /Tempo di gioco/.test(statsText) && /Edifici crollati/.test(statsText));
  await page.tap('#btn-stats-close');
  await wait(300);
  await page.tap('#btn-pause-settings');
  await wait(700);
  await shot('09-settings');
  s = await state();
  record('pause works', s.state === 'pause');
} catch (err) {
  record('test run completed without exceptions', false, String(err && err.stack || err));
}

const fatal = errors.filter(e => !/favicon/i.test(e));
record('no errors in the console', fatal.length === 0, fatal.slice(0, 5).join(' | '));
const st = await state().catch(() => null);
if (st) console.log(`final: fps ${st.fps?.toFixed?.(1)}, draw calls ${st.drawCalls}, triangles ${st.triangles}, pools ${JSON.stringify(st.pools)}`);
console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed in ${((Date.now() - T0) / 1000).toFixed(0)} s`);
fs.writeFileSync(path.join(shotDir, 'e2e-results.json'), JSON.stringify({ date: new Date().toISOString(), results, errors: fatal }, null, 2));
await browser.close();
await server.close();
process.exit(results.every(r => r.pass) ? 0 : 1);
