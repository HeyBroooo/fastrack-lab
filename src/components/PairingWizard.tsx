import {Check, Circle, LoaderCircle, LockKeyhole} from 'lucide-react';
import {BindingPanel} from './BindingPanel';
import type {Snapshot} from '../lib/bluetooth/BluetoothManager';
export function PairingWizard({session,onObservation}:{session:Snapshot;onObservation:(result:'home-screen'|'still-pairing')=>void}){
  const stages=[
    {name:'Choose your watch',detail:'Select the BLE data interface in the browser picker.',done:session.connected,active:session.state==='connecting'},
    {name:'Connect & discover',detail:`${session.rows.length} accessible characteristics`,done:session.connected&&session.rows.length>0,active:['gatt_connected','discovering_services'].includes(session.state)},
    {name:'Enable notifications',detail:`${session.rows.filter(r=>r.listening).length} active channels`,done:session.connected&&session.rows.some(r=>r.listening),active:session.state==='enabling_notifications'},
    {name:'Watch setup',detail:session.binding.remembered?'Previously set up; binding skipped.':session.binding.response?`Response ${session.binding.response.status}; watch screen ${session.binding.observation}`:'Use Bind Watch, then check the watch for a confirmation popup.',done:Boolean(session.binding.remembered)||session.binding.observation==='home-screen',active:['subscribing','binding'].includes(session.binding.state)},
    {name:'Read watch data',detail:session.healthStatus.steps??session.dataStatus.activity??'Battery, firmware and activity are requested after connection.',done:Boolean(session.healthStatus.steps?.startsWith('Synced')||session.healthStatus.steps==='No records on watch'||session.dataStatus.activity?.startsWith('Received')),active:session.state==='synchronizing'},
  ];
  return <section className="panel setup-panel"><div className="panel-head"><div><h2>Make the connection.</h2><p>Transport connection and application pairing are tracked separately.</p></div><span className="badge">SETUP</span></div><ol className="setup-steps">{stages.map((step,i)=><li key={step.name} className={step.done?'done':step.active?'current':''}><span className="step-icon">{step.done?<Check size={18}/>:step.active?<LoaderCircle size={18} className="spin"/>:i>2?<LockKeyhole size={16}/>:<Circle size={16}/>}</span><div><strong>{step.name}</strong><p>{step.detail}</p></div></li>)}</ol><BindingPanel session={session} onObservation={onObservation}/></section>;
}
