# Command reference

> Update: the user supplied recovered TouchGUI sources after this initial analysis. A manual, single-command binding candidate test is now implemented. See [current binding test and limitations](binding-test.md); earlier blanket no-write/no-APK statements below describe the prior milestone. Full pairing remains physically unverified.

Observed families only. None is authorized for live transmission. Framed IDs below are shown as wire bytes; e.g. `0400` means little-endian 0x0004. ACK-like replies are not confirmed success.

| Prefix / wire type | Write frames | Notification frames | Observed sizes (bytes) | Interpretation |
|---|---|---|---|---|
| 0201 | 2688 | 2693 | 2, 17 | Observed prefix and response shape; semantics unknown |
| 0209 | 2694 | 2697 | 2, 12 | Observed prefix and response shape; semantics unknown |
| 0401 | 2698 | 2904 | 6, 17 | Early parameterized initialization candidate; binding role unknown |
| 0206 | 2905 | 2907 | 2, 20 | Identifier-like text; private, no replay |
| 0204 | 2908 | 2910 | 2, 14 | Known device-address bytes in response; private, no replay |
| 0301 | 2970, 3128, 3368 | 2974, 3132, 3372 | 16 | Calendar-shaped fields; strong clock inference, unknown timezone/trailing fields |
| 0211 | 2996, 3241 | 3000, 3243 | 2, 20 | Version-like text at offset 8; role unverified |
| 0311 | 3134 | 3143 | 9, 20 | Observed prefix and response shape; semantics unknown |
| 0801 | 3145 | 3147 | 2, 9 | Observed prefix and response shape; semantics unknown |
| 02f3 | 3148 | 3150 | 2, 22 | Observed prefix and response shape; semantics unknown |
| 0807 | 3151, 3154 | 3156 | 3 | Observed prefix and response shape; semantics unknown |
| 08ee | — | 3153, 3199, 3209 | 3 | Terminal/status candidate; meaning unknown |
| 0803 | 3159, 3202 | 3162, 3163, 3164, 3165, 3166, 3168, 3169, 3170, 3171, 3172, 3173, 3174, 3178, 3180, 3183, 3184, 3187, 3190, 3191, 3192, 3193, 3196, 3206 | 3, 20 | 22 indexed 20-byte responses; sample semantics unknown |
| 0804 | 3207, 3211 | 3213 | 3 | Observed prefix and response shape; semantics unknown |
| framed:0400 | 3215, 3220, 3223, 3227 | 3217, 3222, 3226, 3230 | 19, 28 | Envelope length/CRC verified; body unknown |
| 0802 | 3231 | 3233 | 2, 3 | Observed prefix and response shape; semantics unknown |
| 2001 | 3235 | 3237 | 2, 4 | Observed prefix and response shape; semantics unknown |
| 2005 | 3238 | 3240 | 3 | Observed prefix and response shape; semantics unknown |
| 0205 | 3244 | 3246 | 2, 15 | Observed prefix and response shape; semantics unknown |
| 0215 | 3248 | 3250 | 2, 18 | Observed prefix and response shape; semantics unknown |
| 02b1 | 3251 | 3254 | 2, 10 | Observed prefix and response shape; semantics unknown |
| 0310 | 3255 | 3259 | 10 | Observed prefix and response shape; semantics unknown |
| framed:1500 | 3261, 3266, 3270, 3274, 3278 | 3263, 3268, 3272, 3277, 3283 | 15, 30, 35, 41, 47 | Envelope length/CRC verified; body unknown |
| 02b0 | 3285 | 3288 | 2, 25 | Observed prefix and response shape; semantics unknown |
| 0303 | 3289 | 3291 | 25 | Observed prefix and response shape; semantics unknown |
| 02b5 | 3294 | 3296 | 2, 9 | Observed prefix and response shape; semantics unknown |
| 0325 | 3297 | 3299 | 9 | Observed prefix and response shape; semantics unknown |
| 02b4 | 3302 | 3304 | 2, 14 | Observed prefix and response shape; semantics unknown |
| 0324 | 3305 | 3308 | 14 | Observed prefix and response shape; semantics unknown |
| 0212 | 3309 | 3311 | 2, 9 | Observed prefix and response shape; semantics unknown |
| 0304 | 3312 | 3315 | 9 | Observed prefix and response shape; semantics unknown |
| 0213 | 3316 | 3319 | 2, 9 | Observed prefix and response shape; semantics unknown |
| 0305 | 3320 | 3322 | 9 | Observed prefix and response shape; semantics unknown |
| 02b2 | 3325 | 3328 | 2, 14 | Observed prefix and response shape; semantics unknown |
| 0320 | 3329 | 3331 | 14, 20 | Observed prefix and response shape; semantics unknown |
| 02bb | 3332 | 3334 | 2, 15 | Observed prefix and response shape; semantics unknown |
| 0360 | 3335 | 3337 | 15 | Observed prefix and response shape; semantics unknown |
| 0328 | 3338 | 3340 | 9 | Observed prefix and response shape; semantics unknown |
| framed:0e00 | 3341 | 3343 | 15, 146 | Envelope length/CRC verified; body unknown |
| framed:1900 | 3344 | 3346 | 15 | Envelope length/CRC verified; body unknown |
| 032f | 3347 | 3349 | 3, 20 | Observed prefix and response shape; semantics unknown |
| 032a | 3350 | 3352 | 3, 20 | Observed prefix and response shape; semantics unknown |

Standard live operations use discovered properties and UUIDs: read permitted characteristic values; subscribe using `startNotifications()`; stop via `stopNotifications()`. Application code never writes CCCD handles directly. Standard 180a strings and conditional 180f/180d decoding are separate from this proprietary command table.

The exported `authorizeLiveCommand` denies all proprietary commands. The offline envelope encoder exists for parser round-trip tests and local research only; it has no path to browser GATT writes.
