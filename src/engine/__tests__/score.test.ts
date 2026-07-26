import { describe, expect, it } from 'vitest';

import { scoreGame } from '../score';

/** Instant solve keeps the full 240-point speed bonus, isolating the base score. */
const INSTANT = 0;
/** Past the 120s cutoff, so the speed bonus is zero. */
const SLOW = 200_000;

describe('scoreGame', () => {
  it('scores zero for a loss regardless of anything else (FR-23)', () => {
    expect(scoreGame({ won: false, guessesUsed: 6, wordLength: 6, solveMs: INSTANT })).toBe(0);
    expect(scoreGame({ won: false, guessesUsed: 1, wordLength: 4, solveMs: INSTANT })).toBe(0);
  });

  describe('base score by guess count, at length 4 (multiplier 1.0)', () => {
    const expected = [
      [1, 600],
      [2, 500],
      [3, 400],
      [4, 300],
      [5, 200],
      [6, 100],
    ] as const;

    it.each(expected)('a win on guess %i scores %i before the speed bonus', (used, base) => {
      expect(scoreGame({ won: true, guessesUsed: used, wordLength: 4, solveMs: SLOW })).toBe(base);
    });
  });

  describe('length multipliers (FR-23)', () => {
    it('applies 1.0 at length 4', () => {
      expect(scoreGame({ won: true, guessesUsed: 3, wordLength: 4, solveMs: SLOW })).toBe(400);
    });

    it('applies 1.2 at length 5', () => {
      expect(scoreGame({ won: true, guessesUsed: 3, wordLength: 5, solveMs: SLOW })).toBe(480);
    });

    it('applies 1.5 at length 6', () => {
      expect(scoreGame({ won: true, guessesUsed: 3, wordLength: 6, solveMs: SLOW })).toBe(600);
    });

    it('rounds rather than truncates the multiplied base', () => {
      // 500 * 1.2 = 600 exactly; 200 * 1.2 = 240 exactly. Check a case that
      // would differ under truncation of floating point drift.
      expect(scoreGame({ won: true, guessesUsed: 5, wordLength: 5, solveMs: SLOW })).toBe(240);
    });
  });

  describe('speed bonus (FR-23)', () => {
    it('awards the full 240 for an instant solve', () => {
      expect(scoreGame({ won: true, guessesUsed: 6, wordLength: 4, solveMs: INSTANT })).toBe(
        100 + 240,
      );
    });

    it('decays by 2 points per elapsed second', () => {
      expect(scoreGame({ won: true, guessesUsed: 6, wordLength: 4, solveMs: 10_000 })).toBe(
        100 + (120 - 10) * 2,
      );
    });

    it('floors at zero once past the cutoff, never going negative', () => {
      expect(scoreGame({ won: true, guessesUsed: 6, wordLength: 4, solveMs: 120_000 })).toBe(100);
      expect(scoreGame({ won: true, guessesUsed: 6, wordLength: 4, solveMs: 999_999 })).toBe(100);
    });

    it('uses whole seconds, so sub-second differences do not change the score', () => {
      const a = scoreGame({ won: true, guessesUsed: 4, wordLength: 5, solveMs: 5_000 });
      const b = scoreGame({ won: true, guessesUsed: 4, wordLength: 5, solveMs: 5_999 });

      expect(a).toBe(b);
    });

    it('treats a negative elapsed time as zero rather than inflating the bonus (EC-19)', () => {
      const negative = scoreGame({ won: true, guessesUsed: 1, wordLength: 4, solveMs: -50_000 });

      expect(negative).toBe(600 + 240);
    });
  });

  it('produces the documented best-case score', () => {
    // Instant 6-letter win on the first guess: 600 * 1.5 + 240.
    expect(scoreGame({ won: true, guessesUsed: 1, wordLength: 6, solveMs: INSTANT })).toBe(1140);
  });

  it('produces the documented worst winning score', () => {
    expect(scoreGame({ won: true, guessesUsed: 6, wordLength: 4, solveMs: SLOW })).toBe(100);
  });
});
