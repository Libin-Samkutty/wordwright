import { describe, expect, it } from 'vitest';

import { createGame, pickAnswer } from '../createGame';
import { seededRandom, type RandomSource } from '../random';

const fixed = (value: number): RandomSource => ({ next: () => value });

describe('createGame', () => {
  it('starts in playing status with an empty board', () => {
    const game = createGame({ id: 'g1', wordLength: 5, answer: 'CRANE' });

    expect(game).toEqual({
      id: 'g1',
      wordLength: 5,
      answer: 'CRANE',
      guesses: [],
      currentInput: '',
      status: 'playing',
      startedAt: null,
      finishedAt: null,
    });
  });

  it('leaves startedAt null so the timer begins on the first keystroke (FR-22)', () => {
    expect(createGame({ id: 'g1', wordLength: 5, answer: 'CRANE' }).startedAt).toBeNull();
  });

  it('uppercases the answer', () => {
    expect(createGame({ id: 'g1', wordLength: 4, answer: 'word' }).answer).toBe('WORD');
  });
});

describe('pickAnswer', () => {
  it('picks from the pool', () => {
    const pool = ['ALPHA', 'BRAVO', 'CHARLIE'];

    expect(pool).toContain(pickAnswer(pool, [], fixed(0.5)));
  });

  it('throws on an empty pool rather than returning undefined', () => {
    expect(() => pickAnswer([], [], fixed(0))).toThrow(/empty pool/);
  });

  describe('no-repeat window (FR-4)', () => {
    // 100 words: the window is min(50, floor(100/4)) = 25.
    const pool = Array.from({ length: 100 }, (_unused, index) => `WORD${index}`);

    it('never returns a word inside the suppression window', () => {
      const recent = pool.slice(0, 25);
      const random = seededRandom(1);

      for (let i = 0; i < 300; i += 1) {
        expect(recent).not.toContain(pickAnswer(pool, recent, random));
      }
    });

    it('suppresses only min(50, pool/4) entries, so older answers return', () => {
      // The 26th most recent entry is outside the window and must be reachable.
      const recent = pool.slice(0, 40);
      const random = seededRandom(3);
      const seen = new Set<string>();

      for (let i = 0; i < 2000; i += 1) {
        seen.add(pickAnswer(pool, recent, random));
      }

      expect(seen.has(pool[30] as string)).toBe(true);
      expect(seen.has(pool[0] as string)).toBe(false);
    });

    it('caps the window at 50 for a large pool', () => {
      const big = Array.from({ length: 1000 }, (_unused, index) => `W${index}`);
      const recent = big.slice(0, 200);
      const random = seededRandom(5);
      const seen = new Set<string>();

      for (let i = 0; i < 4000; i += 1) {
        seen.add(pickAnswer(big, recent, random));
      }

      // Entries 50..199 are recent but outside the 50-word cap, so reachable.
      expect(seen.has(big[100] as string)).toBe(true);
      expect(seen.has(big[10] as string)).toBe(false);
    });

    it('falls back to the full pool when everything is suppressed (EC-20)', () => {
      // A four-word pool has a window of floor(4/4) = 1.
      const tiny = ['AAAA', 'BBBB', 'CCCC', 'DDDD'];
      const result = pickAnswer(tiny, tiny, seededRandom(9));

      expect(tiny).toContain(result);
    });

    it('never throws for a pool smaller than the window', () => {
      const random = seededRandom(11);

      for (const size of [1, 2, 3, 5, 10]) {
        const pool = Array.from({ length: size }, (_unused, i) => `W${i}`);
        expect(() => pickAnswer(pool, pool, random)).not.toThrow();
      }
    });

    it('ignores recent words that are not in the pool', () => {
      const small = ['ALPHA', 'BRAVO'];

      expect(small).toContain(pickAnswer(small, ['ZULU', 'YANKEE'], fixed(0)));
    });
  });

  it('is reproducible for a given seed (ADR-009)', () => {
    const pool = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO'];

    const first = Array.from({ length: 10 }, () => pickAnswer(pool, [], seededRandom(42)));
    const second = Array.from({ length: 10 }, () => pickAnswer(pool, [], seededRandom(42)));

    expect(first).toEqual(second);
  });
});
