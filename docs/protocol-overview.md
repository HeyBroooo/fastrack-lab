# Protocol overview

> Update: the user supplied recovered TouchGUI sources after this initial analysis. A manual, single-command binding candidate test is now implemented. See [current binding test and limitations](binding-test.md); earlier blanket no-write/no-APK statements below describe the prior milestone. Full pairing remains physically unverified.

## Verification levels

- **Implemented:** browser connection ownership, discovery, known notification subscriptions, permitted reads, standard GATT decoders, evidence-based protocol inspection, offline envelope encoder/assembler, diagnostics import/export and setup UI.
- **Verified against recordings:** discovery map, channel direction, 22 envelope lengths and checksums, three clock-shaped payloads, short-command prefixes.
- **Physical watch tested by this implementation:** no.
- **Factory-reset pairing verified:** no. The user reports the official application succeeded during the recorded session; that does not validate this implementation.

## Source and isolation

Analyzed the actual `report/fastrack-logs/FS/data/misc/bluetooth/logs/hci_snoop20261021143924.cfa` with TShark, using PDML to preserve repeated discovery entries and reassembled ACL data. The alternate `btsnoop_hci.log` is only 16 bytes. The supplied ATT JSON contains 213 packets; 212 belong to the connection established in frame 2426. Frame 3376 uses HCI handle 0x0edc outside any known connection and is excluded. The watch session uses HCI handle 0x0002 and the user-supplied random BLE address. The audio interface is not the target.

Ordinary `JSON.parse`/`json.load` loses repeated keys in this export, including characteristic declarations. The analyzer reconstructs from PDML instead. It also distinguishes inbound watch service declarations from outbound Android service declarations (frame 2942); merging them would corrupt the handle map.

Run `npm run analyze:capture` to reproduce the extraction. All local raw output is under ignored `report/diagnostics/`; only redacted metadata is written to docs. The private timeline includes frame, timestamp, direction, connection, opcode, handle, mapped UUID, raw value, value length, interpretation and confidence. See [packet timeline](packet-timeline.md) and [GATT map](gatt-characteristics.md).

## Transport observations — confirmed

- Frame 2426: successful LE Enhanced Connection Complete, central role on Android, random peer address, HCI handle 0x0002.
- Frames 2453/2455: watch requests ATT MTU 247; Android responds 517. Effective ATT MTU is min(247, 517) = 247 for this exchange. This is observed Android evidence, not an assumption from Linux.
- Frames 2458–2595: five watch services and 17 characteristics discovered. No standard Battery (180f) or Heart Rate (180d) service appears.
- Frames 2647–2687: five CCCD writes enabling notifications, each with an ATT write response.
- All 22 observed framed application messages fit in individual reassembled ATT values (15–146 bytes). HCI ACL fragmentation is not evidence of proprietary message fragmentation.
- No SMP, HCI encryption-change event, LE start-encryption command or disconnect-complete event was found by the analyzer's targeted inspection. Absence in this capture does not prove these are unnecessary or never occurred elsewhere.

## Framed envelope — validated structure

Zero-based byte offsets:

| Bytes | Observation | Confidence |
|---|---|---|
| 0–5 | `33 da ad da ad 01` fixed prefix | Confirmed in 22/22 |
| 6–7 | Little-endian length; total bytes = field + 3 | Confirmed in 22/22 |
| 8–9 | Little-endian type candidate; observed 0004, 0015, 000e, 0019 | Structure confirmed; command meaning unknown |
| 10–11 | Little-endian request/sequence candidate, 3 through 13, echoed by responses | Strong inference, no wrap/reset rule known |
| 12 through N−3 | Opaque body | Unknown semantics |
| N−2 through N−1 | CRC-16/CCITT-FALSE, little-endian storage | Confirmed in 22/22 |

CRC parameters: polynomial 0x1021, initial 0xffff, no reflection, xorout 0. Coverage: byte 1 through N−3 inclusive (excludes leading 0x33 and checksum). Tested common polynomial/reflection, initial-value, xorout, start-offset and byte-order alternatives; this candidate matched every applicable frame. Validation establishes an envelope, not a safe live command contract.

`FrameAssembler` is a bounded offline byte-stream utility, tested with split captured envelopes. It is deliberately not connected to live notifications: an application fragmentation/retransmission protocol has not been established. `encodeFrame` is similarly offline-only; there is no live arbitrary-write facility.

## Web Bluetooth constraints

The browser exposes a GATT client, not a local GATT server, arbitrary HCI, MAC access, explicit MTU control, or OS bonding management. It requires a secure context and supported browser. On Linux Chrome, experimental Web Platform features may be required. Reconnection requires subscriptions to be re-established. Sources: [Chrome Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth), [Web Bluetooth specification](https://bluetooth.spec.whatwg.org/).

No Rust bridge was added: there is not yet evidence that a missing browser operation is required for binding. If an Android-hosted service proves essential, that would be a concrete reason to evaluate a local authenticated BLE bridge.
