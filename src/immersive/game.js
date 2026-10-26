
(()=>{'use strict';
const ASSET_DATA=__BHI_ASSET_DATA__;
const ART={};for(const [name,src] of Object.entries(ASSET_DATA)){const im=new Image();im.src=src;ART[name]=im;}

const canvas=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
const $=id=>document.getElementById(id);
const phases=[
 {name:'Giardino terrestre',next:'La Terra dall’alto',start:0,end:86,bg:['#193b38','#0e242c'],label:'un piccolo mondo',set:[['🍃','Foglia',0,9,1.7],['🌸','Fiore',4,11,2],['🪨','Sasso',9,12,2.3],['🪑','Panchina',17,16,3.2],['🌲','Albero',22,20,3.4],['🚦','Semaforo',30,22,3.8],['🚗','Automobile',39,25,4.5],['🏡','Casa',51,31,5],['🏢','Palazzo',62,38,6.2],['🏙️','Grattacielo',76,45,8]]},
 {name:'La Terra dall’alto',next:'Il Sistema Solare',start:86,end:186,bg:['#12446c','#08182f'],label:'un mondo intero',set:[['🏘️','Quartiere',86,10,2],['🏙️','Città',99,15,3],['🏝️','Isola',113,20,4],['⛰️','Montagna',125,25,4.5],['🌊','Oceano',140,30,5.5],['🌍','Continente',151,36,6],['🌕','Luna',162,40,7],['🌎','Terra',175,46,9]]},
 {name:'Sistema Solare',next:'La nostra galassia',start:186,end:306,bg:['#121a39','#050a1c'],label:'oltre l’atmosfera',set:[['☄️','Cometa',186,9,2.5],['🪨','Asteroide',197,13,3],['🛰️','Satellite',212,15,3.2],['🌑','Mercurio',225,19,4],['🔴','Marte',241,24,4.8],['🌎','Pianeta',256,30,5],['🪐','Saturno',270,35,6.2],['☀️','Sole',288,47,9]]},
 {name:'Via Lattea',next:'L’Universo',start:306,end:451,bg:['#24143d','#070c27'],label:'tra le stelle',set:[['✦','Stella',306,9,3],['✨','Ammasso stellare',325,14,3.8],['🌌','Nebulosa',345,22,4.8],['☀️','Sistema stellare',367,28,5.3],['💫','Supernova',389,36,6.3],['🌌','Galassia',419,47,9]]},
 {name:'Universo osservabile',next:'Il Multiverso',start:451,end:621,bg:['#2b193b','#07091d'],label:'senza confini',set:[['✨','Ammasso di galassie',451,10,3.2],['🌌','Superammasso',477,17,4],['💠','Filamento cosmico',509,24,5],['🌀','Vuoto cosmico',545,32,6.5],['🌠','Universo',588,47,10]]},
 {name:'Multiverso infinito',next:'Un nuovo universo',start:621,end:831,bg:['#222050','#060921'],label:'oltre l’infinito',set:[['🌟','Stella impossibile',621,10,3.5],['🌀','Universo specchio',650,16,4.3],['🌌','Cosmo alternativo',688,25,5],['💠','Dimensione',731,34,6.5],['🌠','Intero universo',783,47,10]]}
];
const saveKey='bhi-playable-v1';
let data={power:0,absorbed:0,x:0,y:0,universes:1,music:true,sfx:true,particles:true,volume:.32,zen:false},hasSave=false;
try{const raw=localStorage.getItem(saveKey);if(raw){data={...data,...JSON.parse(raw)};hasSave=true}}catch{}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),rand=(a,b)=>a+Math.random()*(b-a),dist=(a,b,c,d)=>Math.hypot(a-c,b-d);
let running=false,paused=true,objects=[],sparks=[],decor=[],prevPhase=-1,phaseIndex=0,phaseProgress=0,worldScale=1,displayScale=1,logicalW=375,logicalH=750,dpr=1,last=0,elapsed=0,camX=data.x,camY=data.y,screenShake=0,tutorialTime=0,toastTime=0,spawnTimer=0,audioCtx=null,musicNodes=[],input={down:false,x:0,y:0,keys:new Set()},scoreToneAt=0;
function stageFor(p){if(p>=621)return 5;return phases.findIndex(s=>p>=s.start&&p<s.end)}
function growth(){const p=stageFor(data.power),s=phases[p];return p===5?((data.power-621)%210)/210:clamp((data.power-s.start)/(s.end-s.start),0,1)}
function updateUniverse(){if(data.power>=621)data.universes=1+Math.floor((data.power-621)/210)+1;else data.universes=1}
function save(){try{localStorage.setItem(saveKey,JSON.stringify(data));hasSave=true}catch{}}
function resize(){dpr=Math.min(devicePixelRatio||1,1.7);logicalW=innerWidth;logicalH=innerHeight;canvas.width=Math.floor(logicalW*dpr);canvas.height=Math.floor(logicalH*dpr);canvas.style.width=logicalW+'px';canvas.style.height=logicalH+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
window.addEventListener('resize',resize);resize();
function randomDecors(){decor=Array.from({length:180},(_,i)=>({x:Math.random(),y:Math.random(),r:rand(.4,2.1),alpha:rand(.18,.68),drift:rand(.2,1.4),hue:rand(175,310),id:i}))}
randomDecors();
function setupPhase(force=false){updateUniverse();const next=stageFor(data.power);if(!force&&next===prevPhase)return;phaseIndex=next;prevPhase=next;const p=phases[next];objects=[];sparks=[];spawnTimer=0;for(let i=0;i<100;i++)spawn(true);randomDecors();if(!force){phaseFade=1;announce(next===5?'L’infinito ti aspetta':p.name,next===5?'Un nuovo universo nasce':'Un universo più grande da esplorare');playSound('milestone')};updateHud()}
function specForPower(){let s=phases[phaseIndex],offset=phaseIndex===5?Math.max(0,Math.floor((data.power-621)/210)*210):0;return s.set.map(v=>({emoji:v[0],name:v[1],req:v[2]+offset,r:v[3],reward:v[4]}))}
function spawn(initial=false){const candidates=specForPower();let eligible=candidates.filter(x=>x.req<=data.power+12&&x.req>=data.power-42);if(!eligible.length)eligible=candidates.filter(x=>x.req<=data.power+12);let selected;if(Math.random()<.16){const future=candidates.filter(x=>x.req>data.power&&x.req<data.power+35);selected=future.length?future[Math.floor(Math.random()*future.length)]:null}if(!selected){const choices=eligible.length?eligible:[candidates[0]];selected=choices[Math.floor(Math.pow(Math.random(),.85)*choices.length)]}
 const a=rand(0,Math.PI*2),far=initial?rand(65,Math.max(logicalW,logicalH)*.78):rand(Math.max(logicalW,logicalH)*.62,Math.max(logicalW,logicalH)*.9),x=data.x+Math.cos(a)*far,y=data.y+Math.sin(a)*far;
 const o={...selected,x,y,r:selected.r*rand(.85,1.15),angle:rand(-.18,.18),bob:rand(0,7),id:Math.random(),pull:false,shrink:1};objects.push(o)}
function targetRadius(){return 24+growth()*38}
function fmtCount(v){return v.toLocaleString('it-IT')}
function formatMass(){let exponent=Math.floor(data.power/12);let mantissa=(Math.pow(10,data.power/12-exponent)).toFixed(1);return `${mantissa} × 10^${exponent}`}
function updateHud(){const st=stageFor(data.power),p=phases[st],pro=growth();$('stage').textContent=p.name;$('universe').textContent='UNIVERSO '+String(data.universes).padStart(2,'0');$('collected').textContent=fmtCount(data.absorbed)+' assorbiti';$('level').textContent='Dimensione · '+p.label;$('next').textContent=st===5?'Prossimo universo · '+(Math.floor(pro*100))+'%':'Prossimo: '+p.next;$('progress').style.width=(pro*100).toFixed(2)+'%';$('zen').textContent=data.zen?'◉ Zen attiva':'◯ Zen';$('zen').setAttribute('aria-pressed',String(data.zen))}
function announce(title,sub){$('toast-title').textContent=title;$('toast-sub').textContent=sub;$('toast').classList.add('show');toastTime=3.2}
function pulse(x,y,color,count=9){if(!data.particles)return;for(let i=0;i<count;i++){let a=rand(0,Math.PI*2),v=rand(20,85);sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.3,.85),max:.85,color,r:rand(1,4)})}if(sparks.length>230)sparks.splice(0,sparks.length-230)}
function initAudio(){try{if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();startAmbient()}if(audioCtx.state==='suspended')audioCtx.resume();updateAudio()}catch{}}
function startAmbient(){if(!audioCtx)return;const root=audioCtx.createGain();root.gain.value=0;root.connect(audioCtx.destination);musicNodes=[root];[110,164.81,220,329.63].forEach((f,i)=>{const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=f;gain.gain.value=i===0?.10:.035;osc.connect(gain).connect(root);osc.start();musicNodes.push(osc)})}
function updateAudio(){if(!audioCtx)return;const root=musicNodes[0];if(root)root.gain.setTargetAtTime(data.music?data.volume*.34:0,audioCtx.currentTime,.2)}
function playSound(type){if(!data.sfx||!audioCtx||audioCtx.state!=='running')return;const now=audioCtx.currentTime;if(type==='take'&&now-scoreToneAt<.055)return;scoreToneAt=now;try{const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';let base=type==='milestone'?440:rand(245,430);osc.frequency.setValueAtTime(base,now);osc.frequency.exponentialRampToValueAtTime(type==='milestone'?660:base*.48,now+.18);gain.gain.setValueAtTime(0.0001,now);gain.gain.exponentialRampToValueAtTime((type==='milestone'?.08:.035)*data.volume,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.32);osc.connect(gain).connect(audioCtx.destination);osc.start(now);osc.stop(now+.34)}catch{}}
function start(){initAudio();paused=false;running=true;$('menu').classList.add('hidden');$('pausePanel').classList.add('hidden');$('settingsPanel').classList.add('hidden');$('hud').classList.remove('hidden');$('footer').classList.remove('hidden');tutorialTime=10;updateHud();save()}
function stop(){paused=true;save();input.down=false;jEl.classList.remove('visible')}
function setOverlay(id){stop();$('menu').classList.add('hidden');$('pausePanel').classList.add('hidden');$('settingsPanel').classList.add('hidden');$(id).classList.remove('hidden')}
$('play').onclick=start;$('resume').onclick=start;$('pause').onclick=()=>setOverlay('pausePanel');$('backMenu').onclick=()=>{$('hud').classList.add('hidden');$('footer').classList.add('hidden');$('play').textContent='Continua l’esplorazione ↗';setOverlay('menu')};$('menuSettings').onclick=()=>{settingsFrom='menu';setOverlay('settingsPanel')};let settingsFrom='pausePanel';$('pauseSettings').onclick=()=>{settingsFrom='pausePanel';setOverlay('settingsPanel')};$('closeSettings').onclick=()=>{setOverlay(settingsFrom);if(settingsFrom==='menu'){$('hud').classList.add('hidden');$('footer').classList.add('hidden')}};
$('zen').onclick=()=>{data.zen=!data.zen;input.down=false;save();updateHud();announce(data.zen?'Modalità Zen attiva':'Modalità Zen disattivata',data.zen?'Il buco nero esplora lentamente da solo':'Riprendi il controllo con un dito')};
function toggleOption(id,k){$(id).onclick=()=>{data[k]=!data[k];syncSettings();updateAudio();save()}}
for(const [id,k] of [['music','music'],['sfx','sfx'],['particles','particles']])toggleOption(id,k);
function syncSettings(){for(const id of ['music','sfx','particles']){$(id).textContent=data[id]?'ON':'OFF';$(id).classList.toggle('on',data[id])}$('volume').value=Math.round(data.volume*100)}
$('volume').oninput=e=>{data.volume=Number(e.target.value)/100;updateAudio();save()};syncSettings();
$('reset').onclick=()=>{if(!confirm('Vuoi davvero ricominciare dal piccolo giardino? I progressi verranno cancellati.'))return;data.power=0;data.absorbed=0;data.x=0;data.y=0;data.universes=1;data.zen=false;camX=0;camY=0;prevPhase=-1;setupPhase(true);save();settingsFrom='menu';$('play').textContent='Entra nell’universo &nbsp; ↗';$('hud').classList.add('hidden');$('footer').classList.add('hidden');setOverlay('menu')};
if(hasSave)$('play').textContent='Continua l’esplorazione ↗';
function localPos(e){const rect=canvas.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top}}
let joystickAnchor={x:0,y:0},joystickX=0,joystickY=0;
const jEl=$('joystick'),sEl=$('stick');
function updateStick(e){const p=localPos(e);input.x=p.x;input.y=p.y;const ax=p.x-joystickAnchor.x,ay=p.y-joystickAnchor.y,d=Math.hypot(ax,ay),m=Math.min(48,d);joystickX=d>7?ax/d*Math.min(1,d/52):0;joystickY=d>7?ay/d*Math.min(1,d/52):0;sEl.style.transform=`translate(${d?ax/d*m:0}px,${d?ay/d*m:0}px)`}
canvas.addEventListener('pointerdown',e=>{if(paused)return;input.down=true;const p=localPos(e);input.x=p.x;input.y=p.y;joystickAnchor=p;jEl.style.left=p.x+'px';jEl.style.top=p.y+'px';jEl.classList.add('visible');sEl.style.transform='';joystickX=0;joystickY=0;canvas.setPointerCapture?.(e.pointerId);initAudio()});
canvas.addEventListener('pointermove',e=>{if(!input.down)return;updateStick(e)});
function release(){input.down=false;joystickX=0;joystickY=0;jEl.classList.remove('visible')}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();input.keys.add(e.key.toLowerCase());if(e.key==='Escape'&&running&&!paused)setOverlay('pausePanel')});window.addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase()));
// One camera, textured environments and material-shaded sprites. Generated images are original game assets.
let absorptionPulse=0,phaseFade=0,pickupTimer=0;
function tileImage(img,offX,offY,size=1024){if(!img||!img.complete||!img.naturalWidth)return;const x0=((offX%size)+size)%size-size,y0=((offY%size)+size)%size-size;for(let x=x0;x<logicalW;x+=size)for(let y=y0;y<logicalH;y+=size)ctx.drawImage(img,x,y,size,size)}
function coverImage(img,offsetX,offsetY,zoom=1.18){if(!img||!img.complete||!img.naturalWidth)return;const size=Math.max(logicalW,logicalH)*zoom,dx=((offsetX%size)+size)%size-size,dy=((offsetY%size)+size)%size-size;for(let x=dx;x<logicalW;x+=size)for(let y=dy;y<logicalH;y+=size)ctx.drawImage(img,x,y,size,size)}
function drawBackground(t){
 ctx.fillStyle='#070e19';ctx.fillRect(0,0,logicalW,logicalH);
 if(phaseIndex===0){ctx.fillStyle='#5e7851';ctx.fillRect(0,0,logicalW,logicalH);tileImage(ART.terrain,-camX+logicalW*.5-340,-camY+logicalH*.5-180,1024);
   const light=ctx.createLinearGradient(0,0,logicalW,logicalH);light.addColorStop(0,'#fff4cb1d');light.addColorStop(.5,'#ffffff00');light.addColorStop(1,'#0c251a4d');ctx.fillStyle=light;ctx.fillRect(0,0,logicalW,logicalH);
 }else if(phaseIndex===1){ctx.fillStyle='#12486b';ctx.fillRect(0,0,logicalW,logicalH);tileImage(ART.orbit,-camX*.60+200,-camY*.60+180,1024);ctx.fillStyle='#0d4b8932';ctx.fillRect(0,0,logicalW,logicalH);
 }else{
   const id='nebula'+Math.min(3,Math.max(0,phaseIndex-2));coverImage(ART[id],-camX*.055,-camY*.055,1.10);
   if(phaseIndex===5){ctx.fillStyle=`hsla(${(data.universes*43+199)%360},70%,28%,.17)`;ctx.fillRect(0,0,logicalW,logicalH)}
 }
 const ground=phaseIndex<2;
 for(const d of decor){let speed=ground?.006:.04*d.drift;
   let x=((d.x*logicalW-camX*speed)%logicalW+logicalW)%logicalW,y=((d.y*logicalH-camY*speed)%logicalH+logicalH)%logicalH;
   if(ground)continue;
   ctx.globalAlpha=d.alpha*(.76+.24*Math.sin(t*.5+d.id));ctx.fillStyle=d.id%6===0?'#ffdeb7':'#c5deff';ctx.beginPath();ctx.arc(x,y,d.r*.7,0,Math.PI*2);ctx.fill();
 }
 ctx.globalAlpha=1;
 const grd=ctx.createRadialGradient(logicalW*.46,logicalH*.44,logicalW*.12,logicalW*.5,logicalH*.5,Math.max(logicalW,logicalH)*.82);
 grd.addColorStop(0,'#00000000');grd.addColorStop(1,ground?'#05110d46':'#0305118a');ctx.fillStyle=grd;ctx.fillRect(0,0,logicalW,logicalH);
}
function artKey(n){n=n.toLowerCase();
 if(n.includes('foglia'))return 'nature';if(n.includes('fiore'))return 'flower';if(n.includes('sasso'))return 'stone';if(n.includes('panchina')||n.includes('semaforo'))return 'furniture';if(n.includes('albero'))return 'tree';if(n.includes('auto'))return 'vehicle';if(n.includes('casa')||n.includes('quartiere'))return 'house';if(n.includes('palazzo')||n.includes('grattacielo')||n.includes('città'))return 'tower';
 if(n.includes('luna'))return 'moon';if(n.includes('mercurio'))return 'mercury';if(n.includes('marte'))return 'mars';if(n.includes('terra')||n.includes('continente')||n==='pianeta')return 'earth';if(n.includes('saturno'))return 'saturn';if(n.includes('sole'))return 'sun';if(n.includes('asteroide')||n.includes('montagna'))return 'asteroid';if(n.includes('cometa'))return 'sun';if(n.includes('satellite'))return 'satellite';if(n.includes('oceano')||n.includes('isola'))return 'earth';if(n.includes('stella')||n.includes('supernova')||n.includes('sistema stellare'))return 'sun';if(n.includes('galass')||n.includes('ammasso')||n.includes('universo')||n.includes('dimensione')||n.includes('cosmo')||n.includes('nebul')||n.includes('filamento')||n.includes('vuoto'))return 'galaxy';return 'neptune';
}
function drawItem(o,sx,sy,t){
 const r=o.r*o.shrink,canTake=o.req<=data.power,near=Math.hypot(sx-logicalW/2,sy-logicalH/2)<140;
 const name=artKey(o.name),im=ART[name];if(!im||!im.complete||!im.naturalWidth)return;
 const terrestrial=phaseIndex<2,sphere=['earth','moon','mercury','mars','jupiter','saturn','neptune','sun','asteroid'].includes(name);
 let size=r*(sphere?2.7:3.05);
 if(name==='galaxy')size=r*3.8;
 ctx.save();ctx.translate(sx,sy+Math.sin(t*.73+o.bob)*(terrestrial?.7:2.3));ctx.rotate(o.angle*.7);
 if(!terrestrial&&['sun','galaxy'].includes(name)){let halo=ctx.createRadialGradient(0,0,size*.12,0,0,size*.86);halo.addColorStop(0,name==='sun'?'#ffbc5a66':'#a5a6ff4a');halo.addColorStop(1,'#ffffff00');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,size*.86,0,Math.PI*2);ctx.fill()}
 // Shadows are pre-baked into the sprite textures for performance on mobile.
 if(!canTake && near){ctx.globalAlpha=.65;ctx.strokeStyle='#f1c69f79';ctx.lineWidth=1.1;ctx.setLineDash([2,5]);ctx.beginPath();ctx.arc(0,0,r*1.45,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}
 if(!canTake && !sphere)ctx.globalAlpha=.84;
 ctx.drawImage(im,-size/2,-size/2,size,size);
 if(name==='saturn'){
  ctx.save();ctx.rotate(-.29);ctx.lineWidth=size*.075;ctx.strokeStyle='#a88966a8';ctx.beginPath();ctx.ellipse(0,0,size*.57,size*.24,0,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#e9d0a4d0';ctx.lineWidth=size*.045;ctx.beginPath();ctx.ellipse(0,0,size*.57,size*.24,0,Math.PI*.03,Math.PI*.95);ctx.stroke();ctx.restore()
 }
 ctx.restore();
}
function drawHole(t){
 const x=logicalW/2+(data.x-camX),y=logicalH/2+(data.y-camY),r=targetRadius()*(1+absorptionPulse*.06);
 ctx.save();ctx.translate(x,y);ctx.rotate(-.20+t*.035);
 // Photons bending around the silhouette, soft gravitational lensing and accretion glow.
 for(let i=0;i<3;i++){const a=r*(1.25+i*.32),g=ctx.createRadialGradient(0,0,r*.76,0,0,a);g.addColorStop(0,'#09090700');g.addColorStop(.5,'#d1884222');g.addColorStop(1,'#cd955000');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,a,0,Math.PI*2);ctx.fill()}
 ctx.save();ctx.scale(1.45,.66);ctx.rotate(.05);
 ctx.shadowColor='#f9ab68';ctx.shadowBlur=17;
 ctx.lineWidth=r*.27;ctx.strokeStyle='#ad59398d';ctx.beginPath();ctx.ellipse(0,0,r*1.04,r*.94,0,0,Math.PI*2);ctx.stroke();
 ctx.lineWidth=r*.10;ctx.strokeStyle='#ffe2a5cb';ctx.beginPath();ctx.ellipse(0,0,r*1.08,r*.97,0,t*.25,t*.25+Math.PI*1.65);ctx.stroke();
 ctx.restore();
 const rim=ctx.createRadialGradient(-r*.2,-r*.2,r*.2,0,0,r*1.1);rim.addColorStop(0,'#020206');rim.addColorStop(.72,'#020307');rim.addColorStop(.82,'#38211a');rim.addColorStop(.90,'#d8a36a');rim.addColorStop(.97,'#f9e6b4');rim.addColorStop(1,'#ffffff00');ctx.fillStyle=rim;ctx.beginPath();ctx.arc(0,0,r*1.1,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#010203';ctx.beginPath();ctx.arc(0,0,r*.77,0,Math.PI*2);ctx.fill();
 // Brighter front part of the hot disk, physically inspired perspective.
 ctx.save();ctx.scale(1.45,.66);ctx.lineCap='round';ctx.shadowBlur=9;ctx.shadowColor='#ffce8b';ctx.strokeStyle='#ffd59eab';ctx.lineWidth=r*.125;ctx.beginPath();ctx.ellipse(0,0,r*1.10,r*.96,0,Math.PI*.08,Math.PI*.87);ctx.stroke();ctx.restore();
 for(let i=0;i<18;i++){let a=i*2.399+t*(.17+i%3*.07),rad=r*(.83+Math.sin(i*5.1)*.25);ctx.fillStyle=i%4?'#ffcc9166':'#fff3d5b0';ctx.beginPath();ctx.arc(Math.cos(a)*rad,Math.sin(a)*rad*.72,Math.max(.7,r*.012)*(1+i%3*.2),0,Math.PI*2);ctx.fill()}
 ctx.restore();
}
function drawAtmosphere(t){if(phaseIndex!==1)return;
 // Orbital haze / blue limb, applied over the topographic base.
 const g=ctx.createLinearGradient(0,0,0,logicalH);g.addColorStop(0,'#5ca0be1c');g.addColorStop(1,'#06102d60');ctx.fillStyle=g;ctx.fillRect(0,0,logicalW,logicalH);
}
function render(t){
 ctx.clearRect(0,0,logicalW,logicalH);drawBackground(t);drawAtmosphere(t);
 for(const o of objects){const x=(o.x-camX)+logicalW/2,y=(o.y-camY)+logicalH/2;if(x<-110||x>logicalW+110||y<-110||y>logicalH+110)continue;drawItem(o,x,y,t)}
 for(const p of sparks){const x=p.x-camX+logicalW/2,y=p.y-camY+logicalH/2;ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.strokeStyle=p.color;ctx.lineWidth=p.r*.56;ctx.beginPath();ctx.moveTo(x-p.vx*.035,y-p.vy*.035);ctx.lineTo(x,y);ctx.stroke()}ctx.globalAlpha=1;
 drawHole(t);
 if(phaseFade>0){ctx.fillStyle=`rgba(7,11,21,${phaseFade*.72})`;ctx.fillRect(0,0,logicalW,logicalH)}
}
function act(dt){elapsed+=dt;phaseProgress=growth();const speed=clamp(198-(growth()*30),145,198),keys=input.keys;
 let dx=0,dy=0;
 if(keys.has('arrowleft')||keys.has('a'))dx-=1;if(keys.has('arrowright')||keys.has('d'))dx+=1;if(keys.has('arrowup')||keys.has('w'))dy-=1;if(keys.has('arrowdown')||keys.has('s'))dy+=1;
 if(input.down&&!data.zen){dx+=joystickX;dy+=joystickY}
 if(data.zen&&!input.down&&dx===0&&dy===0){let best=null,bd=Infinity;for(const o of objects){if(o.req>data.power)continue;let d=dist(data.x,data.y,o.x,o.y);if(d<bd){bd=d;best=o}}if(best){dx=best.x-data.x;dy=best.y-data.y}}
 let mag=Math.hypot(dx,dy);if(mag>0){data.x+=(dx/mag)*speed*dt*(data.zen?.62:1);data.y+=(dy/mag)*speed*dt*(data.zen?.62:1)}
 if(Math.abs(data.x)>2e6||Math.abs(data.y)>2e6){const sx=data.x,sy=data.y;for(const o of objects){o.x-=sx;o.y-=sy}for(const p of sparks){p.x-=sx;p.y-=sy}data.x=0;data.y=0;camX-=sx;camY-=sy}camX+=(data.x-camX)*Math.min(1,dt*9);camY+=(data.y-camY)*Math.min(1,dt*9);absorptionPulse=Math.max(0,absorptionPulse-dt*2.8);phaseFade=Math.max(0,phaseFade-dt*.85);pickupTimer-=dt;if(pickupTimer<=0)$('pickup').classList.remove('visible');
 const r=targetRadius();for(let i=objects.length-1;i>=0;i--){let o=objects[i],d=dist(data.x,data.y,o.x,o.y);if(o.req<=data.power&&d<r+o.r+38){const a=Math.atan2(data.y-o.y,data.x-o.x),strength=clamp((r+o.r+38-d)/(r+o.r+38),0,1);o.x+=Math.cos(a)*dt*(50+250*strength);o.y+=Math.sin(a)*dt*(50+250*strength);o.angle+=dt*1.9*strength;o.shrink=Math.max(.15,o.shrink-dt*.85*strength);if(d<r*.65+5){data.power+=o.reward;data.absorbed++;absorptionPulse=Math.min(1,absorptionPulse+.5);$('pickup').textContent='+'+o.reward.toFixed(1)+' MASSA';$('pickup').classList.add('visible');pickupTimer=.38;pulse(o.x,o.y,phaseIndex>=2?'#c5adff':'#8affdf',6);playSound('take');objects.splice(i,1);if(data.power>=phases[phaseIndex].end&&phaseIndex<5){setupPhase();break}if(phaseIndex===5){const oldU=data.universes;updateUniverse();if(data.universes!==oldU){objects=[];setupPhase(true);phaseFade=1;announce('Universo '+data.universes,'Ogni fine è un nuovo inizio ✨');playSound('milestone')}}}}
 if(Math.hypot(o.x-data.x,o.y-data.y)>Math.max(logicalW,logicalH)*1.6)objects.splice(i,1)}
 if(objects.length<115){for(let n=0;n<Math.min(6,115-objects.length);n++)spawn()}
 for(let i=sparks.length-1;i>=0;i--){let p=sparks[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt;if(p.life<=0)sparks.splice(i,1)}
 if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').classList.remove('show')}
 if(tutorialTime>0){tutorialTime-=dt;if(tutorialTime<=0)$('hint').textContent='Esplora al tuo ritmo'}
 spawnTimer+=dt;if(spawnTimer>.3){spawnTimer=0;updateHud()}}
 let lastRender=0;function frame(ts){let dt=Math.min((ts-last)/1000||0,.05);last=ts;if(!paused)act(dt);if(!paused||ts-lastRender>220){render(ts/1000);lastRender=ts}requestAnimationFrame(frame)}
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused){setOverlay('pausePanel')}});window.addEventListener('pagehide',save);setInterval(()=>{if(running&&!paused)save()},4000);
 setupPhase(true);requestAnimationFrame(frame);
 window.__BHI_DEBUG__={get state(){return {...data,phase:phaseIndex,objects:objects.length}},testAdvance(v=85){data.power+=v;setupPhase();updateHud();save()},get canvas(){return canvas}};
})();
