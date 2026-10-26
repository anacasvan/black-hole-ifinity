import Phaser from 'phaser';
import {getAvailableSpecs,getStageIndex,getUniverse,progressInStage,STAGES,type ItemKind,type ItemSpec} from './content';
import {emitHud,emitNotice} from './bus';
import {loadGame,newGame,saveGame,type SaveData,type Settings} from './state';
import {SoundManager} from './sound';

interface WorldItem extends ItemSpec {x:number;y:number;rotation:number;wave:number;size:number}
interface Particle {x:number;y:number;vx:number;vy:number;life:number;max:number;color:number;size:number}
interface Star {x:number;y:number;size:number;alpha:number;layer:number}
const rand=(min:number,max:number)=>min+Math.random()*(max-min);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const distance=(a:number,b:number,c:number,d:number)=>Math.hypot(a-c,b-d);

export class GameScene extends Phaser.Scene {
 private save:SaveData=loadGame();
 private audioEngine=new SoundManager(this.save.settings);
 private paused=true;
 private dragging=false;
 private target={x:0,y:0};
 private bg!:Phaser.GameObjects.Graphics;
 private world!:Phaser.GameObjects.Graphics;
 private hole!:Phaser.GameObjects.Graphics;
 private items:WorldItem[]=[];
 private particles:Particle[]=[];
 private stars:Star[]=[];
 private currentStage=-1;
 private currentUniverse=1;
 private elapsed=0;
 private lastHud=0;
 private lastSave=0;
 private cursors?:Record<string,Phaser.Input.Keyboard.Key>;

