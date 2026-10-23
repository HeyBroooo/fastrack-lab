export const uuid = (short: string) => `0000${short.toLowerCase()}-0000-1000-8000-00805f9b34fb`;
export const CHANNELS = [
  {service: '27f0', characteristic: '27f7', role: 'Short-command and framed responses'},
  {service: '27f0', characteristic: '27f2', role: '08xx bulk responses'},
  {service: '2760', characteristic: '2762', role: 'Subscribed in capture; payload role unknown'},
  {service: '2760', characteristic: '2763', role: 'Bidirectional 20xx channel'},
  {service: '2760', characteristic: '2764', role: 'Subscribed in capture; payload role unknown'},
] as const;
export const OBSERVED_PREFIXES = new Set(['0201','0209','0401','0206','0204','0301','0211','0311','0801','02f3','0807','08ee','0803','0804','0802','2001','2005','0205','0215','02b1','0310','02b0','0303','02b5','0325','02b4','0324','0212','0304','0213','0305','02b2','0320','02bb','0360','0328','032f','032a']);
/** No generic replay facility. Binding and health sync own their fixed command allowlists. */
export function authorizeLiveCommand(_command: string): never {
  throw new Error('Generic proprietary writes are disabled. Use the dedicated binding and health sync actions.');
}
export function roleFor(service: string, characteristic: string): string {
  return CHANNELS.find(c => uuid(c.service) === service && uuid(c.characteristic) === characteristic)?.role
    ?? (characteristic === uuid('27f1') ? 'Short-command channel (binding and watch data queries)' : characteristic === uuid('27f6') ? 'Health history and framed data channel' : 'Standard or unclassified characteristic');
}
