# Fixture provenance

`captured-packets.json` contains exact, non-personal payloads selected from the supplied CFA:

- 2688, 2694: two-byte observed command prefixes, no parameters.
- 2974: zero-body response to the clock-shaped command; no clock or device identity.
- 3000: version-like text response; no identity or user content. Kept as a candidate, not a confirmed firmware field.
- 3153: three-byte status/terminal candidate; semantic status deliberately unknown.
- 3263, 3344, 3346: short framed bodies containing only 00 and numeric envelope fields/checksum.

No address-bearing response, identifier string, readable user text, health record or authentication material is included. Frame numbers preserve traceability without copying full raw traffic. Command prefixes are fixtures, not a live replay allowlist.

Tests for standard battery/heart-rate field boundaries and mocked Bluetooth devices are synthetic protocol/lifecycle tests, explicitly not captured sensor readings. The optional local-capture test reads ignored private analyzer output in memory without printing payloads; it skips when the capture is unavailable.
