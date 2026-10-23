# Initialization sequence

> Update: the user supplied recovered TouchGUI sources after this initial analysis. A manual, single-command binding candidate test is now implemented. See [current binding test and limitations](binding-test.md); earlier blanket no-write/no-APK statements below describe the prior milestone. Full pairing remains physically unverified.

This is an observation timeline, **not a replay script**. No binding success packet is identified.

| Frames | Observed operation | Interpretation / confidence |
|---|---|---|
| 2426 | Successful BLE link | Confirmed transport only |
| 2453–2455 | MTU 247 / 517 exchange | Confirmed effective MTU 247 |
| 2458–2595 | GATT and descriptor discovery | Confirmed |
| 2647, 2650, 2658, 2666, 2675 | CCCDs 0100 for 27f7, 27f2, 2762, 2763, 2764, in that order | Confirmed notification setup |
| 2688 / 2693 | 0201 on 27f1, matching-prefix 17-byte response on 27f7 | Query-shaped; fields unknown |
| 2694 / 2697 | 0209, matching-prefix 12-byte response | Query-shaped; fields unknown |
| 2698 / 2904 | 0401 with four parameter bytes, 17-byte mostly-zero response | Unknown. Potential initialization candidate, not proven binding |
| 2905 / 2907 | 0206 and 20-byte response | Identifier-like content, kept private |
| 2908 / 2910 | 0204 and 14-byte response | Response contains the two known watch addresses; not a binding credential contract |
| 2912–2956 | Watch-initiated discovery of Android-hosted services | Confirmed traffic; application requirement unknown |
| 2970 / 2974 | 0301 with calendar-shaped fields, matching-prefix zero body | Strong clock-setting inference, no timezone/ack success contract |
| 2996 / 3000 | 0211 and response containing version-like string | Strong version-text inference, firmware role unverified |
| 3128 / 3132 | 0301 repeated with later clock fields | Supports clock inference |
| 3134 / 3143 | 0311 configuration-shaped write and reply | Unknown fields |
| 3145–3352 | 08xx, 20xx, framed exchanges and 02xx/03xx settings-shaped traffic | See synchronization analysis |
| 3368 / 3372 | Third 0301 exchange | Clock-shaped again |

The application reproduces only connection, discovery, notification subscriptions and permitted characteristic reads. It then displays **Connected — initialization protocol incomplete**. It never sends 0401, clock writes, identifier messages, framed messages, or settings based solely on their position in this sequence.

A CCCD write response acknowledges the ATT descriptor operation. A notification with an echoed command prefix is an application response observation. Neither proves binding succeeded, health synchronization finished, or the watch left Scan to Pair.
