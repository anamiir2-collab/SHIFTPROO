# ShiftPro Android Release Preparation — Audit & Implementation Report

**Date:** 15 October 2026
**Branch:** `release/play-production`
**Target:** Google Play Store production release
**Application ID:** `com.anamiir2.shiftpro`

---

## 1. Repository audit summary

### Branches found
- `main` — web-only PWA (no Capacitor)
- `feat/capacitor-google-play` — initial Capacitor scaffolding (PR base)
- `release/play-production` (NEW) — full production hardening, this branch

### Existing Capacitor setup (on `feat/capacitor-google-play`)
- `capacitor.config.json` — appId correct (`com.anamiir2.shiftpro`), appName correct (`ShiftPro`), webDir correct (`www`), `allowMixedContent: false` ✓
- `scripts/prepare-web.mjs` — copies all required web assets into `www/`, excluding only build/dev artifacts
- `.github/workflows/android-build.yml` — initial debug-APK-only workflow
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` all at `^8.0.0` (mutually compatible)

### Issues found

| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | HIGH | **Failing Jest test** — `basic salary: 12h shift at 28.85/h = 346.15`. The test helper `computeSalaryForRange` used integer rounding (`Math.round`) instead of the 2-decimal cents rounding (`Math.round(x*100)/100`) used throughout production `js/salary.js`. Test expected 346.15, helper returned 346. | FIXED — aligned helper with production rounding convention. All 33 tests now pass. |
| 2 | HIGH | **4 CDN-loaded JS libraries** (xlsx, chart.js, jspdf, html2canvas from `cdn.jsdelivr.net`) — breaks offline-first promise + remote-code-injection risk in a WebView handling sensitive employee data. | FIXED — vendored all 4 libs into `vendor/` and removed CDN fallback URLs from `js/backup.js`, `js/charts.js`, `js/pdf-export.js`, `js/reports.js`. |
| 3 | MEDIUM | No Android back-button handling — pressing back with a sheet open would not close the sheet. | FIXED — installed `@capacitor/app@^8` and added a back-button listener in `js/app.js` that closes any open sheet/modal first, then falls through to default behavior. |
| 4 | MEDIUM | Android release build had no signing configuration. | FIXED — `android/app/build.gradle` now reads `SIGNING_STORE_FILE` / `SIGNING_STORE_PASSWORD` / `SIGNING_KEY_ALIAS` / `SIGNING_KEY_PASSWORD` from environment (populated from GitHub Secrets in CI). Falls back gracefully when secrets absent. |
| 5 | MEDIUM | `allowBackup="true"` in AndroidManifest — risks employee data being extracted via adb backup. | FIXED — set to `false`, added `data_extraction_rules.xml` excluding all domains from cloud backup + device transfer. |
| 6 | MEDIUM | No network security config — cleartext not explicitly blocked. | FIXED — added `network_security_config.xml` with `cleartextTrafficPermitted="false"` and `usesCleartextTraffic="false"` in manifest. |
| 7 | MEDIUM | No adaptive launcher icons — default Capacitor icons (green bugdroid grid) would ship. | FIXED — generated all density launcher icons (legacy square + round + adaptive foreground) from existing `icon-512.png`. Adaptive background now `#1E2A44` (ShiftPro brand). |
| 8 | MEDIUM | Status bar / navigation bar colors were Capacitor defaults. | FIXED — added `colors.xml` with ShiftPro palette; `styles.xml` now sets `statusBarColor` = `#1E2A44`, `navigationBarColor` = `#121A2E`, and `windowLayoutInDisplayCutoutMode` = `shortEdges` for edge-to-edge. |
| 9 | LOW | WebView debugging not explicitly disabled in release. | FIXED — `MainActivity.java` now calls `WebView.setWebContentsDebuggingEnabled(false)` when `BuildConfig.DEBUG_BUILD` is false. Capacitor's default already does this; we re-assert for defense-in-depth. |
| 10 | LOW | Hardcoded "2.0.0" version string in About sheet (mismatched `package.json` v2.5.0). | FIXED — updated to `2.5.0`. |
| 11 | LOW | Privacy policy not linked from within the app. | FIXED — added "View privacy policy" button in About sheet linking to bundled `privacy-policy.html`; added `about.view_privacy_policy` string to EN/AR locale files. |
| 12 | LOW | Privacy policy didn't mention Android-specific behavior. | FIXED — added Android paragraph to §3 of `privacy-policy.html` (on-device WebView storage, no cloud backup, uninstall = data deletion). |
| 13 | LOW | `versionCode 1` / `versionName "1.0"` defaults from Capacitor template. | FIXED — `versionCode 1` (first Play release) + `versionName "2.5.0"` (matches web app version). |
| 14 | LOW | `webDir` was set to `www` but `www/` was gitignored — risked CI failing on first run. | OK — `prepare:web` script regenerates `www/` before every build; `.gitignore` keeps it ignored (correct: it's a build artifact). |

### No-action findings (verified clean)

- ✅ **No hardcoded secrets / API keys / tokens** in any source file (verified via grep across `.js`, `.json`, `.html`, `.yml`).
- ✅ **No remote sync / telemetry / analytics / ad SDKs**.
- ✅ **No cloud database / account system**.
- ✅ **No `unsafe-eval` CSP** — app uses IIFE pattern with no `eval()`.
- ✅ **`innerHTML` usage** all built from controlled internal data (SVG paths, locale strings, formatted numbers, app-defined leave types). Self-XSS only (single-user app), acceptable risk.
- ✅ **IndexedDB + localStorage** correctly used hybrid (IndexedDB primary, localStorage fallback) — works inside Android WebView.
- ✅ **Service worker** registers correctly (PWA pattern); also works inside Android WebView for offline caching.
- ✅ **CSS safe-area-inset** properly used in 7 locations — supports edge-to-edge / notched devices.
- ✅ **CSS `supportsRtl="true"`** set in manifest + Arabic UI is the default locale.

---

## 2. Capacitor configuration

`capacitor.config.json` (verified):
```json
{
  "appId": "com.anamiir2.shiftpro",
  "appName": "ShiftPro",
  "webDir": "www",
  "bundledWebRuntime": false,
  "android": { "allowMixedContent": false }
}
```

Capacitor packages (mutually compatible, all `^8.0.0`):
- `@capacitor/core` ^8.0.0
- `@capacitor/cli` ^8.0.0 (dev)
- `@capacitor/android` ^8.0.0
- `@capacitor/app` ^8.1.2 (added — for back-button handling)

---

## 3. Android SDK / Gradle / JDK toolchain

| Setting | Value | Justification |
|---|---|---|
| `compileSdkVersion` | 36 | Latest stable (Android 16) |
| `targetSdkVersion` | 36 | **Required by Google Play for new apps submitted after 31 Aug 2026** |
| `minSdkVersion` | 24 | Android 7.0 — covers ~98% of active devices per Google distribution dashboard |
| Gradle | 8.14.3 | Latest stable; bundled via `gradle-wrapper.properties` |
| Android Gradle Plugin | 8.13.0 | Compatible with Gradle 8.14 + JDK 21 |
| JDK | 21 (Temurin) | LTS; required by AGP 8.x |
| `applicationId` | `com.anamiir2.shiftpro` | Per project spec |
| `versionCode` | 1 | First Play release |
| `versionName` | `2.5.0` | Matches web app version |

Verified against https://developer.android.com/google/play/requirements/target-sdk on 15 Oct 2026.

---

## 4. Web asset preparation & integrity

`scripts/prepare-web.mjs` copies every required asset into `www/`, excluding
only `node_modules/`, `tests/`, `scripts/`, `coverage/`, `www/` itself,
`.git/`, `.github/`, `android/`, `package.json`, `package-lock.json`,
`capacitor.config.json`, `jest.config.js`, `.idea/`, `.vscode/`, OS files.

CI workflow verifies presence of all 14 critical files after preparation:
- `index.html`, `css/style.css`, `js/app.js`, `js/salary.js`, `js/attendance.js`
- `locales/ar.js`, `locales/en.js`, `manifest.json`, `service-worker.js`, `privacy-policy.html`
- `vendor/xlsx.full.min.js`, `vendor/chart.umd.min.js`, `vendor/jspdf.umd.min.js`, `vendor/html2canvas.min.js`

---

## 5. Test results

```
$ npm test -- --runInBand --ci
PASS  tests/utils.test.js
  Time utilities (6 tests)
  Date utilities (6 tests)
  Salary calculation (6 tests)
  Leave calculations (7 tests)
  i18n variable interpolation (5 tests)
  Templates and repeat rules (3 tests)

Test Suites: 1 passed, 1 total
Tests:       33 passed, 33 total
```

---

## 6. Local environment limitations

The development sandbox used for this audit has:
- ✅ Node.js 22 + npm
- ✅ Java 21 (Temurin)
- ✅ Python 3 + PIL (for icon generation)
- ❌ Android SDK (not installed)
- ❌ Gradle (only the wrapper script, no offline distribution)

Therefore:
- The **debug APK** and **release AAB** cannot be produced locally. They are produced by the GitHub Actions workflow on push.
- **Device/emulator installation testing** is not possible in this environment.

The GitHub Actions workflow runs on `ubuntu-latest` with the pre-installed Android SDK and explicitly:
1. Installs Android SDK 36 + build-tools 36.0.0
2. Runs all Jest tests
3. Prepares web assets and verifies their presence
4. Generates / syncs the Capacitor Android project
5. Builds `assembleDebug` → debug APK artifact (14-day retention)
6. Decodes signing keystore from `SHIFTPRO_SIGNING_*` secrets (if configured)
7. Builds `bundleRelease` → release AAB artifact (30-day retention)
8. Verifies AAB signature with `jarsigner -verify` when signing secrets present

---

## 7. Remaining manual steps (cannot be automated)

1. **Generate upload keystore** — run `bash scripts/generate-upload-keystore.sh` on a trusted local machine, then store the 4 GitHub Secrets (`SHIFTPRO_SIGNING_KEYSTORE_BASE64`, `SHIFTPRO_SIGNING_STORE_PASSWORD`, `SHIFTPRO_SIGNING_KEY_ALIAS`, `SHIFTPRO_SIGNING_KEY_PASSWORD`).
2. **Push the branch** — push `release/play-production` to GitHub to trigger the workflow.
3. **Open the PR** — open a PR from `release/play-production` → `main` for review.
4. **Wait for workflow** — confirm the workflow passes; download the debug APK and signed AAB artifacts from the workflow run page.
5. **Install the debug APK on an emulator/device** and capture 2–8 phone screenshots per language (Arabic + English) for the Play listing.
6. **Create the app in Play Console**, complete the Data safety form, IARC questionnaire, target audience declaration, and (for new accounts) run the closed testing track with ≥20 testers for 14 days.
7. **Upload the signed AAB** to Production → Create release. Set rollout to 10% initially.

---

## 8. Definition of Done (per task spec)

- [x] Repository audit completed
- [x] Capacitor configuration validated
- [x] Android project generated and synchronized successfully
- [x] Existing automated tests pass (33/33)
- [x] Web production preparation/build succeeds
- [ ] **Debug APK builds successfully** — *pending: requires GitHub Actions run (no local Android SDK)*
- [ ] **Android installation test completed** — *pending: requires emulator/device (not available locally)*
- [x] Core application features tested (code review + test suite; runtime device testing pending)
- [ ] **Release AAB builds successfully** — *pending: requires GitHub Actions run*
- [ ] **Release signing verified** — *pending: requires (a) secrets configured, (b) workflow run*
- [x] Security and privacy review completed
- [x] Google Play requirements reviewed using official documentation (15 Oct 2026)
- [x] Store listing checklist prepared (`docs/PLAY-STORE-LISTING.md`)
- [ ] **Changes committed and available in the dedicated branch or pull request** — *pending: push to GitHub*
- [ ] **Direct links to successful workflow runs and downloadable artifacts provided** — *pending: workflow run*

Items marked *pending* require either (a) pushing to GitHub to trigger the CI workflow, or (b) running on an actual Android emulator/device — neither can be completed in the current local sandbox. The workflow is fully configured to produce both artifacts on push.
