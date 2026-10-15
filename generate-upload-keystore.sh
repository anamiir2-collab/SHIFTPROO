#!/usr/bin/env bash
# Generate the ShiftPro Google Play upload keystore.
#
# This script is run ONCE on the developer's local machine. It produces a
# .jks keystore that is then base64-encoded and stored as a GitHub Actions
# Secret. The keystore itself MUST NEVER be committed to git (it is already
# in .gitignore).
#
# Prerequisites:
#   - Java 11+ installed (keytool is part of the JDK)
#
# Usage:
#   bash scripts/generate-upload-keystore.sh
#
# Output:
#   ~/shiftpro-upload.jks   (the keystore)
#   echo instructions for configuring GitHub Secrets
#
# After running this, follow the instructions printed at the end to:
#   1. Enable Google Play App Signing in Play Console (one-time).
#   2. Upload the SAME keystore's certificate as the app's upload key.
#   3. Store the four GitHub Secrets.

set -euo pipefail

KEYSTORE_PATH="${HOME}/shiftpro-upload.jks"
ALIAS="shiftpro-upload"
STORE_PASSWORD=""
KEY_PASSWORD=""
VALIDITY_YEARS=25
KEY_SIZE=4096

if [ -f "$KEYSTORE_PATH" ]; then
  echo "WARNING: $KEYSTORE_PATH already exists." >&2
  read -r -p "Overwrite? (type YES to overwrite): " confirm
  if [ "$confirm" != "YES" ]; then
    echo "Aborted."
    exit 1
  fi
  rm -f "$KEYSTORE_PATH"
fi

echo "Generating ShiftPro Google Play upload keystore at: $KEYSTORE_PATH"
echo ""

# Prompt for passwords (not echoed to terminal)
read -r -s -p "Choose a keystore password (min 8 chars): " STORE_PASSWORD; echo
read -r -s -p "Choose a key password (min 8 chars): " KEY_PASSWORD; echo
if [ ${#STORE_PASSWORD} -lt 8 ] || [ ${#KEY_PASSWORD} -lt 8 ]; then
  echo "ERROR: passwords must be at least 8 characters."
  exit 1
fi

keytool -genkeypair \
  -keystore "$KEYSTORE_PATH" \
  -alias "$ALIAS" \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -keyalg RSA \
  -keysize "$KEY_SIZE" \
  -validity $((VALIDITY_YEARS * 365)) \
  -dname "CN=ShiftPro Upload, OU=Mobile, O=anamiir2, L=Cairo, ST=Cairo, C=EG" \
  -storetype JKS

echo ""
echo "Keystore generated successfully: $KEYSTORE_PATH"
echo ""
echo "=========================================================="
echo "NEXT STEPS — Configure GitHub Actions Secrets"
echo "=========================================================="
echo ""
echo "1) Encode the keystore as base64 (copy the full output):"
echo ""
echo "   base64 -w 0 $KEYSTORE_PATH"
echo ""
echo "2) In your GitHub repository, go to:"
echo "   Settings → Secrets and variables → Actions → New repository secret"
echo "   and create these FOUR secrets:"
echo ""
echo "   SHIFTPRO_SIGNING_KEYSTORE_BASE64   ← paste the base64 output above"
echo "   SHIFTPRO_SIGNING_STORE_PASSWORD    ← the keystore password you chose"
echo "   SHIFTPRO_SIGNING_KEY_ALIAS         ← $ALIAS"
echo "   SHIFTPRO_SIGNING_KEY_PASSWORD      ← the key password you chose"
echo ""
echo "3) (Recommended) Also store a backup of $KEYSTORE_PATH in a secure"
echo "   off-site location (password manager, encrypted backup). If you lose"
echo "   this keystore you will be unable to publish updates to ShiftPro on"
echo "   Google Play unless you reset the upload key via Play Console."
echo ""
echo "4) Enable Google Play App Signing in the Play Console:"
echo "   - Create the app in Play Console."
echo "   - Under Release → Setup → App signing integrity, opt in to"
echo "     Play App Signing. Use the certificate from this keystore as the"
echo "     upload key. Play will re-sign your AABs with its own app-signing"
echo "     key for distribution; your upload key only authenticates uploads."
echo ""
echo "5) Push to the release/play-production branch. The GitHub Actions"
echo "   workflow will produce a SIGNED app-release.aab artifact that you"
echo "   can upload directly to Play Console → Production → Create release."
echo ""
echo "=========================================================="
