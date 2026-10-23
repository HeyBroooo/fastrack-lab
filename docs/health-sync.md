# Health history and remembered reconnects

## Current behavior

The user confirmed that the binding popup/home-screen flow and battery reads work on the watch. Heart rate/activity from `02 a0` did not populate. That deprecated snapshot request is skipped when the watch exposes its history channels: the app now performs the SDK's separate history transfers and shows dated records independently of snapshot results.

Connect → subscribe → device/battery/firmware reads → load this watch's browser archive → capability/inventory queries → current and historical heart rate, activity, sleep → available SpO₂, stress and HRV → completion.

Each complete record is committed to IndexedDB **before** its SDK acknowledgement is sent. The watch may advance/consume its sync queue on acknowledgement. A storage failure, corrupt/incomplete record, missing response or repeated page stops the history flow; the record is not acknowledged. No reset or unbind commands are sent. Export the archive before clearing browser storage. Health records are stored separately for each browser Bluetooth device ID, and exported only with the explicit Export all records button.

Successful history synchronization or the user's home-screen confirmation saves setup locally. The next visit uses `navigator.bluetooth.getDevices()` to recover the already-permitted device when the browser supports it. Connect reuses that device and syncs without sending a binding command. If permission is revoked or the browser cannot restore devices, selection is required again, but setup remains remembered for the matching device. The reset-watch control only reveals manual binding controls; it does not reset/unbind the physical watch.

## Recovered protocol evidence

Sources are from the supplied APK, under `analysis/fastrack-source/sources/defpackage` and `analysis/tg-recovered`. Additional missing classes were recovered with installed JADX from the supplied APK's `classes2.dex`; no unrelated app or generated sensor values were used.

| Purpose | Request | Evidence |
|---|---|---|
| Capability flags | `02 09` on 27F1, response 27F7 | `c7k`, `bu00`; full response indexed, stress byte 4 mask 0x20, HRV byte 4 mask 0x01 |
| Short history inventory | `08 01` on 27F6, response 27F2 | `yry`, `umu`, `qd7`; step/sleep/HR historical-day counts at bytes 4/5/6 |
| Extended inventory | `02 f3` on 27F6, response 27F7 | `v800`, `qmu`, `gg9`; SpO₂ count uint16 LE at byte 10 |
| HR today / history | `08 07 01` / `08 08 01` | `fij`, `tlz`, `bku` |
| Activity today / history | `08 03 01` / `08 05 01` | `urw`, `qvz`, `kmu` |
| Sleep today / history | `08 04 01` / `08 06 01` | `ibq`, `iqz`, `cmu` |
| Short record completion | `08 ee 00` notification | `gd00` and transfer subclasses; samples validated before publication |
| Short record ACK | `08 <type> 02` | `gvy`, `dxy`, `b8z`, `y3g`, `nhf`, `hwf` |
| SpO₂ / stress / HRV | framed command 4, body `00 <type> <scope> 00 00` | `b5h`, `tra`, `j8d`; types 1/16/18; scope 1=current, 0=history |
| Framed record ACK | same body with operation 1 | `gij`, `ljc`, `ace`, `ism`, `m2l`, `lhm` |
| Finish | `08 02` | `elx` |

`ao00` proves that each live GATT fragment repeats byte 0x33. The new live assembler removes those per-fragment prefixes and checks command, sequence, declared length and CRC before exposing a record. The previous offline byte-stream assembler is not used for these transfers. Read frames are 19 bytes and do not require MTU negotiation. Incoming frames are bounded by the 16-bit protocol length.

The complete supplied 22-packet step record decodes to 58 intervals on 2026-10-21 with zero totals. Empty captured stress frames are decoded as no records. Positive HR/sleep/SpO₂/stress fixtures used in automated checks are explicitly synthetic, not measurements from the user's watch.

The captured capability response advertises stress but not HRV. The app checks each live device response rather than hard-coding that capture's capabilities.

## Display and limits

- Battery and firmware use short queries. Heart rate and activity use history transfers on this model; the deprecated snapshot query remains a fallback only for connections without history channels.
- History adds dated step/calorie/distance/active-time totals and intervals; HR samples and zone summaries; sleep duration/stages/score; SpO₂ samples and associated HR; stress and supported HRV records.
- Current snapshot cards and archived records carry timestamps. Records remain visible offline, identified as saved data. Date/type filters, complete sample tables, pagination and full JSON export are available.
- Distances, calories, active time and HRV retain raw watch totals where the recovered source does not prove physical unit scales. The app does not label unverified values as metres, kcal, minutes or milliseconds.
- Blood pressure, body temperature, respiratory rate, workout/GPS data and breathing-session records still lack an integrated, validated transfer. Their absence is explicit in the dashboard. This is not a claim that every sensor exists on this model.
- Sample clock fields follow the SDK's local-time interpretation, using the browser's timezone. Correct the watch clock/timezone in its supported setup if the recorded dates are wrong.
- A factory reset erases records the app cannot reconstruct. Missing records are not replaced with estimates or sample measurements.
- A whole health request has a 30-second minimum deadline. Interruption requires reconnect before another history attempt because short-transfer terminators lack a command sequence ID.
- At most 255 pages per framed category/scope are fetched in one run. Repeated pages stop the loop. Already committed records are retained on errors.

## Validation

70 automated tests pass. Production build and TypeScript validation pass in an isolated copy, leaving the user’s running dev server untouched. See `tests/health-history.test.cjs`, `tests/bluetooth.test.cjs`, and `scripts/browser-smoke.cjs`. Physical health-history support is not verified until the user compares the new live results with the watch. Previously verified battery and binding observations do not prove that every health transfer succeeds.

Browser permission restoration follows the [Web Bluetooth specification](https://bluetooth.spec.whatwg.org/).

The final Chromium smoke check also verifies positive mock HR, activity, sleep, SpO₂ and stress history, records remaining in IndexedDB after disconnect, skipped repeat binding and mobile/desktop layouts. Screenshots under `report/diagnostics/health-390.png` and `health-1440.png` contain synthetic test values only.
