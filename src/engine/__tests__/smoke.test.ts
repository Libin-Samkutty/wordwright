import { describe, expect, it } from 'vitest';
import { loadDictionary } from '@/dictionary';
import {
  createGame,
  pickAnswer,
  validateGuess,
  gameReducer,
  boardRows,
  deriveKeyStates,
  scoreGame,
  seededRandom,
  MAX_GUESSES,
} from '@/engine';
import type { GameState } from '@/engine';

describe('end-to-end engine smoke test', () => {
  it('plays a complete winning game through the public API only', async () => {
    const dict = await loadDictionary(5);
    const random = seededRandom(2026);
    const answer = pickAnswer(dict.answers, [], random);

    let state: GameState = createGame({ id: 'smoke-1', wordLength: 5, answer });
    const t0 = 1_000_000;

    // A rejected non-word must not consume a turn.
    expect(validateGuess('ZZZZZ', 5, (w) => dict.guesses.has(w))).toEqual({
      ok: false,
      error: 'not-a-word',
    });
    expect(state.guesses).toHaveLength(0);

    // A short guess is rejected too.
    expect(validateGuess('CRAN', 5, (w) => dict.guesses.has(w)).ok).toBe(false);

    // Real guess, then the winning answer.
    const opener = 'CRANE';
    expect(dict.guesses.has(opener)).toBe(true);
    state = gameReducer(state, { type: 'SUBMIT_GUESS', word: opener, now: t0 });
    state = gameReducer(state, { type: 'REVEAL_COMPLETE', now: t0 });
    expect(state.status).toBe(opener === answer ? 'won' : 'playing');

    if (state.status === 'playing') {
      state = gameReducer(state, { type: 'SUBMIT_GUESS', word: answer, now: t0 + 30_000 });
      expect(state.status).toBe('revealing');
      state = gameReducer(state, { type: 'REVEAL_COMPLETE', now: t0 + 30_000 });
    }

    expect(state.status).toBe('won');
    expect(boardRows(state)).toHaveLength(MAX_GUESSES);
    expect(deriveKeyStates(state.guesses).size).toBeGreaterThan(0);

    const solveMs = (state.finishedAt ?? 0) - (state.startedAt ?? 0);
    expect(solveMs).toBeGreaterThanOrEqual(0);
    expect(
      scoreGame({ won: true, guessesUsed: state.guesses.length, wordLength: 5, solveMs }),
    ).toBeGreaterThan(0);
  });

  it('plays a complete losing game and scores zero', async () => {
    const dict = await loadDictionary(4);
    let state: GameState = createGame({ id: 'smoke-2', wordLength: 4, answer: 'ZZZZ' });
    const wrong = [...dict.guesses].filter((w) => !w.includes('Z')).slice(0, MAX_GUESSES);

    for (const word of wrong) {
      state = gameReducer(state, { type: 'SUBMIT_GUESS', word, now: 1 });
      state = gameReducer(state, { type: 'REVEAL_COMPLETE', now: 1 });
    }

    expect(state.status).toBe('lost');
    expect(state.guesses).toHaveLength(MAX_GUESSES);
    expect(scoreGame({ won: false, guessesUsed: 6, wordLength: 4, solveMs: 1000 })).toBe(0);
  });
});
