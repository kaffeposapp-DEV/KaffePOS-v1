import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // Required for Capacitor — output to dist/
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',

    rollupOptions: {
      output: {
        // Split chunks for better caching
        manualChunks: {
          'react-core':  ['react', 'react-dom', 'react-router-dom'],
          'supabase':    ['@supabase/supabase-js'],
          'pdf':         ['jspdf', 'jspdf-autotable'],
          'capacitor':   [
            '@capacitor/core',
            '@capacitor/filesystem',
            '@capacitor/share',
            '@capacitor/haptics',
            '@capacitor/status-bar',
            '@capacitor/network',
            '@capacitor/toast',
          ],
        },
      },
    },
  },

  // Dev server
  server: {
    port: 5173,
    host: true, // expose to network for Capacitor live reload
  },

  // Ensure env vars are available
  envPrefix: 'VITE_',

  // Vitest configuration
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true
  }
});
