import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

/**
 * Two test projects (ARCHITECTURE §11):
 *   - `unit`: node environment for the pure layers. Fast, no DOM, and it fails
 *     loudly if engine code ever reaches for a browser API (ADR-003).
 *   - `ui`:  jsdom + Testing Library for components and hooks.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['src/{engine,dictionary,lib}/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'ui',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          // `storage` lives here rather than in `unit`: the repository's
          // cross-tab subscription is a real `window` StorageEvent listener.
          include: [
            'src/{components,hooks,state,storage,test}/**/*.test.{ts,tsx}',
            'src/*.test.{ts,tsx}',
          ],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/index.ts',
        'src/dictionary/data/**',
        // Type-only modules: erased at compile time, so there is nothing to
        // execute and v8 reports them as 0%/partial noise.
        'src/engine/types.ts',
        'src/**/*.d.ts',
      ],
      // NFR-8
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
        'src/engine/**/*.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
