/* Optional Chromium/CDP smoke test. Requires the app running at SMOKE_URL. No BLE hardware access. */
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fastrack-browser-'));let browser;let socket;let id=0;const pending=new Map();const errors=[];
 try{
  browser=spawn(process.env.CHROMIUM_PATH||'chromium',['--headless','--no-sandbox','--disable-gpu','--enable-experimental-web-platform-features','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${dir}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let stderr='';browser.stderr.on('data',data=>{stderr+=data;});
  browser.on('error',error=>errors.push(error.message));
  const active=path.join(dir,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active)&&browser.exitCode===null;i++)await wait(100);
  if(!fs.existsSync(active))throw new Error('Chromium did not start: '+stderr.slice(-1200));
  const port=fs.readFileSync(active,'utf8').split('\n')[0];const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error((r.exceptionDetails.exception?.description||r.exceptionDetails.text)+' in '+expression.slice(0,240));return r.result.value;};
  const until=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await wait(100);}throw new Error('Browser condition timed out: '+expression+'; alerts: '+await evaluate(`Array.from(document.querySelectorAll('[role=alert]')).map(e=>e.textContent).join(' | ')`));};
  await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:process.env.SMOKE_URL||'http://127.0.0.1:3001'});
  await until(`document.querySelectorAll('nav.tabs button').length === 7`);
  await wait(600);
  for(const title of ['Device setup','Health & activity','Bluetooth inspector','GATT explorer','Protocol debugger','Capture analyzer','Overview']){
   await evaluate(`Array.from(document.querySelectorAll('nav.tabs button')).find(b=>b.textContent===${JSON.stringify(title)}).click()`);
   await until(`document.querySelector('nav.tabs button.selected')?.textContent === ${JSON.stringify(title)}`);
  }
  // Inject a fake with the captured response shape. Never access a physical watch.
  await evaluate(`(()=>{
    const uuid=s=>'0000'+s+'-0000-1000-8000-00805f9b34fb';
    class C extends EventTarget {
      constructor(short,properties){super();this.uuid=uuid(short);this.properties=Object.create({read:false,notify:false,indicate:false,write:false,writeWithoutResponse:false,...properties});}
      async readValue(){return new DataView(new TextEncoder().encode('lark').buffer);}
      async startNotifications(){return this;} async stopNotifications(){return this;}
    }
    const bulkNotify=new C('27f2',{notify:true}),bulk=new C('27f6',{write:true}),notify=new C('27f7',{notify:true}),writer=new C('27f1',{write:true,writeWithoutResponse:true}),model=new C('2a24',{read:true});
    window.__bindWrites=[];window.__dataWrites=[];window.__historyWrites=[];
    const hex=s=>Uint8Array.from(s.match(/../g),x=>parseInt(x,16));
    const emit=(target,bytes)=>{target.value=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);target.dispatchEvent(new Event('characteristicvaluechanged'));};
    const crc=bytes=>{let c=65535;for(const b of bytes){c^=b<<8;for(let i=0;i<8;i++)c=((c<<1)^((c&32768)?0x1021:0))&65535;}return c;};
    const frame=(sequence,body)=>{const b=new Uint8Array(body.length+14),v=new DataView(b.buffer);b.set([51,218,173,218,173,1]);v.setUint16(6,b.length-3,true);v.setUint16(8,4,true);v.setUint16(10,sequence,true);b.set(body,12);v.setUint16(b.length-2,crc(b.subarray(1,-2)),true);return b;};
    bulk.writeValueWithResponse=async bytes=>{
      window.__historyWrites.push(Array.from(bytes));
      if(bytes[0]===2){const b=new Uint8Array(22);b.set([2,243]);b[10]=1;emit(notify,b);return;}
      if(bytes[0]===8){
        if(bytes[1]===1){emit(bulkNotify,hex('080100000000000000'));return;}
        if(bytes[1]===2||bytes[2]===2){emit(bulkNotify,bytes);return;}
        const code=bytes[1];
        if(code===3){emit(bulkNotify,hex('0803010cea070a1500000f010200000000000000'));emit(bulkNotify,hex('080302107b00000014000000f40100003c000000'));emit(bulkNotify,hex('08030305ec01000000'));}
        else if(code===7){emit(bulkNotify,hex('0807010eea070a1500003a010002000000000000'));emit(bulkNotify,hex('0807021000000000000000000000000000000000'));emit(bulkNotify,hex('080703020548'));}
        else if(code===4){emit(bulkNotify,hex('0804010eea070a15010078000202000000000000'));emit(bulkNotify,hex('0804020b0101003c003c00550000000000000000'));emit(bulkNotify,hex('08040304023c033c'));}
        emit(bulkNotify,hex('08ee00'));return;
      }
      const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const operation=bytes[12],type=bytes[13],scope=bytes[14];let body;
      if(operation===1){body=new Uint8Array(14);body.set([1,type,scope]);}
      else{body=new Uint8Array(33);body.set([0,type,scope]);const bv=new DataView(body.buffer);bv.setUint16(5,1,true);bv.setUint16(7,13,true);bv.setUint32(9,6,true);bv.setUint16(14,2026,true);body[16]=10;body[17]=21;bv.setUint32(27,Date.UTC(2026,9,21,12)/1000,true);body[31]=type===1?98:32;body[32]=72;}
      const reply=frame(v.getUint16(10,true),body);emit(notify,reply.slice(0,20));emit(notify,Uint8Array.from([51,...reply.slice(20)]));
    };
    writer.writeValueWithResponse=async bytes=>{
      let data;
      if(bytes[0]===4){window.__bindWrites.push(Array.from(bytes));data=new Uint8Array(17);data.set([4,1]);}
      else if(bytes[1]===9){data=hex('0209c500f8003cc0dce70020');}else{window.__dataWrites.push(Array.from(bytes));const replies={1:'020116020f000061000001f03200110302',5:'0205007b100061000000000000000000',17:'0211010203040506312e312e313500',160:'02a07b00000014000000f40100003c00000048'};data=Uint8Array.from(replies[bytes[1]].match(/../g),x=>parseInt(x,16));}
      notify.value=new DataView(data.buffer);notify.dispatchEvent(new Event('characteristicvaluechanged'));
    };
    writer.writeValueWithoutResponse=async()=>{throw new Error('Unexpected fallback');};
    const d=new EventTarget();d.id='mock-browser-watch';d.name='FT_38112_TEST';
    d.gatt={connected:false,async connect(){this.connected=true;return this;},disconnect(){this.connected=false;d.dispatchEvent(new Event('gattserverdisconnected'));},async getPrimaryServices(){return [{uuid:uuid('180a'),getCharacteristics:async()=>[model]},{uuid:uuid('27f0'),getCharacteristics:async()=>[notify,writer,bulk,bulkNotify]}];}};
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>d}});
  })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Connect watch').click()`);
  await until(`document.querySelector('.device-details')?.textContent.includes('lark') && document.body.textContent.includes('Online')`);
  await until(`window.__dataWrites.length===3 && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Read watch data').disabled`);
  assert.equal(await evaluate('window.__bindWrites.length'),0);
  assert.equal(await evaluate(`document.querySelector('.device-details').textContent.includes('97%')`),true);
  assert.equal(await evaluate(`document.querySelector('.device-details').textContent.includes('1.1.15')`),true);
  await evaluate(`Array.from(document.querySelectorAll('nav.tabs button')).find(b=>b.textContent==='Health & activity').click()`);
  await until(`document.querySelector('.health-grid')?.textContent.includes('123 steps')`);
  assert.equal(await evaluate(`document.querySelector('.health-grid').textContent.includes('72 bpm')`),true);
  await until(`document.querySelector('.health-grid')?.textContent.includes('98 %') && document.querySelectorAll('.health-record').length>=4`);
  assert.equal(await evaluate(`document.body.textContent.includes('Not supported by watch firmware')`),true);
  assert.equal(await evaluate(`document.body.textContent.includes('Sleep breakdown')`),true);
  await evaluate(`document.querySelector('.health-record').open=true`);
  for(const width of [1440,390]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});await evaluate(`document.querySelector('.health-dashboard').scrollIntoView()`);await wait(100);assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,'Health layout overflow');const shot=await call('Page.captureScreenshot',{format:'png'});fs.mkdirSync('report/diagnostics',{recursive:true});fs.writeFileSync('report/diagnostics/health-'+width+'.png',Buffer.from(shot.data,'base64'));}
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`Array.from(document.querySelectorAll('nav.tabs button')).find(b=>b.textContent==='Overview').click()`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Bind Watch')`),false);
  await evaluate(`Array.from(document.querySelectorAll('nav.tabs button')).find(b=>b.textContent==='Device setup').click()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Watch was reset? Show binding controls').click()`);
  await evaluate(`Array.from(document.querySelectorAll('nav.tabs button')).find(b=>b.textContent==='Overview').click()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Bind Watch').click()`);
  await until(`document.body.textContent.includes('Binding test: awaiting-watch-confirmation') && window.__dataWrites.length===6 && Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Home screen appeared')?.disabled===false`);
  assert.deepEqual(await evaluate('window.__bindWrites'),[[4,1,243,0,0,0]]);
  assert.equal(await evaluate(`!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Bind Watch'&&!b.disabled)`),true);
  assert.equal(await evaluate(`document.body.textContent.includes('Paired Successfully')`),false);
  await evaluate(`document.querySelector('.binding-diagnostics').open=true`);
  assert.equal(await evaluate(`document.querySelector('.binding-diagnostics pre').textContent.includes('04 01 f3 00 00 00')`),true);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Home screen appeared').click()`);
  await until(`document.body.textContent.includes('Home screen observed by you')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Disconnect').click()`);
  await until(`!document.querySelector('.device-details')?.textContent.includes('lark')`);
  const persisted=await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('fastrack-health',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('records').objectStore('records').getAll();q.onsuccess=()=>{resolve(q.result.length);db.close();};q.onerror=reject;};r.onerror=reject;})`);
  assert.ok(persisted>=5,'Health records must remain in IndexedDB after disconnect');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Reconnect').click()`);
  await until(`document.querySelector('.device-details')?.textContent.includes('lark')`);
  assert.equal(await evaluate('window.__bindWrites.length'),1);
  await evaluate(`document.querySelector('.binding-diagnostics').open=true`);
  for(const width of [1440,390]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});await wait(100);assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,`Overflow at ${width}px`);const shot=await call('Page.captureScreenshot',{format:'png'});fs.mkdirSync('report/diagnostics',{recursive:true});fs.writeFileSync(`report/diagnostics/dashboard-${width}.png`,Buffer.from(shot.data,'base64'));}
  assert.deepEqual(errors,[]);console.log('Browser smoke passed: 7 views, mocked battery, firmware, steps, sleep, SpO2 and stress history, IndexedDB persistence and single candidate write, response parsing, physical-observation UI, redacted-log controls, disconnect/reconnect without replay, 1440px and 390px layouts, no runtime exceptions. Screenshots are local under report/diagnostics.');
 }finally{socket?.close();browser?.kill('SIGTERM');}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
