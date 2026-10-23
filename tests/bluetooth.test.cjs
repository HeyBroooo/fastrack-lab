const {test,beforeEach}=require('node:test');const assert=require('node:assert/strict');
const {BluetoothManager}=require('../src/lib/bluetooth/BluetoothManager.ts');const {uuid,CHANNELS}=require('../src/lib/protocol/CommandRegistry.ts');const {bluetoothIssue,characteristicFlags}=require('../src/lib/bluetooth.ts');
class Characteristic extends EventTarget {
 constructor(id,props={notify:true}){super();this.uuid=uuid(id);this.properties=Object.create({read:false,write:false,writeWithoutResponse:false,notify:false,indicate:false,...props});this.starts=0;this.stops=0;this.active=new Set();}
 addEventListener(type,fn,...rest){if(type==='characteristicvaluechanged')this.active.add(fn);super.addEventListener(type,fn,...rest);}
 removeEventListener(type,fn,...rest){this.active.delete(fn);super.removeEventListener(type,fn,...rest);}
 async startNotifications(){this.starts++;return this;}
 async stopNotifications(){this.stops++;return this;}
 async readValue(){return new DataView(new TextEncoder().encode('lark').buffer);}
 emit(){this.value=new DataView(new Uint8Array([2,1]).buffer);this.dispatchEvent(new Event('characteristicvaluechanged'));}
}
function makeDevice(){const device=new EventTarget();device.id='browser-id';device.name='FT_38112_TEST';const chars=CHANNELS.map(c=>new Characteristic(c.characteristic));const model=new Characteristic('2a24',{read:true,notify:false});const services=['27f0','2760'].map(service=>({uuid:uuid(service),getCharacteristics:async()=>CHANNELS.flatMap((c,i)=>c.service===service?[chars[i]]:[])}));services.push({uuid:uuid('180a'),getCharacteristics:async()=>[model]});device.gatt={connected:false,async connect(){this.connected=true;return this;},disconnect(){if(this.connected){this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}},getPrimaryServices:async()=>services};return {device,chars,model};}
beforeEach(()=>{global.window={isSecureContext:true};global.document={};Object.defineProperty(global,'navigator',{configurable:true,value:{userAgent:'Linux',bluetooth:null}});});
test('Availability distinguishes insecure context, Linux API absence and permissions policy',()=>{assert.match(bluetoothIssue(),/chrome:\/\/flags/);window.isSecureContext=false;assert.match(bluetoothIssue(),/secure page/);window.isSecureContext=true;navigator.bluetooth={};assert.equal(bluetoothIssue(),null);document.permissionsPolicy={allowsFeature:()=>false};assert.match(bluetoothIssue(),/permissions policy/);});
test('Connect, automatic subscriptions, read, rescan and reconnect leave exactly one listener',async()=>{
 const {device,chars}=makeDevice();let selections=0;navigator.bluetooth={requestDevice:async()=>{selections++;return device;}};const manager=new BluetoothManager(12000,45000,false);
 assert.deepEqual(characteristicFlags(chars[0].properties),['notify']);await manager.connect();let s=manager.getSnapshot();assert.equal(s.state,'services_discovered');assert.equal(s.info.model,'lark');assert.equal(s.rows.filter(r=>r.listening).length,5);assert.equal(s.connected,true);
 const count=s.total;chars[0].emit();assert.equal(manager.getSnapshot().total,count+1);
 await manager.rescan();assert.equal(chars[0].stops,1);assert.equal(chars[0].active.size,1);const count2=manager.getSnapshot().total;chars[0].emit();assert.equal(manager.getSnapshot().total,count2+1);
 manager.disconnect();assert.equal(chars[0].active.size,0);assert.equal(manager.getSnapshot().info.model,undefined);chars[0].emit();assert.equal(manager.getSnapshot().total,count2+1);
 await manager.connect(false,true);assert.equal(selections,1);assert.equal(chars[0].active.size,1);manager.dispose();assert.equal(chars[0].active.size,0);assert.equal(device.gatt.connected,false);
});
test('Connection timeout fails without granting pairing and closes late GATT success',async()=>{
 const {device}=makeDevice();let resolve;device.gatt.connect=()=>new Promise(r=>{resolve=r;});navigator.bluetooth={requestDevice:async()=>device};const manager=new BluetoothManager(10,45000,false);await manager.connect();assert.equal(manager.getSnapshot().state,'failed');assert.match(manager.getSnapshot().error,/timed out/);device.gatt.connected=true;resolve(device.gatt);await new Promise(r=>setTimeout(r,0));assert.equal(device.gatt.connected,false);manager.dispose();
});
test('Disconnect during discovery ignores stale results',async()=>{
 const {device,chars}=makeDevice();let resolve;device.gatt.getPrimaryServices=()=>new Promise(r=>{resolve=r;});navigator.bluetooth={requestDevice:async()=>device};const manager=new BluetoothManager(12000,45000,false);const connection=manager.connect();await new Promise(r=>setTimeout(r,0));manager.disconnect();resolve([]);await connection;assert.equal(manager.getSnapshot().state,'disconnected');assert.equal(manager.getSnapshot().rows.length,0);assert.equal(chars[0].active.size,0);manager.dispose();
});
test('Subscription failure cleans listeners and disconnects',async()=>{
 const {device,chars}=makeDevice();chars[1].startNotifications=async()=>{throw new Error('Subscription denied');};navigator.bluetooth={requestDevice:async()=>device};const manager=new BluetoothManager(12000,45000,false);await manager.connect();assert.equal(manager.getSnapshot().state,'failed');assert.ok(chars.every(c=>c.active.size===0));assert.equal(device.gatt.connected,false);manager.dispose();
});
test('Chooser cancellation and audio-device selection produce actionable errors',async()=>{
 navigator.bluetooth={requestDevice:async()=>{throw new DOMException('cancelled','NotFoundError');}};const manager=new BluetoothManager(12000,45000,false);await manager.connect();assert.match(manager.getSnapshot().error,/No device selected/);
 const {device}=makeDevice();device.name='FT_38112BT_TEST';navigator.bluetooth.requestDevice=async()=>device;await manager.connect();assert.match(manager.getSnapshot().error,/audio/);assert.equal(device.gatt.connected,false);manager.dispose();
});
test('Cancelled chooser cannot adopt a device after a newer session starts',async()=>{
 const first=makeDevice(),second=makeDevice();let choose;let calls=0;navigator.bluetooth={requestDevice:()=>++calls===1?new Promise(r=>{choose=r;}):Promise.resolve(second.device)};const manager=new BluetoothManager(12000,45000,false);const pending=manager.connect();manager.disconnect();await manager.connect();choose(first.device);await pending;assert.equal(first.device.gatt.connected,false);assert.equal(second.device.gatt.connected,true);assert.equal(manager.getSnapshot().connected,true);manager.dispose();
});
test('Read failures are per-characteristic and never produce live measurements',async()=>{
 const {device,model}=makeDevice();model.readValue=async()=>{throw new DOMException('not permitted','NotAllowedError');};navigator.bluetooth={requestDevice:async()=>device};const manager=new BluetoothManager(12000,45000,false);await manager.connect();assert.equal(manager.getSnapshot().connected,true);assert.equal(manager.getSnapshot().info.model,undefined);assert.equal(manager.getSnapshot().lastSync,undefined);assert.match(manager.getSnapshot().rows.find(r=>r.uuid===uuid('2a24')).error,/denied/);manager.dispose();
});
test('A timed-out browser connect must settle before another attempt is allowed',async()=>{
 const {device}=makeDevice();let resolve;let selections=0;device.gatt.connect=()=>new Promise(r=>{resolve=r;});navigator.bluetooth={requestDevice:async()=>{selections++;return device;}};const manager=new BluetoothManager(5,45000,false);await manager.connect();await manager.connect();assert.equal(selections,1);assert.match(manager.getSnapshot().error,/still settling/);resolve(device.gatt);await new Promise(r=>setTimeout(r,0));manager.dispose();
});
test('Linux API absence is diagnosed before disabled-feature policy',()=>{document.permissionsPolicy={allowsFeature:()=>false};assert.match(bluetoothIssue(),/chrome:\/\/flags/);});

