import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // Pre-bundle mermaid at dev-server start. It is only reached through a dynamic
    // import inside MermaidArtifact, so Vite would otherwise discover it the first
    // time a report contains a diagram — and re-optimizing mid-session kills the
    // in-flight request with "504 (Outdated Optimize Dep)", leaving the card stuck
    // on its loading placeholder until a manual reload. Observed in dev; production
    // builds are unaffected, and this does NOT put mermaid in the initial bundle.
    include: ['mermaid'],
  },
})
