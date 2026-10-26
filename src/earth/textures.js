// Procedural textures painted on canvases at startup (no external assets).
import * as THREE from 'three';
import { makeRng } from './rng.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function noise(ctx, w, h, amount, seed, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data, r = makeRng(seed);
  for (let p = 0; p < d.length; p += 4) {
    const n = (r() - 0.5) * amount;
    if (mono) { d[p] += n; d[p + 1] += n; d[p + 2] += n; }
    else { d[p] += (r() - 0.5) * amount; d[p + 1] += (r() - 0.5) * amount; d[p + 2] += (r() - 0.5) * amount; }
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, w, h, n, colors, rmin, rmax, seed, alpha = 0.15) {
  const r = makeRng(seed);
  for (let k = 0; k < n; k++) {
    const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const col = colors[Math.floor(r() * colors.length)];
    g.addColorStop(0, col.replace('A', String(alpha)));
    g.addColorStop(1, col.replace('A', '0'));
    ctx.fillStyle = g;
    // Draw wrapped copies so the texture tiles.
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      ctx.save(); ctx.translate(ox, oy); ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); ctx.restore();
    }
  }
}

function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function asphalt() {
  const [c, x] = canvas(512);
  x.fillStyle = '#45484d'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 40, ['rgba(30,32,36,A)', 'rgba(90,92,96,A)'], 30, 120, 11, 0.25);
  noise(x, 512, 512, 34, 12);
  const r = makeRng(13);
  for (let k = 0; k < 2600; k++) {
    const v = 90 + r() * 70;
    x.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + r() * 0.4})`;
    x.fillRect(r() * 512, r() * 512, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  x.strokeStyle = 'rgba(20,20,22,0.35)'; x.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    x.beginPath(); let px = r() * 512, py = r() * 512; x.moveTo(px, py);
    for (let s = 0; s < 8; s++) { px += (r() - 0.5) * 50; py += (r() - 0.5) * 50; x.lineTo(px, py); }
    x.stroke();
  }
  return tex(c);
}

function pavers() {
  const [c, x] = canvas(512);
  x.fillStyle = '#9d9a94'; x.fillRect(0, 0, 512, 512);
  const r = makeRng(21);
  const n = 4, s = 512 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 168 + (r() - 0.5) * 22;
    x.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
    x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
  }
  blotches(x, 512, 512, 30, ['rgba(110,104,96,A)', 'rgba(200,196,188,A)'], 20, 70, 22, 0.18);
  noise(x, 512, 512, 22, 23);
  return tex(c);
}

function grass() {
  const [c, x] = canvas(512);
  x.fillStyle = '#5d7f3a'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 70, ['rgba(70,98,40,A)', 'rgba(118,140,62,A)', 'rgba(88,112,48,A)', 'rgba(132,128,72,A)'], 25, 110, 31, 0.35);
  const r = makeRng(32);
  for (let k = 0; k < 9000; k++) {
    const g = 95 + r() * 70;
    x.strokeStyle = `rgba(${g * 0.6},${g},${g * 0.35},0.35)`;
    const px = r() * 512, py = r() * 512;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py - 2 - r() * 4); x.stroke();
  }
  noise(x, 512, 512, 18, 33, false);
  return tex(c);
}

function plaza() {
  const [c, x] = canvas(512);
  x.fillStyle = '#a7a196'; x.fillRect(0, 0, 512, 512);
  const r = makeRng(41);
  const rows = 4;
  for (let j = 0; j < rows; j++) {
    const h = 512 / rows, off = (j % 2) * 64;
    for (let i = -1; i < 5; i++) {
      const v = 186 + (r() - 0.5) * 26;
      x.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      x.fillRect(i * 128 + off + 2, j * h + 2, 124, h - 4);
    }
  }
  blotches(x, 512, 512, 30, ['rgba(140,130,118,A)'], 20, 70, 42, 0.2);
  noise(x, 512, 512, 18, 43);
  return tex(c);
}

function gravel() {
  const [c, x] = canvas(512);
  x.fillStyle = '#b9a98a'; x.fillRect(0, 0, 512, 512);
  const r = makeRng(51);
  for (let k = 0; k < 7000; k++) {
    const v = 140 + r() * 90;
    x.fillStyle = `rgba(${v},${v * 0.92},${v * 0.78},0.7)`;
    x.beginPath(); x.arc(r() * 512, r() * 512, 0.6 + r() * 2, 0, 6.283); x.fill();
  }
  blotches(x, 512, 512, 20, ['rgba(120,104,80,A)'], 30, 90, 52, 0.2);
  return tex(c);
}

function concrete(base = '#b3b1ab', seed = 61) {
  const [c, x] = canvas(512);
  x.fillStyle = base; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 40, ['rgba(120,118,112,A)', 'rgba(210,208,200,A)'], 30, 120, seed, 0.18);
  noise(x, 512, 512, 20, seed + 1);
  x.strokeStyle = 'rgba(80,80,80,0.35)'; x.lineWidth = 2;
  x.strokeRect(0, 0, 512, 512);
  return tex(c);
}

function soilFlowers() {
  const [c, x] = canvas(256);
  x.fillStyle = '#5a4030'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 30, 71);
  const r = makeRng(72);
  for (let k = 0; k < 160; k++) {
    const px = r() * 256, py = r() * 256;
    x.fillStyle = '#3f6a2c'; x.beginPath(); x.arc(px, py, 4 + r() * 4, 0, 6.283); x.fill();
  }
  const cols = ['#e8364a', '#f4c430', '#f7f2f0', '#b35ac8', '#ff8c3a', '#e85fa0'];
  for (let k = 0; k < 260; k++) {
    x.fillStyle = cols[Math.floor(r() * cols.length)];
    x.beginPath(); x.arc(r() * 256, r() * 256, 1.5 + r() * 2.2, 0, 6.283); x.fill();
  }
  return tex(c);
}

function water() {
  const [c, x] = canvas(256);
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#3f8faa'); g.addColorStop(1, '#2e7690');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  blotches(x, 256, 256, 30, ['rgba(160,220,235,A)', 'rgba(30,80,100,A)'], 10, 40, 81, 0.25);
  return tex(c);
}

// --- Facades (one module = 1 bay x 1 floor) --------------------------------

function windowPane(x, X, Y, W, H, r) {
  const g = x.createLinearGradient(X, Y, X + W * 0.6, Y + H);
  g.addColorStop(0, '#93a9b8'); g.addColorStop(0.45, '#4d6070'); g.addColorStop(1, '#2b3a46');
  x.fillStyle = g; x.fillRect(X, Y, W, H);
  x.fillStyle = 'rgba(255,255,255,0.16)';
  x.beginPath(); x.moveTo(X, Y + H * 0.2); x.lineTo(X + W * 0.35, Y); x.lineTo(X + W * 0.55, Y); x.lineTo(X, Y + H * 0.5); x.fill();
  if (r() < 0.5) { x.fillStyle = 'rgba(235,225,205,0.55)'; x.fillRect(X + 2, Y + 2, W - 4, H * (0.15 + r() * 0.25)); }
}

function facadeRes(shutters, seed) {
  const [c, x] = canvas(256);
  x.fillStyle = '#f2efe9'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 14, seed);
  const r = makeRng(seed + 1);
  const W = 86, H = 124, X = (256 - W) / 2, Y = 52;
  x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(X - 6, Y - 6, W + 12, H + 14);
  x.fillStyle = '#f7f6f2'; x.fillRect(X - 5, Y - 5, W + 10, H + 10);
  windowPane(x, X, Y, W, H, r);
  x.fillStyle = '#e9e6de'; x.fillRect(X + W / 2 - 2, Y, 4, H);
  x.fillStyle = '#dad6cc'; x.fillRect(X - 9, Y + H + 4, W + 18, 8);
  if (shutters) {
    x.fillStyle = '#3d6142';
    x.fillRect(X - 46, Y - 2, 40, H + 4); x.fillRect(X + W + 6, Y - 2, 40, H + 4);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 14; k++) { x.fillRect(X - 46, Y + 4 + k * 9, 40, 2); x.fillRect(X + W + 6, Y + 4 + k * 9, 40, 2); }
  }
  x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(0, 250, 256, 6);
  return tex(c);
}

// Residential module with a French window and a small wrought-iron balcony.
function facadeFrench(seed) {
  const [c, x] = canvas(256);
  x.fillStyle = '#f0ebe2'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 14, seed);
  const r = makeRng(seed + 3);
  const W = 74, H = 170, X = (256 - W) / 2, Y = 40;
  x.fillStyle = '#e2dccf'; x.fillRect(X - 10, Y - 12, W + 20, 12);
  x.fillStyle = '#f8f6f1'; x.fillRect(X - 5, Y - 5, W + 10, H + 5);
  windowPane(x, X, Y, W, H, r);
  x.fillStyle = '#ebe6dc'; x.fillRect(X + W / 2 - 2, Y, 4, H);
  x.fillStyle = '#a8662f';
  x.fillRect(X - 34, Y - 2, 28, H + 2); x.fillRect(X + W + 6, Y - 2, 28, H + 2);
  x.fillStyle = 'rgba(0,0,0,0.22)';
  for (let k = 0; k < 18; k++) { x.fillRect(X - 34, Y + 4 + k * 9, 28, 2); x.fillRect(X + W + 6, Y + 4 + k * 9, 28, 2); }
  x.strokeStyle = '#2b2b2c'; x.lineWidth = 3;
  x.strokeRect(X - 14, Y + H - 58, W + 28, 58);
  for (let k = 0; k <= 10; k++) { x.beginPath(); x.moveTo(X - 14 + k * (W + 28) / 10, Y + H - 58); x.lineTo(X - 14 + k * (W + 28) / 10, Y + H); x.stroke(); }
  x.fillStyle = '#cfc8ba'; x.fillRect(X - 18, Y + H, W + 36, 8);
  return tex(c);
}

// Dark glass office module with vertical aluminium fins.
function facadeOfficeDark(seed) {
  const [c, x] = canvas(256);
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#5f7482'); g.addColorStop(0.5, '#2c3a44'); g.addColorStop(1, '#1d2830');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const r = makeRng(seed);
  for (let k = 0; k < 4; k++) if (r() < 0.5) { x.fillStyle = `rgba(200,220,230,${0.06 + r() * 0.1})`; x.fillRect(k * 64 + 4, 0, 56, 256); }
  x.fillStyle = '#9aa4aa';
  for (let k = 0; k < 4; k++) x.fillRect(k * 64 - 5, 0, 10, 256);
  x.fillStyle = '#121a20'; x.fillRect(0, 230, 256, 26);
  return tex(c);
}

function facadeBrick(seed) {
  const [c, x] = canvas(256);
  x.fillStyle = '#8d4a36'; x.fillRect(0, 0, 256, 256);
  const r = makeRng(seed);
  for (let j = 0; j < 32; j++) for (let i = -1; i < 9; i++) {
    const v = r();
    x.fillStyle = `rgb(${150 + v * 50},${70 + v * 30},${50 + v * 20})`;
    x.fillRect(i * 32 + (j % 2) * 16 + 1, j * 8 + 1, 30, 6);
  }
  const W = 84, H = 128, X = (256 - W) / 2, Y = 50;
  x.fillStyle = '#e8e3da'; x.fillRect(X - 7, Y - 7, W + 14, H + 14);
  windowPane(x, X, Y, W, H, r);
  x.fillStyle = '#e8e3da'; x.fillRect(X + W / 2 - 2, Y, 4, H); x.fillRect(X, Y + 44, W, 4);
  return tex(c);
}

function facadeOffice(seed) {
  const [c, x] = canvas(256);
  const r = makeRng(seed);
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#9fc3d6'); g.addColorStop(0.5, '#5d8aa5'); g.addColorStop(1, '#3a6680');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 3; k++) {
    if (r() < 0.6) { x.fillStyle = `rgba(230,240,245,${0.1 + r() * 0.15})`; x.fillRect(k * 85 + 4, 40, 77, 120 * r()); }
  }
  x.fillStyle = '#2d3c48'; x.fillRect(0, 196, 256, 60);
  x.fillStyle = '#cfd6da';
  x.fillRect(0, 0, 256, 4); x.fillRect(0, 192, 256, 6);
  for (let k = 0; k <= 3; k++) x.fillRect(k * 85 - 2, 0, 5, 256);
  return tex(c);
}

function facadeOfficeConcrete(seed) {
  const [c, x] = canvas(256);
  x.fillStyle = '#c9c5bd'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 14, seed);
  const r = makeRng(seed);
  windowPane(x, 20, 70, 216, 120, r);
  x.fillStyle = '#b7b2a8'; x.fillRect(126, 70, 5, 120);
  x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(20, 190, 216, 5);
  return tex(c);
}

function storefront(seed) {
  const [c, x] = canvas(256);
  x.fillStyle = '#ece8e0'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 12, seed);
  const r = makeRng(seed);
  // Shop window with a dim interior, shelves and goods.
  const X = 14, Y = 62, W = 228, H = 194;
  x.fillStyle = '#2a2622'; x.fillRect(X, Y, W, H);
  for (let k = 0; k < 4; k++) {
    x.fillStyle = 'rgba(200,180,150,0.25)'; x.fillRect(X + 6, Y + 30 + k * 40, W - 12, 4);
    for (let q = 0; q < 10; q++) {
      x.fillStyle = `hsla(${Math.floor(r() * 360)},45%,55%,0.45)`;
      x.fillRect(X + 10 + q * 21, Y + 14 + k * 40, 14, 16);
    }
  }
  const g = x.createLinearGradient(X, Y, X + W, Y + H);
  g.addColorStop(0, 'rgba(190,215,230,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(160,190,210,0.25)');
  x.fillStyle = g; x.fillRect(X, Y, W, H);
  x.fillStyle = '#3b3f44';
  x.fillRect(X - 4, Y - 4, W + 8, 6); x.fillRect(X - 4, Y, 6, H); x.fillRect(X + W - 2, Y, 6, H); x.fillRect(X + W * 0.62, Y, 5, H);
  return tex(c);
}

function panel(seed) {
  const [c, x] = canvas(256);
  x.fillStyle = '#e6e4df'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 10, seed);
  x.fillStyle = 'rgba(0,0,0,0.12)';
  for (let k = 0; k < 4; k++) x.fillRect(k * 64, 0, 2, 256);
  x.fillRect(0, 0, 256, 2);
  return tex(c);
}

function corrugated(seed) {
  const [c, x] = canvas(256);
  for (let k = 0; k < 256; k++) {
    const v = 150 + Math.sin(k / 256 * Math.PI * 2 * 12) * 40;
    x.fillStyle = `rgb(${v},${v + 4},${v + 8})`; x.fillRect(k, 0, 1, 256);
  }
  noise(x, 256, 256, 12, seed);
  x.fillStyle = 'rgba(70,60,50,0.12)';
  const r = makeRng(seed + 7);
  for (let k = 0; k < 12; k++) x.fillRect(r() * 256, 200 + r() * 56, 30, 4);
  return tex(c);
}

function roofGravel() {
  const [c, x] = canvas(256);
  x.fillStyle = '#8b8984'; x.fillRect(0, 0, 256, 256);
  const r = makeRng(91);
  for (let k = 0; k < 4000; k++) {
    const v = 100 + r() * 90;
    x.fillStyle = `rgba(${v},${v - 2},${v - 6},0.6)`;
    x.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  blotches(x, 256, 256, 12, ['rgba(60,60,58,A)'], 20, 60, 92, 0.2);
  return tex(c);
}

function roofTiles() {
  const [c, x] = canvas(256);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  const r = makeRng(95);
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      const v = 0.82 + r() * 0.18;
      const g = x.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
      g.addColorStop(0, `rgb(${170 * v},${170 * v},${170 * v})`);
      g.addColorStop(0.5, `rgb(${255 * v},${255 * v},${255 * v})`);
      g.addColorStop(1, `rgb(${150 * v},${150 * v},${150 * v})`);
      x.fillStyle = g;
      x.fillRect(i * 32 + (j % 2) * 16, j * 32, 32, 30);
      x.fillRect(i * 32 + (j % 2) * 16 - 256, j * 32, 32, 30);
    }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, j * 32 + 28, 256, 4);
  }
  return tex(c);
}

function signAtlas() {
  const [c, x] = canvas(1024, 512);
  const labels = ['BAR', 'PIZZERIA', 'FARMACIA', 'MARKET', 'TABACCHI', 'GELATERIA', 'BANCA', 'HOTEL',
    'BOUTIQUE', 'LIBRERIA', 'PANETTERIA', 'OTTICA', 'SUPERMERCATO', 'LOGISTICA', 'CAFFÈ', 'RISTORANTE'];
  const bgs = ['#1f4d3a', '#8c2a22', '#1b6b3a', '#c2461b', '#1e2b4a', '#d06a8f', '#24354f', '#3a2f4f',
    '#222222', '#5b3a24', '#a0602a', '#2b4f6f', '#c81f2d', '#2c5b8a', '#4a2a1f', '#7a1f2a'];
  labels.forEach((t, n) => {
    const col = n % 2, row = Math.floor(n / 2);
    const X = col * 512, Y = row * 64;
    x.fillStyle = bgs[n]; x.fillRect(X + 2, Y + 2, 508, 60);
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 3; x.strokeRect(X + 8, Y + 8, 496, 48);
    x.fillStyle = '#fffaf0';
    x.font = '700 38px "Segoe UI", Roboto, Arial, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, X + 256, Y + 34);
    if (t === 'FARMACIA') { x.fillStyle = '#3cff7a'; x.fillRect(X + 40, Y + 26, 30, 10); x.fillRect(X + 50, Y + 16, 10, 30); }
  });
  const t = tex(c, { repeat: false });
  return t;
}

// Pack several textures into one atlas so a whole chunk can be drawn with a
// single material. Returns the texture and the uv rectangle of each cell
// (inset by a few pixels to limit bleeding between cells).
function atlas(W, H, cells) {
  const [c, x] = canvas(W, H);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, W, H);
  const rects = {};
  for (const [key, { img, px, py, pw, ph }] of Object.entries(cells)) {
    if (img) x.drawImage(img, px, py, pw, ph);
    const inset = 3;
    rects[key] = [(px + inset) / W, 1 - (py + ph - inset) / H, (pw - 2 * inset) / W, (ph - 2 * inset) / H];
  }
  const t = tex(c, { repeat: false });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { texture: t, rects };
}

export function makeTextures(renderer) {
  const t = {
    asphalt: asphalt(), pavers: pavers(), grass: grass(), plaza: plaza(), gravel: gravel(),
    concrete: concrete(), lot: concrete('#8f8f8c', 65), flowers: soilFlowers(), water: water(),
    resA: facadeRes(true, 101), resB: facadeRes(false, 111), brick: facadeBrick(121),
    office: facadeOffice(131), officeC: facadeOfficeConcrete(141), shop: storefront(151),
    panel: panel(161), metal: corrugated(171), roofG: roofGravel(), roofT: roofTiles(), sign: signAtlas(),
    resC: facadeFrench(181), officeD: facadeOfficeDark(191),
  };
  const B = 256;
  const bcell = (img, cx, cy, cw = 1, ch = 1) => ({ img, px: cx * B, py: cy * B, pw: cw * B, ph: ch * B });
  const bld = atlas(2048, 1024, {
    resA: bcell(t.resA.image, 0, 0), resB: bcell(t.resB.image, 1, 0), brick: bcell(t.brick.image, 2, 0), office: bcell(t.office.image, 3, 0),
    officeC: bcell(t.officeC.image, 4, 0), shop: bcell(t.shop.image, 5, 0), panel: bcell(t.panel.image, 6, 0), metal: bcell(t.metal.image, 7, 0),
    roofG: bcell(t.roofG.image, 0, 1), roofT: bcell(t.roofT.image, 1, 1), white: bcell(null, 2, 1), water: bcell(t.water.image, 3, 1),
    resC: bcell(t.resC.image, 4, 1), officeD: bcell(t.officeD.image, 5, 1),
    sign: { img: t.sign.image, px: 0, py: 512, pw: 1024, ph: 512 },
  });
  const G = 512;
  const gcell = (img, cx, cy) => ({ img, px: cx * G, py: cy * G, pw: G, ph: G });
  const ground = atlas(2048, 2048, {
    asphalt: gcell(t.asphalt.image, 0, 0), pavers: gcell(t.pavers.image, 1, 0), grass: gcell(t.grass.image, 2, 0), plaza: gcell(t.plaza.image, 3, 0),
    gravel: gcell(t.gravel.image, 0, 1), concrete: gcell(t.concrete.image, 1, 1), lot: gcell(t.lot.image, 2, 1), flowers: gcell(t.flowers.image, 3, 1),
    water: gcell(t.water.image, 0, 2), white: gcell(null, 1, 2),
  });
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const v of Object.values(t)) v.anisotropy = aniso;
  bld.texture.anisotropy = ground.texture.anisotropy = aniso;
  for (const v of Object.values(t)) v.dispose();
  return { bldAtlas: bld, groundAtlas: ground };
}
