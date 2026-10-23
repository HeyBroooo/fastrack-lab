import {decodeTouchGuiData, type MeasurementKind} from './TouchGuiData';
import {BIND_SERVICE, BIND_NOTIFY, BIND_WRITE, isBindingResponse, parseBindingResponse} from './BindingProtocol';
import {decodeFrame} from './PacketFramer';
import {OBSERVED_PREFIXES, uuid} from './CommandRegistry';
export type Decoded = {status: 'decoded' | 'observed' | 'unknown' | 'invalid'; summary: string; command?: string; fields?: Record<string, string | number>; measurement?: {kind: MeasurementKind; value: number; unit: string}; measurements?: {kind:MeasurementKind;value:number;unit:string}[]; clearMeasurements?:MeasurementKind[]; info?: {kind: 'model' | 'manufacturer' | 'firmware'; value: string}};
export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[\s:]/g, '');
  if (clean.length % 2 || !/^[\da-f]*$/i.test(clean) || clean.length > 8192) throw new Error('Invalid or oversized hexadecimal payload');
  return Uint8Array.from(clean.match(/../g) ?? [], b => parseInt(b, 16));
}
export function toHex(data: Uint8Array): string { return Array.from(data, b => b.toString(16).padStart(2, '0')).join(' '); }
export function decodePacket(service: string, characteristic: string, data: Uint8Array, direction: 'in' | 'out' = 'in'): Decoded {
  const invalid = (summary: string): Decoded => ({status: 'invalid', summary});
  if (!data.length || data.length > 4096) return invalid('Empty or oversized value');
  if (direction === 'in' && service === uuid('180f') && characteristic === uuid('2a19')) {
    if (data.length !== 1 || data[0] > 100) return invalid('Invalid standard battery level');
    return {status: 'decoded', summary: `Battery ${data[0]}%`, measurement: {kind: 'battery', value: data[0], unit: '%'}};
  }
  if (direction === 'in' && service === uuid('180d') && characteristic === uuid('2a37')) {
    const flags=data[0]; const wide=Boolean(flags&1); let offset=wide?3:2;
    if ((flags&0xe0) || data.length<offset || ((flags&2) && !(flags&4))) return invalid('Invalid heart-rate flags or value');
    const value=wide?data[1]+256*data[2]:data[1];
    if (flags&8) offset+=2;
    if (data.length<offset || ((flags&16) ? (data.length-offset<2 || (data.length-offset)%2!==0) : data.length!==offset)) return invalid('Truncated or unexpected heart-rate fields');
    if ((flags&4) && !(flags&2)) return {status:'decoded',summary:'Heart-rate sensor reports no skin contact'};
    if (value<1 || value>300) return invalid('Heart rate outside display validation range (1–300 bpm)');
    return {status:'decoded',summary:`Heart rate ${value} bpm`,measurement:{kind:'heartRate',value,unit:'bpm'}};
  }
  const names: Record<string, 'model'|'manufacturer'|'firmware'> = {[uuid('2a24')]:'model',[uuid('2a29')]:'manufacturer',[uuid('2a26')]:'firmware'};
  if (direction==='in' && service===uuid('180a') && names[characteristic]) {
    try { const value=new TextDecoder('utf-8',{fatal:true}).decode(data).replace(/\0+$/, '');
      if (!value || /[\x00-\x1f\x7f]/.test(value)) return invalid('Invalid device information string');
      return {status:'decoded',summary:`${names[characteristic]}: ${value}`,info:{kind:names[characteristic],value}};
    } catch { return invalid('Invalid UTF-8 device information'); }
  }
  if(direction==='in'&&service===BIND_SERVICE&&characteristic===BIND_NOTIFY){const decoded=decodeTouchGuiData(data);if(decoded)return decoded;}
  if (service===BIND_SERVICE && isBindingResponse(data)) {
    if (direction==='out' && characteristic===BIND_WRITE) return {status:'observed',command:'0401',summary:'Binding candidate sent; not proof of pairing'};
    if (direction==='in' && characteristic===BIND_NOTIFY) {
      try {
        const response=parseBindingResponse(data);
        return {status:'decoded',command:'0401',summary:response.status!==0?'Binding response: nonzero status':response.authLength?'Binding response: additional authentication required':'Binding status zero; watch confirmation still unverified',fields:{status:response.status,authenticationLength:response.authLength,...(response.additionalField===undefined?{}:{additionalField:response.additionalField})}};
      } catch(error) {return invalid(error instanceof Error?error.message:'Invalid binding response');}
    }
  }
  if (![uuid('27f0'),uuid('2760')].includes(service)) return {status:'unknown',summary:'Unclassified GATT value'};
  if (data[0]===0x33) {
    try { const f=decodeFrame(data); return {status:'decoded',command:`frame:${f.command.toString(16).padStart(4,'0')}`,summary:'Envelope verified; body semantics unknown',fields:{command:f.command,sequenceCandidate:f.sequence,bodyBytes:f.body.length,checksum:'CRC valid'}}; }
    catch(error) { return invalid(error instanceof Error?error.message:'Invalid frame'); }
  }
  if(data.length<2) return invalid('Incomplete command prefix');
  const command=toHex(data.subarray(0,2)).replace(/ /g,'');
  if(command==='0211' && direction==='in' && data.length===20) {
    const text=new TextDecoder().decode(data.subarray(8)).replace(/\0+$/, '');
    if(/^\d+\.\d+\.\d+$/.test(text))return {status:'observed',command,summary:'Version-like text; firmware role unverified',fields:{versionTextCandidate:text}};
  }
  if(command==='0301' && direction==='out' && data.length===16) {
    const year=data[2]+data[3]*256;
    if(year<2000||year>2199||data[4]<1||data[4]>12||data[5]<1||data[5]>31||data[6]>23||data[7]>59||data[8]>59)return invalid('Invalid clock-shaped fields');
    return {status:'observed',command,summary:'Clock-shaped command (strong inference); timezone and remaining fields unknown',fields:{year,month:data[4],day:data[5],hour:data[6],minute:data[7],second:data[8]}};
  }
  return {status:OBSERVED_PREFIXES.has(command)?'observed':'unknown',command,summary:OBSERVED_PREFIXES.has(command)?'Captured command family; payload semantics unverified':'Unknown proprietary command'};
}
