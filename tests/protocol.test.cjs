const {test}=require('node:test');const assert=require('node:assert/strict');
const {decodeFrame,encodeFrame,crc16,FrameAssembler}=require('../src/lib/protocol/PacketFramer.ts');
const {decodePacket,fromHex}=require('../src/lib/protocol/PacketDecoder.ts');
const {uuid,authorizeLiveCommand}=require('../src/lib/protocol/CommandRegistry.ts');
const {PairingStateMachine}=require('../src/lib/pairing/PairingStateMachine.ts');
const fixtures=require('./fixtures/captured-packets.json');
const framed=fixtures.filter(f=>f.hex.startsWith('33da'));
test('Captured non-personal envelopes verify and encode byte-for-byte',()=>{
 for(const f of framed){const data=fromHex(f.hex),frame=decodeFrame(data);assert.deepEqual(encodeFrame(frame),data);assert.equal(frame.body.length,1);}
 assert.equal(decodeFrame(fromHex(framed[0].hex)).command,0x15);
 assert.equal(decodeFrame(fromHex(framed[0].hex)).sequence,7);
 assert.equal(crc16(new TextEncoder().encode('123456789')),0x29b1);
});
test('Bad frame lengths, signature and checksums are rejected',()=>{
 const original=fromHex(framed[0].hex);
 for(const at of [0,6,12,14]){const data=original.slice();data[at]^=1;assert.throws(()=>decodeFrame(data));}
 assert.throws(()=>decodeFrame(original.slice(0,-1)));assert.throws(()=>encodeFrame({command:1,sequence:-1,body:new Uint8Array([0])}));
});
test('Offline reassembly tolerates every byte split and multiple frames',()=>{
 const bytes=fromHex(framed[0].hex);
 for(let split=1;split<bytes.length;split++){const a=new FrameAssembler();assert.equal(a.push(bytes.slice(0,split),1).length,0);assert.equal(a.push(bytes.slice(split),2).length,1);}
 const a=new FrameAssembler();assert.equal(a.push(new Uint8Array([...bytes,...bytes])).length,2);
});
test('Incomplete, oversized, and stale fragments are bounded and reset',()=>{
 const bytes=fromHex(framed[0].hex),a=new FrameAssembler(10);a.push(bytes.slice(0,7),1);assert.throws(()=>a.push(bytes.slice(7),20),/timed out/);assert.equal(a.push(bytes,21).length,1);
 assert.throws(()=>a.push(new Uint8Array(4097)),/limit/);assert.throws(()=>a.push(new Uint8Array([1])),/signature/);assert.equal(a.push(bytes).length,1);
});
test('Captured short responses are recognized without inventing sensor fields',()=>{
 for(const f of fixtures.filter(f=>!f.hex.startsWith('33da')&&!['0201','0205','0211'].includes(f.hex.slice(0,4)))){const decoded=decodePacket(uuid(f.service.slice(2)),uuid(f.characteristic.slice(2)),fromHex(f.hex),f.direction);assert.equal(decoded.status,'observed');assert.equal(decoded.measurement,undefined);}
 assert.equal(decodePacket(uuid('27f0'),uuid('27f7'),fromHex('fffe')).status,'unknown');
 assert.equal(decodePacket(uuid('27f0'),uuid('27f7'),fromHex('02')).status,'invalid');
 assert.throws(()=>fromHex('0x01'));assert.throws(()=>fromHex('1'));assert.throws(()=>fromHex('gg'));assert.throws(()=>authorizeLiveCommand('0201'),/disabled/);
});
test('Standard battery/heart-rate schemas require matching service and complete fields (synthetic boundary fixtures)',()=>{
 assert.equal(decodePacket(uuid('180f'),uuid('2a19'),fromHex('64')).measurement.value,100);
 assert.equal(decodePacket(uuid('180f'),uuid('2a19'),fromHex('65')).status,'invalid');
 assert.equal(decodePacket(uuid('27f0'),uuid('2a19'),fromHex('64')).measurement,undefined);
 assert.equal(decodePacket(uuid('180d'),uuid('2a37'),fromHex('0048')).measurement.value,72);
 assert.equal(decodePacket(uuid('180d'),uuid('2a37'),fromHex('012c01')).measurement.value,300);
 for(const bytes of ['01','0848','1048','0148','004800','0248','20ff','010000'])assert.equal(decodePacket(uuid('180d'),uuid('2a37'),fromHex(bytes)).status,'invalid',bytes);
 assert.equal(decodePacket(uuid('180d'),uuid('2a37'),fromHex('0448')).measurement,undefined);
 assert.equal(decodePacket(uuid('180d'),uuid('2a37'),fromHex('10480004')).measurement.value,72);
});
test('State machine cannot promote transport connection to binding or ready',()=>{
 const state=new PairingStateMachine();assert.throws(()=>state.dispatch('synced','invalid'));
 for(const event of ['connect','gattConnected','discover','discovered','subscribe','subscribed','sync','synced'])state.dispatch(event,event);
 assert.equal(state.state,'services_discovered');assert.throws(()=>state.dispatch('binding','invalid'));
 state.dispatch('disconnect','lost');state.dispatch('connect','retry');assert.equal(state.state,'connecting');
 for(let i=0;i<110;i++)state.dispatch('error','bounded');assert.equal(state.history.length,100);
});
test('Captured 0211 version text is firmware as confirmed by u2l / fnu',()=>{const f=fixtures.find(p=>p.frame===3000);const decoded=decodePacket(uuid('27f0'),uuid('27f7'),fromHex(f.hex),'in');assert.equal(decoded.info.value,'1.1.15');assert.equal(decoded.status,'decoded');assert.equal(decoded.info.kind,'firmware');});
