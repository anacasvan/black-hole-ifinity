const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let ts;
try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const project=path.join(__dirname,'..');
for(const file of ['src/game/content.ts','src/game/state.ts','src/game/bus.ts','src/game/sound.ts','src/game/GameScene.ts','src/ui/App.tsx','src/main.tsx','vite.config.ts','capacitor.config.ts']){
 const source=fs.readFileSync(path.join(project,file),'utf8');
 const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.ESNext,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 assert.equal(parsed.parseDiagnostics.length,0,`${file}: ${parsed.parseDiagnostics.map(d=>d.messageText).join('; ')}`);
}
const source=fs.readFileSync(path.join(project,'src/game/content.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const modExports={};new Function('exports',js)(modExports);
const {getStageIndex,progressInStage,getUniverse,getAvailableSpecs,formatMass}=modExports;
assert.equal(getStageIndex(0),0);assert.equal(getStageIndex(85),0);assert.equal(getStageIndex(86),1);
assert.equal(getStageIndex(186),2);assert.equal(getStageIndex(306),3);assert.equal(getStageIndex(451),4);assert.equal(getStageIndex(621),5);
assert.equal(getStageIndex(10500),5);assert.equal(getUniverse(620),1);assert.equal(getUniverse(621),2);assert.equal(getUniverse(831),3);
assert.equal(progressInStage(831),0);assert.ok(Math.abs(progressInStage(726)-.5)<1e-6);
assert.ok(getAvailableSpecs(831).some(s=>s.req===831));
assert.ok(formatMass(10000).includes('10^'));
console.log('✓ Syntax TS/TSX valida; passaggi delle sei fasi, multiverso e progressione verificati.');