function makeBindingDevice(){
 const fixture=makeDevice();const writer=new Characteristic('27f1',{notify:false,write:true,writeWithoutResponse:true});const calls=[];
 const reply=(hex='0401000000000000000000000000000000',char=fixture.chars[0])=>{const payload=Uint8Array.from(Buffer.from(hex,'hex'));const wrapped=new Uint8Array(payload.length+4);wrapped.set(payload,2);char.value=new DataView(wrapped.buffer,2,payload.length);char.dispatchEvent(new Event('characteristicvaluechanged'));};
 writer.writeValueWithResponse=async data=>{calls.push({mode:'response',data:Buffer.from(data).toString('hex')});reply();};
 writer.writeValueWithoutResponse=async data=>{calls.push({mode:'no-response',data:Buffer.from(data).toString('hex')});reply();};
 const original=fixture.device.gatt.getPrimaryServices;fixture.device.gatt.getPrimaryServices=async()=>{const services=await original();const service=services.find(s=>s.uuid===uuid('27f0'));const old=service.getCharacteristics;service.getCharacteristics=async()=>[...await old(),writer];return services;};
 navigator.bluetooth={requestDevice:async()=>fixture.device};return {...fixture,writer,calls,reply};
}
test('Manual binding prefers write-with-response, catches immediate response and waits for user observation',async()=>{
 const {calls,chars}=makeBindingDevice();const manager=new BluetoothManager(12000,45000,false);await manager.connect();assert.equal(calls.length,0);await manager.bindWatch();assert.deepEqual(calls,[{mode:'response',data:'0401f3000000'}]);let s=manager.getSnapshot();assert.equal(s.binding.state,'awaiting-watch-confirmation');assert.equal(s.binding.response.status,0);assert.equal(s.binding.observation,'unverified');assert.notEqual(s.state,'ready');assert.equal(chars[0].active.size,1);assert.equal(manager.bindingAttempt,null);assert.ok(s.packets.some(p=>p.direction==='out'&&p.hex==='04 01 f3 00 00 00'));
 manager.observeWatch('home-screen');assert.equal(manager.getSnapshot().binding.observation,'home-screen');assert.equal(manager.getSnapshot().binding.state,'watch-confirmed-by-user');assert.notEqual(manager.getSnapshot().state,'ready');await manager.bindWatch();assert.equal(calls.length,1);manager.dispose();
});
test('Binding waits for notification completion and concurrent clicks send only one write',async()=>{
 const {chars,calls}=makeBindingDevice();const manager=new BluetoothManager(12000,45000,false);await manager.connect();await manager.toggleNotification(`${uuid('27f0')}/${uuid('27f7')}`);let start;chars[0].startNotifications=()=>new Promise(resolve=>{start=()=>resolve(chars[0]);});const pending=manager.bindWatch();await manager.bindWatch();assert.equal(calls.length,0);assert.equal(manager.getSnapshot().binding.state,'subscribing');start();await pending;assert.equal(calls.length,1);assert.equal(chars[0].active.size,1);manager.dispose();
});
test('Write-without-response fallback requires its explicit property',async()=>{
 const f=makeBindingDevice();f.writer.properties.write=false;const manager=new BluetoothManager(12000,45000,false);await manager.connect();await manager.bindWatch();assert.equal(f.calls[0].mode,'no-response');manager.dispose();
 const g=makeBindingDevice();g.writer.writeValueWithResponse=undefined;g.writer.properties.writeWithoutResponse=false;const second=new BluetoothManager(12000,45000,false);await second.connect();await second.bindWatch();assert.equal(g.calls.length,0);assert.match(second.getSnapshot().binding.error,/write method/);second.dispose();
});
test('A rejected acknowledged write is not retried through the fallback',async()=>{
 const f=makeBindingDevice();f.writer.writeValueWithResponse=async()=>{throw new Error('Write denied');};const manager=new BluetoothManager(12000,45000,false);await manager.connect();await manager.bindWatch();assert.equal(manager.getSnapshot().binding.state,'failed');assert.equal(f.calls.length,0);assert.equal(manager.getSnapshot().binding.attempted,true);manager.dispose();
});
test('Binding ignores wrong commands and correct prefixes on the wrong notification characteristic',async()=>{
 const f=makeBindingDevice();f.writer.writeValueWithResponse=async()=>{f.reply('02010000');f.reply(undefined,f.chars[1]);};const manager=new BluetoothManager(100,10,false);await manager.connect();await manager.bindWatch();assert.equal(manager.getSnapshot().binding.state,'failed');assert.match(manager.getSnapshot().binding.error,/timeout/);assert.equal(manager.getSnapshot().binding.response,undefined);assert.equal(manager.bindingAttempt,null);assert.equal(f.chars[0].active.size,1);f.reply();assert.equal(manager.getSnapshot().binding.state,'failed');manager.dispose();
});
test('Nonzero and malformed matching responses fail without claiming pairing',async()=>{
 for(const hex of ['04010200','040100','040100030701']){const f=makeBindingDevice();f.writer.writeValueWithResponse=async()=>f.reply(hex);const manager=new BluetoothManager(12000,45000,false);await manager.connect();await manager.bindWatch();assert.equal(manager.getSnapshot().binding.state,'failed');assert.equal(manager.bindingAttempt,null);assert.equal(manager.getSnapshot().binding.observation,'unverified');manager.dispose();}
});
test('Optional authentication stops after one command and does not retain auth data in snapshots',async()=>{
 const f=makeBindingDevice();let writes=0;f.writer.writeValueWithResponse=async()=>{writes++;f.reply('0401000307414243');};const manager=new BluetoothManager(12000,45000,false);await manager.connect();await manager.bindWatch();const s=manager.getSnapshot();assert.equal(s.binding.state,'response-received');assert.deepEqual(s.binding.response,{status:0,authLength:3,additionalField:7});assert.equal(writes,1);assert.ok(!JSON.stringify(s).includes('41 42 43'));manager.observeWatch('home-screen');assert.equal(manager.getSnapshot().binding.observation,'unverified');manager.dispose();
});
test('Disconnect and reconnect invalidate a pending binding without resending',async()=>{
 const f=makeBindingDevice();let writes=0;f.writer.writeValueWithResponse=async()=>{writes++;};const manager=new BluetoothManager(100,500,false);await manager.connect();const pending=manager.bindWatch();await new Promise(r=>setTimeout(r,0));f.device.gatt.disconnect();await pending;assert.equal(manager.getSnapshot().binding.state,'disconnected');assert.equal(manager.bindingAttempt,null);assert.equal(f.chars[0].active.size,0);await manager.connect(false,true);assert.equal(writes,1);assert.equal(manager.getSnapshot().binding.attempted,false);assert.equal(manager.getSnapshot().binding.response,undefined);assert.equal(f.chars[0].active.size,1);manager.dispose();
});
test('Disposal cancels response wait and removes notification listeners',async()=>{
 const f=makeBindingDevice();f.writer.writeValueWithResponse=async()=>{};const manager=new BluetoothManager(12000,45000,false);await manager.connect();const pending=manager.bindWatch();await new Promise(r=>setTimeout(r,0));manager.dispose();await pending;assert.equal(manager.bindingAttempt,null);assert.equal(f.chars[0].active.size,0);
});
test('Missing binding service, notification characteristic, writer and disconnected device are explicit errors',async()=>{
 const offline=new BluetoothManager(12000,45000,false);await offline.bindWatch();assert.match(offline.getSnapshot().binding.error,/Connect/);offline.dispose();
 for(const missing of ['service','notify','writer']){
  const f=makeBindingDevice();const original=f.device.gatt.getPrimaryServices;
  f.device.gatt.getPrimaryServices=async()=>{const services=await original();if(missing==='service')return services.filter(s=>s.uuid!==uuid('27f0'));const svc=services.find(s=>s.uuid===uuid('27f0'));const old=svc.getCharacteristics;svc.getCharacteristics=async()=>(await old()).filter(c=>c.uuid!==uuid(missing==='notify'?'27f7':'27f1'));return services;};
  const manager=new BluetoothManager(12000,45000,false);await manager.connect();await manager.bindWatch();assert.equal(manager.getSnapshot().binding.state,'failed');assert.match(manager.getSnapshot().binding.error,/missing/);assert.equal(f.calls.length,0);manager.dispose();
 }
});
test('Binding subscription failure removes the response slot and never writes',async()=>{
 const f=makeBindingDevice();const manager=new BluetoothManager(12000,45000,false);await manager.connect();await manager.toggleNotification(`${uuid('27f0')}/${uuid('27f7')}`);f.chars[0].startNotifications=async()=>{throw new Error('Subscription denied');};await manager.bindWatch();assert.equal(f.calls.length,0);assert.equal(manager.bindingAttempt,null);assert.equal(f.chars[0].active.size,0);assert.match(manager.getSnapshot().binding.error,/Subscription denied/);manager.dispose();
});
test('A binding write timeout disconnects instead of overlapping another GATT operation',async()=>{
 const f=makeBindingDevice();f.writer.writeValueWithResponse=()=>new Promise(()=>{});const manager=new BluetoothManager(10,100,false);await manager.connect();await manager.bindWatch();assert.equal(manager.getSnapshot().connected,false);assert.equal(manager.getSnapshot().binding.state,'failed');assert.equal(manager.bindingAttempt,null);assert.equal(f.chars[0].active.size,0);manager.dispose();
});
test('A GATT write acknowledgment alone leaves binding pending until a protocol response',async()=>{
 const f=makeBindingDevice();f.writer.writeValueWithResponse=async()=>{};const manager=new BluetoothManager(100,500,false);await manager.connect();const pending=manager.bindWatch();await new Promise(r=>setTimeout(r,0));assert.equal(manager.getSnapshot().binding.state,'binding');assert.equal(manager.getSnapshot().binding.response,undefined);assert.equal(manager.getSnapshot().busy,true);f.reply();await pending;assert.equal(manager.getSnapshot().binding.state,'awaiting-watch-confirmation');manager.dispose();
});
test('A binding subscription timeout disconnects and never writes after late completion',async()=>{
 const f=makeBindingDevice();const manager=new BluetoothManager(10,100,false);await manager.connect();await manager.toggleNotification(`${uuid('27f0')}/${uuid('27f7')}`);let finish;f.chars[0].startNotifications=()=>new Promise(resolve=>{finish=()=>resolve(f.chars[0]);});await manager.bindWatch();assert.equal(manager.getSnapshot().connected,false);assert.equal(f.calls.length,0);finish();await new Promise(r=>setTimeout(r,0));assert.equal(f.calls.length,0);assert.equal(f.chars[0].active.size,0);assert.equal(manager.bindingAttempt,null);manager.dispose();
});

