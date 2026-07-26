import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WordLength } from '@/engine/types';

import { getCachedDictionary, loadDictionary, resetDictionaryCache } from '../loadDictionary';
import { DICTIONARY_REGISTRY } from '../registry';
import { DictionaryLoadError } from '../types';

/**
 * `DICTIONARY_REGISTRY` is keyed by number, which `vi.spyOn` cannot infer
 * cleanly. This wrapper keeps the casting in one place instead of at each
 * call site.
 */
function spyOnRegistry(length: WordLength) {
  return vi.spyOn(DICTIONARY_REGISTRY as Record<WordLength, () => Promise<never>>, length);
}

describe('loadDictionary', () => {
  beforeEach(() => {
    resetDictionaryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDictionaryCache();
  });

  it('loads the lists for a length and exposes guesses as a Set (FR-17)', async () => {
    const dictionary = await loadDictionary(5);

    expect(dictionary.wordLength).toBe(5);
    expect(dictionary.answers.length).toBeGreaterThan(0);
    expect(dictionary.guesses).toBeInstanceOf(Set);
    expect(dictionary.guesses.has(dictionary.answers[0] as string)).toBe(true);
  });

  it('returns the identical object on a second call, rather than rebuilding', async () => {
    const first = await loadDictionary(4);
    const second = await loadDictionary(4);

    expect(second).toBe(first);
  });

  it('imports the chunk only once even across repeat calls', async () => {
    const spy = spyOnRegistry(4);

    await loadDictionary(4);
    await loadDictionary(4);
    await loadDictionary(4);

    // The registry entry is invoked on the first call only.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent calls, which StrictMode double-effects produce', async () => {
    const spy = spyOnRegistry(6);

    const [a, b, c] = await Promise.all([loadDictionary(6), loadDictionary(6), loadDictionary(6)]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('keeps each length separate', async () => {
    const four = await loadDictionary(4);
    const five = await loadDictionary(5);

    expect(four).not.toBe(five);
    expect([...four.guesses][0]).toHaveLength(4);
    expect([...five.guesses][0]).toHaveLength(5);
  });

  it('wraps a failed import in a DictionaryLoadError so the UI can retry (EC-14)', async () => {
    spyOnRegistry(5).mockRejectedValue(new Error('network gone'));

    await expect(loadDictionary(5)).rejects.toBeInstanceOf(DictionaryLoadError);
  });

  it('records the length and cause on the error', async () => {
    const cause = new Error('chunk missing');
    spyOnRegistry(5).mockRejectedValue(cause);

    await expect(loadDictionary(5)).rejects.toMatchObject({
      name: 'DictionaryLoadError',
      wordLength: 5,
      cause,
    });
  });

  it('allows a retry to succeed after a failure (EC-14)', async () => {
    const spy = spyOnRegistry(5);
    spy.mockRejectedValueOnce(new Error('transient'));

    await expect(loadDictionary(5)).rejects.toBeInstanceOf(DictionaryLoadError);

    spy.mockRestore();
    await expect(loadDictionary(5)).resolves.toMatchObject({ wordLength: 5 });
  });

  it('does not cache a failed load', async () => {
    spyOnRegistry(5).mockRejectedValue(new Error('boom'));

    await expect(loadDictionary(5)).rejects.toThrow();

    expect(getCachedDictionary(5)).toBeUndefined();
  });
});

describe('DictionaryLoadError', () => {
  it('carries the word length and a readable message', () => {
    const error = new DictionaryLoadError(6);

    expect(error.wordLength).toBe(6);
    expect(error.message).toMatch(/6-letter/);
    expect(error.name).toBe('DictionaryLoadError');
  });

  it('omits `cause` when none is supplied', () => {
    expect(new DictionaryLoadError(4).cause).toBeUndefined();
  });

  it('preserves a supplied cause for debugging', () => {
    const cause = new Error('root cause');

    expect(new DictionaryLoadError(4, cause).cause).toBe(cause);
  });
});

describe('getCachedDictionary', () => {
  beforeEach(() => {
    resetDictionaryCache();
  });

  it('is undefined before a load', () => {
    expect(getCachedDictionary(5)).toBeUndefined();
  });

  it('returns the dictionary after a load', async () => {
    const loaded = await loadDictionary(5);

    expect(getCachedDictionary(5)).toBe(loaded);
  });
});
