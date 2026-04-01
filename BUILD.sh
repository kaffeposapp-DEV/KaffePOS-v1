#!/bin/bash
# ============================================================
# KaffePOS v2 — Full Build Script (Mac M1/M2/Intel)
# Jalankan: bash BUILD.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo ""
echo "☕ KaffePOS v2 — Build APK"
echo "=========================="

# 1. Install dependencies
echo ""
echo "📦 [1/6] Install dependencies..."
npm install --legacy-peer-deps

# 2. Build web
echo ""
echo "🔨 [2/6] Build web app..."
npm run build

# 3. Check if android platform exists
if [ ! -f "android/build.gradle" ] && [ ! -f "android/settings.gradle" ]; then
  echo ""
  echo "📱 [3/6] Android platform belum ada — menambahkan..."
  npx cap add android
else
  echo ""
  echo "📱 [3/6] Android platform sudah ada, skip add."
fi

# 4. Sync Capacitor
echo ""
echo "🔄 [4/6] Sync Capacitor..."
npx cap sync android

# 5. Copy custom AndroidManifest (with Bluetooth permissions)
echo ""
echo "📋 [5/6] Apply AndroidManifest (Bluetooth permissions)..."
MANIFEST_SRC="android/app/src/main/AndroidManifest.xml"
if grep -q "BLUETOOTH_CONNECT" "$MANIFEST_SRC" 2>/dev/null; then
  echo "   ✅ Bluetooth permissions sudah ada"
else
  echo "   ⚠ Menambah Bluetooth permissions..."
  python3 << 'PYEOF'
import re
path = 'android/app/src/main/AndroidManifest.xml'
with open(path, 'r') as f:
    c = f.read()

bt = '''    <!-- Bluetooth Printer — Android 12+ -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30"/>
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30"/>
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation"/>
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
'''
if 'VIBRATE' in c:
    c = c.replace(
        '<uses-permission android:name="android.permission.VIBRATE" />',
        '<uses-permission android:name="android.permission.VIBRATE" />\n' + bt
    )
elif '</manifest>' in c:
    c = c.replace('</manifest>', bt + '\n</manifest>')

with open(path, 'w') as f:
    f.write(c)
print('   ✅ Bluetooth permissions ditambahkan')
PYEOF
fi

# Copy MainActivity.java if exists in source
MAIN_JAVA_SRC="android/app/src/main/java/com/kaffepos/app/MainActivity.java"
if [ ! -f "$MAIN_JAVA_SRC" ]; then
  echo "   📝 Membuat MainActivity.java..."
  mkdir -p "android/app/src/main/java/com/kaffepos/app"
  cat > "$MAIN_JAVA_SRC" << 'JAVAEOF'
package com.kaffepos.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onStart() {
        super.onStart();
        try {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
JAVAEOF
  echo "   ✅ MainActivity.java dibuat"
fi

# 6. Build APK
echo ""
echo "🏗️  [6/6] Build APK Debug..."
cd android
chmod +x gradlew 2>/dev/null || true
./gradlew assembleDebug --no-daemon --stacktrace 2>&1 | tail -30
cd ..

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
  SIZE=$(du -h "$APK_PATH" | cut -f1)
  echo ""
  echo "=============================="
  echo "✅ BUILD BERHASIL!"
  echo "📦 APK: $APK_PATH ($SIZE)"
  echo ""
  echo "Install ke HP:"
  echo "  adb install -r $APK_PATH"
  echo ""
  echo "Atau copy manual ke HP:"
  echo "  cp $APK_PATH ~/Desktop/KaffePOS.apk"
  echo "=============================="
else
  echo ""
  echo "❌ BUILD GAGAL — APK tidak ditemukan"
  echo "Cek log Gradle di atas untuk detail error"
  exit 1
fi
