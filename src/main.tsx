 
 
 
 
 
 

import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_CUSTOM_THEME, applyThemeToDocument, type CustomThemeConfig, type ThemePresetId } from './lib/theme';
import { runAppUpgradeBootstrap } from './lib/appUpgrade';
import { initCriticalStorageBackupBridge, persistCriticalStorageBackup, restoreCriticalStorageBackup } from './lib/appStorageBackup';
import { captureFrontendError, initFrontendErrorTracking } from './lib/errorTracking';
import { applyDevicePerformanceHints } from './lib/devicePerformance';

function registerOfflineShell() {
  if (import.meta.env.DEV) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
          window.dispatchEvent(new CustomEvent('kaffepos-toast', {
            detail: {
              message: 'Update aplikasi tersedia. Tutup dan buka kembali saat operasional sedang longgar.',
              type: 'info',
            },
          }));
        });
      });
    }).catch((error) => {
      console.warn('[OfflineShell] Service worker registration failed', error);
    });
  });
}

function applyPersistedTheme() {
  try {
    const theme = (localStorage.getItem('kpos_app_theme') as ThemePresetId | null) || 'classic';
    const customTheme = (() => {
      try {
        const raw = localStorage.getItem('kpos_app_theme_custom');
        return raw ? { ...DEFAULT_CUSTOM_THEME, ...(JSON.parse(raw) as Partial<CustomThemeConfig>) } : DEFAULT_CUSTOM_THEME;
      } catch {
        return DEFAULT_CUSTOM_THEME;
      }
    })();
    applyThemeToDocument(theme, customTheme);
  } catch {
    applyThemeToDocument('classic', DEFAULT_CUSTOM_THEME);
  }
}

async function bootstrap() {
  initFrontendErrorTracking();
  const hideSplash = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide({ fadeOutDuration: 200 });
      }
    } catch { /* ignore */ }
  };
  try {
    initCriticalStorageBackupBridge();
    await restoreCriticalStorageBackup();
    await runAppUpgradeBootstrap();
    applyPersistedTheme();
    applyDevicePerformanceHints();
    await persistCriticalStorageBackup();

    if (Capacitor.isNativePlatform()) {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#ffffff' });
      } catch { /* ignore */ }
    }
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    );
    registerOfflineShell();
  } catch (e) {
    console.error('Bootstrap error:', e);
    captureFrontendError(e, { source: 'frontend_bootstrap' });
    applyPersistedTheme();
  } finally {
    setTimeout(hideSplash, 400);
  }
}

bootstrap();
