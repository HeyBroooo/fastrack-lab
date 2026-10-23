'use client';
import {useEffect,useState} from 'react';
type Report={device:string;capturedAt:string|null;lastSuccessfulSync:string|null;syncStatus:string;measurementTimes:Record<string,string>;metrics:Record<string,unknown>;errors:string[]};
export function TerminalHealthReport(){
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState('');
  async function refresh(){try{const response=await fetch('/api/health-report',{cache:'no-store'});if(response.status===404){setReport(null);setError('No terminal report yet.');return;}if(!response.ok)throw new Error('Terminal report unavailable');setReport(await response.json());setError('');}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void refresh();},[]);
  const fields=[['Steps','steps',''],['Calories','caloriesKcal',' kcal'],['Distance','distanceMeters',' m'],['Heart rate','heartRateBpm',' BPM'],['SpO₂','spo2Percent','%'],['Stress','stressScore',''],['Sleep','sleep','']] as const;
  return <section className="panel"><div className="panel-head"><div><h2>Terminal health report</h2><p>Saved Python capture · separate from browser Bluetooth</p></div><button className="secondary" onClick={()=>void refresh()}>Refresh report</button></div>{error&&<p>{error}</p>}{report&&<><p>{report.device} · Captured {report.capturedAt??'unknown'} · {report.syncStatus}</p><dl className="device-details">{fields.map(([label,key,unit])=>{const value=report.metrics[key];const text=typeof value==='number'?`${value}${unit}`:key==='sleep'&&value&&typeof value==='object'?`${(value as {periodMinutes:number}).periodMinutes} min period`:'Unavailable';return <div key={key}><dt>{label}</dt><dd>{text}{report.measurementTimes[key]&&<small> · {report.measurementTimes[key]} (watch local)</small>}</dd></div>;})}<div><dt>Last successful synchronization</dt><dd>{report.lastSuccessfulSync??'No completed sync in this report'}</dd></div></dl>{report.errors.map((message,i)=><p className="warning" key={i}>{message}</p>)}</>}<p className="muted">Run analysis/.venv/bin/python analysis/fastrack_all_health.py, then refresh. Disconnect browser Bluetooth before collecting in the terminal.</p></section>;
}
