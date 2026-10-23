// Minimal Web Bluetooth declarations; TypeScript DOM libraries do not consistently ship these.
export interface BLECharacteristic extends EventTarget {
  uuid: string;
  properties: {read:boolean;write:boolean;writeWithoutResponse:boolean;notify:boolean;indicate:boolean};
  readValue(): Promise<DataView>;
  writeValueWithResponse?(value: Uint8Array<ArrayBuffer>): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array<ArrayBuffer>): Promise<void>;
  startNotifications(): Promise<BLECharacteristic>;
  stopNotifications(): Promise<BLECharacteristic>;
  value?: DataView;
}
export interface BLEService {uuid:string;getCharacteristics():Promise<BLECharacteristic[]>;}
export interface BLEServer {connected:boolean;connect():Promise<BLEServer>;disconnect():void;getPrimaryServices():Promise<BLEService[]>;}
export interface BLEDevice extends EventTarget {id:string;name?:string;gatt?:BLEServer;}
interface BLEBluetooth {getDevices?():Promise<BLEDevice[]>;requestDevice(options:{acceptAllDevices?:boolean;filters?:{namePrefix?:string}[];optionalServices?:string[]}):Promise<BLEDevice>;}
export function getBluetooth(): BLEBluetooth | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & {bluetooth?:BLEBluetooth}).bluetooth ?? null;
}
export const SERVICES = [
  '00001800-0000-1000-8000-00805f9b34fb',
  '00001801-0000-1000-8000-00805f9b34fb',
  '0000180f-0000-1000-8000-00805f9b34fb',
  '0000180d-0000-1000-8000-00805f9b34fb',
  '0000180a-0000-1000-8000-00805f9b34fb',
  '000027f0-0000-1000-8000-00805f9b34fb',
  '00002760-0000-1000-8000-00805f9b34fb',
  '021627f0-0000-1000-8000-00805f9b34fb',
];
export const shortUuid = (uuid:string) => uuid.startsWith('0000') ? uuid.slice(4,8).toUpperCase() : uuid.slice(0,8).toUpperCase();
export function bytes(view:DataView):number[]{return Array.from(new Uint8Array(view.buffer,view.byteOffset,view.byteLength));}
export const hex = (view:DataView) => bytes(view).map(b=>b.toString(16).padStart(2,'0')).join(' ');
export function ascii(view:DataView) {return bytes(view).map(b=>b>=32&&b<=126?String.fromCharCode(b):'.').join('');}

// WebIDL properties live on the prototype, so Object.entries(properties) is empty.
export function characteristicFlags(properties: BLECharacteristic['properties']): string[] {
  return (['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'] as const)
    .filter(flag => properties[flag]);
}
export function bluetoothIssue(): string | null {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) return 'Bluetooth requires a secure page. Open http://localhost:3000 on this computer, or use HTTPS (a plain HTTP LAN address will not work).';
  // Check API exposure first: Chromium can report a disabled feature as disallowed
  // even in a top-level page without an explicit Permissions-Policy restriction.
  if (getBluetooth()) {
    const policy = (document as Document & {permissionsPolicy?: {allowsFeature(name:string):boolean}; featurePolicy?: {allowsFeature(name:string):boolean}});
    if ((policy.permissionsPolicy ?? policy.featurePolicy)?.allowsFeature('bluetooth') === false)
      return 'Bluetooth is blocked by this page’s permissions policy. Open the app in its own browser tab instead of an embedded preview, and allow Bluetooth in the hosting policy.';
    return null;
  }
  if (/Linux/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent))
    return 'Web Bluetooth is unavailable in this browser. In desktop Chrome or Chromium on Linux, enable chrome://flags/#enable-experimental-web-platform-features, relaunch the browser, and reopen this page. Firefox and embedded IDE previews do not expose this API.';
  return 'This browser does not expose Web Bluetooth. Open this page directly in a supported Chrome or Edge browser, outside the IDE preview.';
}
export function bluetoothError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const detail = error instanceof Error ? error.message : String(error);
  if (name === 'NotFoundError') return 'No device selected. If the list was empty, try Show all BLE devices, wake the watch, turn on Bluetooth, and disconnect its phone app. Select the BLE watch, not its BT audio device.';
  if (name === 'SecurityError' || name === 'NotAllowedError') return `Bluetooth access denied. Check this site’s Bluetooth permission and open it directly on localhost or HTTPS. ${detail}`;
  if (name === 'NetworkError') return `Could not communicate with the watch. Move it closer and disconnect other apps using it, then reconnect. ${detail}`;
  return detail;
}
