# IT Paradise — Staff Android app

One APK, three logins (Owner / Sales / Technician). The app is a Capacitor shell that loads
`https://<server>/app` — the same backend, database and role permissions as the web CRM,
so every update to the server is live in the app immediately (no re-install needed).

* Build: GitHub Actions → `.github/workflows/android.yml` (runs on push to `mobile/**` or manually).
* Output: `public/downloads/ITParadise.apk` (served at `/download/app`) + GitHub Release `apk-latest`.
* Change server URL: edit `server.url` / `allowNavigation` in `capacitor.config.json` (e.g. `https://crm.itparadise.in/app`).
* Native features used: camera (photos, barcode/serial scan), location (attendance check-in), WhatsApp / dialer intents, PDF open in browser tab.
* Signing: `keystore/debug.keystore` (Android debug key, password `android`) is committed so every build has the same
  signature and staff can update over the old APK. For Play Store, create a private release keystore and keep it in GitHub Secrets.
