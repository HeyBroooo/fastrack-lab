/** TouchGUI ql00 / eiu and capture frames 2698, 2904. Candidate, not proven standalone binding. */
export const BIND_SERVICE = '000027f0-0000-1000-8000-00805f9b34fb';
export const BIND_WRITE = '000027f1-0000-1000-8000-00805f9b34fb';
export const BIND_NOTIFY = '000027f7-0000-1000-8000-00805f9b34fb';
export const bindingCommand = (): Uint8Array<ArrayBuffer> => new Uint8Array([0x04, 0x01, 0xf3, 0, 0, 0]);
export interface BindingResponse {
  status: number;
  authLength: number;
  additionalField?: number;
  authenticationData: Uint8Array;
}
export type BindingSummary = Omit<BindingResponse, 'authenticationData'>;
export const isBindingResponse = (data: Uint8Array) => data.length >= 2 && data[0] === 4 && data[1] === 1;
export function parseBindingResponse(input: DataView | Uint8Array): BindingResponse {
  const data = input instanceof DataView ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : input;
  if (data.length < 2) throw new Error('Binding response is empty or missing command identifiers');
  if (!isBindingResponse(data)) throw new Error('Unexpected command; expected 04 01');
  if (data.length < 4) throw new Error('Binding response is truncated: status and authentication length are required');
  const status = data[2], authLength = data[3];
  if (authLength && data.length < 5 + authLength) throw new Error('Binding response authentication data is truncated');
  // ql00 ignores padding after the declared fields. Preserve only the declared data.
  return {status, authLength, additionalField: authLength ? data[4] : undefined, authenticationData: authLength ? data.slice(5, 5 + authLength) : new Uint8Array(0)};
}
/** Never put random/authentication bytes (including malformed/trailing data) in any log or export. */
export function bindingPayloadIsSensitive(data: Uint8Array): boolean {
  return isBindingResponse(data) && (data.length < 4 || data[3] !== 0 || data.subarray(4).some(byte => byte !== 0));
}
export function bindingSummary(response: BindingResponse): BindingSummary {
  return {status: response.status, authLength: response.authLength, additionalField: response.additionalField};
}
