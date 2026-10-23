'use client';
import {useState} from 'react';
import {importPackets,type Packet} from '../lib/diagnostics/PacketLogger';
import {PacketMonitor} from './PacketMonitor';
export function CaptureAnalyzer(){const [packets,setPackets]=useState<Packet[]>([]);const [error,setError]=useState('');const [name,setName]=useState('');
  return <div className="stack"><section className="panel import-panel"><span className="eyebrow">LOCAL ANALYSIS / HISTORICAL</span><h2>Revisit a session.</h2><p>Open a Fastrack Lab v1 JSON export, up to 2 MB and 500 packets. Files stay in this browser. Sanitized exports show metadata; decoding requires payloads you have reviewed for private content.</p><label className="file-label">Choose capture<input type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setError('');try{if(file.size>2_000_000)throw new Error('Capture exceeds 2 MB');const result=importPackets(await file.text());setPackets(result);setName(file.name);}catch(error){setPackets([]);setName('');setError(error instanceof Error?error.message:'Cannot read capture');}e.target.value='';}}/></label>{name&&<small>Loaded {name} · historical only</small>}{error&&<p role="alert" className="warning">{error}</p>}</section><PacketMonitor packets={packets} historical/></div>;
}