// Data sync uses the same connection and notification listener as binding.
test('Automatic data reads serialize four requests and populate live metrics; refresh and reconnect work',async()=>{
 const f=makeBindingDevice();const writes=[];
 const replies={ '0201':'020116020f000061000001f03200110302','0205':'0205007b100061000000000000000000','0211':'0211010203040506312e312e313500000000000000','02a0':'02a07b00000014000000f40100003c00000048'};
 f.writer.writeValueWithResponse=async data=>{const hex=Buffer.from(data).toString('hex');writes.push(hex);f.reply(replies[hex]);};
 const manager=new BluetoothManager(100);await manager.connect();let s=manager.getSnapshot();
 assert.deepEqual(writes,['0201','0205','0211','02a0']);assert.equal(s.measurements.battery.value,97);assert.equal(s.info.firmware,'1.1.15');assert.equal(s.measurements.steps.value,123);assert.equal(s.measurements.heartRate.value,72);assert.equal(s.dataStatus.activity,'Received');assert.equal(f.chars[0].active.size,1);
 await manager.sync();assert.equal(writes.length,8);manager.disconnect();assert.deepEqual(manager.getSnapshot().measurements,{});await manager.connect(false,true);assert.equal(writes.length,12);manager.dispose();
});
test('Missing activity reply preserves battery and connection, and exposes the timeout',async()=>{
 const f=makeBindingDevice();f.writer.writeValueWithResponse=async data=>{const hex=Buffer.from(data).toString('hex');if(hex==='0201')f.reply('020116020f000061000001f03200110302');else if(hex==='0205')f.reply('0205007b100061000000000000000000');else if(hex==='0211')f.reply('0211010203040506312e3100');else f.reply('02a00000',f.chars[1]);};
 const manager=new BluetoothManager(15);await manager.connect();const s=manager.getSnapshot();assert.equal(s.connected,true);assert.equal(s.measurements.battery.value,97);assert.equal(s.measurements.steps,undefined);assert.match(s.dataStatus.activity,/No response/);assert.equal(manager.dataResponse,null);manager.dispose();
});
test('Disconnect cancels a data request without sending remaining queries',async()=>{
 const f=makeBindingDevice();let writes=0;f.writer.writeValueWithResponse=async()=>{writes++;f.device.gatt.disconnect();};const manager=new BluetoothManager(100);await manager.connect();assert.equal(writes,1);assert.equal(manager.getSnapshot().connected,false);assert.equal(manager.dataResponse,null);assert.deepEqual(manager.getSnapshot().measurements,{});manager.dispose();
});
test('Data sync ignores wrong prefixes and invalid data never becomes a live measurement',async()=>{
 const f=makeBindingDevice();f.writer.writeValueWithResponse=async data=>{f.reply('04010000');f.reply(Buffer.from(data).toString('hex'));};const manager=new BluetoothManager(30);await manager.connect();assert.equal(manager.getSnapshot().connected,true);assert.deepEqual(manager.getSnapshot().measurements,{});assert.match(manager.getSnapshot().dataStatus.battery,/Truncated/);manager.dispose();
});

