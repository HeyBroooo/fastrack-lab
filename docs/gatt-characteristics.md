# GATT discovery evidence

Reconstructed from actual characteristic declaration records, not inferred from adjacent handle annotations. Numeric handles are capture evidence only; browser code uses service + characteristic UUIDs. TShark labels 2760–2764 as units; those labels do not describe this proprietary protocol.

| Service | Value handle | UUID | Properties | Evidence frame |
|---|---|---|---|---|
| 0x1801 | 0x0003 | 0x2a05 | indicate | 2499 |
| 0x1801 | 0x0006 | 0x2b29 | read, write | 2499 |
| 0x1801 | 0x0008 | 0x2b2a | read | 2499 |
| 0x1800 | 0x000b | 0x2a00 | read | 2543 |
| 0x1800 | 0x000d | 0x2a01 | read | 2543 |
| 0x1800 | 0x000f | 0x2a04 | read | 2543 |
| 0x180a | 0x0012 | 0x2a24 | read | 2555 |
| 0x180a | 0x0014 | 0x2a29 | read | 2555 |
| 0x180a | 0x0016 | 0x2a50 | read | 2555 |
| 0x27f0 | 0x0019 | 0x27f6 | write without response, write | 2564 |
| 0x27f0 | 0x001b | 0x27f7 | notify | 2564 |
| 0x27f0 | 0x001e | 0x27f1 | write without response, write | 2564 |
| 0x27f0 | 0x0020 | 0x27f2 | notify | 2564 |
| 0x2760 | 0x0024 | 0x2761 | write without response, write | 2583 |
| 0x2760 | 0x0026 | 0x2762 | notify | 2583 |
| 0x2760 | 0x0029 | 0x2763 | write without response, write, notify | 2583 |
| 0x2760 | 0x002c | 0x2764 | notify | 2583 |

Notification CCCDs: 001c → 27f7, 0021 → 27f2, 0027 → 2762, 002a → 2763, 002d → 2764. Writes 2647, 2650, 2658, 2666, 2675 all carry 0100; ATT write responses follow.

27f1 → 27f7 carries short queries/settings. 27f6 → 27f2 carries the 08xx stream; 27f6 → 27f7 carries framed exchanges. 2763 is bidirectional for 2001 / 200500. No application traffic on 2761, 2762 or 2764 beyond subscription is demonstrated here.
