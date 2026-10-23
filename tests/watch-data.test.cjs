const {test}=require('node:test');const assert=require('node:assert/strict');
const {decodePacket,fromHex}=require('../src/lib/protocol/PacketDecoder.ts');const {uuid}=require('../src/lib/protocol/CommandRegistry.ts');
const decode=hex=>decodePacket(uuid('27f0'),uuid('27f7'),fromHex(hex));
test('Captured device and battery replies both report 97 percent using distinct offsets',()=>{
 for(const hex of ['020116020f000061000001f03200110302','0205007b100061000000000000000000'])assert.deepEqual(decode(hex).measurement,{kind:'battery',value:97,unit:'%'});
 assert.equal(decode('020116020f0000ff000001f03200110302').status,'invalid');assert.equal(decode('0205007b1000ff000000000000000000').status,'invalid');
});
test('Firmware parser accepts null and ff terminators, validates truncation and does not promote wrong channels',()=>{
 assert.equal(decode('0211010203040506312e312e3135ff0000').info.value,'1.1.15');assert.equal(decode('021100').status,'invalid');
 assert.equal(decodePacket(uuid('27f0'),uuid('27f2'),fromHex('0205007b100061000000000000000000')).measurement,undefined);
});
test('Synthetic SDK-format activity fixture decodes offset views, zero totals and missing heart rate',()=>{
 const data=fromHex('02a07b00000014000000f40100003c00000048');const padded=new Uint8Array(data.length+7);padded.set(data,3);
 const result=decodePacket(uuid('27f0'),uuid('27f7'),padded.subarray(3,3+data.length));assert.equal(result.measurements.find(m=>m.kind==='steps').value,123);assert.equal(result.measurements.find(m=>m.kind==='heartRate').value,72);
 const zeros=decode('02a00000000000000000000000000000000000');assert.equal(zeros.measurements[0].value,0);assert.deepEqual(zeros.clearMeasurements,['heartRate']);assert.equal(decode('02a0ffffffff00000000000000000000000000').status,'invalid');assert.equal(decode('02a000').status,'invalid');
});
