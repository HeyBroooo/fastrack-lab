# Repository audit and implementation plan

Existing application retained: Next.js App Router with React, TypeScript and lucide-react. Installed baseline versions: Next.js 15.5.28, React 19.3.1, TypeScript 5.9.3. `tsconfig.json` enables strict mode, bundler resolution, ES2017 target and DOM libraries. No additional runtime or development dependency was added.

Baseline `npm run build` completed successfully before implementation. No test or lint script existed. The original page owned discovery, listeners and UI in one component; it had no protocol parser or binding operation. The preceding fixes already provided explicit characteristic-property detection, browser diagnostics and an all-device picker. These were preserved.

Risks addressed: scattered connection ownership; no operation timeouts; stale async completion after disconnect; duplicate/lost listeners on rescan; missing automatic known-channel subscriptions; generic pairing status; raw diagnostics without safe default redaction; no tests.

Execution plan (completed to available evidence):

1. Audit code and baseline build.
2. Decode actual CFA, isolate connection, reconstruct GATT, compare JSON, validate framing.
3. Document observations, inferences and binding blockers.
4. Implement bounded protocol tooling and automated captured/synthetic tests.
5. Centralize Bluetooth ownership, cleanup, timeouts and manual reconnection.
6. Build setup, overview, health availability, inspector, GATT, debugger and local historical analyzer views.
7. Run typecheck, tests, capture validation and production build; provide physical test procedure.

Binding/health history are not counted as completed functionality. No APK was present; there was no authorized app implementation available to verify the missing command semantics. All work possible with this evidence is distinct from physical hardware acceptance.
