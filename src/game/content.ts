export type ItemKind = 'nature'|'stone'|'tree'|'furniture'|'vehicle'|'house'|'tower'|'mountain'|'water'|'island'|'moon'|'planet'|'saturn'|'satellite'|'sun'|'star'|'galaxy'|'nebula'|'comet';
export interface ItemSpec {name:string;kind:ItemKind;req:number;radius:number;gain:number;color:number}
export interface Stage {name:string;hint:string;next:string;start:number;end:number;background:number;accent:number;items:ItemSpec[]}
type PartialItem=[name:string,kind:ItemKind,req:number,radius:number,gain:number,color:number];
const stage=(name:string,hint:string,next:string,start:number,end:number,background:number,accent:number,items:PartialItem[]):Stage=>({name,hint,next,start,end,background,accent,items:items.map(([name,kind,req,radius,gain,color])=>({name,kind,req,radius,gain,color}))});
export const STAGES:Stage[]=[
 stage('Giardino terrestre','Un piccolo mondo','La Terra dall’alto',0,86,0x112a34,0x84e9d4,[
  ['Foglia','nature',0,9,1.7,0x89ddb2],['Fiore','nature',4,11,2,0xf6a6d1],['Sasso','stone',9,12,2.3,0x9eafca],['Panchina','furniture',17,16,3.2,0xd6ad91],['Albero','tree',22,20,3.4,0x73d5a9],['Semaforo','furniture',30,22,3.8,0xffd48d],['Automobile','vehicle',39,25,4.5,0xffa896],['Casa','house',51,31,5,0xf9dbb5],['Palazzo','tower',62,38,6.2,0xb5b9f3],['Grattacielo','tower',76,45,8,0xaabbed]
 ]),
 stage('La Terra dall’alto','Il mondo dall’alto','Il Sistema Solare',86,186,0x0b2b45,0x73dbe9,[
  ['Quartiere','house',86,10,2,0xe3bde4],['Città','tower',99,15,3,0xc7b8fc],['Isola','island',113,20,4,0xb5e3a5],['Montagna','mountain',125,25,4.5,0xa0c6dd],['Oceano','water',140,30,5.5,0x66b9ec],['Continente','planet',151,36,6,0x77d3c7],['Luna','moon',162,40,7,0xe6dfd3],['Terra','planet',175,46,9,0x78a5ef]
 ]),
 stage('Sistema Solare','Oltre l’atmosfera','Via Lattea',186,306,0x0a1028,0x98b1ff,[
  ['Cometa','comet',186,9,2.5,0x98dff4],['Asteroide','stone',197,13,3,0xbbadad],['Satellite','satellite',212,15,3.2,0xb0c9e6],['Mercurio','moon',225,19,4,0xb8b6c6],['Marte','planet',241,24,4.8,0xea987f],['Pianeta','planet',256,30,5,0x85baf1],['Saturno','saturn',270,35,6.2,0xe9c19b],['Sole','sun',288,47,9,0xffce8e]
 ]),
 stage('Via Lattea','Tra le stelle','Universo osservabile',306,451,0x170e32,0xc39bff,[
  ['Stella','star',306,9,3,0xf7eabd],['Ammasso stellare','star',325,14,3.8,0xffd7a5],['Nebulosa','nebula',345,22,4.8,0xecabf1],['Sistema stellare','sun',367,28,5.3,0xf7c6b7],['Supernova','star',389,36,6.3,0xf7baf5],['Galassia','galaxy',419,47,9,0xa19ff9]
 ]),
 stage('Universo osservabile','Nessun confine','Multiverso infinito',451,621,0x1b1236,0xc6a5fd,[
  ['Ammasso di galassie','galaxy',451,10,3.2,0xb2b1f7],['Superammasso','galaxy',477,17,4,0xd5b2f9],['Filamento cosmico','nebula',509,24,5,0xb3d2ff],['Vuoto cosmico','galaxy',545,32,6.5,0xc6adf3],['Universo','galaxy',588,47,10,0xf7b2d9]
 ]),
 stage('Multiverso infinito','Oltre l’infinito','Nuovo universo',621,831,0x161335,0xdda6f7,[
  ['Stella impossibile','star',621,10,3.5,0xf9e4d5],['Universo specchio','galaxy',650,16,4.3,0xe6b2ef],['Cosmo alternativo','nebula',688,25,5,0x92aef2],['Dimensione','galaxy',731,34,6.5,0xd2a7f1],['Intero universo','galaxy',783,47,10,0xffb1e6]
 ])
];
export function getStageIndex(power:number){return power>=621?5:STAGES.findIndex(s=>power>=s.start&&power<s.end)}
export function progressInStage(power:number){const s=STAGES[getStageIndex(power)];return getStageIndex(power)===5?((power-621)%210)/210:Math.max(0,Math.min(1,(power-s.start)/(s.end-s.start)))}
export function getUniverse(power:number){return power<621?1:2+Math.floor((power-621)/210)}
export function getAvailableSpecs(power:number):ItemSpec[]{const stageIndex=getStageIndex(power);const n=stageIndex===5?Math.floor((power-621)/210)*210:0;return STAGES[stageIndex].items.map(item=>({...item,req:item.req+n}))}
export function formatMass(power:number){const exponent=Math.floor(power/12),mantissa=Math.pow(10,power/12-exponent);return `${mantissa.toFixed(2)} × 10^${exponent}`}