function makeHealthDevice(){
 const f=makeBindingDevice();const bulk=new Characteristic('27f6',{notify:false,write:true});const writes=[];let stored=[];
 const original=f.device.gatt.getPrimaryServices;f.device.gatt.getPrimaryServices=async()=>{const services=await original();const service=services.find(s=>s.uuid===uuid('27f0'));const old=service.getCharacteristics;service.getCharacteristics=async()=>[...await old(),bulk];return services;};
 f.writer.writeValueWithResponse=async data=>{if(data[0]===2&&data[1]===9)f.reply('0209000000');};
 bulk.writeValueWithResponse=async data=>{
  const hex=Buffer.from(data).toString('hex');writes.push(hex);
  if(hex==='02f3')f.reply('02f30000000000000000000000000000000000000000');
  else if(hex==='0801')f.reply('080100000000000000',f.chars[1]);
  else if(hex==='080301'){
   f.reply('0803010cea070a1500000f000100000000000000',f.chars[1]);f.reply('0803021000000000000000000000000000000000',f.chars[1]);f.reply('08ee00',f.chars[1]);
  }else if(data[2]===1)f.reply('08ee00',f.chars[1]);
  else{if(hex==='080302')assert.equal(stored.length,1);f.reply(hex,f.chars[1]);}
 };
 const storage={load:async()=>stored,save:async(_,record)=>{stored=[...stored.filter(r=>r.id!==record.id),record];}};
 return {...f,bulk,writes,storage};
}
test('Manager routes bulk notifications, saves before ACK and retains archived records on disconnect',async()=>{
 const f=makeHealthDevice();const manager=new BluetoothManager(100,100,false,f.storage);await manager.connect();await manager.readHealth(manager.generation);const s=manager.getSnapshot();assert.equal(s.healthError,undefined);assert.equal(s.healthRecords.length,1);assert.equal(s.healthRecords[0].kind,'steps');assert.equal(s.healthStatus.hrv,'Not supported by watch firmware');assert.equal(f.chars[1].active.size,1);manager.disconnect();assert.equal(manager.getSnapshot().healthRecords.length,1);assert.equal(manager.healthResponse,null);manager.dispose();
});
test('Manager never acknowledges a record if local persistence fails',async()=>{
 const f=makeHealthDevice();f.storage.save=async()=>{throw new Error('storage full');};const manager=new BluetoothManager(100,100,false,f.storage);await manager.connect();await manager.readHealth(manager.generation);assert.match(manager.getSnapshot().healthError,/storage failed/);assert.ok(!f.writes.includes('080302'));assert.equal(manager.getSnapshot().healthRecords.length,0);assert.equal(manager.getSnapshot().connected,true);manager.dispose();
});
test('Disconnect during local save cannot send a stale ACK or publish into another session',async()=>{
 const f=makeHealthDevice();let saved;let entered;const saving=new Promise(r=>{entered=r;});f.storage.save=()=>{entered();return new Promise(r=>{saved=r;});};const manager=new BluetoothManager(1000,100,false,f.storage);await manager.connect();const sync=manager.readHealth(manager.generation);await saving;manager.disconnect();saved();await assert.rejects(sync,/Session ended/);assert.ok(!f.writes.includes('080302'));assert.equal(manager.getSnapshot().healthRecords.length,0);manager.dispose();
});
test('Previously set-up watch restores permission after reload and reconnects without chooser or bind',async()=>{
 const values=new Map();window.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const f=makeBindingDevice();let selected=0;navigator.bluetooth={requestDevice:async()=>{selected++;return f.device;},getDevices:async()=>[f.device]};
 const first=new BluetoothManager(100,100,false);await first.connect();await first.bindWatch();first.observeWatch('home-screen');assert.equal(first.getSnapshot().binding.remembered,true);first.dispose();
 const second=new BluetoothManager(100,100,false);await second.restoreKnownDevice();assert.equal(second.getSnapshot().canReconnect,true);assert.equal(second.getSnapshot().binding.remembered,true);await second.connect();assert.equal(selected,1);assert.equal(f.calls.length,1);assert.equal(second.getSnapshot().binding.remembered,true);second.showBindingControls();assert.equal(second.getSnapshot().binding.remembered,false);assert.equal(f.calls.length,1);second.dispose();
});
test('Revoked saved permission does not adopt an unrelated device or revive a disposed manager',async()=>{
 const {rememberWatch}=require('../src/lib/bluetooth/RememberedWatch.ts');const values=new Map();window.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 rememberWatch({id:'revoked',name:'Old watch',setupComplete:true});const f=makeDevice();navigator.bluetooth={getDevices:async()=>[f.device]};const manager=new BluetoothManager();await manager.restoreKnownDevice();assert.equal(manager.getSnapshot().canReconnect,false);manager.dispose();
 rememberWatch({id:f.device.id,name:f.device.name,setupComplete:true});let resolve;navigator.bluetooth.getDevices=()=>new Promise(r=>{resolve=r;});const second=new BluetoothManager();const restoration=second.restoreKnownDevice();second.dispose();resolve([f.device]);await restoration;assert.equal(second.getSnapshot().canReconnect,false);
});
test('A watch with history channels skips deprecated activity polling and syncs its dated records directly',async()=>{
 const f=makeHealthDevice();const original=f.writer.writeValueWithResponse;const reads=[];
 f.writer.writeValueWithResponse=async data=>{const hex=Buffer.from(data).toString('hex');reads.push(hex);const replies={'0201':'020116020f000061000001f03200110302','0205':'0205007b100061000000000000000000','0211':'0211010203040506312e312e313500'};if(replies[hex])f.reply(replies[hex]);else await original(data);};
 const manager=new BluetoothManager(100,100,true,f.storage);await manager.connect();assert.deepEqual(reads,['0201','0205','0211','0209']);assert.equal(manager.getSnapshot().healthRecords.length,1);assert.equal(manager.getSnapshot().binding.remembered,true);assert.equal(manager.getSnapshot().healthError,undefined);manager.dispose();
});
