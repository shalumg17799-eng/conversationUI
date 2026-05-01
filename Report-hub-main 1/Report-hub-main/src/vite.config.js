import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react({
      fastRefresh: false
    }),
    tailwindcss()
  ],
  server: {
    port: 5178,
    host: true,
    hmr: false
  },
  root: '.',
  build: {
    outDir: '../dist'
  },
  define: {
    'process.env': '{}',
    'global': 'globalThis'
  },
  resolve: {
    alias: {
      '@google-cloud/bigquery': 'null',
      '@': path.resolve(__dirname, '.')
    }
  }
});
