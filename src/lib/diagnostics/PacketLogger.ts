import {BIND_SERVICE, BIND_NOTIFY, bindingPayloadIsSensitive} from '../protocol/BindingProtocol';
import {decodePacket, fromHex, toHex, type Decoded} from '../protocol/PacketDecoder';
export interface Packet {id:number;at:string;direction:'in'|'out';source:'live'|'historical';operation:'read'|'notification'|'write';service:string;characteristic:string;hex?:string;length:number;decoded:Decoded;redacted?:boolean;}
export class PacketLogger {
  packets: Packet[]=[]; total=0;
  add(service:string, characteristic:string, data:Uint8Array, operation:Packet['operation'], direction:Packet['direction']='in') {
    const redacted=direction==='in'&&service===BIND_SERVICE&&characteristic===BIND_NOTIFY&&bindingPayloadIsSensitive(data);
    const packet:Packet={id:++this.total,at:new Date().toISOString(),direction,source:'live',operation,service,characteristic,hex:redacted?undefined:toHex(data),redacted,length:data.length,decoded:decodePacket(service,characteristic,data,direction)};
    this.packets=[packet,...this.packets].slice(0,500);return packet;
  }
  clear(){this.packets=[];this.total=0;}
}
/** Safe default export: no device identity, raw data, decoded strings or unknown bodies. */
export function exportPackets(packets:Packet[], includeRaw=false): string {
  return JSON.stringify({format:'fastrack-lab-packets',version:1,sanitized:!includeRaw,packets:packets.map(p=>({at:p.at,direction:p.direction,operation:p.operation,service:p.service,characteristic:p.characteristic,length:p.length,...(includeRaw?{hex:p.hex}:{}),redacted:!includeRaw||Boolean(p.redacted)}))},null,2);
}
export function importPackets(text:string):Packet[] {
  if(text.length>2_000_000)throw new Error('Capture must be at most 2 MB');
  const data:unknown=JSON.parse(text);
  if(!data||typeof data!=='object')throw new Error('Invalid capture');
  const root=data as Record<string,unknown>;
  if(root.format!=='fastrack-lab-packets'||root.version!==1||!Array.isArray(root.packets)||root.packets.length>500)throw new Error('Expected a Fastrack Lab v1 export with at most 500 packets');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return root.packets.map((item:unknown,index:number)=>{
    if(!item||typeof item!=='object')throw new Error('Invalid packet'); const p=item as Record<string,unknown>;
    if(typeof p.at!=='string'||!Number.isFinite(Date.parse(p.at))||typeof p.service!=='string'||!uuid.test(p.service)||typeof p.characteristic!=='string'||!uuid.test(p.characteristic)||(p.direction!=='in'&&p.direction!=='out')||!['read','notification','write'].includes(String(p.operation))||!Number.isInteger(p.length)||Number(p.length)<0||Number(p.length)>4096)throw new Error(`Invalid packet ${index+1}`);
    if(p.hex!==undefined&&typeof p.hex!=='string')throw new Error('Invalid payload');
    const bytes=typeof p.hex==='string'?fromHex(p.hex):null;
    if(bytes&&bytes.length!==p.length)throw new Error('Payload length does not match metadata');
    const privateBinding=p.direction==='in'&&p.service.toLowerCase()===BIND_SERVICE&&p.characteristic.toLowerCase()===BIND_NOTIFY&&bytes&&bindingPayloadIsSensitive(bytes);
    return {id:index+1,at:p.at,direction:p.direction,source:'historical',operation:p.operation as Packet['operation'],service:p.service.toLowerCase(),characteristic:p.characteristic.toLowerCase(),length:Number(p.length),hex:bytes&&!privateBinding?toHex(bytes):undefined,redacted:!bytes||Boolean(privateBinding),decoded:bytes?decodePacket(p.service.toLowerCase(),p.characteristic.toLowerCase(),bytes,p.direction):{status:'unknown',summary:'Payload redacted; metadata only'}};
  });
}
