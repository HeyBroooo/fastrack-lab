# Terminal reader

Run from the project root (disconnect browser BLE first):

```sh
analysis/.venv/bin/python analysis/fastrack_all_health.py
```

Offline replay:

```sh
analysis/.venv/bin/python analysis/fastrack_decode_capture.py analysis/all_health_capture.json
```

The collector saves each raw session under `analysis/captures/`, and writes
`analysis/health_report.json`. Next.js serves this through `/api/health-report`;
open Health & activity → Terminal health report → Refresh report. No subprocess
runs from the browser. Earlier decoded history is retained during normal collection;
sample timestamps remain watch-local time, not the time of the new synchronization.

| Data | Request / response | SDK and layout | Evidence |
|---|---|---|---|
| Activity | 080301 current, 080501 history / 27F2 | qvz/kmu: packet 2, four LE int32 at offsets 4,8,12,16 | 42 steps, 1 kcal watch-matched; distance 30 and active time 0 retained raw, units unknown |
| Heart rate | 080701 current, 080801 history / 27F2 | tlz/bku via fij: date/minute offset header; numbered data packets contain delta-minute/BPM pairs, bounded by declared length/count | 12 samples; latest 91 BPM at 2026-10-22 20:38 |
| Sleep | 080401 current, 080601 history / 27F2 | iqz/cmu: end time, period minutes, summary; stage/minute pairs | Parser implemented; supplied capture has no sleep record |
| SpO₂ | framed command 4 body 00 01 scope 00 00 / 27F7 | b5h/wmu: 27-byte body header then six-byte epoch/percent/HR records | 98%, accompanying HR 81; SDK structure verified |
| Stress | framed command 4 body 00 10 scope 00 00 / 27F7 | tra: same six-byte record structure | No recorded score in captures |
| Workouts | unavailable | No validated command/parser pair in selected evidence | No speculative commands sent |

All requests above write 27F6. Extended scope 1 is current, 0 historical.
Frames require matching sequence, length and CRC. Short streams require 08EE00.
Numbered identical retransmissions are tolerated; conflicting duplicates fail.
Raw notifications are never deduplicated. Header-only extended responses with stale
counts are unavailable, matching SDK behavior. Save/fsync precedes SDK ACKs.

Tests: `python3 -m unittest discover -s tests -p 'test_fastrack_protocol.py'` and `npm test`.

Validation on 2026-10-22: a physical BLE sync completed at 20:59:01 +05:30,
confirming 42 steps and 1 kcal. No new HR/SpO₂/sleep/stress record was returned;
the report retains prior captured HR/SpO₂ with original sample times. Live testing
also confirmed identical numbered retransmissions and header-only SpO₂ responses
with stale metadata. Eight Python tests, 72 JS tests, and TypeScript checks pass.
