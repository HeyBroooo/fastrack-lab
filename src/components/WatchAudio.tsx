'use client';
import {useEffect,useRef,useState} from 'react';
type OutputDevices=MediaDevices&{selectAudioOutput?:()=>Promise<MediaDeviceInfo>};
export function WatchAudio(){
  const player=useRef<HTMLAudioElement>(null);
  const url=useRef<string|null>(null);
  const [name,setName]=useState('Built-in test chime');
  const [outputs,setOutputs]=useState<MediaDeviceInfo[]>([]);
  const [sink,setSink]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [picker,setPicker]=useState(false);
  const [routing,setRouting]=useState(false);
  async function refresh(){
    try{const devices=await navigator.mediaDevices?.enumerateDevices();setOutputs((devices??[]).filter(d=>d.kind==='audiooutput'&&d.deviceId&&d.deviceId!=='default'));}
    catch{setMessage('Output list unavailable. Select the watch in Linux Sound settings.');}
  }
  useEffect(()=>{
    const audio=player.current; if(audio)audio.volume=.25;
    setPicker(typeof (navigator.mediaDevices as OutputDevices|undefined)?.selectAudioOutput==='function');
    setRouting(typeof audio?.setSinkId==='function');
    void refresh();
    const changed=()=>{audio?.pause();setMessage('Audio devices changed. Check your output before pressing Play.');void refresh();};
    navigator.mediaDevices?.addEventListener('devicechange',changed);
    return()=>{audio?.pause();if(url.current)URL.revokeObjectURL(url.current);navigator.mediaDevices?.removeEventListener('devicechange',changed);};
  },[]);
  async function choose(id?:string){
    setBusy(true);player.current?.pause();setMessage('');
    try{
      const audio=player.current;if(!audio?.setSinkId)throw new Error('Choose the watch in Linux Sound settings, then use system output.');
      const device=id===undefined?await (navigator.mediaDevices as OutputDevices).selectAudioOutput?.():undefined;
      const next=id??device?.deviceId;if(next===undefined)return;
      await audio.setSinkId(next);setSink(next);
      setMessage(`Output: ${device?.label||outputs.find(d=>d.deviceId===next)?.label||'System output'}. Press Play when ready.`);
      await refresh();
    }catch(error){setMessage(`Could not select output: ${(error as Error).message}`);}
    finally{setBusy(false);}
  }
  return <section className="panel"><div className="panel-head"><div><h2>Custom sound</h2><p>Play a local audio file through a connected audio output.</p></div></div>
    <ol><li>Enable Bluetooth calling/audio on the watch, then pair its audio device (FT_38112BT_9539) in Linux Bluetooth settings.</li><li>Select the watch in Linux Sound settings or the output selector below. If Linux exposes no watch audio output, speaker playback is unavailable.</li><li>Press Play test chime, or choose your own sound file. Start with low volume.</li></ol>
    <details><summary>Watch appears on phone but not Linux?</summary><p>Turn off Bluetooth on the phone temporarily, enable calling/audio on the watch, and keep its Bluetooth pairing screen open. Linux must scan for Classic Bluetooth as well as BLE. Run:</p><pre>bluetoothctl --timeout 20 scan bredr</pre><p>Then pair FT_38112BT_9539 in Linux Bluetooth settings. The browser’s health-device chooser only lists BLE devices; use Linux settings for the audio device. Refresh outputs after connecting.</p></details>
    <p>This streams from your computer; it does not save a ringtone to the watch. Health-data BLE pairing alone does not provide an audio output.</p>
    <div className="actions"><button className="primary" disabled={busy} onClick={()=>{
      const audio=player.current;if(!audio)return;audio.pause();
      if(url.current){URL.revokeObjectURL(url.current);url.current=null;}
      audio.src='/audio/watch-test.wav';audio.currentTime=0;setName('Built-in test chime');
      void audio.play().then(()=>setMessage('Playing test chime through the selected output.')).catch(e=>setMessage(`Playback failed: ${e.message}`));
    }}>Play test chime</button>{picker&&routing&&<button className="secondary" disabled={busy} onClick={()=>void choose()}>Choose audio output</button>}
      <button className="secondary" disabled={busy} onClick={()=>void refresh()}>Refresh outputs</button>
      {routing&&<label>Output <select aria-label="Audio output" value={sink} disabled={busy} onChange={e=>void choose(e.target.value)}><option value="">System output (check Linux Sound settings)</option>{outputs.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Audio output ${i+1}`}</option>)}{sink&&!outputs.some(d=>d.deviceId===sink)&&<option value={sink}>Previously selected output</option>}</select></label>}
    </div>
    <p><label>Sound file <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac" onChange={event=>{
      const file=event.target.files?.[0];if(!file)return;
      const audio=player.current;audio?.pause();if(url.current)URL.revokeObjectURL(url.current);
      url.current=URL.createObjectURL(file);setName(file.name);setMessage('File stays on this computer. Check the output, then press Play.');
      if(audio){audio.src=url.current;audio.load();}
    }}/></label></p>
    {name&&<p>{name}</p>}
    <audio ref={player} src="/audio/watch-test.wav" controls preload="metadata" style={{width:'100%'}} onError={()=>setMessage('Unable to play this file. Try a browser-supported MP3 or WAV file.')} aria-label="Custom sound player"/>
    <p role="status">{message}</p>
  </section>;
}
