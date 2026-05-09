// capacitor.config.ts — KaffePOS v6 FINAL
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kaffepos.app',
  appName: 'KaffePOS',
  webDir: 'dist',

  server: {
    androidScheme: 'https',
  },

  android: {
    // allowMixedContent: JANGAN aktifkan — semua API production wajib HTTPS.
    captureInput: true,
    webContentsDebuggingEnabled: false,
    appendUserAgent: 'KaffePOS/9.0',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#1a0f0a',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a0f0a',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: { enabled: true }
  },
};

export default config;
