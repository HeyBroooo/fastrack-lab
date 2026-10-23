import {ShortHealthTransfer,parseFramedHealth,type HealthKind,type HealthRecord} from '../protocol/HealthHistory';
import {TouchGuiFrames} from '../protocol/TouchGuiFrames';
import {encodeFrame} from '../protocol/PacketFramer';
export interface HealthTransport {
  request<T>(command:Uint8Array,channel:'short'|'bulk'|'frame',parse:(bytes:Uint8Array)=>{value:T}|undefined):Promise<T>;
  save(record:HealthRecord):Promise<void>;
  status(kind:HealthKind,message:string):void;
  check():void;
  sequence():number;
}
const shortReply=(prefix:number[]) => (bytes:Uint8Array)=>prefix.every((v,i)=>bytes[i]===v)?{value:bytes}:undefined;
/** Mirrors elx/qd7 + y3g/ism. Save must complete before SDK record acknowledgements. */
export async function syncHealth(transport:HealthTransport){
  const run=async(kind:HealthKind,work:()=>Promise<void>)=>{
    transport.check();transport.status(kind,'Syncing…');
    try{await work();return true;}catch(error){transport.check();if(error instanceof Error&&(error.message.includes('Bluetooth operation timed out')||error.message.includes('Session ended')))throw error;transport.status(kind,error instanceof Error?error.message:'Health transfer failed');throw error;}
  };
  // c7k returns the entire 0209 response. bu00 indexes capability bytes including its prefix.
  const capabilities=await transport.request(new Uint8Array([2,9]),'short',shortReply([2,9]));
  if(capabilities.length<5)throw new Error('Truncated watch capabilities');
  const stressSupported=Boolean(capabilities[4]&0x20),hrvSupported=Boolean(capabilities[4]&1);
  let spo2Count:number|undefined;
  let days:Uint8Array|null=null;
  try{days=await transport.request(new Uint8Array([8,1]),'bulk',shortReply([8,1]));if(days.length<8)throw new Error('Truncated history inventory');}
  catch(error){transport.check();for(const kind of ['steps','heartRate','sleep'] as const)transport.status(kind,error instanceof Error?error.message:'History inventory failed');throw error;}
  const inventory=await transport.request(new Uint8Array([2,0xf3]),'frame',shortReply([2,0xf3]));
  if(inventory.length<18)throw new Error('Truncated extended health inventory');
  spo2Count=new DataView(inventory.buffer,inventory.byteOffset,inventory.byteLength).getUint16(10,true);
  if(days&&days.length>=8){
    for(const [kind,today,history,count] of [['heartRate',7,8,days[6]],['steps',3,5,days[4]],['sleep',4,6,days[5]]] as const){
      await run(kind,async()=>{
        let saved=0;
        for(const code of [today,...Array.from({length:count},()=>history)]){
          transport.check();const parser=new ShortHealthTransfer(kind,code);
          const record=await transport.request(new Uint8Array([8,code,1]),'bulk',bytes=>{const result=parser.accept(bytes);return result?{value:result.record}:undefined;});
          if(record){await transport.save(record);saved++;transport.status(kind,`Saved ${saved} record${saved===1?'':'s'}…`);}
          transport.check();
          await transport.request(new Uint8Array([8,code,2]),'bulk',shortReply([8,code,2]));
        }
        transport.status(kind,saved?`Synced ${saved} dated record${saved===1?'':'s'}`:'No records on watch');
      });
    }
  }
  for(const [kind,type] of [['spo2',1],['stress',16],['hrv',18]] as const){
    if((kind==='stress'&&!stressSupported)||(kind==='hrv'&&!hrvSupported)){transport.status(kind,'Not supported by watch firmware');continue;}
    if(kind==='spo2'&&spo2Count===0){transport.status(kind,'No records on watch');continue;}
    await run(kind,async()=>{
      let saved=0;
      for(const scope of [1,0] as const){
        const seen=new Set<string>();let more=true;let pages=0;
        while(more){
          if(++pages>255)throw new Error('History limit reached; saved records retained. Sync again to continue.');
          const sequence=transport.sequence(),fragments=new TouchGuiFrames(4,sequence);
          const command=encodeFrame({command:4,sequence,body:new Uint8Array([0,type,scope,0,0])});
          const record=await transport.request(command,'frame',bytes=>{const frame=fragments.push(bytes);return frame?{value:parseFramedHealth(frame.body,kind,scope)}:undefined;});
          if(record){
            const fingerprint=JSON.stringify([record.date,record.samples]);
            if(seen.has(fingerprint))throw new Error('Watch repeated a history page; saved records retained.');seen.add(fingerprint);
            await transport.save(record);saved++;transport.status(kind,`Saved ${saved} record${saved===1?'':'s'}…`);
          }
          transport.check();
          const ackSequence=transport.sequence(),ackFrames=new TouchGuiFrames(4,ackSequence);
          await transport.request(encodeFrame({command:4,sequence:ackSequence,body:new Uint8Array([1,type,scope,0,0])}),'frame',bytes=>{
            const frame=ackFrames.push(bytes);if(!frame)return;
            if(frame.body.length<3||frame.body[0]!==1||frame.body[1]!==type||frame.body[2]!==scope)throw new Error('Health acknowledgement mismatch');
            return {value:true};
          });
          more=scope===0&&Boolean(record?.more);
        }
      }
      transport.status(kind,saved?`Synced ${saved} dated record${saved===1?'':'s'}`:'No records returned by watch');
    });
  }
  await transport.request(new Uint8Array([8,2]),'bulk',shortReply([8,2]));
}
