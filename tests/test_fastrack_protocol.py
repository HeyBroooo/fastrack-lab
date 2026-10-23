import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'analysis'))
from fastrack_protocol import Frame, extended, decode_capture, decode_short, decode_extended

CAPTURE = json.loads((Path(__file__).parent/'fixtures/health-2026-10-22.json').read_text())

class ProtocolTests(unittest.TestCase):
    def test_real_capture_and_serialization(self):
        report = decode_capture(CAPTURE,'fixture')
        self.assertEqual(report['errors'],[])
        self.assertEqual(report['metrics']['steps'],42)
        self.assertEqual(report['metrics']['caloriesKcal'],1)
        self.assertEqual(report['metrics']['heartRateBpm'],91)
        self.assertEqual(report['metrics']['spo2Percent'],98)
        self.assertEqual(json.loads(json.dumps(report)),report)
        heart = next(r for r in report['history'] if r['kind']=='heartRate')
        self.assertEqual(len(heart['samples']),12) # ignores repeated stale padding
        self.assertEqual(heart['samples'][-1]['at'],'2026-10-22T20:38:00')
        spo2 = next(r for r in report['history'] if r['kind']=='spo2')
        self.assertEqual(spo2['samples'][0]['heartRateBpm'],81)
    def test_live_header_only_stale_count_is_not_a_measurement(self):
        packet=bytes.fromhex('33 da ad da ad 01 19 00 04 00 01 00 00 01 01 de 1e 01 00 0d 00 06 00 00 00 00 29 3d')
        self.assertIsNone(decode_extended(Frame(1).accept(packet),1,1))
    def test_unknown_is_not_zero(self):
        metrics = decode_capture(CAPTURE,'fixture')['metrics']
        for key in ('distanceMeters','stressScore','sleep'):
            self.assertIsNone(metrics[key])
        self.assertEqual(metrics['workouts'],[])
    def test_truncated_stream(self):
        packets=[bytes.fromhex(r['hex']) for r in CAPTURE['records'] if r.get('request')=='health group 07']
        with self.assertRaises(ValueError): decode_short(packets[:-1],7)
        with self.assertRaises(ValueError): decode_short([packets[0],packets[1][:10],*packets[2:]],7)
        with self.assertRaises(ValueError): decode_short([packets[0],*packets[2:]],7)
    def test_identical_numbered_duplicates_preserved_without_extra_samples(self):
        packets=[bytes.fromhex(r['hex']) for r in CAPTURE['records'] if r.get('request')=='health group 07']
        doubled=[p for packet in packets for p in (packet,packet)]
        self.assertEqual(decode_short(doubled,7),decode_short(packets,7))
        bad=bytearray(packets[0]);bad[-1]^=1
        with self.assertRaises(ValueError): decode_short([packets[0],bytes(bad),*packets[1:]],7)
    def test_frame_fragments_sequence_crc(self):
        p=extended(bytes([0,1,1,0,0]),12)
        self.assertIsNone(Frame(13).accept(p))
        frame=Frame(12)
        self.assertIsNone(frame.accept(p[:14]))
        self.assertEqual(frame.accept(b'\x33'+p[14:]),bytes([0,1,1,0,0]))
        with self.assertRaises(ValueError): Frame(12).accept(p[:-1]+bytes([p[-1]^1]))
        with self.assertRaises(ValueError): Frame(12).accept(p+b'\x00')
    def test_new_empty_sync_preserves_historical_times(self):
        previous=decode_capture(CAPTURE,'old')
        latest=decode_capture({'device':CAPTURE['device'],'captured_at':'2026-10-22T21:00:00','records':[], 'syncStatus':'completed'},'new',previous)
        self.assertEqual(latest['metrics']['heartRateBpm'],91)
        self.assertEqual(latest['measurementTimes'],previous['measurementTimes'])
        self.assertEqual(latest['lastSuccessfulSync'],'2026-10-22T21:00:00')
    def test_incomplete_capture_not_success(self):
        capture=dict(CAPTURE,records=CAPTURE['records'][:2])
        self.assertEqual(decode_capture(capture,'fixture')['syncStatus'],'incomplete')

if __name__=='__main__': unittest.main()
