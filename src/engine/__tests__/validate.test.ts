import { describe, expect, it } from 'vitest';

import { validateGuess } from '../validate';

const ALLOWED = new Set(['CRANE', 'SLOTH', 'ABBEY']);
const isAllowed = (word: string): boolean => ALLOWED.has(word);

describe('validateGuess', () => {
  it('accepts a word of the right length that is in the list', () => {
    expect(validateGuess('CRANE', 5, isAllowed)).toEqual({ ok: true, value: 'CRANE' });
  });

  it('uppercases input before checking, so typing case never matters (FR-6)', () => {
    expect(validateGuess('crane', 5, isAllowed)).toEqual({ ok: true, value: 'CRANE' });
    expect(validateGuess('CrAnE', 5, isAllowed)).toEqual({ ok: true, value: 'CRANE' });
  });

  it('rejects a short guess as too-short (FR-14)', () => {
    expect(validateGuess('CRAN', 5, isAllowed)).toEqual({ ok: false, error: 'too-short' });
  });

  it('rejects an empty guess as too-short (EC-2)', () => {
    expect(validateGuess('', 5, isAllowed)).toEqual({ ok: false, error: 'too-short' });
  });

  it('rejects an over-long guess as too-short, since it is not the right length', () => {
    expect(validateGuess('CRANES', 5, isAllowed)).toEqual({ ok: false, error: 'too-short' });
  });

  it('rejects a correctly sized word that is not in the list (FR-15)', () => {
    expect(validateGuess('ZZZZZ', 5, isAllowed)).toEqual({ ok: false, error: 'not-a-word' });
  });

  it('checks length before membership, so a short non-word reports too-short', () => {
    expect(validateGuess('ZZ', 5, isAllowed)).toEqual({ ok: false, error: 'too-short' });
  });

  it('allows a word to be guessed more than once (FR-16)', () => {
    expect(validateGuess('CRANE', 5, isAllowed).ok).toBe(true);
    expect(validateGuess('CRANE', 5, isAllowed).ok).toBe(true);
  });

  it('honours the injected predicate rather than any bundled list (ADR-003)', () => {
    expect(validateGuess('ZZZZZ', 5, () => true)).toEqual({ ok: true, value: 'ZZZZZ' });
    expect(validateGuess('CRANE', 5, () => false)).toEqual({ ok: false, error: 'not-a-word' });
  });

  it('validates against the requested length, not a fixed one', () => {
    expect(validateGuess('WORD', 4, (w) => w === 'WORD').ok).toBe(true);
    expect(validateGuess('WORD', 6, (w) => w === 'WORD')).toEqual({
      ok: false,
      error: 'too-short',
    });
  });

  it('ignores surrounding whitespace', () => {
    expect(validateGuess('  CRANE  ', 5, isAllowed)).toEqual({ ok: true, value: 'CRANE' });
  });
});
