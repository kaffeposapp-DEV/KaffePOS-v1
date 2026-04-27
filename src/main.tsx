 
 
 
 
 
 

import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_CUSTOM_THEME, applyThemeToDocument, type CustomThemeConfig, type ThemePresetId } from './lib/theme';
import { runAppUpgradeBootstrap } from './lib/appUpgrade';
import { initCriticalStorageBackupBridge, persistCriticalStorageBackup, restoreCriticalStorageBackup } from './lib/appStorageBackup';

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
  } catch (e) {
    console.error('Bootstrap error:', e);
    applyPersistedTheme();
  } finally {
    setTimeout(hideSplash, 400);
  }
}

bootstrap();
