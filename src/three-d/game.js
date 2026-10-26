(()=>{'use strict';
const ASSETS=__BHI_ASSET_DATA__;
const $=id=>document.getElementById(id);
const cvs=$('game'),gl=cvs.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'high-performance'});
function fallback2D(){setTimeout(()=>{const bytes=Uint8Array.from(atob('__BHI_CLASSIC_FALLBACK__'),c=>c.charCodeAt(0));document.open();document.write(new TextDecoder().decode(bytes));document.close()},0)}
if(!gl){fallback2D();return}
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNormal;layout(location=2) in vec2 aUV;
uniform mat4 uVP,uModel;
out vec3 vNormal,vLocal,vWorld;out vec2 vUV;
void main(){vec4 world=uModel*vec4(aPos,1.0);vWorld=world.xyz;vNormal=mat3(uModel)*aNormal;vLocal=aPos;vUV=aUV;gl_Position=uVP*world;}`;
const fragment=`#version 300 es
precision highp float;
in vec3 vNormal,vLocal,vWorld;in vec2 vUV;
uniform vec3 uColor;uniform vec3 uCamera;uniform float uTime,uAlpha,uEmissive;uniform int uKind;uniform sampler2D uTerrain;
out vec4 outColor;
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=dot(i,vec3(1.,57.,113.));return mix(mix(mix(fract(sin(a)*43758.5453),fract(sin(a+1.)*43758.5453),f.x),mix(fract(sin(a+57.)*43758.5453),fract(sin(a+58.)*43758.5453),f.x),f.y),mix(mix(fract(sin(a+113.)*43758.5453),fract(sin(a+114.)*43758.5453),f.x),mix(fract(sin(a+170.)*43758.5453),fract(sin(a+171.)*43758.5453),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,w=.5;for(int i=0;i<4;i++){v+=w*noise(p);p*=2.07;w*=.5;}return v;}
void main(){vec3 n=normalize(vNormal);vec3 lightDir=normalize(vec3(-.52,.93,.48));float diffuse=max(.0,dot(n,lightDir));vec3 color=uColor;float alpha=uAlpha;float glow=uEmissive;
 if(uKind==1){vec3 tx=texture(uTerrain,vUV).rgb;color=mix(tx,uColor,.10);diffuse=.62+.35*diffuse;}
 if(uKind==2){float land=fbm(vLocal*3.2+.7);float coast=fbm(vLocal*11.);land=mix(land,coast,.27);color=land>.53?mix(vec3(.19,.31,.15),vec3(.42,.49,.25),smoothstep(.53,.78,land)):mix(vec3(.014,.084,.23),vec3(.038,.37,.59),smoothstep(.25,.54,land));float cloud=fbm(vLocal*16.+vec3(uTime*.018,0.,0.));color=mix(color,vec3(.88,.94,1.),smoothstep(.72,.82,cloud)*.65);}
 if(uKind==3){float n1=fbm(vLocal*8.);color=mix(uColor*.50,uColor*1.35,n1);color=mix(color,vec3(.32,.24,.19),smoothstep(.77,.91,n1)*.4);}
 if(uKind==4){float band=sin(vLocal.y*26.+sin(vLocal.z*5.)*.8)*.5+.5;float storm=fbm(vLocal*12.);color=mix(uColor*.68,uColor*1.36,band*.7+storm*.3);}
 if(uKind==5){float glowV=fbm(vLocal*13.+uTime*.06);color=mix(vec3(1.,.28,.05),vec3(1.,.82,.38),glowV);glow=.9;}
 if(uKind==6){vec2 q=(vUV-.5)*2.;float r=length(q);if(r>.99)discard;float swirl=atan(q.y,q.x)+uTime*.22;float hot=pow(1.-r,2.);color=mix(vec3(.17,.075,.05),vec3(1.,.58,.24),.50+.35*sin(swirl*5.+r*20.));alpha*=smoothstep(.99,.82,r)*smoothstep(.03,.21,r);glow=.66+hot*.22;diffuse=1.;}
 if(uKind==7){float r=length(vUV-.5)*2.;alpha*=pow(max(0.,1.-r),2.3)*.29;glow=1.;diffuse=1.;if(alpha<.003)discard;}
 if(uKind==8){float wx=step(.16,fract(vUV.x*5.))*(1.-step(.74,fract(vUV.x*5.)));float wy=step(.17,fract(vUV.y*8.))*(1.-step(.72,fract(vUV.y*8.)));float on=step(.50,noise(vec3(floor(vUV*vec2(5.,8.)),7.)));color=mix(color,vec3(.92,.77,.48),wx*wy*on*.78);}
 if(uKind==9){float crater=fbm(vLocal*21.);color=mix(color*.65,color*1.21,crater);}
 if(uKind==10){float rad=length(vUV-.5)*2.;if(rad>.99||rad<.38)discard;float band=sin(rad*44.)*.5+.5;color=mix(uColor*.63,uColor*1.38,band);alpha*=.68;diffuse=1.;}
 if(uKind==11){float r=length(vUV-.5)*2.;if(r>1.)discard;alpha*=pow(1.-r,.7)*.48;glow=.88;diffuse=1.;}
 if(uKind==12){float n1=fbm(vLocal*5.);color=mix(uColor*.45,uColor*1.7,n1);glow=.20;}
 if(uKind==13){float f=fbm(vLocal*13.);color=mix(uColor*.65,uColor*1.4,f);}
 vec3 view=normalize(uCamera-vWorld);float spec=pow(max(dot(reflect(-lightDir,n),view),.0),25.)*.17;
 float ambient=(uKind==1?.57:.20);float lighting=ambient+(1.-ambient)*diffuse;vec3 shaded=color*lighting+vec3(1.,.86,.68)*spec+color*glow;
 if(uKind==7||uKind==6||uKind==10||uKind==11)shaded=color*(1.+glow);
 outColor=vec4(shaded,clamp(alpha,0.,1.));}`;
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
let prog;try{prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog)}catch(error){console.warn('Renderer 3D non disponibile, avvio la versione 2D:',error);fallback2D();return}
const uni=Object.fromEntries(['uVP','uModel','uColor','uCamera','uTime','uAlpha','uEmissive','uKind','uTerrain'].map(n=>[n,gl.getUniformLocation(prog,n)]));
const random=(a=0,b=1)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const phases=[
 {name:'Giardino terrestre',next:'La Terra dall’alto',start:0,end:86,desc:'Il viaggio comincia',color:'#345b44',spec:[['Foglia',0,.27,1.7,'leaf'],['Fiore',4,.31,2,'flower'],['Sasso',9,.37,2.3,'rock'],['Panchina',17,.6,3.2,'bench'],['Albero',22,.9,3.4,'tree'],['Semaforo',30,.75,3.8,'lamp'],['Automobile',39,1.05,4.5,'car'],['Casa',51,1.65,5,'house'],['Palazzo',62,2.2,6.2,'building'],['Grattacielo',76,3,8,'tower']]},
 {name:'Terra dall’alto',next:'Sistema Solare',start:86,end:186,desc:'Un mondo intero',color:'#3e7192',spec:[['Quartiere',86,.45,2,'house'],['Città',99,.68,3,'building'],['Isola',113,.75,4,'earth'],['Montagna',125,.9,4.5,'rock'],['Oceano',140,1.18,5.5,'earth'],['Continente',151,1.42,6,'earth'],['Luna',162,1.67,7,'moon'],['Terra',175,2.45,9,'earth']]},
 {name:'Sistema Solare',next:'Via Lattea',start:186,end:306,desc:'Oltre l’atmosfera',color:'#28385f',spec:[['Cometa',186,.31,2.5,'comet'],['Asteroide',197,.42,3,'rock'],['Satellite',212,.60,3.2,'satellite'],['Mercurio',225,.73,4,'moon'],['Marte',241,.96,4.8,'mars'],['Pianeta',256,1.25,5,'earth'],['Saturno',270,1.66,6.2,'saturn'],['Sole',288,2.50,9,'sun']]},
 {name:'Via Lattea',next:'Universo',start:306,end:451,desc:'Tra le stelle',color:'#433268',spec:[['Stella',306,.37,3,'sun'],['Ammasso stellare',325,.61,3.8,'stars'],['Nebulosa',345,.90,4.8,'nebula'],['Sistema stellare',367,1.3,5.3,'sun'],['Supernova',389,1.61,6.3,'sun'],['Galassia',419,2.7,9,'galaxy']]},
 {name:'Universo osservabile',next:'Multiverso',start:451,end:621,desc:'Senza confini',color:'#352752',spec:[['Ammasso di galassie',451,.48,3.2,'galaxy'],['Superammasso',477,.77,4,'galaxy'],['Filamento cosmico',509,1.1,5,'nebula'],['Vuoto cosmico',545,1.48,6.5,'galaxy'],['Universo',588,2.7,10,'galaxy']]},
 {name:'Multiverso infinito',next:'Nuovo universo',start:621,end:831,desc:'Oltre l’infinito',color:'#25234c',spec:[['Stella impossibile',621,.4,3.5,'sun'],['Universo specchio',650,.8,4.3,'galaxy'],['Cosmo alternativo',688,1.15,5,'nebula'],['Dimensione',731,1.6,6.5,'galaxy'],['Intero universo',783,2.7,10,'galaxy']]}
];
const saveKey='bhi-3d-v3',defaults={power:0,absorbed:0,x:0,z:0,universes:1,music:true,sfx:true,particles:true,volume:.32,gravity:1,zen:false};let data={...defaults},hasSave=false;try{const s=localStorage.getItem(saveKey);if(s){data={...data,...JSON.parse(s)};hasSave=true}else{const old=localStorage.getItem('bhi-playable-v1');if(old){const d=JSON.parse(old);data={...data,power:d.power||0,absorbed:d.absorbed||0,x:(d.x||0)/28,z:(d.y||0)/28,universes:d.universes||1,music:d.music!==false,sfx:d.sfx!==false,volume:d.volume??.32,zen:!!d.zen};hasSave=true}}}catch{}
const stageFor=p=>p>=621?5:phases.findIndex(q=>p>=q.start&&p<q.end);let phase=stageFor(data.power),lastPhase=phase;
const stageProgress=()=>phase===5?((data.power-621)%210)/210:clamp((data.power-phases[phase].start)/(phases[phase].end-phases[phase].start),0,1);
const radius=()=>.87+stageProgress()*1.32;const canAbsorb=o=>data.power+0.000001>=o.req;
function save(){try{localStorage.setItem(saveKey,JSON.stringify(data));hasSave=true}catch{}}
function universe(){return data.power<621?1:2+Math.floor((data.power-621)/210)}
function makeGeometry(positions,normals,uvs,indices){const vao=gl.createVertexArray();gl.bindVertexArray(vao);const attrib=(buf,arr,loc,size)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0)};attrib(0,positions,0,3);attrib(0,normals,1,3);attrib(0,uvs,2,2);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);gl.bindVertexArray(null);return {vao,count:indices.length}}
function meshFromFaces(faces){const p=[],n=[],u=[],idx=[];for(const f of faces){let start=p.length/3;for(const v of f.v){p.push(...v);n.push(...f.n);u.push(...f.uv.shift())}idx.push(start,start+1,start+2,start,start+2,start+3)}return makeGeometry(p,n,u,idx)}
function cube(){const f=[{n:[0,0,1],v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},{n:[0,0,-1],v:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]},{n:[1,0,0],v:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},{n:[-1,0,0],v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},{n:[0,1,0],v:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},{n:[0,-1,0],v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]}];return meshFromFaces(f.map(x=>({...x,uv:[[0,0],[1,0],[1,1],[0,1]]}))) }
function sphere(segments=24,rings=16){const p=[],n=[],u=[],ids=[];for(let y=0;y<=rings;y++){let v=y/rings,phi=v*Math.PI;for(let x=0;x<=segments;x++){let w=x/segments,t=w*Math.PI*2;let xx=Math.cos(t)*Math.sin(phi),yy=Math.cos(phi),zz=Math.sin(t)*Math.sin(phi);p.push(xx,yy,zz);n.push(xx,yy,zz);u.push(w,1-v)}}for(let y=0;y<rings;y++)for(let x=0;x<segments;x++){let a=y*(segments+1)+x,b=a+segments+1;ids.push(a,b,a+1,b,b+1,a+1)}return makeGeometry(p,n,u,ids)}
function cylinder(top=.75,bottom=1){const p=[],n=[],u=[],ids=[],steps=12;for(let i=0;i<=steps;i++){let a=i/steps*Math.PI*2,s=Math.sin(a),c=Math.cos(a);p.push(s*bottom,-1,c*bottom,s*top,1,c*top);n.push(s,0,c,s,0,c);u.push(i/steps,0,i/steps,1)}for(let i=0;i<steps;i++){let a=i*2;ids.push(a,a+2,a+1,a+2,a+3,a+1)}return makeGeometry(p,n,u,ids)}
function plane(){return makeGeometry([-1,0,-1,1,0,-1,1,0,1,-1,0,1],[0,1,0,0,1,0,0,1,0,0,1,0],[0,0,1,0,1,1,0,1],[0,1,2,0,2,3])}
const mesh={cube:cube(),sphere:sphere(),cyl:cylinder(),cone:cylinder(0,1),plane:plane()};
function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o}
function lookAt(eye,target){const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l)};let z=norm(eye.map((v,i)=>v-target[i])),x=norm([z[2],0,-z[0]]),y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];const out=identity();out[0]=x[0];out[4]=x[1];out[8]=x[2];out[1]=y[0];out[5]=y[1];out[9]=y[2];out[2]=z[0];out[6]=z[1];out[10]=z[2];out[12]=-x.reduce((s,v,i)=>s+v*eye[i],0);out[13]=-y.reduce((s,v,i)=>s+v*eye[i],0);out[14]=-z.reduce((s,v,i)=>s+v*eye[i],0);return out}
function model(pos,scale,rotate=0,tilt=0){let c=Math.cos(rotate),s=Math.sin(rotate),ca=Math.cos(tilt),sa=Math.sin(tilt);return new Float32Array([scale[0]*c,0,-scale[0]*s,0,scale[1]*s*sa,scale[1]*ca,scale[1]*c*sa,0,scale[2]*s*ca,-scale[2]*sa,scale[2]*c*ca,0,pos[0],pos[1],pos[2],1])}
function rgb(hex){let h=hex.replace('#','');return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255]}
function texture(src){const tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([77,101,75,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);const im=new Image();im.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,tx);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);gl.generateMipmap(gl.TEXTURE_2D)};im.src=src;return tx}
const terrain=texture(ASSETS.terrain3d);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,terrain);gl.uniform1i(uni.uTerrain,0);
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE);
let vp=identity(),camera=[0,27,28],drawCount=0;
function draw(shape,pos,scale,col,kind=0,alpha=1,rot=0,tilt=0,emissive=0){if(alpha<=.001)return;gl.bindVertexArray(mesh[shape].vao);gl.uniformMatrix4fv(uni.uModel,false,model(pos,scale,rot,tilt));gl.uniform3fv(uni.uColor,rgb(col));gl.uniform1i(uni.uKind,kind);gl.uniform1f(uni.uAlpha,alpha);gl.uniform1f(uni.uEmissive,emissive);gl.drawElements(gl.TRIANGLES,mesh[shape].count,gl.UNSIGNED_SHORT,0);drawCount++}
// World geometry is truly 3D: mesh surfaces respond to a directional light and camera perspective.
function objectMesh(o,t){const x=o.x,z=o.z,s=o.r*o.shrink,rot=o.rot+t*(o.pulling?1.1:.04);const meshDraw=(shape,pos,...args)=>draw(shape,[pos[0],pos[1]+o.y,pos[2]],...args);
 if(phase===0){meshDraw('plane',[x,.035,z],[s*1.55,1,s*1.55],'#06100b',11,.42,0,0);}
 switch(o.type){
 case 'leaf':meshDraw('plane',[x,.10,z],[s,1,s*.55],'#78a459',0,1,rot);break;
 case 'flower':meshDraw('cyl',[x,.18,z],[.055,.17,.055],'#4d8751');meshDraw('sphere',[x,.44,z],[s*.72,s*.37,s*.72],'#eaa9a4',0,1,rot);break;
 case 'rock':meshDraw('sphere',[x,.21,z],[s*.8,s*.55,s*.70],phase>1?'#93877f':'#818780',9,1,rot);break;
 case 'bench':meshDraw('cube',[x,.25,z],[s*.94,.10,s*.37],'#8e6248',0,1,rot);meshDraw('cube',[x,.50,z+s*.25],[s*.94,.27,.09],'#967354',0,1,rot);break;
 case 'tree':meshDraw('cyl',[x,.45*s,z],[s*.14,s*.65,s*.14],'#6a4832',0,1,rot);meshDraw('sphere',[x,1.4*s,z],[s*.72,s*.82,s*.67],'#355d38',13,1,rot);meshDraw('sphere',[x+.28*s,1.6*s,z+.15*s],[s*.46,s*.5,s*.48],'#527b42',13,1,rot);break;
 case 'lamp':meshDraw('cyl',[x,s*.85,z],[s*.065,s*.8,s*.065],'#717d84');meshDraw('sphere',[x,s*1.72,z],[s*.22,s*.21,s*.22],'#ffe1a4',0,1,0,0,.35);break;
 case 'car':meshDraw('cube',[x,s*.30,z],[s*.9,s*.24,s*.49],o.col,0,1,rot);meshDraw('cube',[x,s*.62,z],[s*.48,s*.17,s*.43],'#9ac0ce',0,1,rot);break;
 case 'house':meshDraw('cube',[x,s*.64,z],[s*.80,s*.63,s*.77],'#b8a28a',8,1,rot);meshDraw('cone',[x,s*1.46,z],[s*1.14,s*.38,s*1.08],'#884a39',0,1,rot+Math.PI/4);break;
 case 'building':case 'tower':{let tall=o.type==='tower'?2.4:1.8;meshDraw('cube',[x,s*tall*.5,z],[s*.73,s*tall*.5,s*.69],o.col,8,1,rot);meshDraw('cube',[x,s*tall+.065,z],[s*.76,.065,s*.73],'#86959d');break;}
 case 'earth':meshDraw('sphere',[x,s*1.05,z],[s,s,s],'#ffffff',2,1,rot);break;
 case 'moon':meshDraw('sphere',[x,s*1.05,z],[s,s,s],'#a9a6a1',9,1,rot);break;
 case 'mars':meshDraw('sphere',[x,s*1.05,z],[s,s,s],'#ba6652',3,1,rot);break;
 case 'saturn':meshDraw('sphere',[x,s*1.05,z],[s,s,s],'#c5ac89',4,1,rot);meshDraw('plane',[x,s*1.06,z],[s*1.95,1,s*1.95],'#c8a58d',10,.9,rot+.3);break;
 case 'sun':meshDraw('sphere',[x,s*1.07,z],[s,s,s],'#ffae4b',5,1,rot);meshDraw('plane',[x,s*.94,z],[s*1.75,1,s*1.75],'#ffb751',7,.5,rot);break;
 case 'satellite':meshDraw('cube',[x,s*.45,z],[s*.38,s*.23,s*.25],'#929aa3',0,1,rot);meshDraw('cube',[x+s*.64,s*.45,z],[s*.42,s*.03,s*.36],'#365a95',0,1,rot);meshDraw('cube',[x-s*.64,s*.45,z],[s*.42,s*.03,s*.36],'#365a95',0,1,rot);break;
 case 'comet':meshDraw('sphere',[x,s,z],[s*.8,s*.8,s*.8],'#acc4de',9,1,rot);meshDraw('plane',[x-s*1.2,s,z-s*.5],[s*2,1,s*.9],'#85b4e2',11,.6,rot);break;
 case 'galaxy':case 'nebula':case 'stars':{meshDraw('sphere',[x,s*.65,z],[s*.70,s*.7,s*.7],o.col,12,.9,rot);meshDraw('plane',[x,s*.62,z],[s*2,1,s*2],o.col,6,.85,rot);meshDraw('plane',[x,s*.65,z],[s*2.45,1,s*2.45],o.col,7,.55,rot-.45);break;}
 }
}
// Unlike the original 2D attraction, each collectible has 3D position and real velocity.
let objects=[],particles=[],running=false,paused=true,elapsed=0,lastTs=0,cameraX=data.x,cameraZ=data.z,pulse=0,toastSec=0,uiTimer=0,ambientCtx=null,audioNodes=[],input={axisX:0,axisZ:0,keys:new Set(),pointer:null},zenDestination=null;
function spawn(initial=false){let b=phases[phase].spec,offset=phase===5?Math.max(0,Math.floor((data.power-621)/210)*210):0;let eligible=b.filter(v=>v[1]+offset<=data.power+14&&v[1]+offset>=data.power-48);if(!eligible.length)eligible=b.filter(v=>v[1]+offset<=data.power+14);let pick=eligible[Math.floor(random(0,eligible.length))]||b[0];if(Math.random()<.17){let future=b.filter(v=>v[1]+offset>data.power&&v[1]+offset<data.power+32);if(future.length)pick=future[Math.floor(random(0,future.length))]}
 let a=random(0,Math.PI*2),dist=initial?random(3,37):random(25,46),r=pick[2]*random(.80,1.14);let obj={name:pick[0],req:pick[1]+offset,r,reward:pick[3],type:pick[4],x:data.x+Math.cos(a)*dist,z:data.z+Math.sin(a)*dist,y:phase>=2?random(-3.5,4):0,vx:0,vy:0,vz:0,rot:random(0,6.28),shrink:1,pulling:false,col:['#65798d','#5b655c','#bf725c','#b2a292','#c3a777'][Math.floor(random(0,5))]};objects.push(obj)}
function setupPhase(force=false){phase=stageFor(data.power);lastPhase=phase;objects=[];particles=[];for(let i=0;i<88;i++)spawn(true);setBackdrop();updateHud();if(!force){announce(phases[phase].name,'Il cosmo si apre davanti a te');sound('milestone')}}
function setBackdrop(){cvs.style.backgroundImage=phase<2?'none':`linear-gradient(0deg,rgba(3,6,22,.40),rgba(4,8,19,.10)),url("${ASSETS['nebula'+Math.min(3,phase-2)]}")`;cvs.style.backgroundColor=phase===0?'#3e5b40':phase===1?'#183a56':'#070a16';cvs.style.backgroundSize='cover';cvs.style.backgroundPosition='center';$('shaderFilm').style.opacity=phase<2?'1':'.53'}
function updateHud(){let q=phases[phase],pr=stageProgress();$('stage').textContent=q.name;$('universe').textContent='UNIVERSO '+String(universe()).padStart(2,'0');$('collected').textContent=data.absorbed.toLocaleString('it-IT')+' assorbiti';$('level').textContent='Massa · '+(Math.pow(10,(data.power%72)/24)).toFixed(1)+' × 10^'+Math.floor(data.power/72);$('next').textContent=phase===5?'Nuovo universo · '+Math.floor(pr*100)+'%':'Prossimo: '+q.next;$('progress').style.width=(pr*100).toFixed(1)+'%';$('zen').textContent=data.zen?'◉ Zen attiva':'◯ Zen';$('zen').setAttribute('aria-pressed',String(data.zen));$('gravityLabel').textContent='GRAVITÀ '+Math.round(data.gravity*100)+'%'}
function announce(title,sub){$('toast-title').textContent=title;$('toast-sub').textContent=sub;$('toast').classList.add('show');toastSec=3.1}
function particle(x,z,col){if(!data.particles)return;for(let j=0;j<7;j++){let a=random(0,Math.PI*2);particles.push({x,z,vx:Math.cos(a)*random(1,6),vz:Math.sin(a)*random(1,6),life:random(.3,.95),color:col})}if(particles.length>100)particles.splice(0,particles.length-100)}
function audioInit(){try{if(!ambientCtx){ambientCtx=new (window.AudioContext||window.webkitAudioContext)();const bus=ambientCtx.createGain();bus.gain.value=0;bus.connect(ambientCtx.destination);audioNodes=[bus];[82.41,123.47,164.81,246.94].forEach((f,i)=>{const osc=ambientCtx.createOscillator(),g=ambientCtx.createGain();osc.type='sine';osc.frequency.value=f;g.gain.value=i===0?.065:.020;osc.connect(g).connect(bus);osc.start();audioNodes.push(osc)})}if(ambientCtx.state==='suspended')ambientCtx.resume();audioUpdate()}catch{}}
function audioUpdate(){if(ambientCtx)audioNodes[0].gain.setTargetAtTime(data.music?data.volume*.45:0,ambientCtx.currentTime,.15)}
let lastSound=0;function sound(type){if(!data.sfx||!ambientCtx||ambientCtx.state!=='running')return;const now=ambientCtx.currentTime;if(type==='pickup'&&now-lastSound<.060)return;lastSound=now;const osc=ambientCtx.createOscillator(),g=ambientCtx.createGain();osc.type='sine';osc.frequency.setValueAtTime(type==='milestone'?560:random(200,390),now);osc.frequency.exponentialRampToValueAtTime(type==='milestone'?820:130,now+.23);g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime((type==='milestone'?.06:.024)*data.volume,now+.012);g.gain.exponentialRampToValueAtTime(.001,now+.28);osc.connect(g).connect(ambientCtx.destination);osc.start(now);osc.stop(now+.30)}
function pickup(o){data.power+=o.reward;data.absorbed++;pulse=1;sound('pickup');particle(o.x,o.z,phase>1?'#bda0ec':'#e3b27b');$('pickup').textContent='+'+o.reward.toFixed(1)+' MASSA';$('pickup').classList.add('visible');setTimeout(()=>$('pickup').classList.remove('visible'),340)}
function move(dt){let dx=input.axisX,dz=input.axisZ;const keys=input.keys;if(keys.has('arrowleft')||keys.has('a'))dx--;if(keys.has('arrowright')||keys.has('d'))dx++;if(keys.has('arrowup')||keys.has('w'))dz--;if(keys.has('arrowdown')||keys.has('s'))dz++;
 if(data.zen&&Math.abs(dx)+Math.abs(dz)<.05){let nearest,dd=1e6;for(let o of objects){if(!canAbsorb(o))continue;const d=Math.hypot(o.x-data.x,o.z-data.z);if(d<dd){nearest=o;dd=d}}if(nearest){dx=nearest.x-data.x;dz=nearest.z-data.z}}
 let n=Math.hypot(dx,dz);if(n>.01){const speed=(7.5+(phase>1?1.5:0))*(data.zen?.65:1);data.x+=dx/n*speed*dt;data.z+=dz/n*speed*dt}
 if(Math.abs(data.x)>20000||Math.abs(data.z)>20000){const ox=data.x,oz=data.z;for(const o of objects){o.x-=ox;o.z-=oz}for(const p of particles){p.x-=ox;p.z-=oz}data.x=0;data.z=0;cameraX-=ox;cameraZ-=oz}
 cameraX=lerp(cameraX,data.x,Math.min(1,dt*5.5));cameraZ=lerp(cameraZ,data.z,Math.min(1,dt*5.5));pulse=Math.max(0,pulse-dt*2.2);
 const gravRange=radius()*5+5;
 for(let i=objects.length-1;i>=0;i--){const o=objects[i],dx=data.x-o.x,dz=data.z-o.z,dy=phase>=2?.87-o.y:0,d2=dx*dx+dz*dz+dy*dy,d=Math.sqrt(d2),eligible=canAbsorb(o);
  if(eligible&&d<gravRange){o.pulling=true;const a=clamp(28*data.gravity*(1+stageProgress())/(d2+2.3),0,22);const tangential=clamp((gravRange-d)/gravRange,0,1)*a*.12;
   o.vx+=(dx/(d||1)*a-dz/(d||1)*tangential)*dt;o.vz+=(dz/(d||1)*a+dx/(d||1)*tangential)*dt;if(phase>=2)o.vy+=dy/(d||1)*a*dt;
   const drag=Math.exp(-dt*(.16+1.3*clamp((radius()*2.1-d)/(radius()*2.1),0,1)));o.vx*=drag;o.vz*=drag;o.vy*=drag;o.x+=o.vx*dt;o.z+=o.vz*dt;if(phase>=2)o.y+=o.vy*dt;o.rot+=dt*.7;
   if(d<radius()*.87+o.r*.13){pickup(o);objects.splice(i,1);const newPhase=stageFor(data.power),newUniverse=universe();if(newPhase!==phase){setupPhase();break}if(phase===5&&newUniverse!==data.universes){data.universes=newUniverse;setupPhase(true);announce('Universo '+newUniverse,'Ogni fine nasconde un nuovo inizio ✨');sound('milestone');break}}
  }else{o.pulling=false;o.vx*=Math.exp(-dt*1.7);o.vz*=Math.exp(-dt*1.7)}
  if(Math.hypot(o.x-data.x,o.z-data.z)>69)objects.splice(i,1)
 }
 while(objects.length<88)spawn();for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.x+=p.vx*dt;p.z+=p.vz*dt;p.vx*=.94;p.vz*=.94;p.life-=dt;if(p.life<0)particles.splice(i,1)}
 if(toastSec>0){toastSec-=dt;if(toastSec<=0)$('toast').classList.remove('show')};uiTimer+=dt;if(uiTimer>.35){uiTimer=0;updateHud()}
}
function environment(t){if(phase===0){const startX=Math.floor(cameraX/26),startZ=Math.floor(cameraZ/26);
  // Repeating textured 3D terrain tiles and roads provide visual cues for depth and movement.
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){let cx=(startX+x)*26,cz=(startZ+z)*26;draw('plane',[cx,-.23,cz],[13,1,13],'#627a55',1,1,0)}
  // Shadows and road markings are lit 3D surfaces, not screen-space sprites.
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){const gx=(startX+x)*26,gz=(startZ+z)*26;draw('plane',[gx,-.215,gz+12],[13,1,1.0],'#3c464a');draw('plane',[gx+12,-.21,gz],[1,1,13],'#3c464a');for(let m=-2;m<=2;m++){draw('plane',[gx+m*4.6,-.208,gz+12],[.65,1,.043],'#abb3ad',0,.7);draw('plane',[gx+12,-.207,gz+m*4.6],[.043,1,.65],'#abb3ad',0,.7)}}
 }else if(phase===1){const startX=Math.floor(cameraX/28),startZ=Math.floor(cameraZ/28);for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)draw('plane',[(startX+x)*28,-.25,(startZ+z)*28],[14,1,14],'#235476',1,1,0)}
 else{
  // Stars in depth: the camera passes through independently positioned luminous spheres.
  for(let i=0;i<108;i++){let ax=(i*17.21%107)-53+cameraX*.10,az=(i*47.7%103)-51+cameraZ*.10;let y=(i*13.73%27)+.5;draw('sphere',[ax,y,az],[.017,.017,.017],i%4===0?'#ffd4a7':'#c1d4ff',0,.90,0,0,.7)}
 }}
function blackHole(t){let r=radius()*(1+pulse*.065),px=data.x,pz=data.z,y=phase<2?.06:.87;
 // Light halo and accretion disk are rendered in real perspective around a dark 3D event horizon.
 gl.depthMask(false);draw('plane',[px,y+.02,pz],[r*3.6,1,r*3.6],'#db855a',7,.36,t*.18);draw('plane',[px,y+.05,pz],[r*2.0,1,r*2.0],'#f9b16a',6,.75,t*.45);gl.depthMask(true);
 draw('sphere',[px,y+.26*r,pz],[r*.81,r*.52,r*.81],'#020306',0,1,0,0,0);
 gl.depthMask(false);draw('plane',[px,y+.32*r,pz],[r*1.98,1,r*1.98],'#fdce93',10,.45,t*.3);gl.depthMask(true);
}
function render(t){drawCount=0;gl.viewport(0,0,cvs.width,cvs.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const aspect=cvs.width/cvs.height,zoom=1+.12*stageProgress(),camHeight=(24+radius()*3)*zoom,camDepth=(22+radius()*3)*zoom;camera=[cameraX,camHeight,cameraZ+camDepth];vp=multiply(perspective(Math.PI/3.1,aspect,.08,300),lookAt(camera,[cameraX,.05,cameraZ]));gl.useProgram(prog);gl.uniformMatrix4fv(uni.uVP,false,vp);gl.uniform3fv(uni.uCamera,camera);gl.uniform1f(uni.uTime,t);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,terrain);
 environment(t);
 // Render from far to near for transparent celestial layers.
 objects.sort((a,b)=>Math.hypot(b.x-cameraX,b.z-cameraZ)-Math.hypot(a.x-cameraX,a.z-cameraZ));for(const o of objects){if(Math.abs(o.x-cameraX)>45||Math.abs(o.z-cameraZ)>45)continue;objectMesh(o,t)}
 for(const p of particles){gl.depthMask(false);draw('sphere',[p.x,.28,p.z],[.10,.10,.10],p.color,0,Math.min(1,p.life),0,0,.8);gl.depthMask(true)}blackHole(t);
}
function resize(){let dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);cvs.width=Math.round(w*dpr);cvs.height=Math.round(h*dpr);cvs.style.width=w+'px';cvs.style.height=h+'px'}window.addEventListener('resize',resize);resize();
function tick(ts){let dt=Math.min(.05,(ts-lastTs)/1000||0);lastTs=ts;if(!paused)move(dt);if(!paused||ts%250<20)render(ts/1000);requestAnimationFrame(tick)}
function start(){audioInit();paused=false;running=true;for(const id of ['menu','pausePanel','settingsPanel'])$(id).classList.add('hidden');$('hud').classList.remove('hidden');$('footer').classList.remove('hidden');$('joystick').classList.remove('disabled');updateHud();save()}
function stop(){paused=true;save();release();$('joystick').classList.add('disabled')}
function overlay(id){stop();for(const panel of ['menu','pausePanel','settingsPanel'])$(panel).classList.toggle('hidden',panel!==id)}
$('play').onclick=start;$('resume').onclick=start;$('pause').onclick=()=>overlay('pausePanel');$('backMenu').onclick=()=>{$('hud').classList.add('hidden');$('footer').classList.add('hidden');$('play').textContent='Continua l’esplorazione ↗';overlay('menu')};let settingReturn='menu';$('menuSettings').onclick=()=>{settingReturn='menu';overlay('settingsPanel')};$('pauseSettings').onclick=()=>{settingReturn='pausePanel';overlay('settingsPanel')};$('closeSettings').onclick=()=>overlay(settingReturn);
$('zen').onclick=()=>{data.zen=!data.zen;updateHud();save();announce(data.zen?'Modalità Zen attiva':'Modalità Zen disattivata',data.zen?'Il buco nero segue la materia da solo':'Esplora liberamente con il joystick')};
function settings(){for(const id of ['music','sfx','particles']){$(id).textContent=data[id]?'ON':'OFF';$(id).classList.toggle('on',data[id])}$('volume').value=Math.round(data.volume*100);$('gravity').value=Math.round(data.gravity*100);$('gravityValue').textContent=Math.round(data.gravity*100)+'%'}
for(const id of ['music','sfx','particles'])$(id).onclick=()=>{data[id]=!data[id];settings();audioUpdate();save()};$('volume').oninput=e=>{data.volume=+e.target.value/100;audioUpdate();save()};$('gravity').oninput=e=>{data.gravity=+e.target.value/100;settings();save()};
$('reset').onclick=()=>{if(!confirm('Vuoi cancellare la crescita e ripartire dal giardino?'))return;const settings={music:data.music,sfx:data.sfx,particles:data.particles,volume:data.volume,gravity:data.gravity};data={...defaults,...settings};cameraX=0;cameraZ=0;setupPhase(true);save();$('hud').classList.add('hidden');$('footer').classList.add('hidden');settingReturn='menu';overlay('menu')};
// A fixed virtual thumbstick: available immediately on mobile, mouse and touch.
const stick=$('stick'),joystick=$('joystick');let ptrId=null;
function updateInput(e){const rect=joystick.getBoundingClientRect();const dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2),dist=Math.hypot(dx,dy),lim=Math.min(dist,39),nx=dist>4?dx/dist:0,ny=dist>4?dy/dist:0;input.axisX=nx*clamp(dist/39,0,1);input.axisZ=ny*clamp(dist/39,0,1);stick.style.transform=`translate(${(nx*lim).toFixed(1)}px,${(ny*lim).toFixed(1)}px)`}
joystick.addEventListener('pointerdown',e=>{if(paused)return;e.preventDefault();ptrId=e.pointerId;joystick.setPointerCapture(e.pointerId);joystick.classList.add('engaged');updateInput(e);audioInit()});joystick.addEventListener('pointermove',e=>{if(e.pointerId===ptrId)updateInput(e)});function release(){ptrId=null;input.axisX=0;input.axisZ=0;stick.style.transform='translate(0px, 0px)';joystick.classList.remove('engaged')}
for(const ty of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(ty,e=>{if(e.pointerId===ptrId)release()});
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();input.keys.add(e.key.toLowerCase());if(e.key==='Escape'&&running&&!paused)overlay('pausePanel')});window.addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase()));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)overlay('pausePanel')});window.addEventListener('pagehide',save);setInterval(()=>{if(running&&!paused)save()},4000);
settings();setupPhase(true);$('joystick').classList.add('disabled');if(hasSave)$('play').textContent='Continua l’esplorazione ↗';requestAnimationFrame(tick);
window.__BHI_DEBUG__={get state(){return {...data,phase,objects:objects.length,render:'WebGL2 3D',gravityEnabled:true,drawCount}},testAdvance(v=86){data.power+=v;setupPhase(true);save()},testStep(n=60){for(let i=0;i<n;i++)move(1/60);return {...data,objects:objects.length}},get bodies(){return objects.slice(0,8).map(({name,req,x,y,z,vx,vy,vz})=>({name,req,x,y,z,vx,vy,vz}))},get canvas(){return cvs}};
})();
