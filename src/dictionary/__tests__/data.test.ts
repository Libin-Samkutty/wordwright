import { describe, expect, it } from 'vitest';

import { WORD_LENGTHS } from '@/engine/constants';
import type { WordLength } from '@/engine/types';

import { DICTIONARY_REGISTRY } from '../registry';
import type { RawLists } from '../types';

/**
 * Invariants for the generated word lists (FR-26, FR-27, FR-30).
 *
 * These run against the real data, unlike component tests which use fixtures.
 * A regeneration that produces malformed output fails here.
 */
describe.each(WORD_LENGTHS)('lists-%i', (length: WordLength) => {
  let lists: RawLists;

  beforeAll(async () => {
    lists = await DICTIONARY_REGISTRY[length]();
  });

  describe.each(['answers', 'guesses'] as const)('%s', (listName) => {
    it('contains only uppercase A-Z (FR-27)', () => {
      const invalid = lists[listName].filter((word) => !/^[A-Z]+$/.test(word));

      expect(invalid).toEqual([]);
    });

    it(`contains only ${length}-letter words (FR-27)`, () => {
      const wrongLength = lists[listName].filter((word) => word.length !== length);

      expect(wrongLength).toEqual([]);
    });

    it('has no duplicates (FR-27)', () => {
      const list = lists[listName];

      expect(new Set(list).size).toBe(list.length);
    });

    it('is sorted ascending (FR-27)', () => {
      const list = [...lists[listName]];

      expect(list).toEqual([...list].sort());
    });

    it('is not empty', () => {
      expect(lists[listName].length).toBeGreaterThan(0);
    });
  });

  it('has at least 300 answers (FR-30)', () => {
    expect(lists.answers.length).toBeGreaterThanOrEqual(300);
  });

  it('has at least 1500 guesses (FR-30)', () => {
    expect(lists.guesses.length).toBeGreaterThanOrEqual(1500);
  });

  it('keeps every answer guessable, so the solution is always accepted (FR-26)', () => {
    const guesses = new Set(lists.guesses);
    const orphaned = lists.answers.filter((word) => !guesses.has(word));

    expect(orphaned).toEqual([]);
  });

  it('draws answers from a smaller, curated pool than the guess list (ADR-004)', () => {
    expect(lists.answers.length).toBeLessThan(lists.guesses.length);
  });

  it('excludes plurals whose singular is also a word, which make unfair answers', () => {
    const guesses = new Set(lists.guesses);
    const plurals = lists.answers.filter(
      (word) => word.endsWith('S') && guesses.has(word.slice(0, -1)),
    );

    expect(plurals).toEqual([]);
  });

  it('excludes answers built from one or two distinct letters', () => {
    const monotonous = lists.answers.filter((word) => new Set(word).size <= 2);

    expect(monotonous).toEqual([]);
  });

  it('keeps offensive words out of the answer pool (FR-31)', () => {
    // Spot check: these are in ENABLE1 and so remain guessable, but must never
    // be shown to the player as a solution.
    const banned = ['DAMN', 'CRAP', 'HELL', 'SEXY', 'NAKED', 'MURDER', 'CANCER', 'CORPSE'];
    const answers = new Set(lists.answers);

    expect(banned.filter((word) => answers.has(word))).toEqual([]);
  });

  it('accepts ordinary words as guesses even when they are barred as answers', () => {
    // The permissive guess list is the point of ADR-004: rejecting a real word
    // the player typed is worse than accepting an unpleasant one.
    const guesses = new Set(lists.guesses);
    const sample = length === 4 ? 'DAMN' : length === 5 ? 'NASTY' : 'MURDER';

    expect(guesses.has(sample)).toBe(true);
  });
});

describe('the registry', () => {
  it('covers every supported word length (FR-29)', () => {
    expect(Object.keys(DICTIONARY_REGISTRY).map(Number).sort()).toEqual([...WORD_LENGTHS]);
  });
});
