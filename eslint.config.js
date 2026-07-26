import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Tailwind palette utilities we never want hard-coded in components.
 * All colour must flow through semantic design tokens (ADR-008).
 */
const RAW_COLOR_PATTERN =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', '**/*.tsbuildinfo'],
  },

  // Base JS/TS rules (type-aware) for the app source.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // NFR-7: no `any`, no non-null assertions.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      // CONTRIBUTING: no stray logging in committed code.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-param-reassign': 'error',
    },
  },

  // ADR-003: the engine is framework-independent. No React, no DOM, no
  // storage, no ambient randomness or clock — those arrive as parameters.
  {
    files: ['src/engine/**/*.ts'],
    // `random.ts` is the single sanctioned wrapper around Math.random: it
    // exists precisely so the rest of the engine can take an injected
    // RandomSource instead (ADR-009).
    ignores: ['src/engine/**/*.test.ts', 'src/engine/random.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react*',
                '@/components/*',
                '@/hooks/*',
                '@/state/*',
                '@/storage/*',
              ],
              message:
                'The engine must stay framework-independent (ADR-003). Inject dependencies as parameters instead.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Engine code must not touch the DOM (ADR-003).' },
        { name: 'document', message: 'Engine code must not touch the DOM (ADR-003).' },
        { name: 'localStorage', message: 'Engine code must not touch storage (ADR-003).' },
        { name: 'setTimeout', message: 'Engine code must be synchronous and pure (ADR-003).' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Inject a RandomSource instead so games are reproducible (ADR-009).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Pass the current time in as a parameter (ADR-003).',
        },
      ],
    },
  },

  // random.ts still may not reach for React, the DOM, or storage.
  {
    files: ['src/engine/random.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react*',
                '@/components/*',
                '@/hooks/*',
                '@/state/*',
                '@/storage/*',
              ],
              message: 'The engine must stay framework-independent (ADR-003).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Engine code must not touch the DOM (ADR-003).' },
        { name: 'document', message: 'Engine code must not touch the DOM (ADR-003).' },
        { name: 'localStorage', message: 'Engine code must not touch storage (ADR-003).' },
      ],
    },
  },

  // NFR-11: LocalStorage is only reachable through the storage layer.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/storage/**', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'Use a repository from src/storage instead of touching localStorage (NFR-11).',
        },
        {
          name: 'sessionStorage',
          message: 'Persistence belongs in src/storage (NFR-11).',
        },
      ],
    },
  },

  // ADR-008: components consume semantic tokens, never palette utilities.
  {
    files: ['src/components/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${RAW_COLOR_PATTERN.toString()}]`,
          message:
            'Raw Tailwind colour utilities are not allowed in components. Use a semantic design token (ADR-008).',
        },
        {
          selector: `TemplateElement[value.raw=${RAW_COLOR_PATTERN.toString()}]`,
          message:
            'Raw Tailwind colour utilities are not allowed in components. Use a semantic design token (ADR-008).',
        },
      ],
    },
  },

  // Tests may be looser, but never sloppy.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },

  // Config files run in Node.
  {
    files: ['*.config.{ts,js}'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
