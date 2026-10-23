import type {Decoded} from './PacketDecoder';

export type MeasurementKind = 'battery'|'heartRate'|'steps'|'calories'|'distance'|'activeTime';
export type DataQuery = 'device'|'battery'|'firmware'|'activity';
// Constructors and parsers in the supplied APK: kl00, nhm, u2l, ixz.
export const DATA_QUERIES: Record<DataQuery, {code:number;label:string}> = {
  device:{code:0x01,label:'Device information'}, battery:{code:0x05,label:'Battery'},
  firmware:{code:0x11,label:'Firmware'}, activity:{code:0xa0,label:'Current activity'},
};
export function dataCommand(query:DataQuery):Uint8Array<ArrayBuffer> {return new Uint8Array([2,DATA_QUERIES[query].code]);}
export function decodeTouchGuiData(data:Uint8Array):Decoded|null {
  if(data[0]!==2 || !Object.values(DATA_QUERIES).some(q=>q.code===data[1]))return null;
  const command=`02${data[1].toString(16).padStart(2,'0')}`;
  const invalid=(summary:string):Decoded=>({status:'invalid',command,summary});
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(data[1]===1){
    if(data.length<14)return invalid('Truncated TouchGUI device information');
    if(data[7]>100)return invalid('Invalid TouchGUI battery percentage');
    return {status:'decoded',command,summary:`Watch battery ${data[7]}%`,fields:{deviceId:view.getUint16(2,true),versionCode:data[4],runMode:data[5],batteryStatus:data[6],battery:data[7],pairFlag:data[8],bindConfirm:data[11],platform:data[12]},measurement:{kind:'battery',value:data[7],unit:'%'}};
  }
  if(data[1]===5){
    if(data.length<14)return invalid('Truncated TouchGUI battery response');
    if(data[6]>100)return invalid('Invalid TouchGUI battery percentage');
    return {status:'decoded',command,summary:`Battery ${data[6]}%`,fields:{type:data[2],voltage:view.getUint16(3,true),batteryStatus:data[5]},measurement:{kind:'battery',value:data[6],unit:'%'}};
  }
  if(data[1]===0x11){
    if(data.length<8)return invalid('Truncated TouchGUI version response');
    const end=data.findIndex((v,i)=>i>=8&&(v===0||v===255));
    const bytes=data.subarray(8,end<0?data.length:end);
    let version:string;
    try{version=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return invalid('Invalid firmware text');}
    if(/[\x00-\x1f\x7f]/.test(version))return invalid('Invalid firmware text');
    return {status:'decoded',command,summary:version?`Firmware ${version}`:'No detailed firmware version supplied',fields:{sdkVersion:data[2],heartRateAlgorithm:data[3],sleepAlgorithm:data[4],stepAlgorithm:data[5]},...(version?{info:{kind:'firmware' as const,value:version}}:{})};
  }
  if(data.length<19)return invalid('Truncated TouchGUI current activity response');
  const totals=[2,6,10,14].map(offset=>view.getInt32(offset,true));
  if(totals.some(n=>n<0))return invalid('Invalid negative activity totals');
  // The recovered model confirms meanings, but does not document the physical
  // scales of calorie/distance/active-time totals. Do not invent conversions.
  const measurements:NonNullable<Decoded['measurements']>=[
    {kind:'steps',value:totals[0],unit:'steps'},
    {kind:'calories',value:totals[1],unit:'watch units'},
    {kind:'distance',value:totals[2],unit:'watch units'},
    {kind:'activeTime',value:totals[3],unit:'watch units'},
  ];
  if(data[18]>0&&data[18]<255)measurements.push({kind:'heartRate',value:data[18],unit:'bpm'});
  return {status:'decoded',command,summary:`Current activity: ${totals[0]} steps`,measurements,clearMeasurements:data[18]===0||data[18]===255?['heartRate']:[],fields:{heartRate:data[18],steps:totals[0],calories:totals[1],distance:totals[2],activeTime:totals[3]}};
}
