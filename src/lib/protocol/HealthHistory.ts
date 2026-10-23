export type HealthKind='steps'|'heartRate'|'sleep'|'spo2'|'stress'|'hrv';
export interface HealthSample {at:string;value?:number;heartRate?:number;steps?:number;calories?:number;distance?:number;activeTime?:number;stage?:number;minutes?:number;}
export interface HealthRecord {id:string;kind:HealthKind;date:string;receivedAt:string;summary:Record<string,number>;samples:HealthSample[];more:boolean;}
export const HEALTH_LABELS:Record<HealthKind,string>={steps:'Activity',heartRate:'Heart-rate history',sleep:'Sleep',spo2:'Blood oxygen (SpO₂)',stress:'Stress',hrv:'Heart-rate variability'};
export function watchDate(year:number,month:number,day:number):string {
  const d=new Date(year,month-1,day);
  if(year<2000||year>2199||d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)throw new Error('Invalid watch record date');
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function atMinute(date:string,minute:number){const d=new Date(`${date}T00:00:00`);d.setMinutes(minute);return d.toISOString();}
function createRecord(kind:HealthKind,date:string,summary:Record<string,number>,samples:HealthSample[],more=false):HealthRecord {
  return {id:`${kind}/${date}`,kind,date,receivedAt:new Date().toISOString(),summary,samples,more};
}
/** qvz/tlz/iqz: one ordered series, published only after 08 EE and validation. */
export class ShortHealthTransfer {
  private previous?:Uint8Array;
  private last=0;private date='';private count=0;private summary:Record<string,number>={};private samples:HealthSample[]=[];
  private minutes=0;private interval=0;private empty=false;
  constructor(readonly kind:'steps'|'heartRate'|'sleep',readonly code:number){}
  accept(bytes:Uint8Array):{record:HealthRecord|null}|undefined {
    if(bytes[0]!==8)return;
    if(bytes[1]===0xee){
      if(bytes.length<3||bytes[2]!==0)throw new Error('Watch rejected health transfer');
      if(!this.last||this.empty)return {record:null};
      if(this.last<2||this.samples.length!==this.count)throw new Error(`Incomplete ${this.kind} record: ${this.samples.length}/${this.count} samples`);
      if(this.kind==='sleep'){
        let minute=this.summary.endHour*60+this.summary.endMinute-this.summary.totalMinutes;
        this.samples=this.samples.map(s=>{const result={...s,at:atMinute(this.date,minute)};minute+=s.minutes!;return result;});
      }
      return {record:createRecord(this.kind,this.date,this.summary,this.samples)};
    }
    if(bytes[1]!==this.code)return;
    if(bytes.length<4)throw new Error('Truncated health packet');
    if(this.previous&&bytes.length===this.previous.length&&bytes.every((value,index)=>value===this.previous![index]))return;
    const sequence=bytes[2];if(sequence!==this.last+1)throw new Error('Missing, repeated or unordered health packet');this.last=sequence;this.previous=bytes.slice();
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const need=(n:number)=>{if(bytes.length<n)throw new Error('Truncated health packet');};
    if(sequence===1){
      need(this.kind==='steps'?13:14);
      const year=v.getUint16(4,true);if(!year&&!bytes[6]&&!bytes[7]){this.empty=true;return;}
      this.date=watchDate(year,bytes[6],bytes[7]);
      if(this.kind==='sleep'){
        if(bytes[8]>23||bytes[9]>59)throw new Error('Invalid sleep end time');
        this.summary={endHour:bytes[8],endMinute:bytes[9],totalMinutes:v.getUint16(10,true)};this.count=bytes[12];
      }else{
        this.minutes=v.getUint16(8,true);if(this.minutes>1440)throw new Error('Invalid activity time offset');
        if(this.kind==='steps'){this.interval=bytes[10];this.count=bytes[11];this.summary={intervalMinutes:this.interval};}
        else{this.summary={restingHeartRate:bytes[10]};this.count=v.getUint16(11,true);}
      }
      if(this.count>2880)throw new Error('Health sample count exceeds limit');return;
    }
    if(this.empty)return;
    if(!this.date)throw new Error('Missing record header');
    if(sequence===2){
      if(this.kind==='steps'){
        need(20);const values=[4,8,12,16].map(i=>v.getInt32(i,true));if(values.some(n=>n<0))throw new Error('Negative activity total');
        Object.assign(this.summary,{steps:values[0],calories:values[1],distance:values[2],activeTime:values[3]});
      }else if(this.kind==='sleep'){
        need(15);Object.assign(this.summary,{lightCount:bytes[4],deepCount:bytes[5],wakeCount:bytes[6],lightMinutes:v.getUint16(7,true),deepMinutes:v.getUint16(9,true),sleepScore:bytes[11],remCount:bytes[12],remMinutes:v.getUint16(13,true)});
      }else{
        need(19);Object.assign(this.summary,{fatBurnThreshold:bytes[4],aerobicThreshold:bytes[5],limitThreshold:bytes[6],fatBurnMinutes:v.getUint16(7,true),aerobicMinutes:v.getUint16(9,true),limitMinutes:v.getUint16(11,true),warmUpThreshold:bytes[13],warmUpMinutes:v.getUint16(14,true),anaerobicThreshold:bytes[16],anaerobicMinutes:v.getUint16(17,true)});
      }return;
    }
    const size=this.kind==='steps'?5:2;const length=bytes[3];
    if(length%size||length>bytes.length-4)throw new Error('Invalid sample payload length');
    let delta=0;
    for(let offset=4;offset<4+length&&this.samples.length<this.count;offset+=size){
      if(this.kind==='steps'){
        const a=v.getUint16(offset,true),b=v.getUint16(offset+2,true),c=bytes[offset+4];
        this.samples.push({at:atMinute(this.date,this.minutes),steps:(a>>2)&4095,activeTime:((a>>14)&3)|((b&3)<<2),calories:(b>>2)&1023,distance:(c<<4)|((b>>12)&15)});this.minutes+=this.interval;
      }else if(this.kind==='heartRate'){
        delta+=bytes[offset];const value=bytes[offset+1];
        if(value){this.minutes+=delta;delta=0;if(value===255)throw new Error('Invalid heart-rate sample');this.samples.push({at:atMinute(this.date,this.minutes),value});}
      }else{this.samples.push({at:'',stage:bytes[offset],minutes:bytes[offset+1]});}
    }
  }
}
/** b5h/tra/j8d: framed health records. The SDK's epoch fields encode watch local time. */
export function parseFramedHealth(body:Uint8Array,kind:'spo2'|'stress'|'hrv',scope:0|1):HealthRecord|null {
  if(body.length<14)throw new Error('Truncated health record header');
  const type=kind==='spo2'?1:kind==='stress'?16:18;
  if(body[0]!==0||body[1]!==type||body[2]!==scope)throw new Error('Health response type does not match request');
  const v=new DataView(body.buffer,body.byteOffset,body.byteLength);
  const count=v.getUint16(5,true),headerSize=v.getUint16(7,true),payloadSize=v.getUint32(9,true),more=body[13]===1;
  if(body[13]>1||count>10000)throw new Error('Invalid health record header');
  // Observed header-only replies retain old count/size fields; SDK returns no record.
  if(body.length===14&&!more)return null;
  if(!count){if(more)throw new Error('Empty record claims more data');return null;}
  if(body.length<27||headerSize+14+payloadSize>body.length+11||payloadSize<count*6||27+count*6>body.length)throw new Error('Truncated health record samples');
  const date=watchDate(v.getUint16(14,true),body[16],body[17]);const samples:HealthSample[]=[];
  for(let i=0;i<count;i++){
    const offset=27+i*6;const encoded=new Date(v.getUint32(offset,true)*1000);
    const local=new Date(encoded.getUTCFullYear(),encoded.getUTCMonth(),encoded.getUTCDate(),encoded.getUTCHours(),encoded.getUTCMinutes(),encoded.getUTCSeconds());
    if(local.getFullYear()<2000||local.getFullYear()>2199)throw new Error('Invalid health sample time');
    const value=kind==='hrv'?v.getUint16(offset+4,true):body[offset+4];
    if((kind==='spo2'||kind==='stress')&&value>100)throw new Error(`Invalid ${kind} value`);
    samples.push({at:local.toISOString(),value,...(kind==='spo2'?{heartRate:body[offset+5]}:{})});
  }
  const record=createRecord(kind,date,{offset:v.getUint16(3,true)},samples,more);
  record.id+=`/${samples[0].at}/${scope}`;return record;
}
