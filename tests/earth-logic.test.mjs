// Node tests for the pure logic of the Earth Edition: city generation and growth.
import assert from 'node:assert/strict';
import { generateChunk, blockBounds, zoneOf, START_CHUNK, groundHeight, CURB } from '../src/earth/citygen.js';
import { radiusForMass, massForRadius, progressInfo, KINDS, tier } from '../src/earth/config.js';

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

function footprint(it) {
  const turned = Math.abs(Math.sin(it.rot)) > 0.5;
  const fw = turned ? it.d : it.w, fd = turned ? it.w : it.d;
  return { x0: it.x - fw / 2, x1: it.x + fw / 2, z0: it.z - fd / 2, z1: it.z + fd / 2 };
}
const overlap = (a, b, m = 0) => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;

// Determinism
const a = JSON.stringify(generateChunk(5, -3));
const b = JSON.stringify(generateChunk(5, -3));
ok(a === b, 'chunk generation must be deterministic');

const zones = {};
let buildings = 0, props = 0;
for (let i = -8; i <= 8; i++) {
  for (let j = -8; j <= 8; j++) {
    const ch = generateChunk(i, j);
    zones[ch.zone] = (zones[ch.zone] || 0) + 1;
    const bb = blockBounds(i, j);
    const blds = ch.items.filter(it => it.t === 'b');
    buildings += blds.length;
    for (const it of blds) {
      const f = footprint(it);
      ok(f.x0 >= ch.L.x0 - 0.01 && f.x1 <= ch.L.x1 + 0.01 && f.z0 >= ch.L.z0 - 0.01 && f.z1 <= ch.L.z1 + 0.01,
        `building ${it.kind} outside lot in chunk ${i},${j}`);
      ok(it.needR > 0 && it.mass > 0 && it.h > 0, 'building has size data');
    }
    for (let p = 0; p < blds.length; p++) for (let q = p + 1; q < blds.length; q++) {
      ok(!overlap(footprint(blds[p]), footprint(blds[q]), 0.05), `buildings overlap in chunk ${i},${j}: ${blds[p].kind}/${blds[q].kind}`);
    }
    for (const it of ch.items) {
      if (it.t !== 'p') continue;
      props++;
      ok(KINDS[it.kind], `unknown kind ${it.kind}`);
      ok(it.x > bb.x0 && it.x < bb.x1 && it.z > bb.z0 && it.z < bb.z1, `prop ${it.kind} on the road in chunk ${i},${j}`);
      ok(groundHeight(it.x, it.z) === CURB, 'props stand on the block surface');
      if (KINDS[it.kind].cat === 'tiny') continue;
      for (const bd of blds) {
        const f = footprint(bd);
        ok(!(it.x > f.x0 + 0.2 && it.x < f.x1 - 0.2 && it.z > f.z0 + 0.2 && it.z < f.z1 - 0.2), `prop ${it.kind} inside building ${bd.kind} in ${i},${j}`);
      }
    }
  }
}
ok(zoneOf(...START_CHUNK) === 'park', 'start chunk is a park');
for (const z of ['residential', 'downtown', 'commercial', 'cbd', 'park']) ok(zones[z] > 0, `zone ${z} present`);

// Growth curve: continuous, monotone, unbounded, slowing down.
let prev = 0;
for (let m = 0; m < 1e9; m = m * 1.5 + 0.01) {
  const r = radiusForMass(m);
  ok(r >= prev, 'radius is monotone');
  ok(Math.abs(massForRadius(r) - m) / Math.max(1, m) < 1e-6, 'mass/radius inverse');
  prev = r;
}
ok(radiusForMass(1e12) > 2000, 'growth has no upper bound');
ok(radiusForMass(0) >= KINDS.leaf.needR && radiusForMass(0) < KINDS.cone.needR, 'start: only tiny objects');
const p0 = progressInfo(0);
ok(p0.current.index === 1 && p0.next.index === 2, 'starts at tier 1');
for (let n = 1; n < 16; n++) ok(tier(n + 1).r > tier(n).r, `tier ${n} radius increasing`);
const pBig = progressInfo(1e15);
ok(pBig.next.r > pBig.r && pBig.progress >= 0 && pBig.progress <= 1, 'progress keeps working at huge scale');

// Pace: how many objects of the unlocking class are needed to reach the next tier.
const pace = [];
for (let n = 2; n <= 10; n++) {
  const t0 = tier(n), t1 = tier(n + 1);
  const objs = Object.values(KINDS).filter(k => k.tier === n && !k.building);
  if (!objs.length) continue;
  const avg = objs.reduce((s, k) => s + k.mass, 0) / objs.length;
  pace.push(`${t0.name}: ~${Math.round((massForRadius(t1.r) - massForRadius(t0.r)) / avg)} oggetti`);
}
console.log(`zones ${JSON.stringify(zones)}, ${buildings} buildings, ${props} props in 17x17 chunks`);
console.log('pace:', pace.join(' | '));
console.log(`earth-logic: ${checks} checks passed`);
