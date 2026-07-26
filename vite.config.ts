import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/wordwright/, so assets need this prefix.
  base: '/wordwright/',
  // Tailwind runs through PostCSS (postcss.config.mjs), not the Vite plugin —
  // see ADR-018 for why.
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // NFR-1: keep an eye on the initial payload. Dictionary chunks are lazy
    // (ADR-007) so the entry bundle should stay far below this.
    chunkSizeWarningLimit: 250,
  },
});
