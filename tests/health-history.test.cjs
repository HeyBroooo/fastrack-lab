const {test}=require('node:test');const assert=require('node:assert/strict');
const {ShortHealthTransfer,parseFramedHealth}=require('../src/lib/protocol/HealthHistory.ts');
const {TouchGuiFrames}=require('../src/lib/protocol/TouchGuiFrames.ts');
const {encodeFrame,decodeFrame}=require('../src/lib/protocol/PacketFramer.ts');
const {fromHex}=require('../src/lib/protocol/PacketDecoder.ts');
const {syncHealth}=require('../src/lib/health/HealthSync.ts');
function stepPackets(code=3){return [fromHex(`08${code.toString(16).padStart(2,'0')}010cea070a1500000f3a1500000000000000`),...Array.from({length:21},(_,i)=>{const b=new Uint8Array(20);b.set([8,code,i+2,i===0?18:i===20?5:15]);return b;})];}
function framedBody(type=1,scope=0,value=98,more=false){const b=new Uint8Array(33),v=new DataView(b.buffer);b.set([0,type,scope]);v.setUint16(5,1,true);v.setUint16(7,13,true);v.setUint32(9,6,true);b[13]=Number(more);v.setUint16(14,2026,true);b[16]=10;b[17]=21;v.setUint32(27,Date.UTC(2026,9,21,12)/1000,true);b[31]=value;b[32]=72;return b;}
test('Captured step sequence produces all 58 intervals and zero totals only after completion',()=>{
 const parser=new ShortHealthTransfer('steps',3);for(const bytes of stepPackets())assert.equal(parser.accept(bytes),undefined);
 const result=parser.accept(fromHex('08ee00')).record;assert.equal(result.date,'2026-10-21');assert.equal(result.samples.length,58);assert.equal(result.summary.steps,0);assert.equal(result.samples[57].steps,0);
});
test('Missing/repeated packets and truncated samples never produce a complete record',()=>{
 const p=new ShortHealthTransfer('steps',3);const packets=stepPackets();p.accept(packets[0]);assert.throws(()=>p.accept(packets[2]),/unordered/);
 const q=new ShortHealthTransfer('steps',3);q.accept(packets[0]);q.accept(packets[1]);assert.throws(()=>q.accept(fromHex('08ee00')),/Incomplete/);
 const r=new ShortHealthTransfer('steps',3);r.accept(packets[0]);assert.equal(r.accept(packets[0]),undefined);const conflicting=packets[0].slice();conflicting[10]^=1;assert.throws(()=>r.accept(conflicting),/unordered/);
});
test('Empty stream and other commands are distinct from a missing transfer terminator',()=>{
 const p=new ShortHealthTransfer('sleep',4);assert.equal(p.accept(fromHex('080701')),undefined);assert.equal(p.accept(fromHex('08ee00')).record,null);
 assert.throws(()=>new ShortHealthTransfer('steps',3).accept(fromHex('08ee01')),/rejected/);
});
test('Synthetic heart-rate history preserves offsets and summary',()=>{
 const p=new ShortHealthTransfer('heartRate',7);const h=new Uint8Array(20);h.set([8,7,1,14,0xea,7,10,21,60,0,58,2,0,2]);p.accept(h);const summary=new Uint8Array(20);summary.set([8,7,2,16]);p.accept(summary);p.accept(fromHex('0807030405480a50'));const record=p.accept(fromHex('08ee00')).record;assert.equal(record.summary.restingHeartRate,58);assert.deepEqual(record.samples.map(s=>s.value),[72,80]);assert.equal(new Date(record.samples[0].at).getMinutes(),5);assert.equal(new Date(record.samples[1].at).getMinutes(),15);
});
test('Synthetic sleep records preserve stages and cross-midnight timing',()=>{
 const p=new ShortHealthTransfer('sleep',4);const h=new Uint8Array(20);h.set([8,4,1,14,0xea,7,10,21,1,0,120,0,2,2]);p.accept(h);const summary=new Uint8Array(20);summary.set([8,4,2,11,1,1,0,60,0,60,0,85,0,0,0]);p.accept(summary);p.accept(fromHex('08040304023c033c'));const r=p.accept(fromHex('08ee00')).record;assert.equal(r.summary.deepMinutes,60);assert.equal(new Date(r.samples[0].at).getDate(),20);assert.equal(new Date(r.samples[0].at).getHours(),23);assert.equal(r.samples[1].stage,3);
});
test('Live TouchGUI fragments strip each 33 prefix and verify CRC, command and sequence',()=>{
 const frame=encodeFrame({command:4,sequence:9,body:framedBody()});const assembler=new TouchGuiFrames(4,9);
 assert.equal(assembler.push(encodeFrame({command:4,sequence:10,body:framedBody()})),null);
 assert.equal(assembler.push(frame.slice(0,20)),null);
 const result=assembler.push(Uint8Array.from([0x33,...frame.slice(20)]));assert.equal(result.sequence,9);assert.equal(parseFramedHealth(result.body,'spo2',0).samples[0].value,98);
 frame[20]^=1;assert.throws(()=>new TouchGuiFrames(4,9).push(frame),/CRC/);
});
test('Framed health validates bounds, category, sample timestamps and percentages',()=>{
 const body=framedBody();assert.equal(parseFramedHealth(body,'spo2',0).samples[0].heartRate,72);
 assert.throws(()=>parseFramedHealth(body,'stress',0),/match/);assert.throws(()=>parseFramedHealth(body.slice(0,-1),'spo2',0),/Truncated/);
 body[31]=255;assert.throws(()=>parseFramedHealth(body,'spo2',0),/Invalid/);
 const empty=fromHex('001001000000000d000000000000');assert.equal(parseFramedHealth(empty,'stress',1),null);
});
function transport(options={}){
 const writes=[],saved=[],statuses={};let sequence=2;
 return {writes,saved,statuses,check(){},sequence:()=>++sequence,status:(k,v)=>{statuses[k]=v;},save:async r=>{if(options.failSave)throw Error('disk full');saved.push(r);},request:async(command,channel,parse)=>{
  writes.push(Buffer.from(command).toString('hex'));let packets;
  if(command[0]===2&&command[1]===9){assert.equal(channel,'short');packets=[fromHex(options.capabilities??'0209c500f8003cc0dce70020')];}
  else if(command[0]===2&&command[1]===0xf3){assert.equal(channel,'frame');packets=[fromHex('02f30000000000000000000000000000000000000000')];}
  else if(command[0]===8){assert.equal(channel,'bulk');if(command[1]===1)packets=[fromHex('080100000000000000')];else if(command[1]===2||command[2]===2)packets=[command];else packets=command[1]===3?[...stepPackets(),fromHex('08ee00')]:[fromHex('08ee00')];}
  else{assert.equal(channel,'frame');const f=decodeFrame(command);const body=new Uint8Array(14);body.set(f.body.slice(0,3));packets=[encodeFrame({command:4,sequence:f.sequence,body})];}
  for(const bytes of packets){const result=parse(bytes);if(result)return result.value;}throw Error('mock received no complete response');
 }};
}
test('SDK sync covers current histories, respects capability bits and retains records before acknowledging',async()=>{
 const t=transport();const save=t.save;t.save=async r=>{assert.ok(!t.writes.includes('080302'));await save(r);};await syncHealth(t);
 assert.equal(t.saved.length,1);assert.equal(t.statuses.hrv,'Not supported by watch firmware');assert.equal(t.statuses.spo2,'No records on watch');assert.equal(t.writes.at(-1),'0802');assert.equal(t.writes.filter(w=>w.startsWith('33')).length,4);
});
test('Storage failure stops sync before acknowledgement or completion and preserves watch data',async()=>{
 const t=transport({failSave:true});await assert.rejects(syncHealth(t),/disk full/);assert.ok(!t.writes.includes('080302'));assert.ok(!t.writes.includes('0802'));
});
test('Unsupported optional sensors never receive a framed request',async()=>{const t=transport({capabilities:'0209000000'});await syncHealth(t);assert.equal(t.writes.filter(w=>w.startsWith('33')).length,0);assert.equal(t.statuses.stress,'Not supported by watch firmware');});
test('Framed sync follows more-data pages and saves each page before its acknowledgement',async()=>{
 const t=transport({capabilities:'0209000021'});const original=t.request;const pages=new Map();let pendingRecord=false,acknowledged=0;
 t.save=async record=>{t.saved.push(record);pendingRecord=false;};
 t.request=async(command,channel,parse)=>{
  if(command[0]===2&&command[1]===0xf3){const b=fromHex('02f30000000000000000010000000000000000000000');return parse(b).value;}
  if(command[0]!==51)return original(command,channel,parse);
  const f=decodeFrame(command),[op,type,scope]=f.body;const key=type+'/'+scope;let body;
  if(op===1){assert.equal(pendingRecord,false);acknowledged++;body=new Uint8Array(14);body.set([1,type,scope]);}
  else{const page=(pages.get(key)??0)+1;pages.set(key,page);body=framedBody(type,scope,type===1?98:32,type===16&&scope===0&&page===1);const v=new DataView(body.buffer);v.setUint32(27,v.getUint32(27,true)+page*60,true);if(type===18)v.setUint16(31,45,true);pendingRecord=true;}
  return parse(encodeFrame({command:4,sequence:f.sequence,body})).value;
 };
 await syncHealth(t);assert.equal(pages.get('16/0'),2);assert.equal(acknowledged,7);assert.equal(t.saved.filter(r=>r.kind==='stress').length,3);assert.equal(t.saved.filter(r=>r.kind==='hrv').length,2);
});
test('Repeated historical page stops without acknowledging the duplicate',async()=>{
 const t=transport();const original=t.request;let reads=0,acks=0;
 t.request=async(command,channel,parse)=>{
  if(command[0]!==51)return original(command,channel,parse);
  const f=decodeFrame(command),[op,type,scope]=f.body;let body;
  if(op===1){acks++;body=new Uint8Array(14);body.set([1,type,scope]);}
  else{reads++;body=framedBody(type,scope,32,scope===0);}
  return parse(encodeFrame({command:4,sequence:f.sequence,body})).value;
 };
 await assert.rejects(syncHealth(t),/repeated/);assert.equal(reads,3);assert.equal(acks,2);assert.ok(!t.writes.includes('0802'));
});

test('Live header-only SpO2 frame with stale count has no measurement',()=>{
 const packet=fromHex('33daad daad01190004000100000101de1e01000d000600000000293d'.replace(/ /g,''));
 const frame=new TouchGuiFrames(4,1).push(packet);assert.equal(parseFramedHealth(frame.body,'spo2',1),null);
});
test('October 22 real heart-rate capture ignores stale padding and exact retransmissions',()=>{
 const capture=require('./fixtures/health-2026-10-22.json');const parser=new ShortHealthTransfer('heartRate',7);let record;
 for(const row of capture.records.filter(r=>r.request==='health group 07')){const bytes=fromHex(row.hex);const result=parser.accept(bytes);if(result)record=result.record;else parser.accept(bytes);}
 assert.equal(record.samples.length,12);assert.equal(record.samples.at(-1).value,91);
});
