const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseBindingResponse,bindingCommand,BIND_SERVICE,BIND_NOTIFY}=require('../src/lib/protocol/BindingProtocol.ts');
const {bindingLogPayload,formatBindingLog}=require('../src/lib/diagnostics/BindingLog.ts');
const {PacketLogger,exportPackets,importPackets}=require('../src/lib/diagnostics/PacketLogger.ts');
const {fromHex}=require('../src/lib/protocol/PacketDecoder.ts');
// Exact, non-personal response from frame 2904; optional-auth cases below are synthetic.
const captured='0401000000000000000000000000000000';
test('Binding candidate matches ql00 and captured frame 2698 exactly',()=>assert.equal(Buffer.from(bindingCommand()).toString('hex'),'0401f3000000'));
test('Captured zero-status response decodes without inventing physical success',()=>{const r=parseBindingResponse(fromHex(captured));assert.equal(r.status,0);assert.equal(r.authLength,0);assert.equal(r.additionalField,undefined);assert.equal(r.authenticationData.length,0);assert.equal(r.paired,undefined);});
test('Binding parser preserves nonzero status without assigning undocumented meanings',()=>assert.equal(parseBindingResponse(fromHex('04010200')).status,2));
test('Binding parser checks and extracts optional authentication data and extra field',()=>{const r=parseBindingResponse(fromHex('0401000307414243'));assert.equal(r.authLength,3);assert.equal(r.additionalField,7);assert.deepEqual([...r.authenticationData],[65,66,67]);});
test('Binding parser rejects empty, truncated and wrong command payloads',()=>{for(const hex of ['', '04', '0401','040100','04010001','0401000207aa','02010000','04020000'])assert.throws(()=>parseBindingResponse(fromHex(hex)),undefined,hex);});
test('Binding parser and logging respect DataView byte offsets',()=>{const bytes=fromHex('ffff'+captured+'eeee');const r=parseBindingResponse(new DataView(bytes.buffer,2,17));assert.equal(r.status,0);assert.equal(r.authLength,0);assert.equal(bindingLogPayload(bytes.subarray(2,19)).hex,fromHex(captured).reduce((s,b)=>s+(s?' ':'')+b.toString(16).padStart(2,'0'),''));});
test('Authentication bytes are redacted in binding log, live inspector, raw export and historical import',()=>{
 const data=fromHex('0401000307414243'),visible=bindingLogPayload(data);assert.equal(visible.hex,'04 01 00 03');assert.equal(visible.redacted,true);
 const text=formatBindingLog([{at:'2026-10-21T00:00:00Z',direction:'RX',characteristic:BIND_NOTIFY,command:'Binding response',status:'received',description:'Authentication required',...visible}]);assert.ok(!text.includes('41 42 43'));
 const logger=new PacketLogger();logger.add(BIND_SERVICE,BIND_NOTIFY,data,'notification');assert.equal(logger.packets[0].hex,undefined);assert.equal(logger.packets[0].decoded.fields.authenticationLength,3);
 const exported=exportPackets(logger.packets,true);assert.ok(!exported.includes('41 42 43'));assert.equal(JSON.parse(exported).packets[0].redacted,true);
 const unsafe={format:'fastrack-lab-packets',version:1,packets:[{at:'2026-10-21T00:00:00Z',direction:'in',operation:'notification',service:BIND_SERVICE,characteristic:BIND_NOTIFY,length:8,hex:'0401000307414243'}]};assert.equal(importPackets(JSON.stringify(unsafe))[0].hex,undefined);
});
test('Malformed auth response and unexplained trailing data cannot leak through diagnostics',()=>{for(const hex of ['04010003074142','04010000414243']){const data=fromHex(hex);assert.equal(bindingLogPayload(data).hex,'04 01 00 '+data[3].toString(16).padStart(2,'0'));assert.equal(bindingLogPayload(data).redacted,true);}});
