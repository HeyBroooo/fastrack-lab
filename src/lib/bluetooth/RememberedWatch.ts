export interface RememberedWatch {id:string;name:string;setupComplete:boolean;}
const KEY='fastrack-last-watch-v1';
export function readRememberedWatch():RememberedWatch|null {
  try{const raw=window.localStorage.getItem(KEY);if(!raw)return null;const data=JSON.parse(raw);return typeof data.id==='string'&&typeof data.name==='string'&&typeof data.setupComplete==='boolean'?data:null;}catch{return null;}
}
export function rememberWatch(watch:RememberedWatch):void {try{window.localStorage.setItem(KEY,JSON.stringify(watch));}catch{/* Permissions still allow an in-session reconnect when storage is blocked. */}}
