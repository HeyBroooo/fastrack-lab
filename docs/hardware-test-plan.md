# Hardware test plan

The user has confirmed that binding shows a confirmation popup, reaches the watch home screen, and battery reads succeed. The remaining live check is the new history synchronization; automated tests use captures and mock devices.

1. Reload the app at the same localhost origin. Disconnect the phone companion and wake the watch.
2. Click Connect (or Reconnect if offered). Previously saved setup skips binding. If the device chooser is required by the browser, select the BLE data interface, not the BT audio interface.
3. Open **Health & activity**. Wait for synchronization or click **Sync all health data**. Check each category's status.
4. Compare step totals and battery with the watch. Record a heart-rate or SpO₂ measurement on the watch, then sync again. Confirm timestamps and units; no-record status means no stored sample was returned.
5. Check available sleep history, stages and score. Check stress when supported. HRV must display unsupported if the watch's capability bit is absent.
6. Expand saved records; verify dates, interval counts and summaries. Export all records and confirm the JSON includes samples.
7. Disconnect: live battery clears, but saved records remain. Reconnect: no automatic binding command or popup should occur; data refreshes. Reload the page and repeat using the saved browser permission.
8. If a transfer fails, export Bluetooth inspector logs with raw payloads explicitly enabled. Note the failing category and watch screen. Binding authentication remains redacted. Do not reset the watch to troubleshoot this.
9. For a genuinely reset watch, use Device setup → Watch was reset? Show binding controls, bind once, then confirm the home screen.

History acknowledgements are sent only after local IndexedDB commits. Export your records before clearing browser/site storage. Do not interpret raw watch units as verified physical scales.

See [health-sync.md](health-sync.md) for exact command/source evidence and remaining unsupported data types.
