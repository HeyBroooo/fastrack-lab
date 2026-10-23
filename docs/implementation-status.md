# Implementation status

## Confirmed by the user on the physical watch

- BLE connection and binding popup work.
- The watch reaches its home screen.
- Battery reads work.
- The earlier deprecated current-activity request did not show heart rate/calories; the implementation now uses the SDK's health-history flow on connections exposing those channels.

## Implemented

- Existing single-owner BLE connection, notification listeners, cancellation, binding and diagnostics remain in place.
- Battery, firmware and device queries; history-capable watches skip deprecated `02 a0` polling.
- SDK-backed current/historical activity, heart-rate and sleep transfers; framed SpO₂, stress and capability-gated HRV transfers.
- Ordered short packets, per-fragment 0x33 handling, frame command/sequence/length/CRC validation, count/date/value validation and bounded page loops.
- IndexedDB record commits before SDK acknowledgements; storage failure or incomplete transfer stops synchronization without acknowledging that record.
- Date/type filters, complete sample tables, sleep breakdown, saved-history pagination and JSON export.
- Setup persistence and previously permitted device restoration. Normal reconnects send no binding command. An explicit reset-watch control reveals binding controls without resetting or unbinding the watch.
- Existing diagnostics, raw-payload opt-in exports and authentication redaction.

## Verification

- 70 automated tests pass, including captured 58-interval step history and synthetic positive sensor fixtures.
- Production build and TypeScript validation pass in an isolated copy without modifying the user's running dev-server output.
- Chromium smoke passes all seven views, positive mock history, IndexedDB persistence after disconnect, explicit binding and reconnect without replay, and desktop/mobile layouts (1440px and 390px).
- No new physical health-history test is claimed. The user must compare the resulting live records with the watch.

## Remaining limits

- Raw distance, calorie, active-time and HRV unit scales are not established by the recovered source; those values remain labelled watch units.
- Blood pressure, temperature, respiratory rate, workout/GPS and breathing-session transfers are not integrated/validated. The dashboard states these omissions.
- Missing or reset-erased records cannot be reconstructed. HRV is disabled when the live capability flag is absent.
- Browser permission restoration depends on `getDevices()` support and retained site permissions. Saved health data belongs to the current browser/origin and should be exported before clearing site storage.

See [health-sync.md](health-sync.md) for command evidence, safeguards and limits, and [hardware-test-plan.md](hardware-test-plan.md) for the physical check.
