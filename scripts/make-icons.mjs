// Generates the app icons (PNG) in public/icons using headless Edge/Chrome.
// Run once with: node scripts/make-icons.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const svg = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2440"/><stop offset="1" stop-color="#070a12"/></linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="48%" stop-color="#8ea2ff" stop-opacity="0"/><stop offset="66%" stop-color="#b9c4ff" stop-opacity="0.85"/><stop offset="100%" stop-color="#6f7cff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg)"/>
  <circle cx="60" cy="60" r="46" fill="url(#halo)"/>
  <ellipse cx="60" cy="60" rx="44" ry="12" fill="none" stroke="#dfe5ff" stroke-opacity="0.55" stroke-width="2" transform="rotate(-18 60 60)"/>
  <circle cx="60" cy="60" r="24" fill="#000"/>
  <circle cx="60" cy="60" r="24.6" fill="none" stroke="#e6ebff" stroke-width="1.6"/>
</svg>`;

fs.mkdirSync('public/icons', { recursive: true });
let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel, headless: true }); break; } catch { /* try next */ }
}
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(size)}</body></html>`);
  await page.screenshot({ path: `public/icons/icon-${size}.png`, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written to public/icons');
