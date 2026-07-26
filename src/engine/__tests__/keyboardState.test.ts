import { describe, expect, it } from 'vitest';

import { evaluateGuess } from '../evaluate';
import { deriveKeyStates } from '../keyboardState';
import type { Guess } from '../types';

function guess(word: string, answer: string): Guess {
  return { word, evaluation: evaluateGuess(word, answer) };
}

describe('deriveKeyStates', () => {
  it('returns an empty map before any guess', () => {
    expect(deriveKeyStates([])).toEqual(new Map());
  });

  it('records the state of every letter in a guess', () => {
    const states = deriveKeyStates([guess('CRANE', 'CRANE')]);

    for (const letter of 'CRANE') {
      expect(states.get(letter)).toBe('correct');
    }
  });

  it('upgrades a key from present to correct (FR-53)', () => {
    // ADOBE: the O is present but misplaced. ROBIN: the O is exact.
    const states = deriveKeyStates([guess('ADOBE', 'ROBIN'), guess('ROBIN', 'ROBIN')]);

    expect(states.get('O')).toBe('correct');
  });

  it('never downgrades a key from correct to present (FR-53)', () => {
    // Same two guesses, reversed. The answer must not change.
    const states = deriveKeyStates([guess('ROBIN', 'ROBIN'), guess('ADOBE', 'ROBIN')]);

    expect(states.get('O')).toBe('correct');
  });

  it('never downgrades a key from present to absent', () => {
    // Answer ABBEY. First guess puts B as present; a later guess with a
    // surplus B marks that tile absent, which must not overwrite the key.
    const states = deriveKeyStates([guess('BUNCH', 'ABBEY'), guess('BOBBY', 'ABBEY')]);

    expect(states.get('B')).not.toBe('absent');
  });

  it('keeps absent letters absent', () => {
    const states = deriveKeyStates([guess('SLOTH', 'CRANE')]);

    for (const letter of 'SLOTH') {
      expect(states.get(letter)).toBe('absent');
    }
  });

  it('leaves untouched letters unrecorded, so the keyboard shows them neutral', () => {
    const states = deriveKeyStates([guess('CRANE', 'CRANE')]);

    expect(states.has('Z')).toBe(false);
  });

  it('accumulates across many guesses', () => {
    const states = deriveKeyStates([
      guess('SLOTH', 'CRANE'),
      guess('BUNCH', 'CRANE'),
      guess('CRANE', 'CRANE'),
    ]);

    expect(states.get('S')).toBe('absent');
    expect(states.get('C')).toBe('correct');
    expect(states.get('N')).toBe('correct');
  });

  it('handles a guess shorter than its evaluation without throwing', () => {
    // Defensive: a malformed record restored from storage must not crash the
    // keyboard (EC-12).
    const malformed: Guess = { word: 'AB', evaluation: ['correct', 'present', 'absent'] };

    expect(() => deriveKeyStates([malformed])).not.toThrow();
    expect(deriveKeyStates([malformed]).size).toBe(2);
  });
});
