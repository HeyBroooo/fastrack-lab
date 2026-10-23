# Pairing and first-time binding

> Update: the user supplied recovered TouchGUI sources after this initial analysis. A manual, single-command binding candidate test is now implemented. See [current binding test and limitations](binding-test.md); earlier blanket no-write/no-APK statements below describe the prior milestone. Full pairing remains physically unverified.

## What is known

The user physically observed the official app take the watch from Scan to Pair to its home screen while logging this session. The capture shows the successful BLE connection, five notification subscriptions, query-shaped and configuration-shaped messages, and later bulk exchanges. The exact moment of the screen transition was not marked in the capture.

No packet is identified as an authenticated bind request, account authorization response, watch confirmation, or binding-success event. The 0401 exchange precedes much of the traffic, but proximity is insufficient to call it binding. Its four parameter bytes cannot be reused safely without understanding their origin. Likewise, the two-byte 0201/0209 requests are observed, not automatically authorized as harmless commands.

## Android-hosted services

The watch acts as an ATT client as well as a server: it searches Android for two 128-bit services (frames 2912 and 2925), then the standard Generic Attribute service and characteristics. The UUID search values are UUIDs, not demonstrated secrets. This is different from Android probing the watch. These queries may be optional compatibility probes or part of the app integration; this recording alone does not settle their role.

A required local GATT-server implementation cannot run through Web Bluetooth's GATT-client API. This would be a blocker **if necessity is demonstrated**. No bridge is justified yet.

## Security evidence

No SMP exchange, encryption-change event, or LE start-encryption operation was located in the supplied session. This does not establish that binding is unauthenticated: Android may already hold keys, or account authorization may occur outside HCI. The ATT capture cannot prove backend behavior or application storage state. No captured user identifier, address payload, session credential or readable user content is replayed by the implementation.

## Implemented behavior

The setup state machine records real selection, GATT connection, discovery, notification and read completion events. It has the requested state vocabulary but deliberately no transition into initializing, awaiting_confirmation, binding or ready: there is no verified response contract for those events. Read completion returns to services_discovered, never ready. Disconnection clears live device values and subscriptions; reconnect repeats discovery and subscriptions. No automatic retries, reset or unbind occur.

## What is needed to implement binding

1. An authorized copy of the installed official APK (and relevant splits, if needed) to trace `com.titan.fastrack.reflex`'s protocol handler. No APK is currently present in the project, and none was downloaded from third-party sites.
2. Trace 0401, the origin of its parameter, the 020x queries and Android service registration. Identify whether app/account credentials are required and how they are obtained legitimately.
3. If the APK is insufficient, a second controlled official-app capture with an event log noting connection, watch confirmation and screen transition times. A different session helps distinguish counters, settings and identities from authorization material.
4. Only after a reproducible authorized initialization contract exists: implement narrowly typed commands, response matching, timeouts and tests; then request approval for the hardware reset test.

**First-time pairing implemented: no. Physically verified: no. Factory-reset target passed: no.** The current release is ready for non-destructive communication testing, not reset testing.
