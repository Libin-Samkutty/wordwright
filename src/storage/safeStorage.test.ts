import { describe, expect, it } from 'vitest';

import { createSafeStorage } from './safeStorage';

/** A Storage stand-in whose behaviour each test controls. */
function makeStorage(overrides: Partial<Storage> = {}): Storage {
  const map = new Map<string, string>();

  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    ...overrides,
  };
}

describe('createSafeStorage', () => {
  it('uses the backend when it works', () => {
    const storage = createSafeStorage(makeStorage());

    storage.setItem('a', '1');

    expect(storage.getItem('a')).toBe('1');
    expect(storage.isPersistent).toBe(true);
  });

  it('falls back to memory when no backend exists (SSR, locked-down webview)', () => {
    const storage = createSafeStorage(undefined);

    storage.setItem('a', '1');

    expect(storage.getItem('a')).toBe('1');
    expect(storage.isPersistent).toBe(false);
  });

  it('falls back to memory when the backend throws on write (EC-11)', () => {
    const throwing = makeStorage({
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    });

    const storage = createSafeStorage(throwing);

    expect(storage.isPersistent).toBe(false);
    expect(() => {
      storage.setItem('a', '1');
    }).not.toThrow();
    expect(storage.getItem('a')).toBe('1');
  });

  it('falls back when the probe cannot read back what it wrote', () => {
    const amnesiac = makeStorage({ getItem: () => null });

    expect(createSafeStorage(amnesiac).isPersistent).toBe(false);
  });

  it('swallows a write that starts throwing mid-session', () => {
    let failing = false;
    const storage = createSafeStorage(
      makeStorage({
        setItem: (key, value) => {
          if (failing) throw new Error('quota');
          makeStorage().setItem(key, value);
        },
      }),
    );

    failing = true;

    expect(() => {
      storage.setItem('a', '1');
    }).not.toThrow();
  });

  it('returns null rather than throwing when a read fails', () => {
    let failing = false;
    const storage = createSafeStorage(
      makeStorage({
        getItem: (key) => {
          if (failing) throw new Error('revoked');
          return key === '__wordwright_probe__' ? '1' : null;
        },
      }),
    );

    failing = true;

    expect(storage.getItem('a')).toBeNull();
  });

  it('swallows a failing removeItem', () => {
    const storage = createSafeStorage(
      makeStorage({
        removeItem: () => {
          throw new Error('nope');
        },
      }),
    );

    // The probe uses removeItem, so a throwing backend degrades to memory —
    // either way, the call must not propagate.
    expect(() => {
      storage.removeItem('a');
    }).not.toThrow();
  });

  it('lists its keys', () => {
    const storage = createSafeStorage(undefined);

    storage.setItem('a', '1');
    storage.setItem('b', '2');

    expect([...storage.keys()].sort()).toEqual(['a', 'b']);
  });

  it('removes keys', () => {
    const storage = createSafeStorage(undefined);

    storage.setItem('a', '1');
    storage.removeItem('a');

    expect(storage.getItem('a')).toBeNull();
  });

  it('leaves no probe key behind', () => {
    const backend = makeStorage();
    createSafeStorage(backend);

    expect(backend.getItem('__wordwright_probe__')).toBeNull();
  });
});