 constructor(){super('BlackHoleInfinity')}
 create(){
  this.bg=this.add.graphics().setScrollFactor(0).setDepth(-10);
  this.world=this.add.graphics().setDepth(1);
  this.hole=this.add.graphics().setDepth(3);
  this.cursors=this.input.keyboard?.addKeys({up:Phaser.Input.Keyboard.KeyCodes.UP,down:Phaser.Input.Keyboard.KeyCodes.DOWN,left:Phaser.Input.Keyboard.KeyCodes.LEFT,right:Phaser.Input.Keyboard.KeyCodes.RIGHT,w:Phaser.Input.Keyboard.KeyCodes.W,a:Phaser.Input.Keyboard.KeyCodes.A,s:Phaser.Input.Keyboard.KeyCodes.S,d:Phaser.Input.Keyboard.KeyCodes.D}) as Record<string,Phaser.Input.Keyboard.Key>|undefined;
  this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{if(this.paused)return;this.dragging=true;this.target={x:pointer.x,y:pointer.y};void this.audioEngine.resume()});
  this.input.on('pointermove',(pointer:Phaser.Input.Pointer)=>{if(!this.dragging)return;this.target={x:pointer.x,y:pointer.y}});
  this.input.on('pointerup',()=>{this.dragging=false});
  this.input.on('pointerupoutside',()=>{this.dragging=false});
  this.input.on('gameout',()=>{this.dragging=false});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){this.setPaused(true);saveGame(this.save)}});
  this.scale.on('resize',()=>{this.makeStars()});
  this.makeStars();this.configureWorld(true);emitHud(this.save);
 }
 private makeStars(){this.stars=Array.from({length:160},()=>({x:Math.random(),y:Math.random(),size:rand(.4,2),alpha:rand(.16,.85),layer:rand(.02,.18)}))}
 private factor(){return Math.pow(1.75,getStageIndex(this.save.power))}
 private holeRadius(){return (24+progressInStage(this.save.power)*38)*this.factor()}
 private areaRadius(){return Math.max(this.scale.width,this.scale.height)*this.factor()}
 private configureWorld(force=false){
  const stage=getStageIndex(this.save.power),universe=getUniverse(this.save.power);
  if(!force&&stage===this.currentStage&&universe===this.currentUniverse)return;
  const wasStage=this.currentStage;
  this.currentStage=stage;this.currentUniverse=universe;
  this.items=[];this.particles=[];
  // Ogni transizione rappresenta un cambio di scala cosmica; il giocatore resta al centro.
  if(!force){this.save.x=0;this.save.y=0;this.cameras.main.centerOn(0,0)}
  for(let i=0;i<130;i++)this.spawn(true);
  this.makeStars();
  if(!force){emitNotice(stage===5?'Nuovo universo da scoprire':STAGES[stage].name,wasStage===stage?'Ogni fine è un nuovo inizio ✨':'Il cosmo si apre davanti a te');this.audioEngine.effect(true);saveGame(this.save)}
 }
 private available(){return getAvailableSpecs(this.save.power)}
 private spawn(initial=false){
  const all=this.available();
  const eligible=all.filter(o=>o.req<=this.save.power+12&&o.req>=this.save.power-42);
  const possible=eligible.length?eligible:all.filter(o=>o.req<=this.save.power+12);
  let selected:ItemSpec|undefined;
  if(Math.random()<.16){const future=all.filter(o=>o.req>this.save.power&&o.req<this.save.power+35);if(future.length)selected=future[Math.floor(Math.random()*future.length)]}
  if(!selected){const pool=possible.length?possible:[all[0]];selected=pool[Math.floor(Math.random()*pool.length)]}
  const a=rand(0,Math.PI*2),far=initial?rand(85,this.areaRadius()*.88):rand(this.areaRadius()*.66,this.areaRadius()*.92);
  this.items.push({...selected,x:this.save.x+Math.cos(a)*far,y:this.save.y+Math.sin(a)*far,rotation:rand(-.25,.25),wave:rand(0,8),size:rand(.87,1.13)});
 }
 setPaused(value:boolean){this.paused=value;if(value){saveGame(this.save);this.dragging=false}else void this.audioEngine.resume()}
 isPaused(){return this.paused}
 getSave(){return this.save}
 setSettings(settings:Settings){this.save.settings={...settings};this.audioEngine.updateSettings(settings);saveGame(this.save);emitHud(this.save)}
 resetGame(){this.save={...newGame(),settings:{...this.save.settings,zen:false}};this.currentStage=-1;this.configureWorld(true);emitHud(this.save);saveGame(this.save)}
 private sparkle(x:number,y:number,color:number){if(!this.save.settings.particles)return;for(let i=0;i<7;i++){const a=rand(0,Math.PI*2),v=rand(20,85)*this.factor();this.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.3,.75),max:.75,color,size:rand(1,4)*this.factor()})}if(this.particles.length>220)this.particles.splice(0,this.particles.length-220)}
 private move(dt:number){
  let dx=0,dy=0;const k=this.cursors;
  if(k){if(k.left.isDown||k.a.isDown)dx--;if(k.right.isDown||k.d.isDown)dx++;if(k.up.isDown||k.w.isDown)dy--;if(k.down.isDown||k.s.isDown)dy++}
  if(this.dragging&&!this.save.settings.zen){const ox=this.target.x-this.scale.width/2,oy=this.target.y-this.scale.height/2,d=Math.hypot(ox,oy);if(d>20){dx+=ox/d*Math.min(d/105,1);dy+=oy/d*Math.min(d/105,1)}}
  if(this.save.settings.zen&&!this.dragging&&dx===0&&dy===0){let closest:WorldItem|undefined,closestDist=Infinity;for(const item of this.items){if(item.req>this.save.power)continue;const dist=distance(item.x,item.y,this.save.x,this.save.y);if(dist<closestDist){closestDist=dist;closest=item}}if(closest){dx=closest.x-this.save.x;dy=closest.y-this.save.y}}
  const len=Math.hypot(dx,dy);if(len>0){const speed=(185-30*progressInStage(this.save.power))*this.factor()*(this.save.settings.zen?.65:1);this.save.x+=dx/len*speed*dt;this.save.y+=dy/len*speed*dt}
  // Rinumera le coordinate a intervalli molto ampi, prevenendo errori float nella navigazione infinita.
  if(Math.abs(this.save.x)>2e6||Math.abs(this.save.y)>2e6){const shiftX=this.save.x,shiftY=this.save.y;for(const item of this.items){item.x-=shiftX;item.y-=shiftY}for(const p of this.particles){p.x-=shiftX;p.y-=shiftY}this.save.x=0;this.save.y=0}
 }
 private updateItems(dt:number){
  const radius=this.holeRadius();
  for(let i=this.items.length-1;i>=0;i--){
   const item=this.items[i],d=distance(item.x,item.y,this.save.x,this.save.y),r=item.radius*item.size*this.factor();
   if(item.req<=this.save.power&&d<radius+r+40*this.factor()){
    const a=Math.atan2(this.save.y-item.y,this.save.x-item.x),strength=clamp((radius+r+40*this.factor()-d)/(radius+r+40*this.factor()),0,1);
    item.x+=Math.cos(a)*dt*(60+260*strength)*this.factor();item.y+=Math.sin(a)*dt*(60+260*strength)*this.factor();item.rotation+=dt*1.6*strength;
    if(d<radius*.7){this.save.power+=item.gain;this.save.absorbed++;this.sparkle(item.x,item.y,item.color);this.audioEngine.effect();this.items.splice(i,1);this.configureWorld();break}
   }
   if(distance(item.x,item.y,this.save.x,this.save.y)>this.areaRadius()*1.7)this.items.splice(i,1);
  }
  while(this.items.length<140)this.spawn();
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0)this.particles.splice(i,1)}
 }
 update(_time:number,delta:number){
  const dt=Math.min(delta/1000,.05);this.elapsed+=dt;
  if(!this.paused){this.move(dt);this.updateItems(dt);this.lastHud+=dt;this.lastSave+=dt;if(this.lastHud>.20){this.lastHud=0;emitHud(this.save)}if(this.lastSave>4){this.lastSave=0;saveGame(this.save)}}
  this.cameras.main.setZoom(1/this.factor());
  this.cameras.main.centerOn(this.save.x,this.save.y);
  this.renderBackground();this.renderWorld();this.renderHole();
 }
 private renderBackground(){
  const g=this.bg,w=this.scale.width,h=this.scale.height,stage=this.currentStage<0?0:this.currentStage;
  g.clear();const zoomFactor=this.factor();g.setScale(zoomFactor);g.setPosition((1-zoomFactor)*w/2,(1-zoomFactor)*h/2);const bg=stage===5?Phaser.Display.Color.HSLToColor(((this.currentUniverse*37+231)%360)/360,.43,.18).color:STAGES[stage].background;g.fillStyle(bg,1);g.fillRect(0,0,w,h);
  g.fillStyle(stage<2?0x75dbc0:0x7e6ac6,.055);g.fillCircle(w*.2,h*.3,Math.max(w,h)*.5);g.fillStyle(stage<2?0x45a1ab:0xa34c9a,.07);g.fillCircle(w*.85,h*.75,Math.max(w,h)*.38);
  if(stage<2){g.lineStyle(1,0xd6eef6,.055);const grid=96,ox=(-this.save.x*.07)%grid,oy=(-this.save.y*.07)%grid;for(let x=ox;x<w;x+=grid)g.lineBetween(x,0,x,h);for(let y=oy;y<h;y+=grid)g.lineBetween(0,y,w,y)}
  for(const star of this.stars){const x=((star.x*w-this.save.x*star.layer/this.factor())%w+w)%w,y=((star.y*h-this.save.y*star.layer/this.factor())%h+h)%h;g.fillStyle(stage<2?0x97e9ba:0xe9ddff,star.alpha*(stage<2?.16:1));g.fillCircle(x,y,star.size)}
 }
 private drawItem(g:Phaser.GameObjects.Graphics,item:WorldItem){
  const scale=this.factor(),r=item.radius*item.size*scale,x=item.x,y=item.y,k=item.kind;
  g.fillStyle(item.color,.13);g.fillCircle(x,y,r*1.25);g.lineStyle(1.2*scale,item.req<=this.save.power?0xafeff1:0xc2adc5,.5);g.strokeCircle(x,y,r*1.08);
  const D=(n:number)=>n*r/24;
  const rectangle=(xx:number,yy:number,ww:number,hh:number,c:number)=>{g.fillStyle(c);g.fillRoundedRect(x+D(xx),y+D(yy),D(ww),D(hh),D(2))};
  const circle=(xx:number,yy:number,rr:number,c:number)=>{g.fillStyle(c);g.fillCircle(x+D(xx),y+D(yy),D(rr))};
  const segment=(ax:number,ay:number,bx:number,by:number,c:number,thick=2)=>{g.lineStyle(D(thick),c,1);g.lineBetween(x+D(ax),y+D(ay),x+D(bx),y+D(by))};
  switch(k){
   case 'nature':circle(-7,1,10,item.color);circle(6,-6,8,0xf2b7d9);circle(3,5,5,0xffe4a8);break;
   case 'stone':g.fillStyle(item.color);g.fillTriangle(x-D(17),y+D(9),x+D(2),y-D(17),x+D(18),y+D(10));circle(8,6,3,0x677b99);break;
   case 'tree':rectangle(-4,1,8,20,0xaf8669);circle(-8,-4,12,0x55bd93);circle(8,-7,13,item.color);circle(0,-14,10,0x9be8bb);break;
   case 'furniture':rectangle(-16,-3,32,8,0xe3a981);rectangle(-16,7,32,5,0xdbb298);rectangle(-11,11,4,8,0xb5d7d5);rectangle(8,11,4,8,0xb5d7d5);break;
   case 'vehicle':rectangle(-19,-2,38,15,item.color);rectangle(-9,-13,20,13,0xa9e3f1);circle(-11,13,5,0x20263d);circle(12,13,5,0x20263d);break;
   case 'house':rectangle(-15,-2,30,22,0xf3d9ac);g.fillStyle(item.color);g.fillTriangle(x-D(20),y-D(1),x,y-D(20),x+D(20),y-D(1));rectangle(-4,5,9,15,0x966c84);break;
   case 'tower':rectangle(-15,-8,13,31,item.color);rectangle(0,-20,18,43,0xb8c4ed);for(let xx=-11;xx<16;xx+=8)for(let yy=-12;yy<19;yy+=9)if(xx>=0||yy>=-4)rectangle(xx,yy,3,5,0xffedbc);break;
   case 'mountain':g.fillStyle(item.color);g.fillTriangle(x-D(22),y+D(19),x-D(4),y-D(20),x+D(16),y+D(19));g.fillStyle(0xf0f6ff);g.fillTriangle(x-D(10),y-D(7),x-D(4),y-D(20),x+D(3),y-D(6));break;
   case 'island':circle(0,0,18,0x7ddac1);circle(0,6,13,0xe9d0a2);circle(-3,-3,8,0x74cfa1);break;
   case 'water':circle(0,0,19,0x459ccf);for(let i=0;i<3;i++)segment(-14,-11+i*10,15,-11+i*10,0xafedff,2);break;
   case 'moon':circle(0,0,19,item.color);circle(-7,-5,5,0xabb5c7);circle(8,8,4,0x9b9dac);circle(10,-10,4,0xbac6d2);break;
   case 'planet':circle(0,0,19,item.color);circle(-7,-4,9,0x85d9b5);circle(9,8,6,0x83dab4);break;
   case 'saturn':g.lineStyle(D(8),0xd2b3a8,.7);g.strokeEllipse(x,y,D(53),D(18));circle(0,0,18,item.color);segment(-12,-2,12,-2,0xffe3b4,3);break;
   case 'satellite':rectangle(-8,-10,16,20,0xd2d9ed);rectangle(-23,-8,13,16,0x668edc);rectangle(10,-8,13,16,0x668edc);break;
   case 'comet':segment(-21,-17,6,6,0x94e3f6,7);circle(9,7,11,0xe2dfd6);break;
   case 'sun':case 'star':for(let j=0;j<10;j++){const a=j*Math.PI/5;segment(Math.cos(a)*13,Math.sin(a)*13,Math.cos(a)*23,Math.sin(a)*23,0xffd89e,3)}circle(0,0,14,item.color);circle(-4,-4,7,0xfff6ce);break;
   case 'galaxy':case 'nebula':for(let j=0;j<4;j++){for(let v=0;v<14;v++){const a=v*.39+j*Math.PI/2,rr=(2+v*1.2);circle(Math.cos(a)*rr,Math.sin(a)*rr*.65,1.7,j%2?0xa8d6ff:item.color)}}circle(0,0,6,0xffe8ef);break;
   default:circle(0,0,18,item.color);
  }
 }
 private renderWorld(){
  const g=this.world;g.clear();const radius=this.areaRadius()*.82,now=this.elapsed;
  for(const item of this.items){if(distance(item.x,item.y,this.save.x,this.save.y)>radius)continue;const originalY=item.y;item.y+=Math.sin(now*1.15+item.wave)*this.factor()*1.6;this.drawItem(g,item);item.y=originalY}
  for(const p of this.particles){g.fillStyle(p.color,clamp(p.life/p.max,0,1));g.fillCircle(p.x,p.y,p.size)}
 }
 private renderHole(){
  const g=this.hole;g.clear();const x=this.save.x,y=this.save.y,r=this.holeRadius();
  for(let j=3;j>=0;j--){g.fillStyle(j%2?0xb3a0ed:0x7cdde8,.025);g.fillCircle(x,y,r*(1.8+j*.21))}
  g.lineStyle(r*.22,0x9b9ae5,.30);g.strokeEllipse(x,y,r*2.6,r*1.7);
  g.fillStyle(0x6a59a6,.4);g.fillCircle(x,y,r*1.14);
  g.fillStyle(0xbac9fd,.72);g.fillCircle(x,y,r*1.02);
  g.fillStyle(0x252044,1);g.fillCircle(x,y,r*.95);
  g.fillStyle(0x030716,1);g.fillCircle(x,y,r*.81);
  for(let j=0;j<14;j++){const a=j*Math.PI/7+this.elapsed*(j%2?.22:-.18),rad=r*(.88+Math.sin(j*11)*.10);g.fillStyle(j%2?0xeebeff:0xb1f4eb,.8);g.fillCircle(x+Math.cos(a)*rad,y+Math.sin(a)*rad,r*.018)}
 }
}
