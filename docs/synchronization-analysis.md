# Synchronization analysis

## Short command families

0201 and 0209 have matching-prefix responses of 17 and 12 bytes. Their fields are not decoded into battery, steps or other measurements. 0204 returns bytes matching the two user-provided BLE/audio addresses (frame 2910); it is excluded from fixtures and live decoding. 0206 contains identifier-like text and is treated as private. Two 0211 responses (3000 and 3243) have the same version-like text at offset 8; the inspector labels it a candidate, not a confirmed firmware version.

Three outgoing 0301 payloads (2970, 3128, 3368) contain a little-endian year followed by month, day, hour, minute, second. Calendar fields advance consistently with the capture timing. This supports a clock command hypothesis; the timezone and remaining fields are not established. No live clock-setting operation is enabled.

Later 02xx requests followed by 03xx parameterized writes and zero-filled replies are configuration-shaped. Units, bit meanings, side effects and success codes are unknown. These are not health measurements simply because values fit a plausible range.

## 08xx stream

A request 080301 (3159) precedes 22 notifications of 20 bytes (3162–3196), with third-byte values 01 through 16 (hex), followed by 08ee00 (3199). These are strong sequence/index candidates, but the precise sample layout and terminal response semantics are unknown. Later outgoing 080302 (3202) receives an identical three-byte response. It could acknowledge/advance/clear data; it is not replayed. Other 0807/0804 exchanges contain 08ee00 or matching prefixes. An empty/terminal-looking response is not established as successful synchronization.

The app does not concatenate this stream into fabricated sensor records, and does not assume the third byte is a global fragment number. `FrameAssembler` applies only to the separately validated 33da envelope.

## Framed exchanges

- Type candidate 0004: four request/response exchanges, sequence candidates 3–6; 19-byte requests and 28-byte replies.
- Type candidate 0015: five requests (35–47 bytes, one 30-byte request) and 15-byte replies, sequence candidates 7–11. Bodies contain readable text and are treated as private content; these are not assumed to be health records.
- Type candidate 000e: one 146-byte request and 15-byte response, sequence candidate 12. Body unknown/private.
- Type candidate 0019: identical 15-byte request and response, sequence candidate 13. An echo is not demonstrated success.

The same validated length and CRC rule holds across all 22 messages. The 16-bit fields at offsets 8 and 10 are exposed as command and sequence candidates, while bodies remain opaque.

## Service 2760

2763 carries 2001 → 20010000 and 200500 → 200500. They are observed exchanges with unknown semantics. 2761 advertises write/write-without-response; 2762 and 2764 advertise notify. No data role is established for those other three characteristics in this session.

## Live capability matrix

| Capability | Implementation | Captured watch support | Physical test |
|---|---|---|---|
| Model/manufacturer | Read and decode standard 180a strings | 2a24 / 2a29 declared readable | Pending |
| Firmware | Standard 2a26 decoder | Not exposed here; 0211 text remains candidate | Pending |
| Battery | Standard 180f/2a19 decoder, 0–100% validation | Not exposed here | Pending |
| Heart rate | Standard 180d/2a37 flags/length parsing, optional-field checks; display range 1–300 bpm | Not exposed here | Pending |
| Steps/distance/calories/SpO₂/sleep/history | Not supported or not yet decoded | Proprietary field semantics unresolved | Not testable yet |

Standard decoders follow the [Bluetooth GATT Specification Supplement](https://btprodspecificationrefs.blob.core.windows.net/gatt-specification-supplement/GATT_Specification_Supplement.pdf); synthetic boundary tests are explicitly separate from captured fixtures. No proprietary byte is promoted to a health measurement. Last successful GATT read is labelled separately from history synchronization.
