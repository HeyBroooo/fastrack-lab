/** Envelope validated against all 22 framed packets in the supplied HCI session. */
export const MAGIC = [0x33, 0xda, 0xad, 0xda, 0xad, 0x01] as const;
export const MAX_FRAME = 4096; // defensive implementation limit, not a device capability
export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc;
}
export interface Envelope { command: number; sequence: number; body: Uint8Array; }
export function decodeFrame(data: Uint8Array): Envelope {
  if (data.length < 15 || data.length > MAX_FRAME) throw new Error('Invalid frame size');
  if (!MAGIC.every((b, i) => data[i] === b)) throw new Error('Invalid frame signature');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint16(6, true) + 3 !== data.length) throw new Error('Frame length mismatch');
  if (crc16(data.subarray(1, -2)) !== view.getUint16(data.length - 2, true)) throw new Error('CRC mismatch');
  return {command: view.getUint16(8, true), sequence: view.getUint16(10, true), body: data.slice(12, -2)};
}
/** Offline tooling only. Envelope validity does NOT authorize a command for transmission. */
export function encodeFrame(frame: Envelope): Uint8Array {
  if (![frame.command, frame.sequence].every(n => Number.isInteger(n) && n >= 0 && n <= 65535)) throw new Error('Invalid envelope fields');
  if (frame.body.length < 1 || frame.body.length + 14 > MAX_FRAME) throw new Error('Invalid body size');
  const data = new Uint8Array(frame.body.length + 14); data.set(MAGIC); data.set(frame.body, 12);
  const view = new DataView(data.buffer);
  view.setUint16(6, data.length - 3, true); view.setUint16(8, frame.command, true); view.setUint16(10, frame.sequence, true);
  view.setUint16(data.length - 2, crc16(data.subarray(1, -2)), true);
  return data;
}
/** Byte-stream utility for offline analysis. No proprietary fragmentation scheme is assumed.
 * Live notifications are decoded individually: HCI fragmentation was already reassembled by the stack.
 */
export class FrameAssembler {
  private buffer = new Uint8Array(0);
  private updated = 0;
  constructor(private timeoutMs = 5000) {}
  reset() { this.buffer = new Uint8Array(0); this.updated = 0; }
  push(chunk: Uint8Array, now = Date.now()): Envelope[] {
    if (this.buffer.length && now - this.updated > this.timeoutMs) { this.reset(); throw new Error('Incomplete frame timed out'); }
    if (chunk.length + this.buffer.length > MAX_FRAME) { this.reset(); throw new Error('Frame buffer limit exceeded'); }
    const joined = new Uint8Array(this.buffer.length + chunk.length); joined.set(this.buffer); joined.set(chunk, this.buffer.length);
    this.buffer = joined; this.updated = now; const result: Envelope[] = [];
    try {
      while (this.buffer.length) {
        if (!MAGIC.slice(0, Math.min(6, this.buffer.length)).every((b, i) => this.buffer[i] === b)) throw new Error('Invalid frame signature');
        if (this.buffer.length < 8) break;
        const length = this.buffer[6] + this.buffer[7] * 256 + 3;
        if (length < 15 || length > MAX_FRAME) throw new Error('Invalid declared length');
        if (this.buffer.length < length) break;
        result.push(decodeFrame(this.buffer.slice(0, length))); this.buffer = this.buffer.slice(length);
      }
      return result;
    } catch (error) { this.reset(); throw error; }
  }
}
