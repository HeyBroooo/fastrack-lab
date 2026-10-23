> Latest update: health-history synchronization, per-watch browser storage, capability checks and remembered reconnects are implemented. See [current health-sync behavior and limits](health-sync.md). Earlier snapshot-only and bind-only descriptions below are historical.

# Watch data reads

The user reported that binding now shows a popup and allows access to the watch home screen. This confirms that physical observation, not long-term binding persistence or health synchronization.

The previous runtime read standard GATT characteristics only. The captured watch exposes no standard battery or heart-rate service, so those cards could never populate. The runtime now subscribes to 27F7, serially sends the following fixed queries to 27F1, and decodes responses on the same connection. It runs after connection, after a zero-status binding response without additional authentication, and on **Read watch data**. There is no automatic binding or retry loop.

| Query | Decoder evidence in supplied APK | Result |
|---|---|---|
| `02 01` | `defpackage/kl00.java`, `ziu.java` | Device ID, status flags and battery at offset 7; captured reply reports 97% |
| `02 05` | `nhm.java`, `diu.java` | Battery at offset 6 and battery metadata; captured reply reports 97% |
| `02 11` | `u2l.java`, `fnu.java` | Algorithm versions and detailed firmware text at offset 8; captured firmware is 1.1.15 |
| `02 a0` | `ixz.java`, `ulu.java` | Four little-endian signed 32-bit nonnegative totals at offsets 2, 6, 10, 14; stored heart rate at offset 18 |

`lm00.java` / `ml00.java` confirm the two-byte query encoding. The activity command is marked deprecated in the recovered SDK interface. Its format is source-backed, but this command is absent from the supplied capture and support on this watch firmware must be physically checked. It is not a command to start measuring heart rate.

The activity totals are steps, calories, distance and active time. The supplied model does not document the physical unit scales of the latter three. The UI deliberately labels those raw totals as **watch units** rather than claiming kcal, metres or minutes. Zero steps is a valid value. A zero or 255 heart-rate byte clears the previous reading and is shown as no stored reading.

Requests use the existing notification listener, match both service/channel and command, and register the waiter before writing. A missing reply is reported per query and does not erase other received data or disconnect a healthy link. A browser write timeout does disconnect because the pending operation cannot safely overlap another write. Disconnect/disposal cancels pending waits and clears live data. Imported captures remain historical only.

Sleep, SpO₂ and multi-day activity history are not synchronized in this change. Their transfers require additional request mapping, bounded multi-packet parsing and validation; existing capture payloads must not be promoted to live data. No history-clear or history-advance acknowledgements are sent.

## Physical check

1. Reload the app and reconnect the BLE data watch. Keep the phone companion disconnected.
2. Wait for the four data statuses. Compare battery and firmware against the watch.
3. Open Health & activity. Compare steps; record a heart-rate measurement on the watch and click Read watch data.
4. If activity times out, export the current Bluetooth inspector session with raw payloads explicitly enabled. Binding authentication remains redacted. The `02 a0` request and any response identify whether this firmware supports the SDK query.
5. Disconnect and reconnect. Ensure values are cleared while offline and repopulated from new responses.

Unit and mocked browser tests do not establish physical watch support. Do not report health synchronization as hardware-verified until these checks pass.

## Local verification

- 52 tests passed, including captured battery/firmware fixtures, synthetic activity boundaries, immediate notifications, wrong channels, missing replies, cancellation and reconnect.
- Production build passed, including TypeScript validation.
- Chromium smoke test passed with mocked battery, firmware, steps and heart-rate responses; checked all seven views, binding, disconnect/reconnect, and 1440px/390px layouts. No physical BLE device was used for these tests.
