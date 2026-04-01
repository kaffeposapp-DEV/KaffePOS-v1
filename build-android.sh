#!/bin/bash
cd ~/kaffepos-new/kaffepos-v2

echo "🔨 Building..."
npm run build && npx cap sync android

echo "🔧 Fixing Android 12+ splash..."
mkdir -p android/app/src/main/res/values-v31
cat > android/app/src/main/res/values-v31/themes.xml << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@color/splash_background</item>
        <item name="android:statusBarColor">@color/splash_background</item>
        <item name="android:navigationBarColor">@color/splash_background</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme">
        <item name="android:windowBackground">@color/splash_background</item>
        <item name="android:windowFullscreen">true</item>
        <item name="android:windowSplashScreenBackground">@color/splash_background</item>
        <item name="android:windowSplashScreenAnimatedIcon">@color/splash_background</item>
    </style>
</resources>
XML
rm -f android/app/src/main/res/values/themes.xml.backup

echo "📦 Building APK..."
cd android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
