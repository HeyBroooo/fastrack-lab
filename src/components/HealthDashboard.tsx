'use client';
import {useMemo,useState} from 'react';
import type {Snapshot} from '../lib/bluetooth/BluetoothManager';
import {HEALTH_LABELS,type HealthKind,type HealthRecord} from '../lib/protocol/HealthHistory';
const stageName=(stage:number)=>({1:'Awake',2:'Light',3:'Deep',4:'REM'}[stage]??`Stage ${stage}`);
const label=(key:string)=>key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase());
export function HealthDashboard({session,onSync}:{session:Snapshot;onSync:()=>void}){
  const [filter,setFilter]=useState<HealthKind|'all'>('all');const [date,setDate]=useState('');const [page,setPage]=useState(0);
  const records=useMemo(()=>[...session.healthRecords].sort((a,b)=>b.date.localeCompare(a.date)||b.receivedAt.localeCompare(a.receivedAt)),[session.healthRecords]);
  const shown=records.filter(r=>(filter==='all'||r.kind===filter)&&(!date||r.date===date));
  const latest=(kind:HealthKind)=>records.find(r=>r.kind===kind);
  const latestSample=(kind:HealthKind)=>records.filter(r=>r.kind===kind).flatMap(r=>r.samples).filter(s=>s.value!==undefined&&s.value>0).sort((a,b)=>b.at.localeCompare(a.at))[0];
  const steps=latest('steps'),sleep=latest('sleep');
  const metric=(key:'steps'|'calories'|'distance'|'activeTime',unit:string)=>{
    const live=session.measurements[key];const record=steps?.summary[key];
    return live?{value:live.value,unit:live.unit,detail:`Received ${new Date(live.at).toLocaleString()}`}:
      record!==undefined?{value:record,unit,detail:`Recorded ${steps!.date}`} : undefined;
  };
  const sampleMetric=(kind:'heartRate'|'spo2'|'stress'|'hrv',unit:string)=>{
    const sample=latestSample(kind);const live=kind==='heartRate'?session.measurements.heartRate:undefined;
    if(live&&(!sample||live.at>sample.at))return {value:live.value,unit,detail:`Received ${new Date(live.at).toLocaleString()}`};
    return sample?{value:sample.value!,unit,detail:`Recorded ${new Date(sample.at).toLocaleString()}`}:undefined;
  };
  const cards=[
    {name:'Heart rate',kind:'heartRate' as const,data:sampleMetric('heartRate','bpm')},
    {name:'Blood oxygen',kind:'spo2' as const,data:sampleMetric('spo2','%')},
    {name:'Stress',kind:'stress' as const,data:sampleMetric('stress','/ 100')},
    {name:'Heart-rate variability',kind:'hrv' as const,data:sampleMetric('hrv','watch units')},
    {name:'Steps',kind:'steps' as const,data:metric('steps','steps')},
    {name:'Distance',kind:'steps' as const,data:metric('distance','watch units')},
    {name:'Calories',kind:'steps' as const,data:metric('calories','kcal')},
    {name:'Active time',kind:'steps' as const,data:metric('activeTime','watch units')},
    {name:'Sleep period',kind:'sleep' as const,data:sleep?{value:sleep.summary.totalMinutes,unit:'min',detail:`Recorded ${sleep.date}`} :undefined},
    {name:'Sleep score',kind:'sleep' as const,data:sleep?{value:sleep.summary.sleepScore,unit:'watch score',detail:`Recorded ${sleep.date}`} :undefined},
  ];
  function download(){const blob=new Blob([JSON.stringify({format:'fastrack-health',version:1,exportedAt:new Date().toISOString(),device:session.deviceName,records:session.healthRecords},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='fastrack-health.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="health-dashboard">
    <div className="section-title"><div><p className="eyebrow">YOUR WATCH RECORDS</p><h2>Health & activity</h2><p>{session.connected?'Connected':'Offline'} · {records.length} saved records for {session.deviceName}</p></div><button className="secondary" disabled={!session.connected||session.busy} onClick={onSync}>{session.busy?'Syncing…':'Sync all health data'}</button></div>
    {session.healthError&&<p role="alert" className="warning">{session.healthError}</p>}
    <div className="health-grid">{cards.map(card=><article className="metric" key={card.name}><span>{card.name}</span><strong>{card.data&&Number.isFinite(card.data.value)?`${card.data.value.toLocaleString()} ${card.data.unit}`:'—'}</strong><small>{card.data?.detail??session.healthStatus[card.kind]??'No saved reading yet'}</small></article>)}<article className="metric"><span>Battery</span><strong>{session.measurements.battery?`${session.measurements.battery.value}%`:'—'}</strong><small>{session.dataStatus.battery??'Connect to refresh battery'}</small></article></div>
    {sleep&&<div className="panel health-summary"><h3>Sleep breakdown · {sleep.date}</h3><dl className="device-details">{['lightMinutes','deepMinutes','remMinutes','wakeCount'].map(key=><div key={key}><dt>{label(key)}</dt><dd>{sleep.summary[key]??'Not reported'}</dd></div>)}</dl></div>}
    <details className="panel health-summary" open><summary>Sync status & available data</summary><dl className="device-details">{(Object.keys(HEALTH_LABELS) as HealthKind[]).map(kind=><div key={kind}><dt>{HEALTH_LABELS[kind]}</dt><dd>{session.healthStatus[kind]??'Not requested in this session'}</dd></div>)}</dl><p className="muted">Measurements depend on what the watch has recorded. A reset cannot recover erased history. Distance, active time and HRV retain their watch values until their unit scales are verified.</p><p className="muted">Blood pressure, temperature, respiratory rate, workout/GPS records and breathing-session logs have no validated integration yet. They are not reported as zero or inferred from other readings.</p></details>
    <section className="panel health-summary"><div className="panel-head"><div><h3>Saved health history</h3><p>Saved in this browser before acknowledging each record to the watch. Export a copy before clearing browser storage.</p></div><button className="secondary" disabled={!records.length} onClick={download}>Export all records</button></div>
    <div className="filterbar"><label>Data type <select value={filter} onChange={e=>{setFilter(e.target.value as HealthKind|'all');setPage(0);}}><option value="all">All health data</option>{(Object.keys(HEALTH_LABELS) as HealthKind[]).map(kind=><option key={kind} value={kind}>{HEALTH_LABELS[kind]}</option>)}</select></label><label>Watch date <input type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(0);}}/></label><button className="secondary" onClick={()=>{setDate('');setFilter('all');setPage(0);}}>Clear filters</button></div>
    {!shown.length?<p className="empty">No matching saved records. Sync the watch to retrieve available history.</p>:shown.slice(page*20,(page+1)*20).map(record=><RecordDetails key={record.id} record={record}/>)}
    {shown.length>20&&<div className="actions"><button className="secondary" disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1} / {Math.ceil(shown.length/20)}</span><button className="secondary" disabled={(page+1)*20>=shown.length} onClick={()=>setPage(page+1)}>Next</button></div>}
    </section>
  </section>;
}
function RecordDetails({record}:{record:HealthRecord}){
  return <details className="health-record"><summary>{HEALTH_LABELS[record.kind]} · {record.date} · {record.samples.length} samples</summary><dl className="device-details">{Object.entries(record.summary).map(([key,value])=><div key={key}><dt>{label(key)}</dt><dd>{value}</dd></div>)}</dl><div className="health-table"><table><thead><tr><th>Recorded time</th><th>Reading</th><th>Additional data</th></tr></thead><tbody>{record.samples.map((sample,i)=><tr key={i}><td>{new Date(sample.at).toLocaleString()}</td><td>{sample.stage!==undefined?`${stageName(sample.stage)} · ${sample.minutes} min`:sample.steps!==undefined?`${sample.steps} steps`:sample.value===0?'No reading':sample.value}</td><td>{Object.entries(sample).filter(([key])=>!['at','value','steps','stage','minutes'].includes(key)).map(([key,value])=>`${label(key)}: ${value}`).join(' · ')||'—'}</td></tr>)}</tbody></table></div></details>;
}
