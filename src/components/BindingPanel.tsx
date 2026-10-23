'use client';
import {useState} from 'react';
import type {Snapshot} from '../lib/bluetooth/BluetoothManager';
import {formatBindingLog} from '../lib/diagnostics/BindingLog';
export function BindingPanel({session,onObservation}:{session:Snapshot;onObservation:(result:'home-screen'|'still-pairing')=>void}){
  const [copyStatus,setCopyStatus]=useState('');
  const binding=session.binding;
  const response=binding.response;
  const canObserve=session.connected&&!session.busy&&response?.status===0&&response.authLength===0;
  async function copy(){try{await navigator.clipboard.writeText(formatBindingLog(session.bindingEvents));setCopyStatus('Logs copied');}catch{setCopyStatus('Clipboard unavailable. Use Export logs instead.');}}
  function download(){const url=URL.createObjectURL(new Blob([formatBindingLog(session.bindingEvents)],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='fastrack-binding-log.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="binding-panel">
    <div className="callout" aria-live="polite"><strong>Binding test: {binding.state}</strong>
      {binding.remembered?<p>This watch is already set up. Connect and sync its data; no binding command is sent on reconnect.</p>:<p>Click <b>Bind Watch</b> to send <code>04 01 F3 00 00 00</code> once. Watch for a confirmation popup and accept it if presented. This is a high-confidence candidate; a zero response does not prove the full setup completed.</p>}
      {binding.error&&<p className="warning" role="alert">{binding.error}</p>}
      {response&&<p>Response status: <b>{response.status}</b> · Authentication length: <b>{response.authLength}</b>{response.additionalField!==undefined&&<> · Additional field: <b>{response.additionalField}</b></>}</p>}
      {response&&response.authLength>0&&<p className="warning">Additional authentication is required. Its data is redacted and no authentication command will be sent. Export these diagnostics for the next investigation.</p>}
      {binding.state==='binding'&&<p>Waiting up to 45 seconds for a 04 01 response. Check the watch now.</p>}
      {canObserve&&<><p>What do you see on the watch? Confirming the home screen saves setup and starts data synchronization.</p><div className="actions"><button className="secondary" onClick={()=>onObservation('home-screen')}>Home screen appeared</button><button className="secondary" onClick={()=>onObservation('still-pairing')}>Still on Scan to Pair</button></div></>}
      <p>Watch screen: <b>{binding.observation==='home-screen'?'Home screen observed by you':binding.observation==='still-pairing'?'Still on Scan to Pair (your report)':'Not yet verified'}</b></p>
      {binding.attempted&&<p>To run another manual attempt, disconnect and reconnect first. No binding write is retried automatically.</p>}
    </div>
    <details className="binding-diagnostics"><summary>Binding diagnostics · {session.bindingEvents.length} events</summary><p>Only binding and connection events. Authentication payloads are always redacted, including in exports.</p><div className="actions"><button className="secondary" disabled={!session.bindingEvents.length} onClick={()=>void copy()}>Copy logs</button><button className="secondary" disabled={!session.bindingEvents.length} onClick={download}>Export logs</button></div><p role="status">{copyStatus}</p><pre>{formatBindingLog(session.bindingEvents)||'No binding events yet.'}</pre></details>
  </div>;
}
