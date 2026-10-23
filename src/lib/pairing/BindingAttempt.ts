import {isBindingResponse, parseBindingResponse, type BindingResponse} from '../protocol/BindingProtocol';
export type BindingState = 'idle' | 'connecting' | 'connected' | 'subscribing' | 'binding' | 'awaiting-watch-confirmation' | 'watch-confirmed-by-user' | 'response-received' | 'failed' | 'disconnected';
/** One pending response slot; the connection manager owns the actual GATT listener. */
export class BindingAttempt {
  readonly response: Promise<BindingResponse>;
  private resolve!: (result: BindingResponse) => void;
  private reject!: (error: Error) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private armed = false;
  private settled = false;
  private abort = () => this.cancel('Binding cancelled: BLE session ended');
  constructor(private signal: AbortSignal, private timeoutMs: number, private onReceive: (data: Uint8Array) => void) {
    this.response = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    // May fail while subscribe/write is still pending; attach a handler immediately.
    void this.response.catch(() => {});
    signal.addEventListener('abort', this.abort, {once: true});
    if (signal.aborted) this.abort();
  }
  arm() {
    if (this.settled) throw new Error('Binding attempt is no longer active');
    this.armed = true;
    this.timer = setTimeout(() => this.cancel('No 04 01 binding response before timeout. Check the watch, then reconnect before another attempt.'), this.timeoutMs);
  }
  accept(data: Uint8Array) {
    if (!this.armed || this.settled || !isBindingResponse(data)) return;
    this.onReceive(data);
    try { const result = parseBindingResponse(data); this.cleanup(); this.resolve(result); }
    catch (error) { this.cancel(error instanceof Error ? error.message : 'Malformed binding response'); }
  }
  cancel(message: string) { if (!this.settled) { this.cleanup(); this.reject(new Error(message)); } }
  private cleanup() { this.settled = true; clearTimeout(this.timer); this.signal.removeEventListener('abort', this.abort); }
}
