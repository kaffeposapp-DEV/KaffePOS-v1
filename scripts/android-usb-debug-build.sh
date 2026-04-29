#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== KaffePOS Android USB Debug Build =="
echo "Root: $ROOT_DIR"

if [[ "${VITE_API_BASE_URL:-}" == http://* ]]; then
  echo "ERROR: VITE_API_BASE_URL must use HTTPS for Android builds." >&2
  exit 1
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
