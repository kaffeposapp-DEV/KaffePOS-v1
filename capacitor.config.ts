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
    // allowMixedContent: JANGAN aktifkan — security risk, konflik dengan androidScheme https
    captureInput: true,
    // Aktif untuk debug via USB/Chrome DevTools. Matikan lagi sebelum build release.
    webContentsDebuggingEnabled: true,
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
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // serverClientId = Web Client ID dari Supabase
      // Android Client ID (772175003609-cdbe7lane...) sudah terdaftar di Google Cloud dgn SHA-1
      serverClientId: '772175003609-pmecpcf33sr7kk8l270f0mh534pceh20.apps.googleusercontent.com',
      forceCodeForRefreshToken: false,
    },
    CapacitorCookies: { enabled: true }
  },
};

export default config;
