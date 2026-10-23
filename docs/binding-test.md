# Manual TouchGUI binding candidate test

## Current milestone

**Implemented:** an explicit Bind Watch action, one candidate write, response parsing, bounded diagnostics, cancellation and watch-screen observations. **Not established:** complete standalone initialization, optional authentication, binding persistence, or health synchronization. No physical BLE pairing is claimed tested.

This iteration replaces the earlier blanket prohibition on proprietary writes with exactly one user-authorized candidate. It does not replay the captured initialization sequence. Wait for the user's real-device result before adding commands.

## Evidence inspected

- `analysis/fastrack-source/sources/titan/commons/WearableProduct.java`: FT_38112 selects `WearableSDK.TG` (TouchGUI).
- `analysis/tg-recovered/sources/fastrack/reflex/touchgui/TouchGUICommandManager.java`: unbound `onReady` calls `mClient.v().h0()`. The bind callback accepts status zero; when random/authentication data exists, it calls `mClient.v().n(eiu.b())`.
- `analysis/fastrack-source/sources/defpackage/ql00.java`: encodes `04 01 F3 00 00 00` and parses status at offset 2, optional data length at offset 3, an additional field at 4, and data starting at 5.
- `analysis/fastrack-source/sources/defpackage/{lm00,eiu}.java`: command-prefix matching and bind-result fields.
- `analysis/protocol-timeline.tsv`: frame 2698 sends `0401f3000000`; frame 2904 receives `0401000000000000000000000000000000`.

The precise `riu.h0()` → `ql00` call chain remains unresolved. This is a high-confidence binding candidate, not a claim that one packet is a complete binding procedure. Decompiled source and captures remain local/ignored under `analysis/` and `report/`.

## Runtime flow

1. Connect normally using the existing BluetoothManager. No binding write occurs during connection/reconnection.
2. Click **Bind Watch**. Require an active GATT connection and the discovered 27F0 service.
3. Resolve 27F7 from this session's UUID map. Register the pending response slot before enabling notifications. Reuse the existing session listener; await notification readiness before writing.
4. Resolve 27F1, prefer `writeValueWithResponse()` only when both method and `write` property exist. Fall back to `writeValueWithoutResponse()` only when that method and property explicitly exist. Never retry a failed acknowledged write via the fallback.
5. Send exactly `04 01 F3 00 00 00`. Arm the response collector before invoking the write so immediate notifications are caught. Ignore other command prefixes and notifications on other characteristics.
6. Wait up to 45 seconds for a matching 04 01 response. Individual GATT operations retain the existing 12-second deadline. Watch confirmation may be needed while this wait is active.
7. Validate and display the result. A write acknowledgment is not a binding response, and status zero is not physical proof that the QR screen disappeared.
8. For status zero with no authentication data, display **awaiting-watch-confirmation** and buttons to record whether the normal home screen appeared or Scan to Pair remains. A reported home screen sets `watch-confirmed-by-user`; this is a user observation, never a transition to fully verified/ready.

Only one candidate may be attempted per connection. Disconnect and reconnect before another manual attempt; there is no protocol transaction identifier to reliably distinguish a late reply from a retry. Failures before any write may be retried manually. No silent write retries occur.

## Response parsing and privacy

| Field | Rule |
|---|---|
| Command | Must be 04 01 |
| Status | Byte 2, displayed as unsigned byte; zero is the SDK's accepted status |
| Authentication length | Byte 3; minimum response length is 4 |
| Additional field | Byte 4, only if authentication length > 0 |
| Authentication data | Require at least 5 + declared length bytes; extract only that declared span |
| Padding | Extra bytes are ignored by the recovered parser; nonzero unexplained trailing bytes are redacted |

Nonzero status fails without guessing its meaning. Truncated matching responses fail. Unrelated responses are ignored until a matching response or timeout. Optional authentication stops the flow at response-received and displays only its length/additional field. No authentication command is implemented or guessed.

Authentication bytes are not retained in React snapshots, packet logs, copied/exported binding logs, or raw inspector exports. Historical imports apply the same redaction. The parser's transient byte array is used only to parse the response. Zero-auth, zero-padding captured responses can be shown in full.

Binding diagnostics contain timestamp, TX/RX/SYSTEM direction, UUID where applicable, command name, status, payload/header and description. They are capped at 200 events across connections. Copy/export includes only these events, excluding unrelated personal packets.

Disconnect, timeout and unmount clear the response slot and cancellation handler. The normal notification listener remains after response completion to preserve the inspector; disconnect/unmount remove it. Stale callbacks cannot complete a newer attempt. A timed-out browser GATT operation closes the connection rather than overlapping another operation.

## Exact physical test

1. Disconnect the official Android app **and the iPhone** from the watch. If either keeps reconnecting, turn Bluetooth off on that phone temporarily. Do not reset or unbind the watch.
2. Run `npm run dev`; open `http://localhost:3000` in your Chromium browser. On Linux, use the experimental Web Platform flag if the app reports the API unavailable.
3. Connect to **FT_38112_9539**, not **FT_38112BT_9539**. Wait for discovery to finish.
4. Click **Bind Watch** once. Expand **Binding diagnostics** in Overview or Device setup.
5. Look for TX on 27F1 with `04 01 F3 00 00 00` and RX on 27F7 beginning `04 01`.
6. **Watch the physical watch immediately**, including while the app waits. Accept a pairing popup if it appears.
7. Check whether the QR/Scan to Pair screen changes to the normal home screen. Record the matching observation in the app when offered.
8. Click **Copy logs** or **Export logs**. Report the response status, authentication length, whether a popup appeared/was accepted, and whether the home screen appeared. On timeout or nonzero status, report what the watch displayed along with the logs.
9. Stop here. Do not reset or try further protocol commands. Health-data synchronization and follow-up commands wait for this real-device result.

Web Bluetooth does not expose arbitrary HCI, native Android authorization, direct OS bonding control, or an Android-style local GATT server. If one is required, this candidate test may not finish pairing; logs and the observed watch behavior will determine the next investigation.

## Automated checks

45 Node tests pass, including all six required parser cases plus response/write ordering, notification readiness, duplicate clicks, wrong-channel/prefix filtering, late responses, disconnect/reconnect, disposal and privacy. TypeScript and production build pass. Chromium smoke checks use mocked GATT and verify the button-to-write-to-response/user-observation UI path. These are implementation checks, not physical pairing evidence.
