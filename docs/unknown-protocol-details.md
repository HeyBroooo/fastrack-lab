# Unknown details and next engineering tasks

> Update: the user supplied recovered TouchGUI sources after this initial analysis. A manual, single-command binding candidate test is now implemented. See [current binding test and limitations](binding-test.md); earlier blanket no-write/no-APK statements below describe the prior milestone. Full pairing remains physically unverified.

| Open question | Current evidence | Required next step |
|---|---|---|
| Binding trigger | Successful official session; no correlated screen timestamp | Trace authorized APK handlers and state transitions |
| 0401 parameter | Single early parameterized write and matching-prefix response | Establish origin, lifetime and meaning; do not replay |
| Account/backend authorization | HCI does not capture HTTPS or app storage | Inspect legitimate app authorization flow |
| Android server requirement | Watch probes phone services | Determine whether failed/absent server prevents binding |
| OS bonding necessity | No visible SMP/encryption event | Inspect prior bond state and app behavior |
| Sequence wrap/reset | Framed values 3–13 echoed | Additional sessions / implementation evidence |
| CRC generality | Rule matches all 22 available frames | Validate new firmware/captures; reject mismatches |
| Proprietary fragmentation | Every captured framed value is complete after HCI reassembly | Capture larger exchanges before enabling live reassembly |
| 08xx stream layout | 22 indexed 20-byte responses and apparent delimiter | Establish units, dates, sample counts and termination contract |
| Sensor units/timestamps | No trusted field mapping | Compare documented handler/SDK and controlled known measurements |
| Readable text | Present in outgoing frames | Keep private; do not treat as sensor data |
| 20xx channel | Two exchanges on 2763 | Trace app code before naming or replaying |
| Disconnect/bond persistence | No captured link termination | Manual non-destructive disconnect/reconnect test |

No automatic retries or arbitrary write/debug console are provided. Current operational BLE actions are connection, discovery, read, subscription and disconnection. No firmware flashing, reset, unbind, account impersonation or replay of identity/session bytes is implemented.

Raw captures and analysis files are ignored by `.gitignore`. The available `.git` directory is empty/read-only rather than a usable Git checkout, so previously tracked-file history could not be audited. Before publishing from a different checkout, verify `git ls-files report` is empty; ignore rules do not untrack existing files.
