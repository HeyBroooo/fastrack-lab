import type {HealthRecord} from '../protocol/HealthHistory';
export interface HealthStorage {load(device:string):Promise<HealthRecord[]>;save(device:string,record:HealthRecord):Promise<void>;}
export class HealthStore implements HealthStorage {
  private async open():Promise<IDBDatabase>{
    if(typeof indexedDB==='undefined')throw new Error('Local health storage is unavailable. No record acknowledgement sent.');
    return new Promise((resolve,reject)=>{const request=indexedDB.open('fastrack-health',1);
      request.onupgradeneeded=()=>{const store=request.result.createObjectStore('records',{keyPath:'key'});store.createIndex('device','device');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('Cannot open health storage'));
      request.onblocked=()=>reject(new Error('Close other Fastrack tabs to open health storage'));
    });
  }
  async load(device:string):Promise<HealthRecord[]>{
    const db=await this.open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly');const r=tx.objectStore('records').index('device').getAll(device);let rows:HealthRecord[]=[];r.onsuccess=()=>{rows=r.result.map(row=>row.record);};tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error??new Error('Health storage read failed'));tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  }
  async save(device:string,record:HealthRecord):Promise<void>{
    const db=await this.open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite',{durability:'strict'});tx.objectStore('records').put({key:`${device}/${record.id}`,device,record});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Health record was not saved'));tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  }
}
