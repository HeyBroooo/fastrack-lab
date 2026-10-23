import {crc16, MAGIC, type Envelope} from './PacketFramer';
/** ao00.c(): every GATT fragment repeats 0x33; the inner envelope does not. */
export class TouchGuiFrames {
  private bytes=new Uint8Array(0);
  constructor(private command:number,private sequence:number){}
  push(chunk:Uint8Array):Envelope|null {
    if(chunk[0]!==0x33)return null;
    if(chunk.length<2)throw new Error('Empty TouchGUI fragment');
    if(chunk.length>=12&&MAGIC.every((v,i)=>chunk[i]===v)){
      const view=new DataView(chunk.buffer,chunk.byteOffset,chunk.byteLength);
      if(view.getUint16(8,true)!==this.command||view.getUint16(10,true)!==this.sequence)return null;
      if(this.bytes.length)throw new Error('Unexpected new frame during transfer');
    }else if(!this.bytes.length)return null;
    const joined=new Uint8Array(this.bytes.length+chunk.length-1);
    if(joined.length>65537)throw new Error('Health frame exceeds protocol limit');
    joined.set(this.bytes);joined.set(chunk.subarray(1),this.bytes.length);this.bytes=joined;
    if(joined.length<11)return null;
    const view=new DataView(joined.buffer);const expected=view.getUint16(5,true)+2;
    if(expected<13||expected>65537)throw new Error('Invalid health frame length');
    if(joined.length<expected)return null;
    if(joined.length!==expected)throw new Error('Health frame length mismatch');
    if(crc16(joined.subarray(0,-2))!==view.getUint16(expected-2,true))throw new Error('Health frame CRC mismatch');
    this.bytes=new Uint8Array(0);
    return {command:this.command,sequence:this.sequence,body:joined.slice(11,-2)};
  }
}
