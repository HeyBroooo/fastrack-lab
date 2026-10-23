import {bindingPayloadIsSensitive} from '../protocol/BindingProtocol';
export interface BindingEvent {
  at: string;
  direction: 'TX' | 'RX' | 'SYSTEM';
  characteristic: string | null;
  command: string;
  status: string;
  description: string;
  hex?: string;
  redacted?: boolean;
  length?: number;
}
export function bindingLogPayload(data: Uint8Array): Pick<BindingEvent, 'hex' | 'redacted' | 'length'> {
  const redacted = bindingPayloadIsSensitive(data);
  // The four-byte header contains only command, status and declared length.
  const visible = redacted ? data.subarray(0, Math.min(4, data.length)) : data;
  return {hex: Array.from(visible, b => b.toString(16).padStart(2, '0')).join(' '), redacted, length: data.length};
}
export function formatBindingLog(events: BindingEvent[]): string {
  return events.map(e => `[${e.at}] ${e.direction} ${e.characteristic ?? '—'} ${e.command} [${e.status}]${e.hex ? ` ${e.hex}${e.redacted ? ' [remaining bytes redacted]' : ''}` : ''} ${e.description}`).join('\n');
}
