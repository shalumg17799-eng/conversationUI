// Standalone Vite root for exercising the mermaid-artifact render path in a real
// browser, WITHOUT loading src/app/pages/Conversational_new.tsx — which currently
// carries unresolved merge-conflict markers unrelated to this feature.
//
// Run:  npm run harness:mermaid      (then open http://localhost:5199)
//
// This whole directory is a disposable dev tool. `rm -rf harness` to remove it.
import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  server: { port: 5199, open: false },
});
