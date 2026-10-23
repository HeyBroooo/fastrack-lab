> Latest update: health-history synchronization, per-watch browser storage, capability checks and remembered reconnects are implemented. See [current health-sync behavior and limits](docs/health-sync.md). Earlier snapshot-only and bind-only descriptions below are historical.

> Current update: binding popup/home screen reported working by the user. Battery, firmware and current-activity requests are now implemented; see [watch data reads](docs/watch-data.md) for evidence, limitations and the current hardware check. Earlier bind-only restrictions below describe the previous iteration.

# Fastrack Lab

An evidence-based companion and Bluetooth research console for the Fastrack 38112 (`lark`). Built on the existing Next.js application.

**Current boundary:** BLE connection, discovery, notification subscriptions and permitted reads are implemented. An explicit **Bind Watch** action now sends the single TouchGUI binding candidate and parses its response. Complete binding is **not yet physically verified**. The app does not yet replace the official app after a factory reset, and no physical watch test is claimed.

## Run

```bash
npm install
npm run dev
```

Open **http://localhost:3000** directly in Chrome/Chromium. On Linux, if Web Bluetooth is unavailable, enable `chrome://flags/#enable-experimental-web-platform-features`, relaunch and reopen localhost. HTTP LAN addresses and embedded IDE previews may not expose Bluetooth. See [Chrome's Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth).

Wake the watch, disconnect other apps using it, click **Connect watch**, and select the BLE interface `FT_38112_9539`, not the audio interface `FT_38112BT_9539`. Use **Show all BLE devices** if the filtered list is empty.

## What works in code

- One connection owner with explicit states, 12-second GATT-operation deadlines, cleanup on unmount/disconnect and manual reconnect. Device selection remains under the user's control without an arbitrary chooser timeout.
- Discovery by service/characteristic UUID, automatic subscriptions to the five channels observed in the capture, explicit property detection, readable-value synchronization and per-characteristic errors.
- Standard model/manufacturer/firmware string decoding. Conditional standard battery and heart-rate support if those services exist. The captured watch does **not** expose standard battery or heart-rate services; those cards may correctly remain unavailable.
- A responsive dashboard with overview, setup wizard, health capability status, Bluetooth inspector, GATT explorer, protocol debugger and local historical capture analyzer.
- Bounded diagnostics (500 packets, 100 events/transitions), search/filtering, sanitized-by-default export, opt-in private raw payloads, strict import validation and historical/live separation.
- Validated proprietary envelope length/CRC decoding. Offline encoding and bounded byte-stream assembly for research and tests; no arbitrary write/replay UI.
- **Bind Watch** sends `04 01 F3 00 00 00` once per connection, waits for a matching response, and requests a physical watch-screen observation. No write acknowledgment or zero response is labelled successful pairing. See [the binding test](docs/binding-test.md).

## Capture analysis

```bash
npm run analyze:capture
```

Requires local TShark and Python 3. Uses the existing CFA, rather than relying on duplicate-key JSON discovery entries. It identified 212 target-session ATT packets, five services, 17 characteristics, five notification subscriptions and 22 framed messages with matching length/CRC rules. One out-of-session ATT packet is excluded.

Outputs under ignored `report/diagnostics/`:

- `watch-timeline.private.json`: full extracted value payloads and ATT PDU hex, timestamps, directions, handles, UUIDs and interpretations. Sensitive: keep local.
- `watch-gatt.json`: discovery map and envelope validation results.
- `watch-packets.sanitized.json`: metadata-only export suitable for Capture analyzer.
- `watch-packets.private.json`: raw application payloads for local analysis. Review/redact before sharing; contains potentially private text and identifiers.

The analyzer also regenerates the redacted [timeline](docs/packet-timeline.md) and [GATT map](docs/gatt-characteristics.md). Browser code never hardcodes ATT handles.

## Protocol and verification

Start with [protocol overview](docs/protocol-overview.md), [initialization sequence](docs/initialization-sequence.md), [pairing analysis](docs/pairing-analysis.md), [synchronization analysis](docs/synchronization-analysis.md), [command reference](docs/command-reference.md), and [unknown details](docs/unknown-protocol-details.md).

The `33daaddaad01` envelope's length and CRC-16/CCITT-FALSE match **22/22 captured frames**. The short protocol families are recognized without inventing sensor values. Clock-shaped fields and version-like text are explicitly labelled inferences. Command meanings, authentication and binding success are not established. The **only enabled proprietary write** is the explicitly requested binding candidate. There is no replay of captured credentials/settings, no reset/unbind and no firmware flashing. Optional authentication data is redacted and stops the flow.

The user-supplied recovered TouchGUI sources under `analysis/` now identify the candidate encoder and response parser. The full call chain and optional authentication command remain unresolved. The next step is the [manual binding test](docs/binding-test.md), not additional protocol commands or health synchronization.

## Checks

```bash
npm test
npm run typecheck
npm run build
```

Tests use Node's built-in runner and the existing TypeScript compiler, with no new dependencies. Sanitized captured fixtures cover envelopes and short command families; explicitly synthetic fixtures cover standard GATT edge cases and mocked Bluetooth lifecycle behavior. When local analyzer output is available, an additional test verifies all 22 captured envelopes and all three clock-shaped commands. No standalone lint configuration existed; production build runs Next.js's available validation.

Optional browser smoke test, with Chromium installed and production app already built:

```bash
npm run start -- --hostname 127.0.0.1 --port 3001
# In a second terminal:
node scripts/browser-smoke.cjs
```

The smoke test uses a temporary headless Chromium profile and **mocked** Bluetooth, not physical hardware. It checks the seven views, read display, disconnect/reconnect and desktop/mobile overflow. Local screenshots go under `report/diagnostics/`. Override `CHROMIUM_PATH` or `SMOKE_URL` if needed.

## Hardware validation and privacy

Follow the current [binding candidate test](docs/binding-test.md), using the watch in its current state **without resetting or unbinding it**. Report physical results before further protocol work. The earlier [hardware plan](docs/hardware-test-plan.md) remains context for non-destructive BLE checks.

Raw captures, bug reports, APKs, decompiled `analysis/` artifacts and generated local diagnostics are ignored. Never publish unreviewed captures or raw exports. There is no usable Git history in this workspace to verify previously tracked files; check tracking before publishing from another checkout.

Independent research; not affiliated with Fastrack or Titan.
