const {test}=require('node:test');const assert=require('node:assert/strict');
const {PacketLogger,importPackets,exportPackets}=require('../src/lib/diagnostics/PacketLogger.ts');const {uuid}=require('../src/lib/protocol/CommandRegistry.ts');
test('Sanitized export removes payload and decoded private strings; imports stay historical',()=>{
 const logger=new PacketLogger();logger.add(uuid('180a'),uuid('2a29'),new TextEncoder().encode('PRIVATE_TEXT'),'read');
 const safe=exportPackets(logger.packets);assert.ok(!safe.includes('PRIVATE_TEXT'));assert.ok(!safe.includes('50 52 49'));assert.equal(importPackets(safe)[0].redacted,true);
 const raw=importPackets(exportPackets(logger.packets,true));assert.equal(raw[0].source,'historical');assert.equal(raw[0].decoded.info.value,'PRIVATE_TEXT');
});
test('Import rejects malformed data and mismatched payload lengths',()=>{
 for(const text of ['null','{}','[]','{"format":"fastrack-lab-packets","version":1,"packets":[null]}','x'.repeat(2_000_001)])assert.throws(()=>importPackets(text));
 const logger=new PacketLogger();logger.add(uuid('180f'),uuid('2a19'),new Uint8Array([50]),'read');const data=JSON.parse(exportPackets(logger.packets,true));data.packets[0].length=2;assert.throws(()=>importPackets(JSON.stringify(data)),/length/);
});
test('Packet retention is bounded while total count remains accurate',()=>{const logger=new PacketLogger();for(let i=0;i<510;i++)logger.add(uuid('27f0'),uuid('27f7'),new Uint8Array([2,1]),'notification');assert.equal(logger.packets.length,500);assert.equal(logger.total,510);});
