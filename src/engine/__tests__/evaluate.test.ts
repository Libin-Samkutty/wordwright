import { describe, expect, it } from 'vitest';

import { evaluateGuess } from '../evaluate';
import type { Evaluation, LetterState } from '../types';

/** Compact notation so expectations read like the board: G/Y/. */
function parse(pattern: string): Evaluation {
  return [...pattern].map((char): LetterState => {
    if (char === 'G') return 'correct';
    if (char === 'Y') return 'present';
    if (char === '.') return 'absent';
    throw new Error(`Bad pattern character: ${char}`);
  });
}

describe('evaluateGuess', () => {
  describe('the SPEC §6.3 truth table', () => {
    // Every row here is machine-verified against the reference algorithm.
    // These are the cases that decide whether the game is correct.
    const cases: ReadonlyArray<readonly [answer: string, guess: string, expected: string]> = [
      // Baselines
      ['CRANE', 'CRANE', 'GGGGG'],
      ['CRANE', 'SLOTH', '.....'],

      // Duplicates in the guess, single copy in the answer
      ['ABBEY', 'BABES', 'YYGG.'],
      ['ALLOY', 'LULLS', 'Y.G..'],

      // Duplicates in the answer
      ['SPEED', 'ERASE', 'Y..YY'],
      ['SPEED', 'EEEEE', '..GG.'],
      ['GEESE', 'EEEEE', '.GG.G'],
      ['BOOKS', 'OOZES', 'YG..G'],

      // Mixed
      ['LOLLY', 'LILLY', 'G.GGG'],
      ['MAMA', 'AMMA', 'YYGG'],
    ];

    it.each(cases)('answer %s + guess %s -> %s', (answer, guess, expected) => {
      expect(evaluateGuess(guess, answer)).toEqual(parse(expected));
    });
  });

  describe('duplicate letter handling (FR-12, FR-13, EC-1)', () => {
    it('assigns greens before yellows so an exact match is never downgraded', () => {
      // The trailing L is exact. A naive left-to-right scan would spend the
      // answer's only L on index 0 and mark index 3 grey.
      expect(evaluateGuess('LEVEL', 'LABEL')).toEqual(parse('G..GG'));
    });

    it('marks surplus copies grey once the answer runs out (FR-13)', () => {
      // ROBOT has two O's; ROOOO offers four.
      expect(evaluateGuess('ROOOO', 'ROBOT')).toEqual(parse('GG.G.'));
    });

    it('assigns yellows left to right when copies are scarce (FR-13)', () => {
      // Answer BUNCH holds one N. The guess offers two, at indices 0 and 3.
      // Neither is positionally exact, so the leftmost claims the only copy
      // and the later one goes grey.
      expect(evaluateGuess('NEENY', 'BUNCH')).toEqual(parse('Y....'));
    });

    it('never marks a letter present when every copy is already claimed', () => {
      const result = evaluateGuess('EEEEE', 'SPEED');
      const claimed = result.filter((state) => state !== 'absent');

      // SPEED holds exactly two E's, so at most two tiles may be non-grey.
      expect(claimed).toHaveLength(2);
    });
  });

  describe('invariants', () => {
    const words = [
      'CRANE',
      'SPEED',
      'ABBEY',
      'LEVEL',
      'ROBOT',
      'GEESE',
      'ALLOY',
      'BOOKS',
      'STAMP',
      'QUEUE',
    ];

    it('always returns one state per letter', () => {
      for (const answer of words) {
        for (const guess of words) {
          expect(evaluateGuess(guess, answer)).toHaveLength(answer.length);
        }
      }
    });

    it('marks every tile correct when the guess is the answer', () => {
      for (const word of words) {
        expect(evaluateGuess(word, word).every((state) => state === 'correct')).toBe(true);
      }
    });

    it('never reports more correct+present of a letter than the answer contains', () => {
      for (const answer of words) {
        for (const guess of words) {
          const evaluation = evaluateGuess(guess, answer);

          const claimed = new Map<string, number>();
          evaluation.forEach((state, index) => {
            if (state === 'absent') return;
            const letter = guess[index] as string;
            claimed.set(letter, (claimed.get(letter) ?? 0) + 1);
          });

          for (const [letter, count] of claimed) {
            const available = [...answer].filter((char) => char === letter).length;
            expect(count).toBeLessThanOrEqual(available);
          }
        }
      }
    });

    it('is symmetric in its green positions', () => {
      // Position i is green in evaluate(a, b) exactly when it is in evaluate(b, a).
      for (const a of words) {
        for (const b of words) {
          const forward = evaluateGuess(a, b);
          const backward = evaluateGuess(b, a);

          forward.forEach((state, index) => {
            expect(state === 'correct').toBe(backward[index] === 'correct');
          });
        }
      }
    });
  });

  describe('word lengths', () => {
    it('evaluates 4-letter words', () => {
      expect(evaluateGuess('WORD', 'WARD')).toEqual(parse('G.GG'));
    });

    it('evaluates 6-letter words', () => {
      expect(evaluateGuess('SILVER', 'SILVER')).toEqual(parse('GGGGGG'));
      // Anagrams: every letter is in the word, and the I happens to land
      // in its exact position.
      expect(evaluateGuess('LISTEN', 'SILENT')).toEqual(parse('YGYYYY'));
    });

    it('throws when the lengths disagree, rather than returning nonsense', () => {
      expect(() => evaluateGuess('CAT', 'CRANE')).toThrow(/3-letter guess/);
    });
  });
});
