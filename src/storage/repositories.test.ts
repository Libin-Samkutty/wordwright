import { beforeEach, describe, expect, it } from 'vitest';

import { createGame } from '@/engine/createGame';

import { STORAGE_KEYS, isOwnedKey } from './keys';
import { migrate } from './migrations';
import { defaultStats, DEFAULT_SETTINGS } from './schemas';
import { createMetaRepository, createSessionRepository } from './sessionRepository';
import { createSettingsRepository } from './settingsRepository';
import { createStatsRepository } from './statsRepository';

/**
 * Covers the concrete repository factories end to end against the shared
 * storage instance, complementing `createRepository.test.ts` which exercises
 * the generic machinery in isolation.
 */
describe('repository factories', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('settings round-trip through their own key', () => {
    const repo = createSettingsRepository();

    expect(repo.read()).toEqual(DEFAULT_SETTINGS);

    repo.write({ theme: 'dark', colorblind: true, motion: 'reduced', defaultWordLength: 6 });

    expect(repo.read()).toEqual({
      theme: 'dark',
      colorblind: true,
      motion: 'reduced',
      defaultWordLength: 6,
    });
    expect(localStorage.getItem(STORAGE_KEYS.settings)).not.toBeNull();
  });

  it('settings fall back to defaults on an invalid theme', () => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'neon' }),
    );

    expect(createSettingsRepository().read()).toEqual(DEFAULT_SETTINGS);
  });

  it('stats round-trip and reject an incoherent record', () => {
    const repo = createStatsRepository();
    expect(repo.read()).toEqual(defaultStats());

    const stats = defaultStats();
    repo.write(stats);
    expect(repo.read()).toEqual(stats);

    // More wins than games played is impossible; defaults are safer.
    localStorage.setItem(
      STORAGE_KEYS.stats,
      JSON.stringify({ ...stats, overall: { ...stats.overall, gamesPlayed: 1, gamesWon: 5 } }),
    );
    expect(createStatsRepository().read()).toEqual(defaultStats());
  });

  it('the session repository stores and clears a game', () => {
    const repo = createSessionRepository();
    const game = createGame({ id: 'g1', wordLength: 5, answer: 'CRANE' });

    expect(repo.read()).toBeNull();

    repo.write(game);
    expect(repo.read()).toEqual(game);

    repo.clear();
    expect(repo.read()).toBeNull();
  });

  it('meta round-trips the recent-answer buffer', () => {
    const repo = createMetaRepository();

    expect(repo.read().recentAnswers[5]).toEqual([]);

    repo.write({ schemaVersion: 1, recentAnswers: { 4: ['WORD'], 5: ['CRANE'], 6: [] } });

    expect(repo.read().recentAnswers[5]).toEqual(['CRANE']);
    expect(repo.read().recentAnswers[4]).toEqual(['WORD']);
  });

  it('reports an issue through the callback when data is unreadable', () => {
    const issues: string[] = [];
    localStorage.setItem(STORAGE_KEYS.settings, '{oops');

    createSettingsRepository((issue) => issues.push(issue)).read();

    expect(issues).toEqual(['corrupt']);
  });
});

describe('storage keys', () => {
  it('namespaces every key', () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(key.startsWith('wordwright:v1:')).toBe(true);
    }
  });

  it('recognises its own keys, including earlier versions', () => {
    expect(isOwnedKey(STORAGE_KEYS.stats)).toBe(true);
    expect(isOwnedKey('wordwright:v0:legacy')).toBe(true);
    expect(isOwnedKey('someone-else:data')).toBe(false);
  });
});

describe('migrate (EC-13)', () => {
  it('passes data through unchanged when already current', () => {
    const data = { schemaVersion: 1, value: 'x' };

    expect(migrate(data, 1)).toEqual({ data, ok: true });
  });

  it('refuses data written by a newer build rather than guessing', () => {
    expect(migrate({ anything: true }, 99)).toEqual({ data: null, ok: false });
  });

  it('tolerates an empty chain when stepping up from an older version', () => {
    const result = migrate({ legacy: true }, 0);

    expect(result.ok).toBe(true);
  });
});
