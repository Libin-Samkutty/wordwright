import { describe, expect, it } from 'vitest';

import { RECENT_ANSWER_WINDOW } from '@/engine/constants';
import { createGame } from '@/engine/createGame';
import type { GameState } from '@/engine/types';

import { createRepository } from './createRepository';
import { defaultMeta, validateSession } from './schemas';
import { createSafeStorage } from './safeStorage';
import { isSessionUsable, rememberAnswer } from './sessionRepository';

function session(overrides: Partial<GameState> = {}): GameState {
  return { ...createGame({ id: 's1', wordLength: 5, answer: 'CRANE' }), ...overrides };
}

/** Mirrors createSessionRepository but against an isolated in-memory store. */
function makeRepo() {
  const storage = createSafeStorage(undefined);
  const repo = createRepository<GameState | null>({
    key: 'test:session',
    defaults: () => null,
    storage,
    validate: (value) => {
      if (value === null) return null;
      const parsed = validateSession(value);
      if (!parsed) return null;
      if (parsed.status === 'revealing') return { ...parsed, status: 'playing' };
      if (parsed.status === 'loading' || parsed.status === 'idle' || parsed.status === 'error') {
        return null;
      }
      return parsed;
    },
  });
  return { repo, storage };
}

describe('session persistence (FR-32, EC-9)', () => {
  it('restores an in-progress game exactly', () => {
    const { repo } = makeRepo();
    const inProgress = session({
      guesses: [{ word: 'SLOTH', evaluation: ['absent', 'absent', 'absent', 'absent', 'absent'] }],
      currentInput: 'CR',
      startedAt: 1_700_000_000_000,
    });

    repo.write(inProgress);

    expect(repo.read()).toEqual(inProgress);
  });

  it('preserves the elapsed-time baseline across a reload (AC-9)', () => {
    const { repo } = makeRepo();
    repo.write(session({ startedAt: 1_700_000_000_000 }));

    expect(repo.read()?.startedAt).toBe(1_700_000_000_000);
  });

  it('normalises a session saved mid-reveal to playing (EC-10)', () => {
    const { repo } = makeRepo();
    repo.write(
      session({
        status: 'revealing',
        guesses: [
          { word: 'SLOTH', evaluation: ['absent', 'absent', 'absent', 'absent', 'absent'] },
        ],
      }),
    );

    const restored = repo.read();

    expect(restored?.status).toBe('playing');
    // The guess itself survives, fully revealed.
    expect(restored?.guesses).toHaveLength(1);
  });

  it('discards transient startup statuses', () => {
    const { repo } = makeRepo();

    for (const status of ['loading', 'idle', 'error'] as const) {
      repo.write(session({ status }));
      expect(repo.read()).toBeNull();
    }
  });

  it('keeps a finished game so the result panel survives a refresh', () => {
    const { repo } = makeRepo();
    repo.write(session({ status: 'won', finishedAt: 1_700_000_001_000 }));

    expect(repo.read()?.status).toBe('won');
  });

  it('returns null when nothing is stored', () => {
    expect(makeRepo().repo.read()).toBeNull();
  });

  it('discards a malformed session rather than crashing (EC-12)', () => {
    const { repo, storage } = makeRepo();

    for (const bad of [
      '{"id":"x"}',
      JSON.stringify({ ...session(), wordLength: 9 }),
      JSON.stringify({ ...session(), answer: 'TOOLONG' }),
      JSON.stringify({ ...session(), guesses: [{ word: 'AB', evaluation: ['correct'] }] }),
      JSON.stringify({ ...session(), guesses: [{ word: 'CRANE', evaluation: ['nope'] }] }),
      JSON.stringify({ ...session(), currentInput: 'TOOLONG' }),
      JSON.stringify({ ...session(), startedAt: 'yesterday' }),
    ]) {
      storage.setItem('test:session', bad);
      expect(repo.read()).toBeNull();
    }
  });

  it('rejects a session with more guesses than the limit', () => {
    const { repo, storage } = makeRepo();
    storage.setItem(
      'test:session',
      JSON.stringify({
        ...session(),
        guesses: Array.from({ length: 7 }, () => ({
          word: 'SLOTH',
          evaluation: ['absent', 'absent', 'absent', 'absent', 'absent'],
        })),
      }),
    );

    expect(repo.read()).toBeNull();
  });
});

describe('isSessionUsable (FR-33)', () => {
  const known = (word: string): boolean => word === 'CRANE';

  it('accepts a matching, still-valid session', () => {
    expect(isSessionUsable(session(), 5, known)).toBe(true);
  });

  it('rejects null', () => {
    expect(isSessionUsable(null, 5, known)).toBe(false);
  });

  it('rejects a session for a different word length', () => {
    expect(isSessionUsable(session(), 6, known)).toBe(false);
  });

  it('rejects a session whose answer left the dictionary', () => {
    expect(isSessionUsable(session({ answer: 'RETIRED' }), 5, known)).toBe(false);
  });
});

describe('rememberAnswer (FR-4)', () => {
  it('adds an answer to the front of its length', () => {
    const meta = rememberAnswer(defaultMeta(), 5, 'CRANE');

    expect(meta.recentAnswers[5]).toEqual(['CRANE']);
  });

  it('keeps lengths independent', () => {
    let meta = rememberAnswer(defaultMeta(), 5, 'CRANE');
    meta = rememberAnswer(meta, 4, 'WORD');

    expect(meta.recentAnswers[5]).toEqual(['CRANE']);
    expect(meta.recentAnswers[4]).toEqual(['WORD']);
  });

  it('moves a repeated answer to the front rather than duplicating it', () => {
    let meta = rememberAnswer(defaultMeta(), 5, 'CRANE');
    meta = rememberAnswer(meta, 5, 'SLOTH');
    meta = rememberAnswer(meta, 5, 'CRANE');

    expect(meta.recentAnswers[5]).toEqual(['CRANE', 'SLOTH']);
  });

  it('caps the ring buffer at the configured window', () => {
    let meta = defaultMeta();
    for (let i = 0; i < RECENT_ANSWER_WINDOW + 20; i += 1) {
      meta = rememberAnswer(meta, 5, `WORD${i}`);
    }

    expect(meta.recentAnswers[5]).toHaveLength(RECENT_ANSWER_WINDOW);
    expect(meta.recentAnswers[5][0]).toBe(`WORD${RECENT_ANSWER_WINDOW + 19}`);
  });

  it('does not mutate the meta it is given', () => {
    const before = defaultMeta();
    const snapshot = structuredClone(before);

    rememberAnswer(before, 5, 'CRANE');

    expect(before).toEqual(snapshot);
  });
});
