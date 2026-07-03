---
  name: SOTI Surf kiosk camera access
  description: How to enable getUserMedia camera access for web content inside SOTI Surf kiosk browser via MobiControl
  ---

  Getting `navigator.mediaDevices.getUserMedia()` to work inside the SOTI Surf kiosk browser (Android, managed via MobiControl) requires three independent layers to all be satisfied — missing any one produces a different failure signature:

  1. **Secure context (HTTPS)**: if the page is served over plain HTTP (e.g. a local IP), `navigator.mediaDevices` is entirely `undefined` in the WebView (not just getUserMedia throwing). Check via `window.isSecureContext` / `location.protocol`.
  2. **Android system permission for the SOTI Surf app**: Settings → Apps → SOTI Surf → Permissions → Camera. "Allow only while using the app" is sufficient.
  3. **SOTI Surf / MobiControl WebView permission config**: even with 1 and 2 satisfied, SOTI Surf's kiosk mode fails closed on WebView permission prompts (no UI can be shown in kiosk lockdown), causing `getUserMedia` to reject with `NotAllowedError: Permission denied`. This must be explicitly allowed in MobiControl: Profile → SOTI Surf → Privacy & Security → enable "Enable Camera", and add the site's domain under "Website Permissions" with Camera set to "Always Allow".

  **Why:** each layer produces a distinct, diagnosable error (missing API vs NotAllowedError), so an on-screen debug log capturing `isSecureContext`, `navigator.mediaDevices` presence, and the `err.name`/`err.message` from a failed getUserMedia call is enough to pinpoint which of the 3 layers is missing without device console access.

  **How to apply:** when a kiosk/managed-browser environment (SOTI Surf or similar MDM browsers) reports camera issues, walk through these 3 layers in order using an in-app debug log rather than guessing — this is a device/MDM configuration issue, not fixable from web app code.
  