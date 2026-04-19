#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <app-path> <zip-path> <notary-profile>"
  exit 1
fi

APP_PATH="$1"
ZIP_PATH="$2"
NOTARY_PROFILE="$3"

echo "Creating zip archive for notarization..."
/usr/bin/ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo "Submitting to Apple notarization service..."
xcrun notarytool submit "$ZIP_PATH" --keychain-profile "$NOTARY_PROFILE" --wait

echo "Stapling notarization ticket..."
xcrun stapler staple "$APP_PATH"

echo "Notarization workflow complete."
