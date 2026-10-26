import type {SaveData} from './state';
import {getStageIndex,getUniverse,progressInStage} from './content';
export interface HUD {power:number;absorbed:number;stage:number;universe:number;progress:number;zen:boolean}
type Notice={title:string;detail:string};
type Handlers={onHud?:(value:HUD)=>void;onNotice?:(value:Notice)=>void};
const handlers=new Set<Handlers>();
export function subscribe(handlersToAdd:Handlers){handlers.add(handlersToAdd);return ()=>{handlers.delete(handlersToAdd)}}
export function emitHud(data:SaveData){const hud:HUD={power:data.power,absorbed:data.absorbed,stage:getStageIndex(data.power),universe:getUniverse(data.power),progress:progressInStage(data.power),zen:data.settings.zen};handlers.forEach(h=>h.onHud?.(hud))}
export function emitNotice(title:string,detail:string){handlers.forEach(h=>h.onNotice?.({title,detail}))}
