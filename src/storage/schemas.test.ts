import { describe, expect, it } from 'vitest';

import { MAX_GUESSES } from '@/engine/constants';

import {
  DEFAULT_SETTINGS,
  defaultMeta,
  defaultStats,
  emptyBucket,
  validateMeta,
  validateSession,
  validateSettings,
  validateStats,
} from './schemas';

/**
 * Storage is user-writable and survives upgrades, so everything read back is
 * untrusted input (EC-12). These guards are the only thing standing between a
 * hand-edited LocalStorage value and a crash, so they are tested against
 * hostile input rather than just the happy path.
 */

describe('validateSettings', () => {
  it('accepts a well-formed record', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'settings'],
    ['a number', 7],
    ['an unknown theme', { ...DEFAULT_SETTINGS, theme: 'sepia' }],
    ['a non-boolean colorblind flag', { ...DEFAULT_SETTINGS, colorblind: 'yes' }],
    ['an unknown motion mode', { ...DEFAULT_SETTINGS, motion: 'fast' }],
    ['an unsupported word length', { ...DEFAULT_SETTINGS, defaultWordLength: 7 }],
    ['a missing field', { theme: 'dark' }],
  ])('rejects %s', (_label, value) => {
    expect(validateSettings(value)).toBeNull();
  });
});

describe('validateStats', () => {
  it('accepts the default shape', () => {
    expect(validateStats(defaultStats())).toEqual(defaultStats());
  });

  it('rejects a non-object', () => {
    expect(validateStats('nope')).toBeNull();
    expect(validateStats(null)).toBeNull();
  });

  it('rejects a bucket with negative counters', () => {
    const stats = defaultStats();

    expect(validateStats({ ...stats, overall: { ...stats.overall, gamesPlayed: -1 } })).toBeNull();
  });

  it('rejects more wins than games played, which cannot happen', () => {
    const stats = defaultStats();

    expect(
      validateStats({ ...stats, overall: { ...stats.overall, gamesPlayed: 2, gamesWon: 3 } }),
    ).toBeNull();
  });

  it('rejects a distribution of the wrong length', () => {
    const stats = defaultStats();

    expect(
      validateStats({ ...stats, overall: { ...stats.overall, distribution: [1, 2, 3] } }),
    ).toBeNull();
  });

  it('rejects a non-numeric fastest solve but allows null', () => {
    const stats = defaultStats();

    expect(
      validateStats({ ...stats, overall: { ...stats.overall, fastestSolveMs: 'fast' } }),
    ).toBeNull();
    expect(
      validateStats({ ...stats, overall: { ...stats.overall, fastestSolveMs: null } }),
    ).not.toBeNull();
  });

  it('rejects a missing per-length bucket', () => {
    const stats = defaultStats();

    expect(
      validateStats({ ...stats, perLength: { 4: emptyBucket(), 5: emptyBucket() } }),
    ).toBeNull();
  });

  it('drops individual malformed recent games rather than the whole history', () => {
    const stats = defaultStats();
    const good = {
      id: 'g1',
      playedAt: 1,
      wordLength: 5,
      answer: 'CRANE',
      guessesUsed: 3,
      won: true,
      solveMs: 1000,
      score: 400,
    };

    const result = validateStats({
      ...stats,
      recentGames: [good, { id: 'bad' }, { ...good, id: 'g2', wordLength: 9 }],
    });

    expect(result?.recentGames).toHaveLength(1);
    expect(result?.recentGames[0]?.id).toBe('g1');
  });

  it('rejects a game record whose answer length disagrees with its word length', () => {
    const stats = defaultStats();

    const result = validateStats({
      ...stats,
      recentGames: [
        {
          id: 'g1',
          playedAt: 1,
          wordLength: 5,
          answer: 'TOOLONG',
          guessesUsed: 1,
          won: true,
          solveMs: 1,
          score: 1,
        },
      ],
    });

    expect(result?.recentGames).toHaveLength(0);
  });

  it('rejects more guesses than the limit allows', () => {
    const stats = defaultStats();

    const result = validateStats({
      ...stats,
      recentGames: [
        {
          id: 'g1',
          playedAt: 1,
          wordLength: 5,
          answer: 'CRANE',
          guessesUsed: MAX_GUESSES + 1,
          won: true,
          solveMs: 1,
          score: 1,
        },
      ],
    });

    expect(result?.recentGames).toHaveLength(0);
  });

  it('defaults a missing recorded-id list rather than failing', () => {
    const withoutIds: Record<string, unknown> = { ...defaultStats() };
    delete withoutIds.recordedGameIds;

    expect(validateStats(withoutIds)?.recordedGameIds).toEqual([]);
  });
});

describe('validateSession', () => {
  const base = {
    id: 's1',
    wordLength: 5,
    answer: 'CRANE',
    guesses: [],
    currentInput: '',
    status: 'playing',
    startedAt: null,
    finishedAt: null,
  };

  it('accepts a well-formed session', () => {
    expect(validateSession(base)).toEqual(base);
  });

  it.each([
    ['a missing id', { ...base, id: '' }],
    ['an unsupported word length', { ...base, wordLength: 7 }],
    ['an answer of the wrong length', { ...base, answer: 'TOOLONG' }],
    ['input longer than the row', { ...base, currentInput: 'TOOLONG' }],
    ['an unknown status', { ...base, status: 'paused' }],
    ['a non-numeric startedAt', { ...base, startedAt: 'now' }],
    ['a non-array guess list', { ...base, guesses: 'none' }],
    ['a guess of the wrong length', { ...base, guesses: [{ word: 'AB', evaluation: [] }] }],
    [
      'an evaluation with an unknown state',
      { ...base, guesses: [{ word: 'CRANE', evaluation: ['correct', 'x', 'x', 'x', 'x'] }] },
    ],
    [
      'an evaluation of the wrong length',
      { ...base, guesses: [{ word: 'CRANE', evaluation: ['correct'] }] },
    ],
  ])('rejects %s', (_label, value) => {
    expect(validateSession(value)).toBeNull();
  });

  it('accepts a finished session so the result panel survives a refresh', () => {
    expect(validateSession({ ...base, status: 'won', finishedAt: 123 })).not.toBeNull();
  });
});

describe('validateMeta', () => {
  it('accepts the default shape', () => {
    expect(validateMeta(defaultMeta())).toEqual(defaultMeta());
  });

  it('rejects a missing schema version', () => {
    expect(validateMeta({ recentAnswers: {} })).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(validateMeta(null)).toBeNull();
    expect(validateMeta([])).toBeNull();
  });

  it('substitutes an empty list for a malformed per-length entry', () => {
    const result = validateMeta({ schemaVersion: 1, recentAnswers: { 4: 'nope', 5: ['CRANE'] } });

    expect(result?.recentAnswers[4]).toEqual([]);
    expect(result?.recentAnswers[5]).toEqual(['CRANE']);
    expect(result?.recentAnswers[6]).toEqual([]);
  });
});
