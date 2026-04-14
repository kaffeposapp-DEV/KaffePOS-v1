import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const chunkGroups = [
  {
    name: 'react-core',
    modules: ['react', 'react-dom', 'react-router-dom'],
  },
  {
    name: 'supabase',
    modules: ['@supabase/supabase-js'],
  },
  {
    name: 'pdf',
    modules: ['jspdf', 'jspdf-autotable'],
  },
  {
    name: 'capacitor',
    modules: [
      '@capacitor/core',
      '@capacitor/filesystem',
      '@capacitor/share',
      '@capacitor/haptics',
      '@capacitor/status-bar',
      '@capacitor/network',
      '@capacitor/toast',
    ],
  },
] as const;

function manualChunks(id: string) {
  if (!id.includes('node_modules')) {
    return;
  }

  for (const group of chunkGroups) {
    if (
      group.modules.some(
        (moduleName) =>
          id.includes(`/node_modules/${moduleName}/`) ||
          id.includes(`\\node_modules\\${moduleName}\\`)
      )
    ) {
      return group.name;
    }
  }
}

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
        manualChunks,
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
