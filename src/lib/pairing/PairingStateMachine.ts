export type PairingState = 'disconnected'|'connecting'|'gatt_connected'|'discovering_services'|'services_discovered'|'enabling_notifications'|'initializing'|'awaiting_confirmation'|'binding'|'synchronizing'|'ready'|'failed';
export type PairingEvent = 'connect'|'gattConnected'|'discover'|'discovered'|'subscribe'|'subscribed'|'sync'|'synced'|'disconnect'|'error';
export type Transition = {at:string;from:PairingState;to:PairingState;event:PairingEvent;detail:string};
const edges: Partial<Record<PairingState, Partial<Record<PairingEvent, PairingState>>>> = {
  disconnected:{connect:'connecting'},failed:{connect:'connecting'},connecting:{gattConnected:'gatt_connected'},
  gatt_connected:{discover:'discovering_services'},discovering_services:{discovered:'services_discovered'},
  services_discovered:{discover:'discovering_services',subscribe:'enabling_notifications',sync:'synchronizing'},
  enabling_notifications:{subscribed:'services_discovered'},synchronizing:{synced:'services_discovered'},
};
export class PairingStateMachine {
  state: PairingState = 'disconnected';
  history: Transition[] = [];
  dispatch(event: PairingEvent, detail: string) {
    const next = event==='disconnect'?'disconnected':event==='error'?'failed':edges[this.state]?.[event];
    if(!next) throw new Error(`Invalid pairing transition: ${this.state} / ${event}`);
    this.history=[{at:new Date().toISOString(),from:this.state,to:next,event,detail},...this.history].slice(0,100);this.state=next;
  }
  // No transition to binding/ready exists until a verified authorization/response contract is known.
}
