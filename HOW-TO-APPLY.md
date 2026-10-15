# How to apply ShiftPro release-prep changes to your GitHub repository

This sandbox does not have GitHub push credentials, so the `release/play-production`
branch could not be pushed directly. Instead, all changes are saved here as a
**git bundle** (preferred) and a **patch file** (fallback). Apply one of them
on a machine that has push access to `anamiir2-collab/SHIFTPROO`.

---

## Option A — Apply the git bundle (preferred, preserves history)

```sh
# 1. On your local machine, clone the existing repo (if you haven't already):
git clone https://github.com/anamiir2-collab/SHIFTPROO.git
cd SHIFTPROO

# 2. Fetch the release branch from the bundle:
git fetch /path/to/shiftpro-release-play-production.bundle release/play-production:release/play-production

# 3. Checkout the branch and verify:
git checkout release/play-production
git log --oneline -3

# 4. Push to GitHub:
git push origin release/play-production

# 5. Open a PR on GitHub:
#    https://github.com/anamiir2-collab/SHIFTPROO/compare/main...release/play-production
```

---

## Option B — Apply the patch (fallback, single commit only)

```sh
git clone https://github.com/anamiir2-collab/SHIFTPROO.git
cd SHIFTPROO
git checkout -b release/play-production
git am /path/to/0001-release-prepare-ShiftPro-for-Google-Play-prod.patch
git push origin release/play-production
```

> The bundle is preferred because it preserves the full commit history. The
> patch contains only the single release commit on top of the
> `feat/capacitor-google-play` parent.

---

## After pushing — verify the workflow runs

1. Go to https://github.com/anamiir2-collab/SHIFTPROO/actions
2. The "Android build (Capacitor)" workflow will start automatically on push
   to `release/play-production`.
3. The workflow has two jobs:
   - **Tests & web preparation** — runs all 33 Jest tests + prepares web assets
   - **Capacitor sync + debug APK + release AAB** — builds both artifacts
4. Without signing secrets configured, the release AAB will be **unsigned**
   (artifact name: `shiftpro-release-aab-unsigned`). The debug APK is always
   produced.

---

## Configure release signing (one-time)

To produce a **signed** release AAB suitable for direct Play Store upload:

1. Run the keystore generator on a trusted local machine:
   ```sh
   bash scripts/generate-upload-keystore.sh
   ```
   This produces `~/shiftpro-upload.jks` and prints the exact next steps.

2. Encode the keystore as base64:
   ```sh
   base64 -w 0 ~/shiftpro-upload.jks
   ```
   Copy the full output.

3. In your GitHub repository, go to
   **Settings → Secrets and variables → Actions → New repository secret**
   and add these four secrets:

   | Secret name | Value |
   |---|---|
   | `SHIFTPRO_SIGNING_KEYSTORE_BASE64` | The base64 output from step 2 |
   | `SHIFTPRO_SIGNING_STORE_PASSWORD` | The keystore password you chose |
   | `SHIFTPRO_SIGNING_KEY_ALIAS` | `shiftpro-upload` (default from the script) |
   | `SHIFTPRO_SIGNING_KEY_PASSWORD` | The key password you chose |

4. Re-run the workflow (push a new commit, or use the "Run workflow" button on
   the Actions page). The release AAB will now be **signed** and the artifact
   will be named `shiftpro-release-aab-signed`.

5. Verify the signature locally:
   ```sh
   # Download the AAB artifact from the workflow run page, then:
   jarsigner -verify app-release.aab
   # Should print: jar verified.
   ```

---

## Then submit to Google Play

1. **Create the app** in the Play Console using the metadata in
   `PLAY-STORE-LISTING.md`.
2. **Upload the signed AAB** to Production → Create release.
3. **Complete the Data safety form**, IARC questionnaire, and target audience
   declaration as documented in `PLAY-STORE-LISTING.md`.
4. **Run closed testing** with ≥20 testers for 14 days (new personal accounts
   only).
5. **Roll out** to production at 10% → 50% → 100%.

---

## Files in this download

| File | Purpose |
|---|---|
| `shiftpro-release-play-production.bundle` | Git bundle — fetch the branch with full history |
| `0001-release-prepare-ShiftPro-for-Google-Play-prod.patch` | Patch file — apply with `git am` |
| `RELEASE-AUDIT.md` | Full audit + implementation report (also in `docs/` of the branch) |
| `PLAY-STORE-LISTING.md` | Google Play store listing checklist (EN + AR), Data safety form, IARC answers |
| `generate-upload-keystore.sh` | One-shot script to generate the Play upload keystore + print secret configuration instructions |
| `play-feature-graphic.png` | 1024×500 Play Store feature graphic |
