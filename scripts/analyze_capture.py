#!/usr/bin/env python3
"""Rebuild discovery and private packet timeline from HCI; never print raw payloads."""
import argparse, binascii, collections, datetime, json, pathlib, subprocess, xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
def field(node, name, default=''):
    item = node.find(f".//field[@name='{name}']")
    return item.get('show', default) if item is not None else default

def analyze(capture, address):
    # Decode the complete file so TShark can reassemble ACL and resolve sessions.
    xml = subprocess.check_output(['tshark', '-r', str(capture), '-T', 'pdml'], stderr=subprocess.PIPE)
    packets = ET.fromstring(xml)
    raw_packets=json.loads(subprocess.check_output(['tshark','-r',str(capture),'-Y','btatt','-T','json','-x'],stderr=subprocess.PIPE))
    raw_att={int(p['_source']['layers']['frame']['frame.number']):p['_source']['layers'].get('btatt_raw',[''])[0] for p in raw_packets}
    connects=[]
    for p in packets:
        if field(p,'bthci_evt.bd_addr').lower()==address.lower() and field(p,'bthci_evt.connection_handle') and field(p,'bthci_evt.status')=='0x00':
            connects.append(int(field(p,'frame.number')))
    if not connects: raise ValueError('No successful connection event for target address')
    selected=[p for p in packets if p.find("proto[@name='btatt']") is not None and int(field(p,'bthci_acl.connect_in','0')) in connects]
    services=[]; chars=[]; descriptors=[]
    for p in selected:
        a=p.find("proto[@name='btatt']"); n=int(field(p,'frame.number')); op=field(a,'btatt.opcode')
        if field(p,'hci_h4.direction') != '0x01': continue
        for entry in a.findall("field[@name='btatt.attribute_data']"):
            handles=entry.findall("field[@name='btatt.handle']"); uuid=entry.find("field[@name='btatt.uuid16']")
            if uuid is None or not handles: continue
            u=uuid.get('show'); end=entry.find("field[@name='btatt.group_end_handle']"); prop=entry.find("field[@name='btatt.characteristic_properties']")
            if op=='0x11' and end is not None:
                services.append(dict(start=int(handles[0].get('show'),16),end=int(end.get('show'),16),uuid=u,frame=n))
            if prop is not None and len(handles)==2:
                chars.append(dict(declaration=int(handles[0].get('show'),16),handle=int(handles[1].get('show'),16),uuid=u,properties=int(prop.get('show'),16),frame=n))
        if op=='0x05':
            for entry in a.findall("field[@name='btatt.information_data']"):
                descriptors.append(dict(handle=field(entry,'btatt.handle'),uuid=field(entry,'btatt.uuid16'),frame=n))
    for c in chars:
        c['service']=next(s['uuid'] for s in services if s['start']<=c['handle']<=s['end'])
    mapping={c['handle']:c for c in chars}; timeline=[]; framed=[]; counts=collections.Counter()
    for p in selected:
        a=p.find("proto[@name='btatt']"); op=field(a,'btatt.opcode'); n=int(field(p,'frame.number'))
        h=a.find("field[@name='btatt.handle']"); handle=int(h.get('show'),16) if h is not None else None
        v=a.find("field[@name='btatt.value']"); payload=v.get('value','') if v is not None else ''
        cfg=a.find("field[@name='btatt.characteristic_configuration_client']")
        if cfg is not None: payload=cfg.get('value','')
        mapped=mapping.get(handle,{}) if op in ['0x52','0x12','0x1b'] else {}
        if cfg is not None and handle is not None: mapped=mapping.get(handle-1,{})
        info='ATT discovery/control; not an application binding acknowledgement'; confidence='confirmed ATT operation'
        if payload and op in ['0x52','0x1b']:
            counts[payload[:4]]+=1
            info='Observed command prefix '+payload[:4]+'; payload semantics unknown'
            confidence='confirmed prefix only'
        if payload.startswith('33daaddaad01'):
            b=bytes.fromhex(payload); length=int.from_bytes(b[6:8],'little'); valid=binascii.crc_hqx(b[1:-2],0xffff)==int.from_bytes(b[-2:],'little')
            assert len(b)==length+3 and valid, f'Invalid framed packet {n}'
            framed.append(dict(frame=n,length=len(b),command=int.from_bytes(b[8:10],'little'),sequence=int.from_bytes(b[10:12],'little'),crcValid=valid))
            info=f'Validated framed envelope; command {framed[-1]["command"]}; sequence candidate {framed[-1]["sequence"]}; body unknown'
            confidence='confirmed envelope; inferred sequence'
        if cfg is not None: info='Enable notifications (CCCD 0100)';confidence='confirmed'
        timeline.append(dict(frame=n,at=field(p,'frame.time_utc'),attHex=raw_att.get(n,''),attLength=len(raw_att.get(n,''))//2,relativeSeconds=float(field(p,'frame.time_relative')),direction='out' if field(p,'hci_h4.direction')=='0x00' else 'in',connection=field(p,'bthci_acl.chandle'),opcode=op,handle=f'0x{handle:04x}' if handle is not None else None,service=mapped.get('service'),characteristic=mapped.get('uuid'),hex=payload,length=len(payload)//2,interpretation=info,confidence=confidence))
    out=ROOT/'report/diagnostics';out.mkdir(parents=True,exist_ok=True)
    (out/'watch-timeline.private.json').write_text(json.dumps(timeline,indent=2))
    # Importable exports: historical inspection only, never a replay source.
    importable=[]
    for t in timeline:
        if t['opcode'] not in ['0x52','0x1b'] or not t['characteristic'] or not t['hex']: continue
        packet=next(p for p in selected if int(field(p,'frame.number'))==t['frame'])
        stamp=datetime.datetime.fromtimestamp(float(field(packet,'frame.time_epoch')),datetime.timezone.utc).isoformat()
        full=lambda u: f"0000{u[2:]}-0000-1000-8000-00805f9b34fb"
        importable.append(dict(at=stamp,direction=t['direction'],operation='write' if t['direction']=='out' else 'notification',service=full(t['service']),characteristic=full(t['characteristic']),length=t['length'],hex=t['hex']))
    for sanitized in [True,False]:
        export=dict(format='fastrack-lab-packets',version=1,sanitized=sanitized,packets=[{**{k:v for k,v in p.items() if k!='hex' or not sanitized},'redacted':sanitized} for p in importable])
        (out/f"watch-packets.{'sanitized' if sanitized else 'private'}.json").write_text(json.dumps(export,indent=2))
    (out/'watch-gatt.json').write_text(json.dumps(dict(services=services,characteristics=chars,descriptors=descriptors,framed=framed),indent=2))
    docs=ROOT/'docs';docs.mkdir(exist_ok=True)
    rows=['# Packet timeline','',f'{len(timeline)} ATT packets belonging to target connection event(s) {connects}. Direction is relative to Android. Raw payloads and exact timestamps are available only in ignored `report/diagnostics/watch-timeline.private.json`. This committed timeline deliberately redacts bodies; all packets are retained, including watch-initiated discovery of Android services.','', '| Frame | Relative s | Direction | HCI | ATT | Handle | UUID | Bytes | Interpretation / confidence |','|---|---|---|---|---|---|---|---|---|']
    for t in timeline: rows.append(f'| {t["frame"]} | {t["relativeSeconds"]:.6f} | {t["direction"]} | {t["connection"]} | {t["opcode"]} | {t["handle"] or "—"} | {t["characteristic"] or "—"} | {t["length"]} | {t["interpretation"]}; {t["confidence"]} |')
    (docs/'packet-timeline.md').write_text('\n'.join(rows)+'\n')
    rows=['# GATT discovery evidence','','Reconstructed from actual characteristic declaration records, not inferred from adjacent handle annotations. Numeric handles are capture evidence only; browser code uses service + characteristic UUIDs. TShark labels 2760–2764 as units; those labels do not describe this proprietary protocol.','','| Service | Value handle | UUID | Properties | Evidence frame |','|---|---|---|---|---|']
    for c in chars:
        flags=', '.join(label for mask,label in [(2,'read'),(4,'write without response'),(8,'write'),(16,'notify'),(32,'indicate')] if c['properties']&mask)
        rows.append(f'| {c["service"]} | 0x{c["handle"]:04x} | {c["uuid"]} | {flags} | {c["frame"]} |')
    rows+=['','Notification CCCDs: 001c → 27f7, 0021 → 27f2, 0027 → 2762, 002a → 2763, 002d → 2764. Writes 2647, 2650, 2658, 2666, 2675 all carry 0100; ATT write responses follow.','', '27f1 → 27f7 carries short queries/settings. 27f6 → 27f2 carries the 08xx stream; 27f6 → 27f7 carries framed exchanges. 2763 is bidirectional for 2001 / 200500. No application traffic on 2761, 2762 or 2764 beyond subscription is demonstrated here.']
    (docs/'gatt-characteristics.md').write_text('\n'.join(rows)+'\n')
    print(json.dumps(dict(connectionEvents=connects,attPackets=len(timeline),services=len(services),characteristics=len(chars),framedPackets=len(framed),allFrameLengthsAndCRCsValid=True)))
    return timeline

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--capture',type=pathlib.Path,default=ROOT/'report/fastrack-logs/FS/data/misc/bluetooth/logs/hci_snoop20261021143924.cfa');parser.add_argument('--address',default='CB:4E:FD:04:95:39');args=parser.parse_args();analyze(args.capture,args.address)
