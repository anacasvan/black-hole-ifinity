// After `vite build`: inline the JS bundle and the CSS into a single HTML file
// that can be opened directly from disk (file://), without a web server.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, file) =>
  `<style>${fs.readFileSync(path.join(dist, file), 'utf8')}</style>`);
let bundle = null;
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (_, file) => {
  bundle = fs.readFileSync(path.join(dist, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '';
});
if (!bundle) throw new Error('Bundle script tag not found');
// The game script must run after the markup it uses, so it goes at the end of <body>.
html = html.replace('</body>', () => `<script type="module">${bundle}</script>\n</body>`);
if (/src="\.\/assets\//.test(html) || /href="\.\/assets\/[^"]+\.css"/.test(html)) throw new Error('Inlining failed');
const out = path.join(root, 'black-hole-infinity-earth.html');
fs.writeFileSync(out, html);
console.log(`Standalone build: ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} kB)`);
