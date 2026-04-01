import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './index.css';
import { Capacitor } from '@capacitor/core';

async function bootstrap() {
  const hideSplash = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide({ fadeOutDuration: 200 });
      }
    } catch {}
  };
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#ffffff' });
      } catch {}
    }
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    );
  } catch (e) {
    console.error('Bootstrap error:', e);
  } finally {
    setTimeout(hideSplash, 400);
  }
}

bootstrap();
