import {readRememberedWatch,rememberWatch} from './RememberedWatch';
import {syncHealth} from '../health/HealthSync';
import {HealthStore,type HealthStorage} from '../health/HealthStore';
import {HEALTH_LABELS,type HealthKind,type HealthRecord} from '../protocol/HealthHistory';
import {decodeTouchGuiData, DATA_QUERIES, dataCommand, type DataQuery, type MeasurementKind} from '../protocol/TouchGuiData';
import {BIND_SERVICE, BIND_WRITE, BIND_NOTIFY, bindingCommand, bindingSummary, type BindingSummary} from '../protocol/BindingProtocol';
import {BindingAttempt, type BindingState} from '../pairing/BindingAttempt';
import {bindingLogPayload, type BindingEvent} from '../diagnostics/BindingLog';
import {bluetoothError, bluetoothIssue, characteristicFlags, getBluetooth, SERVICES, type BLECharacteristic, type BLEDevice} from '../bluetooth';
import {CHANNELS, roleFor, uuid} from '../protocol/CommandRegistry';
import {PacketLogger, type Packet} from '../diagnostics/PacketLogger';
import {PairingStateMachine, type PairingEvent, type PairingState, type Transition} from '../pairing/PairingStateMachine';
export interface GattRow {key:string;service:string;uuid:string;flags:string[];role:string;listening:boolean;value?:string;error?:string;}
export interface Measurement {value:number;unit:string;at:string;}
export interface BindingStatus {remembered?:boolean;state:BindingState;attempted:boolean;response?:BindingSummary;error?:string;observation:'unverified'|'home-screen'|'still-pairing';}
export interface Snapshot {healthRecords:HealthRecord[];healthStatus:Partial<Record<HealthKind,string>>;healthError?:string;binding:BindingStatus;bindingEvents:BindingEvent[];state:PairingState;connected:boolean;busy:boolean;deviceName:string;rows:GattRow[];packets:Packet[];total:number;events:string[];transitions:Transition[];error?:string;info:Partial<Record<'model'|'manufacturer'|'firmware',string>>;measurements:Partial<Record<MeasurementKind,Measurement>>;dataStatus:Partial<Record<DataQuery,string>>;lastSync?:string;canReconnect:boolean;}
export const initialSnapshot = ():Snapshot=>({healthRecords:[],healthStatus:{},binding:{state:'idle',attempted:false,observation:'unverified'},bindingEvents:[],state:'disconnected',connected:false,busy:false,deviceName:'No watch selected',rows:[],packets:[],total:0,events:[],transitions:[],info:{},measurements:{},dataStatus:{},canReconnect:false});
export class BluetoothManager {
  private device:BLEDevice|null=null;
  private chars=new Map<string,BLECharacteristic>();
  private listeners=new Map<string,{char:BLECharacteristic;listener:EventListener}>();
  private observers=new Set<(snapshot:Snapshot)=>void>();
  private machine=new PairingStateMachine();
  private logger=new PacketLogger();
  private generation=0;
  private connectionPending=false;
  private dataResponse:((data:Uint8Array)=>void)|null=null;
  private healthResponse:((channel:string,data:Uint8Array)=>void)|null=null;
  private frameSequence=2;
  private healthNeedsReconnect=false;
  private bindingAttempt:BindingAttempt|null=null;
  private aborter=new AbortController();
  private snapshot=initialSnapshot();
  constructor(private timeoutMs=12000, private bindingTimeoutMs=45000, private autoSync=true,private healthStore:HealthStorage=new HealthStore()) {}
  async restoreKnownDevice(){
    const previous=readRememberedWatch();const bluetooth=getBluetooth();const generation=this.generation;
    if(!previous||!bluetooth?.getDevices)return;
    try{const devices=await bluetooth.getDevices();if(generation!==this.generation||this.snapshot.busy||this.snapshot.connected)return;
      const device=devices.find(d=>d.id===previous.id&&!d.name?.startsWith('FT_38112BT'));
      if(device){this.device=device;this.publish({deviceName:device.name||previous.name,canReconnect:true,binding:{...this.snapshot.binding,remembered:previous.setupComplete}});}
    }catch{ /* Permission revocation simply falls back to the normal picker. */ }
  }
  private saveSetup(complete:boolean){if(!this.device)return;rememberWatch({id:this.device.id,name:this.device.name||'Watch',setupComplete:complete});this.publish({binding:{...this.snapshot.binding,remembered:complete}});}
  showBindingControls(){if(this.snapshot.busy)return;this.saveSetup(false);}
  getSnapshot=()=>this.snapshot;
  subscribe=(callback:(snapshot:Snapshot)=>void)=>{this.observers.add(callback);return ()=>{this.observers.delete(callback);};};
  private publish(patch:Partial<Snapshot>={}){this.snapshot={...this.snapshot,...patch,state:this.machine.state,transitions:[...this.machine.history],packets:[...this.logger.packets],total:this.logger.total};this.observers.forEach(fn=>fn(this.snapshot));}
  private log(message:string){this.publish({events:[`${new Date().toISOString()} ${message}`,...this.snapshot.events].slice(0,100)});}
  private bindingEvent(direction:BindingEvent['direction'],status:string,description:string,characteristic:string|null=null,data?:Uint8Array){
    const event:BindingEvent={at:new Date().toISOString(),direction,status,description,characteristic,command:direction==='TX'?'Bind candidate 0401':direction==='RX'?'Binding response 0401':'BLE / binding',...(data?bindingLogPayload(data):{})};
    this.publish({bindingEvents:[...this.snapshot.bindingEvents,event].slice(-200)});
  }
  private bindingState(state:BindingState,description:string,patch:Partial<BindingStatus>={}){
    this.publish({binding:{...this.snapshot.binding,...patch,state}});this.bindingEvent('SYSTEM',state,description);
  }
  private transition(event:PairingEvent,detail:string){this.machine.dispatch(event,detail);this.log(detail);}
  private ensure(generation:number){if(generation!==this.generation||this.aborter.signal.aborted)throw new Error('Session ended');}
  private async timed<T>(promise:Promise<T>,generation:number):Promise<T>{
    const signal=this.aborter.signal;let timer:ReturnType<typeof setTimeout>|undefined;let abort:()=>void=()=>{};
    try {const value=await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Bluetooth operation timed out; reconnect to retry')),this.timeoutMs);abort=()=>reject(new Error('Session ended'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();})]);this.ensure(generation);return value;}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  private cleanupListeners(){for(const {char,listener} of this.listeners.values())char.removeEventListener('characteristicvaluechanged',listener);this.listeners.clear();}
  private endSession(){this.dataResponse=null;this.healthResponse=null;this.bindingAttempt?.cancel('Binding cancelled: BLE session ended');this.bindingAttempt=null;this.generation++;this.aborter.abort();this.aborter=new AbortController();this.cleanupListeners();this.chars.clear();}
  private disconnected=()=>{
    this.endSession();this.transition('disconnect','BLE disconnected. Application binding remains unverified.');
    this.bindingState('disconnected','BLE disconnected; any pending binding attempt was cancelled.',{response:undefined,observation:'unverified'});
    this.publish({connected:false,busy:false,rows:[],info:{},measurements:{},dataStatus:{},lastSync:undefined,canReconnect:Boolean(this.device)});
  };
  disconnect(){const device=this.device;device?.removeEventListener('gattserverdisconnected',this.disconnected);this.disconnected();device?.gatt?.disconnect();}
  dispose(){this.observers.clear();this.device?.removeEventListener('gattserverdisconnected',this.disconnected);this.endSession();this.device?.gatt?.disconnect();}
  private fail(error:unknown){const message=bluetoothError(error);this.device?.removeEventListener('gattserverdisconnected',this.disconnected);this.endSession();this.device?.gatt?.disconnect();this.transition('error',message);this.bindingState('failed',message,{error:message,observation:'unverified'});this.publish({error:message,busy:false,connected:false,rows:[],info:{},measurements:{},dataStatus:{},lastSync:undefined,canReconnect:Boolean(this.device)});}
  async connect(showAll=false,reconnect=false){
    if(this.snapshot.busy||this.snapshot.connected)return;
    if(this.connectionPending){this.publish({error:'The previous browser connection is still settling. Wait for it to finish, or reload this page before reconnecting.'});return;}
    const issue=bluetoothIssue();const bluetooth=getBluetooth();if(issue||!bluetooth){this.publish({error:issue||'Bluetooth unavailable'});return;}
    this.endSession();this.healthNeedsReconnect=false;const generation=this.generation;this.logger.clear();
    this.bindingState('connecting','Connecting BLE; no binding command is sent automatically.',{attempted:false,response:undefined,error:undefined,observation:'unverified',remembered:false});
    this.transition('connect',reconnect?'Reconnecting to previously selected watch':'Waiting for browser device selection');
    this.publish({busy:true,error:undefined,healthRecords:[],healthStatus:{},healthError:undefined,rows:[],info:{},measurements:{},dataStatus:{},lastSync:undefined});
    try{
      // requestDevice must run before any await, while the click still has user activation.
      const selection=(reconnect||!showAll)&&this.device?Promise.resolve(this.device):bluetooth.requestDevice({...showAll?{acceptAllDevices:true}:{filters:[{namePrefix:'FT_38112'}]},optionalServices:SERVICES});
      // The chooser is user-controlled; do not impose a device-operation timeout on it.
      const device=await selection;this.ensure(generation);
      if(device.name?.startsWith('FT_38112BT'))throw new Error('Select the BLE data watch, not the BT audio interface.');
      this.device?.removeEventListener('gattserverdisconnected',this.disconnected);this.device=device;
      this.publish({deviceName:device.name||'Unnamed BLE device',canReconnect:true});
      const previous=readRememberedWatch();const remembered=previous?.id===device.id&&previous.setupComplete;this.saveSetup(Boolean(remembered));
      device.addEventListener('gattserverdisconnected',this.disconnected);
      if(!device.gatt)throw new Error('Device has no GATT server');
      this.connectionPending=true;
      let connecting:ReturnType<typeof device.gatt.connect>;
      try{connecting=device.gatt.connect();}catch(error){this.connectionPending=false;throw error;}
      // A browser connect cannot be cancelled. Close a late success after timeout/disposal.
      void connecting.then(server=>{this.connectionPending=false;if(generation!==this.generation)server.disconnect();},()=>{this.connectionPending=false;});
      await this.timed(connecting,generation);this.transition('gattConnected','GATT connected; this is not proof of pairing');this.publish({connected:true});
      await this.discoverInternal(generation);await this.subscribeKnown(generation);await this.readInternal(generation);
      this.bindingState('connected','GATT discovery complete. Bind Watch is a separate manual action.');
      if(this.autoSync){await this.readWatchData(generation);await this.readHealth(generation);}
    }catch(error){if(generation===this.generation)this.fail(error);}
    finally{if(generation===this.generation)this.publish({busy:false});}
  }
  private async discoverInternal(generation:number){
    if(!this.device?.gatt?.connected)throw new Error('Watch disconnected');
    this.transition('discover','Discovering permitted GATT services');
    // Stop each old notification context before obtaining replacement objects.
    for(const {char} of this.listeners.values())await this.timed(char.stopNotifications(),generation);
    this.cleanupListeners();this.chars.clear();this.publish({rows:[]});
    const services=await this.timed(this.device.gatt.getPrimaryServices(),generation);const rows:GattRow[]=[];
    for(const service of services){
      try{for(const char of await this.timed(service.getCharacteristics(),generation)){
        const key=`${service.uuid}/${char.uuid}`;this.chars.set(key,char);rows.push({key,service:service.uuid,uuid:char.uuid,flags:characteristicFlags(char.properties),role:roleFor(service.uuid,char.uuid),listening:false});
      }}catch(error){this.ensure(generation);if(error instanceof Error&&error.message.includes('timed out'))throw error;this.log(`Service ${service.uuid} unavailable: ${bluetoothError(error)}`);}
    }
    if(!rows.length)throw new Error('No accessible characteristics. Additional service permissions or vendor initialization may be needed.');
    this.publish({rows});this.transition('discovered',`${services.length} services and ${rows.length} characteristics discovered`);
  }
  private async subscribeKnown(generation:number){
    this.transition('subscribe','Enabling the notification channels observed in the capture');
    for(const channel of CHANNELS){const key=`${uuid(channel.service)}/${uuid(channel.characteristic)}`;
      if(this.chars.has(key))await this.setNotification(key,true,generation);else this.log(`Observed channel ${channel.characteristic} is not exposed by this device`);
    }
    for(const row of this.snapshot.rows)if([uuid('2a19'),uuid('2a37')].includes(row.uuid)&&(row.flags.includes('notify')||row.flags.includes('indicate')))await this.setNotification(row.key,true,generation);
    this.transition('subscribed','Notification channels ready for binding and data requests.');
  }
  private record(row:GattRow,data:DataView,operation:Packet['operation']){
    const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    if(operation==='notification'&&row.service===BIND_SERVICE&&row.uuid===BIND_NOTIFY){this.bindingAttempt?.accept(bytes);this.dataResponse?.(bytes);}
    if(operation==='notification'&&row.service===BIND_SERVICE)this.healthResponse?.(row.uuid,bytes);
    const packet=this.logger.add(row.service,row.uuid,bytes,operation);
    const info={...this.snapshot.info};const measurements={...this.snapshot.measurements};
    if(packet.decoded.info)info[packet.decoded.info.kind]=packet.decoded.info.value;
    for(const kind of packet.decoded.clearMeasurements??[])delete measurements[kind];
    for(const m of [...(packet.decoded.measurement?[packet.decoded.measurement]:[]),...(packet.decoded.measurements??[])])measurements[m.kind]={value:m.value,unit:m.unit,at:packet.at};
    this.publish({info,measurements,rows:operation==='read'?this.snapshot.rows.map(r=>r.key===row.key?{...r,value:packet.hex,error:undefined}:r):this.snapshot.rows});
  }
  private async setNotification(key:string,enable:boolean,generation:number){
    const char=this.chars.get(key);const row=this.snapshot.rows.find(r=>r.key===key);if(!char||!row)throw new Error('Characteristic no longer available');
    if(enable===this.listeners.has(key))return;
    if(enable){
      if(!char.properties.notify&&!char.properties.indicate)throw new Error('Notifications not supported');
      const listener:EventListener=()=>{if(generation===this.generation&&char.value)this.record(row,char.value,'notification');};
      char.addEventListener('characteristicvaluechanged',listener);this.listeners.set(key,{char,listener});
      try{await this.timed(char.startNotifications(),generation);}catch(error){char.removeEventListener('characteristicvaluechanged',listener);if(this.listeners.get(key)?.listener===listener)this.listeners.delete(key);throw error;}
    }else{await this.timed(char.stopNotifications(),generation);const existing=this.listeners.get(key);if(existing)char.removeEventListener('characteristicvaluechanged',existing.listener);this.listeners.delete(key);}
    this.publish({rows:this.snapshot.rows.map(r=>r.key===key?{...r,listening:enable}:r)});this.log(`${enable?'Listening on':'Stopped'} ${row.uuid}`);
  }
  private async readInternal(generation:number){
    this.transition('sync','Reading permitted GATT information');let successes=0;
    for(const row of this.snapshot.rows){const char=this.chars.get(row.key);if(!char?.properties.read)continue;
      try{const value=await this.timed(char.readValue(),generation);this.record(row,value,'read');successes++;}
      catch(error){this.ensure(generation);if(error instanceof Error&&error.message.includes('timed out'))throw error;this.publish({rows:this.snapshot.rows.map(r=>r.key===row.key?{...r,error:bluetoothError(error)}:r)});}
    }
    this.publish({lastSync:successes?new Date().toISOString():undefined});this.transition('synced',`Read ${successes} characteristics. Watch data queries are tracked separately.`);
  }
  private async readWatchData(generation:number){
    const writer=this.chars.get(`${BIND_SERVICE}/${BIND_WRITE}`);
    const notifyKey=`${BIND_SERVICE}/${BIND_NOTIFY}`;
    if(!writer||!this.chars.has(notifyKey)){
      this.publish({dataStatus:{device:'TouchGUI data channels unavailable',battery:'TouchGUI data channels unavailable',firmware:'TouchGUI data channels unavailable',activity:'TouchGUI data channels unavailable'}});return;
    }
    if(this.snapshot.binding.response?.authLength||this.snapshot.binding.state==='failed'){
      this.publish({error:'Complete watch binding before requesting data.'});return;
    }
    await this.setNotification(notifyKey,true,generation);
    const write=writer.properties.write&&writer.writeValueWithResponse?
      (bytes:Uint8Array<ArrayBuffer>)=>writer.writeValueWithResponse!(bytes):
      writer.properties.writeWithoutResponse&&writer.writeValueWithoutResponse?
      (bytes:Uint8Array<ArrayBuffer>)=>writer.writeValueWithoutResponse!(bytes):null;
    if(!write){this.publish({error:'The watch data channel has no supported write method.'});return;}
    this.transition('sync','Requesting battery, firmware and current activity from the watch');
    let received=0;
    const historyAvailable=this.chars.has(`${BIND_SERVICE}/${uuid('27f6')}`)&&this.chars.has(`${BIND_SERVICE}/${uuid('27f2')}`);
    const queries=(Object.keys(DATA_QUERIES) as DataQuery[]).filter(query=>query!=='activity'||!historyAvailable);
    if(historyAvailable)this.publish({dataStatus:{...this.snapshot.dataStatus,activity:'Read through health history'}});
    for(const query of queries){
      this.ensure(generation);
      const {code,label}=DATA_QUERIES[query];
      this.publish({dataStatus:{...this.snapshot.dataStatus,[query]:'Reading…'}});
      let timer:ReturnType<typeof setTimeout>|undefined;
      const signal=this.aborter.signal;
      let abort:()=>void=()=>{};
      let receive:(data:Uint8Array)=>void=()=>{};
      const response=new Promise<Uint8Array>((resolve,reject)=>{
        receive=data=>{if(data[0]===2&&data[1]===code)resolve(data.slice());};
        abort=()=>reject(new Error('Session ended'));
        signal.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>reject(new Error('No response from watch. Wake it, finish binding if needed, then read again.')),this.timeoutMs);
      });
      // An immediate notification can precede the write acknowledgement.
      void response.catch(()=>{});this.dataResponse=receive;
      try{
        const command=dataCommand(query);
        this.logger.add(BIND_SERVICE,BIND_WRITE,command,'write','out');this.publish();
        await this.timed(write(command),generation);
        const bytes=await response;this.ensure(generation);
        const decoded=decodeTouchGuiData(bytes);
        if(!decoded||decoded.status==='invalid')throw new Error(decoded?.summary??'Unrecognized response');
        received++;
        this.publish({lastSync:new Date().toISOString(),dataStatus:{...this.snapshot.dataStatus,[query]:query==='activity'&&(bytes[18]===0||bytes[18]===255)?'Received; no heart-rate reading stored':'Received'}});
      }catch(error){
        this.ensure(generation);
        if(error instanceof Error&&error.message.includes('Bluetooth operation timed out'))throw error;
        const message=bluetoothError(error);
        this.publish({dataStatus:{...this.snapshot.dataStatus,[query]:message}});this.log(`${label}: ${message}`);
      }finally{
        clearTimeout(timer);signal.removeEventListener('abort',abort);
        if(this.dataResponse===receive)this.dataResponse=null;
      }
    }
    this.transition('synced',`Received ${received} of ${queries.length} watch data responses`);
  }
  private async healthRequest<T>(command:Uint8Array,channel:'short'|'bulk'|'frame',parse:(bytes:Uint8Array)=>{value:T}|undefined,generation:number):Promise<T>{
    this.ensure(generation);
    const characteristic=channel==='short'?BIND_WRITE:uuid('27f6');
    const writer=this.chars.get(`${BIND_SERVICE}/${characteristic}`);
    if(!writer)throw new Error('Health transfer write channel is missing');
    const notify=channel==='bulk'?uuid('27f2'):BIND_NOTIFY;
    await this.setNotification(`${BIND_SERVICE}/${notify}`,true,generation);
    const data=new Uint8Array(command);
    const write=writer.properties.write&&writer.writeValueWithResponse?()=>writer.writeValueWithResponse!(data):writer.properties.writeWithoutResponse&&writer.writeValueWithoutResponse?()=>writer.writeValueWithoutResponse!(data):null;
    if(!write)throw new Error('Health channel does not support writes');
    let timer:ReturnType<typeof setTimeout>|undefined;const signal=this.aborter.signal;let abort=()=>{};let receiver:((channel:string,data:Uint8Array)=>void)|null=null;
    const response=new Promise<T>((resolve,reject)=>{
      receiver=(received,bytes)=>{if(received!==notify)return;try{const result=parse(bytes);if(result)resolve(result.value);}catch(error){reject(error);}};this.healthResponse=receiver;
      abort=()=>reject(new Error('Session ended'));signal.addEventListener('abort',abort,{once:true});
      // Total deadline bounds even a device which streams indefinitely.
      timer=setTimeout(()=>reject(new Error('Health response timed out; reconnect before retrying history.')),Math.max(this.timeoutMs,30000));
    });
    void response.catch(()=>{});
    try{this.logger.add(BIND_SERVICE,characteristic,command,'write','out');this.publish();await this.timed(write(),generation);const value=await response;this.ensure(generation);return value;}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);if(this.healthResponse===receiver)this.healthResponse=null;}
  }
  private async readHealth(generation:number){
    if(!this.chars.has(`${BIND_SERVICE}/${uuid('27f6')}`)||!this.chars.has(`${BIND_SERVICE}/${uuid('27f2')}`)){
      this.publish({healthError:'This connection does not expose the watch history channels.'});return;
    }
    if(this.snapshot.binding.response?.authLength||this.snapshot.binding.state==='failed')return;
    if(this.healthNeedsReconnect){this.publish({healthError:'Reconnect before retrying an interrupted health transfer. Saved records are retained.'});return;}
    const device=this.device!.id;
    this.publish({healthError:undefined,healthStatus:{}});
    try{
      const records=await this.timed(this.healthStore.load(device),generation);this.publish({healthRecords:records});
      await syncHealth({
        request:(command,channel,parse)=>this.healthRequest(command,channel,parse,generation),
        check:()=>this.ensure(generation),sequence:()=>{this.frameSequence=this.frameSequence%65534+1;return this.frameSequence;},
        status:(kind,message)=>{this.ensure(generation);this.publish({healthStatus:{...this.snapshot.healthStatus,[kind]:message}});this.log(`${HEALTH_LABELS[kind]}: ${message}`);},
        save:async record=>{
          this.ensure(generation);
          try{await this.timed(this.healthStore.save(device,record),generation);}catch(error){throw new Error(`Local storage failed; record not acknowledged: ${bluetoothError(error)}`);}
          this.ensure(generation);const records=this.snapshot.healthRecords.filter(r=>r.id!==record.id);records.push(record);
          this.publish({healthRecords:records,lastSync:new Date().toISOString()});
        },
      });
      this.saveSetup(true);
    }catch(error){
      this.ensure(generation);this.healthNeedsReconnect=true;
      if(error instanceof Error&&error.message.includes('Bluetooth operation timed out'))throw error;
      this.publish({healthError:bluetoothError(error)});
    }
  }
  /** Fixed binding write, separate from the allowlisted read queries. */
  async bindWatch(){
    if(this.snapshot.busy)return;
    if(!this.device?.gatt?.connected||!this.snapshot.connected){
      this.bindingState('failed','Connect the BLE watch before clicking Bind Watch.',{error:'Connect the BLE watch first.'});return;
    }
    if(this.snapshot.binding.attempted){
      this.bindingEvent('SYSTEM','blocked','One candidate was already attempted on this connection. Disconnect and reconnect before a new manual attempt.');return;
    }
    const generation=this.generation;let attempt:BindingAttempt|null=null;
    this.publish({busy:true,error:undefined});
    this.bindingState('subscribing','Preparing the 27F7 notification channel.',{error:undefined,response:undefined,observation:'unverified'});
    try{
      if(!this.snapshot.rows.some(row=>row.service===BIND_SERVICE))throw new Error('Required service 27F0 is missing. Reconnect and grant the watch service permissions.');
      const notifyKey=`${BIND_SERVICE}/${BIND_NOTIFY}`;
      if(!this.chars.has(notifyKey))throw new Error('Required notification characteristic 27F7 is missing.');
      // The normal session listener routes to this slot; no second GATT listener is added.
      attempt=new BindingAttempt(this.aborter.signal,this.bindingTimeoutMs,data=>this.bindingEvent('RX','received','Binding response received; authentication bytes, if present, are redacted.',BIND_NOTIFY,data));
      this.bindingAttempt=attempt;
      await this.setNotification(notifyKey,true,generation);this.ensure(generation);
      this.bindingEvent('SYSTEM','subscribed','Notifications are enabled on 27F7 before the write.',BIND_NOTIFY);
      const writer=this.chars.get(`${BIND_SERVICE}/${BIND_WRITE}`);
      if(!writer)throw new Error('Required write characteristic 27F1 is missing.');
      let write:(data:Uint8Array<ArrayBuffer>)=>Promise<void>;
      let mode:string;
      if(writer.properties.write&&typeof writer.writeValueWithResponse==='function'){
        write=data=>writer.writeValueWithResponse!(data);mode='write with response';
      }else if(writer.properties.writeWithoutResponse&&typeof writer.writeValueWithoutResponse==='function'){
        write=data=>writer.writeValueWithoutResponse!(data);mode='write without response';
      }else throw new Error('27F1 does not expose a supported write method/property combination. No command sent.');
      this.bindingState('binding','Sending the fixed binding candidate once. Check the watch now and accept a confirmation popup if it appears.',{attempted:true});
      const command=bindingCommand();attempt.arm();
      this.bindingEvent('TX','attempted',`Sending one candidate using ${mode}. No automatic retry.`,BIND_WRITE,command);
      this.logger.add(BIND_SERVICE,BIND_WRITE,command,'write','out');this.publish();
      await this.timed(write(command),generation);
      this.bindingEvent('SYSTEM','write-complete','GATT write completed. This is not a binding response or proof of pairing.',BIND_WRITE);
      const response=await attempt.response;this.ensure(generation);
      const summary=bindingSummary(response);
      this.bindingState('response-received',`Binding response status ${summary.status}; authentication length ${summary.authLength}.`,{response:summary});
      if(summary.status!==0){
        this.bindingState('failed',`Watch returned nonzero binding status ${summary.status}. No further command sent.`,{error:`Watch returned binding status ${summary.status}.`});
      }else if(summary.authLength){
        this.bindingEvent('SYSTEM','authentication-required',`Additional authentication required (${summary.authLength} bytes, additional field ${summary.additionalField}). Data redacted. The authentication command is not implemented; stopped here.`,BIND_NOTIFY);
      }else{
        this.healthNeedsReconnect=false;
        this.bindingState('awaiting-watch-confirmation','Status zero received. Accept any watch popup and check whether the normal home screen appears. The app cannot verify that screen remotely.');
        if(this.autoSync){await this.readWatchData(generation);await this.readHealth(generation);}
      }
    }catch(error){
      if(generation===this.generation){
        // A timed-out browser write is not cancellable. Close the link instead of overlapping another GATT operation.
        if(error instanceof Error&&error.message.includes('Bluetooth operation timed out'))this.fail(error);
        else{const message=bluetoothError(error);this.bindingState('failed',message,{error:message});}
      }
    }finally{
      attempt?.cancel('Binding operation finished');
      if(this.bindingAttempt===attempt)this.bindingAttempt=null;
      if(generation===this.generation)this.publish({busy:false});
    }
  }
  observeWatch(observation:'home-screen'|'still-pairing'){
    const response=this.snapshot.binding.response;
    if(!this.snapshot.connected||this.snapshot.busy||response?.status!==0||response.authLength)return;
    this.publish({binding:{...this.snapshot.binding,observation,state:observation==='home-screen'?'watch-confirmed-by-user':'awaiting-watch-confirmation'}});
    this.bindingEvent('SYSTEM','user-observation',observation==='home-screen'?'User reports the normal home screen appeared. Binding persistence and data sync remain untested.':'User reports the watch is still on Scan to Pair. Status zero did not establish a complete pairing flow.');
    if(observation==='home-screen'){this.saveSetup(true);if(this.autoSync)void this.sync();}
  }
  private async operation(task:(generation:number)=>Promise<void>){if(this.snapshot.busy||!this.snapshot.connected)return;const generation=this.generation;this.publish({busy:true,error:undefined});try{await task(generation);}catch(error){if(generation===this.generation)this.fail(error);}finally{if(generation===this.generation)this.publish({busy:false});}}
  rescan(){return this.operation(async generation=>{await this.discoverInternal(generation);await this.subscribeKnown(generation);await this.readInternal(generation);if(this.autoSync){await this.readWatchData(generation);await this.readHealth(generation);}});}
  sync(){return this.operation(async generation=>{await this.readInternal(generation);await this.readWatchData(generation);await this.readHealth(generation);});}
  toggleNotification(key:string){return this.operation(generation=>this.setNotification(key,!this.listeners.has(key),generation));}
}
