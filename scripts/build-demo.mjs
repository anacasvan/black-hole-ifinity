// Offline single-file game bundler. Run with Node, no external dependencies.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const get=name=>fs.readFileSync(path.join(root,name),'utf8');
const assets=['terrain3d.jpg','nebula0.jpg','nebula1.jpg','nebula2.jpg','nebula3.jpg'];
const data=Object.fromEntries(assets.map(filename=>{
 const ext=path.extname(filename).slice(1),type=ext==='jpg'?'jpeg':ext;
 return [path.basename(filename,`.${ext}`),`data:image/${type};base64,${fs.readFileSync(path.join(root,'assets',filename)).toString('base64')}`];
}));
const classic=fs.readFileSync(path.join(root,'classic-v2.html')).toString('base64');
const source=get('src/three-d/game.js').replace('__BHI_ASSET_DATA__',JSON.stringify(data)).replace('__BHI_CLASSIC_FALLBACK__',classic);
if(source.includes('__BHI_ASSET_DATA__')||source.includes('__BHI_CLASSIC_FALLBACK__'))throw new Error('Asset embedding failed');
const final=get('src/three-d/shell.html').replace('<!--BHI_STYLE-->',get('src/three-d/style.css')).replace('<!--BHI_SCRIPT-->',source);
for(const dest of ['demo.html','public/demo.html'])fs.writeFileSync(path.join(root,dest),final);
console.log(`Gravity 3D Edition ready: ${(final.length/1024/1024).toFixed(2)} MB standalone HTML (WebGL2, offline).`);
