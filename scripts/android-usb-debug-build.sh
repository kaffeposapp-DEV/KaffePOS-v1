#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== KaffePOS Android USB Debug Build =="
echo "Root: $ROOT_DIR"

API_BASE="${VITE_API_BASE_URL:-}"
if [[ -n "$API_BASE" ]]; then
  if [[ "$API_BASE" != https://* ]]; then
    echo "ERROR: VITE_API_BASE_URL must use HTTPS for Android builds." >&2
    exit 1
  fi

  if [[ "$API_BASE" == *localhost* || "$API_BASE" == *127.0.0.1* || "$API_BASE" == *10.0.2.2* || "$API_BASE" == *.local* ]]; then
    echo "ERROR: Android APK builds must not point VITE_API_BASE_URL to localhost, 127.0.0.1, 10.0.2.2, or .local hosts." >&2
    exit 1
  fi

  echo "API target: $API_BASE"
else
  echo "API target: native fallback https://api.kaffepos.my.id"
fi

echo "== Build mobile web assets =="
npm run build:mobile

echo "== Sync Capacitor Android project =="
npx cap sync android

echo "== Assemble debug APK =="
(
  cd android
  ./gradlew assembleDebug
)

APK_PATH="$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
echo "APK ready: $APK_PATH"

if [[ "${INSTALL:-0}" == "1" ]]; then
  echo "== Install via USB debugging =="
  adb devices
  adb install -r "$APK_PATH"
  echo "Installed via adb."
else
  echo "Set INSTALL=1 to install via adb after build."
fi
