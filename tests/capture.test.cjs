const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {decodeFrame,encodeFrame}=require('../src/lib/protocol/PacketFramer.ts');const {fromHex,decodePacket}=require('../src/lib/protocol/PacketDecoder.ts');const {uuid}=require('../src/lib/protocol/CommandRegistry.ts');
const file=path.join(__dirname,'../report/diagnostics/watch-timeline.private.json');
test('All 22 local captured envelopes round-trip; all three clock-shaped payloads validate', {skip:!fs.existsSync(file)},()=>{
 const packets=JSON.parse(fs.readFileSync(file,'utf8'));const framed=packets.filter(p=>p.hex.startsWith('33daaddaad01'));assert.equal(framed.length,22);
 for(const p of framed){const bytes=fromHex(p.hex);assert.deepEqual(encodeFrame(decodeFrame(bytes)),bytes,`frame ${p.frame}`);}
 const clocks=packets.filter(p=>p.direction==='out'&&p.hex.startsWith('0301'));assert.equal(clocks.length,3);
 for(const p of clocks){const decoded=decodePacket(uuid('27f0'),uuid('27f1'),fromHex(p.hex),'out');assert.equal(decoded.status,'observed');assert.equal(decoded.fields.year,2026);assert.equal(decoded.measurement,undefined);}
});
test('Analyzer exports can be imported as historical data without leaking into live state',{skip:!fs.existsSync(file)},()=>{const {importPackets}=require('../src/lib/diagnostics/PacketLogger.ts');for(const kind of ['sanitized','private']){const packets=importPackets(fs.readFileSync(path.join(__dirname,`../report/diagnostics/watch-packets.${kind}.json`),'utf8'));assert.ok(packets.length>100);assert.ok(packets.every(p=>p.source==='historical'));assert.ok(packets.every(p=>p.redacted===(kind==='sanitized')));}});
