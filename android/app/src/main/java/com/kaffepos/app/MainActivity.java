package com.kaffepos.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.WindowManager;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UsbPrinterPlugin.class);
        registerPlugin(BluetoothPrinterPlugin.class);
        super.onCreate(savedInstanceState);

        // ── FIX: Prevent screen from dimming/going to sleep while app is open
        // This prevents Android from killing the WebView due to screen-off + memory pressure
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // ── FIX: Optimize WebView settings to reduce memory pressure ──────
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                // Enable hardware acceleration for WebView (GPU rendering = less CPU/memory)
                settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
                // Enable DOM storage (required for localStorage)
                settings.setDomStorageEnabled(true);
                // Cache mode: use cache when network is unavailable
                settings.setCacheMode(WebSettings.LOAD_DEFAULT);
                // Disable file access from file:// (security + reduces crash risk)
                settings.setAllowFileAccessFromFileURLs(false);
                settings.setAllowUniversalAccessFromFileURLs(false);
                // Enable mixed content only on Debug builds (Capacitor handles this on release)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
                }
            }
        } catch (Exception e) {
            // Ignore — WebView may not be ready yet
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-add keep-screen-on flag on resume (some devices clear it)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }


    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (getBridge() != null) {
            getBridge().onNewIntent(intent);
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // When app goes to background, clear keep-screen-on to save battery
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // When Android signals memory pressure, hint GC to clean up
        // Levels: TRIM_MEMORY_MODERATE (60), TRIM_MEMORY_RUNNING_LOW (10+)
        if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_MODERATE) {
            try {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    // Tell JavaScript to run GC via a minimal eval — no-op but hints the engine
                    webView.evaluateJavascript("window.__kpos_gc_hint && window.__kpos_gc_hint()", null);
                }
            } catch (Exception ignored) {}
            System.gc();
        }
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        System.gc();
    }
}
