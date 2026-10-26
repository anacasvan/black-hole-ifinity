export interface Settings {music:boolean;effects:boolean;particles:boolean;volume:number;zen:boolean}
export interface SaveData {power:number;absorbed:number;x:number;y:number;settings:Settings}
export const INITIAL_SETTINGS:Settings={music:true,effects:true,particles:true,volume:.32,zen:false};
const KEY='black-hole-infinity-phaser-v1';
export const newGame=():SaveData=>({power:0,absorbed:0,x:0,y:0,settings:{...INITIAL_SETTINGS}});
export function loadGame():SaveData{try{const raw=localStorage.getItem(KEY);if(!raw)return newGame();const v=JSON.parse(raw) as Partial<SaveData>;return {power:Math.max(0,Number(v.power)||0),absorbed:Math.max(0,Number(v.absorbed)||0),x:Number(v.x)||0,y:Number(v.y)||0,settings:{...INITIAL_SETTINGS,...v.settings}}}catch{return newGame()}}
export function saveGame(data:SaveData){try{localStorage.setItem(KEY,JSON.stringify(data))}catch{/* Storage non disponibile: partita comunque giocabile */}}
export function hasSavedGame(){try{return localStorage.getItem(KEY)!==null}catch{return false}}
export function clearGame(){try{localStorage.removeItem(KEY)}catch{}}
