import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guards the engine's independence (ADR-003, T-17).
 *
 * ESLint enforces this too, but a test fails loudly in CI, in watch mode, and
 * for anyone who runs the suite without the linter. The engine's value is that
 * it can be tested in milliseconds and reused by a future non-React host; a
 * single stray `import { useState }` would quietly end that.
 */

const ENGINE_DIR = join(import.meta.dirname, '..');

function engineSourceFiles(): readonly string[] {
  return readdirSync(ENGINE_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(ENGINE_DIR, name));
}

describe('engine boundaries', () => {
  const files = engineSourceFiles();

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file): [string, string] => [file.split('/').pop() ?? file, file]))(
    '%s imports no framework, DOM, or storage module',
    (_name: string, file: string) => {
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '');

      const forbidden = imports.filter(
        (specifier) =>
          specifier === 'react' ||
          specifier === 'react-dom' ||
          specifier.startsWith('react/') ||
          specifier.startsWith('@/components') ||
          specifier.startsWith('@/hooks') ||
          specifier.startsWith('@/state') ||
          specifier.startsWith('@/storage') ||
          specifier.startsWith('@/dictionary'),
      );

      expect(forbidden).toEqual([]);
    },
  );

  it.each(files.map((file): [string, string] => [file.split('/').pop() ?? file, file]))(
    '%s touches no browser global or ambient clock',
    (_name: string, file: string) => {
      const source = readFileSync(file, 'utf8');
      // Strip comments so prose about `Math.random` does not trip the check.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      // `random.ts` is the single sanctioned wrapper around Math.random,
      // exposed as an injectable RandomSource (ADR-009).
      const isRandomModule = file.endsWith('random.ts');

      expect(code).not.toMatch(/\bwindow\./);
      expect(code).not.toMatch(/\bdocument\./);
      expect(code).not.toMatch(/\blocalStorage\b/);
      expect(code).not.toMatch(/\bsessionStorage\b/);
      expect(code).not.toMatch(/\bsetTimeout\b/);
      expect(code).not.toMatch(/\bsetInterval\b/);
      expect(code).not.toMatch(/\bDate\.now\b/);
      expect(code).not.toMatch(/\bfetch\(/);

      if (!isRandomModule) {
        expect(code).not.toMatch(/\bMath\.random\b/);
      }
    },
  );

  it('confines Math.random to the injectable random source', () => {
    const offenders = files.filter(
      (file) => !file.endsWith('random.ts') && /\bMath\.random\b/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
