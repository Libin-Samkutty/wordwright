import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useGame, useSettings, useStats, useToast } from './contexts';

/**
 * A component used outside its provider should fail immediately with a clear
 * message, rather than producing a confusing "cannot read property of null"
 * somewhere further down.
 */
describe('context hooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cases = [
    ['useSettings', useSettings, /SettingsProvider/],
    ['useToast', useToast, /ToastProvider/],
    ['useStats', useStats, /StatsProvider/],
    ['useGame', useGame, /GameProvider/],
  ] as const;

  it.each(cases)(
    '%s throws a named error when used outside its provider',
    (_name, hook, message) => {
      // React logs the thrown render error; keep the output readable.
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      function Consumer() {
        hook();
        return null;
      }

      expect(() => render(<Consumer />)).toThrow(message);
    },
  );
});
