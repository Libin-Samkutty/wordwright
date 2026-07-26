import { describe, expect, it, vi } from 'vitest';

import { createRepository, type StorageIssue } from './createRepository';
import { createSafeStorage, type SafeStorage } from './safeStorage';

interface Widget {
  readonly name: string;
  readonly count: number;
}

const defaults = (): Widget => ({ name: 'default', count: 0 });

function validate(value: unknown): Widget | null {
  if (typeof value !== 'object' || value === null) return null;
  const { name, count } = value as Record<string, unknown>;
  if (typeof name !== 'string' || typeof count !== 'number') return null;
  return { name, count };
}

function setup(
  options: { storage?: SafeStorage; onIssue?: (i: StorageIssue, k: string) => void } = {},
) {
  const storage = options.storage ?? createSafeStorage(undefined);
  const repo = createRepository<Widget>({
    key: 'test:widget',
    defaults,
    validate,
    storage,
    ...(options.onIssue ? { onIssue: options.onIssue } : {}),
  });
  return { repo, storage };
}

describe('createRepository', () => {
  describe('read', () => {
    it('returns defaults when nothing is stored', () => {
      const { repo } = setup();

      expect(repo.read()).toEqual({ name: 'default', count: 0 });
    });

    it('returns fresh defaults each time, so callers cannot corrupt them', () => {
      const { repo } = setup();

      expect(repo.read()).not.toBe(repo.read());
    });

    it('round-trips a valid value', () => {
      const { repo } = setup();

      repo.write({ name: 'widget', count: 42 });

      expect(repo.read()).toEqual({ name: 'widget', count: 42 });
    });

    it('falls back to defaults on unparseable JSON (EC-12)', () => {
      const storage = createSafeStorage(undefined);
      storage.setItem('test:widget', '{not json');
      const { repo } = setup({ storage });

      expect(repo.read()).toEqual(defaults());
    });

    it('falls back to defaults when the shape is wrong (EC-12)', () => {
      const storage = createSafeStorage(undefined);
      storage.setItem('test:widget', JSON.stringify({ name: 'x', count: 'not a number' }));
      const { repo } = setup({ storage });

      expect(repo.read()).toEqual(defaults());
    });

    it('falls back to defaults for a stored null or primitive', () => {
      const storage = createSafeStorage(undefined);
      const { repo } = setup({ storage });

      for (const raw of ['null', '42', '"text"', '[]']) {
        storage.setItem('test:widget', raw);
        expect(repo.read()).toEqual(defaults());
      }
    });

    it('reports corrupt data exactly once per read, for a one-time warning', () => {
      const onIssue = vi.fn();
      const storage = createSafeStorage(undefined);
      storage.setItem('test:widget', '{oops');
      const { repo } = setup({ storage, onIssue });

      repo.read();

      expect(onIssue).toHaveBeenCalledExactlyOnceWith('corrupt', 'test:widget');
    });

    it('never throws, whatever is stored', () => {
      const storage = createSafeStorage(undefined);
      const { repo } = setup({ storage });

      for (const raw of ['', '{', 'undefined', '{"a":', '\u0000']) {
        storage.setItem('test:widget', raw);
        expect(() => repo.read()).not.toThrow();
      }
    });
  });

  describe('migration', () => {
    it('runs before validation, so upgraded data is accepted', () => {
      const storage = createSafeStorage(undefined);
      storage.setItem('test:widget', JSON.stringify({ name: 'old' }));

      const repo = createRepository<Widget>({
        key: 'test:widget',
        defaults,
        validate,
        storage,
        migrate: (data) => ({ data: { ...(data as object), count: 7 }, ok: true }),
      });

      expect(repo.read()).toEqual({ name: 'old', count: 7 });
    });

    it('falls back to defaults and reports when migration declines (EC-13)', () => {
      const onIssue = vi.fn();
      const storage = createSafeStorage(undefined);
      storage.setItem('test:widget', JSON.stringify({ name: 'future', count: 1 }));

      const repo = createRepository<Widget>({
        key: 'test:widget',
        defaults,
        validate,
        storage,
        onIssue,
        migrate: () => ({ data: null, ok: false }),
      });

      expect(repo.read()).toEqual(defaults());
      expect(onIssue).toHaveBeenCalledWith('unsupported-version', 'test:widget');
    });
  });

  describe('write', () => {
    it('persists through the storage layer', () => {
      const { repo, storage } = setup();

      repo.write({ name: 'saved', count: 1 });

      expect(storage.getItem('test:widget')).toBe(JSON.stringify({ name: 'saved', count: 1 }));
    });

    it('does not throw when the value cannot be serialised (FR-42)', () => {
      const { repo, storage } = setup();
      const cyclic = { name: 'x', count: 1 } as Widget & { self?: unknown };
      (cyclic as { self?: unknown }).self = cyclic;

      expect(() => {
        repo.write(cyclic);
      }).not.toThrow();

      // Nothing partial was written.
      expect(storage.getItem('test:widget')).toBeNull();
    });

    it('does not throw when storage rejects the write', () => {
      const failing: SafeStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: () => undefined,
        keys: () => [],
        isPersistent: true,
      };
      const { repo } = setup({ storage: failing });

      expect(() => {
        repo.write({ name: 'x', count: 1 });
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('removes the value and reverts to defaults', () => {
      const { repo } = setup();

      repo.write({ name: 'temp', count: 5 });
      repo.clear();

      expect(repo.read()).toEqual(defaults());
    });
  });

  describe('subscribe (EC-16)', () => {
    it('notifies on a storage event for its own key', () => {
      const storage = createSafeStorage(undefined);
      const { repo } = setup({ storage });
      const listener = vi.fn();

      const unsubscribe = repo.subscribe(listener);
      storage.setItem('test:widget', JSON.stringify({ name: 'other tab', count: 9 }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'test:widget' }));

      expect(listener).toHaveBeenCalledWith({ name: 'other tab', count: 9 });
      unsubscribe();
    });

    it('ignores events for other keys', () => {
      const { repo } = setup();
      const listener = vi.fn();

      const unsubscribe = repo.subscribe(listener);
      window.dispatchEvent(new StorageEvent('storage', { key: 'someone:else' }));

      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('responds to a full store clear, where key is null', () => {
      const { repo } = setup();
      const listener = vi.fn();

      const unsubscribe = repo.subscribe(listener);
      window.dispatchEvent(new StorageEvent('storage', { key: null }));

      expect(listener).toHaveBeenCalledWith(defaults());
      unsubscribe();
    });

    it('stops notifying after unsubscribe', () => {
      const { repo } = setup();
      const listener = vi.fn();

      repo.subscribe(listener)();
      window.dispatchEvent(new StorageEvent('storage', { key: 'test:widget' }));

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
