import { describe, expect, it } from 'vitest';

import { MAX_GUESSES } from '../constants';
import { createGame } from '../createGame';
import { gameReducer, startGame, type GameAction } from '../reducer';
import type { GameState } from '../types';

const NOW = 1_700_000_000_000;

function newGame(answer = 'CRANE'): GameState {
  return createGame({ id: 'g1', wordLength: answer.length as 4 | 5 | 6, answer });
}

/** Applies a sequence of actions, as a real session would. */
function run(state: GameState, ...actions: readonly GameAction[]): GameState {
  return actions.reduce(gameReducer, state);
}

/** Types a whole word into the active row. */
function type(state: GameState, word: string, now = NOW): GameState {
  return [...word].reduce(
    (acc, letter) => gameReducer(acc, { type: 'ADD_LETTER', letter, now }),
    state,
  );
}

/** Types, submits and completes the reveal for one guess. */
function playGuess(state: GameState, word: string, now = NOW): GameState {
  const typed = type(state, word, now);
  const submitted = gameReducer(typed, { type: 'SUBMIT_GUESS', word, now });
  return gameReducer(submitted, { type: 'REVEAL_COMPLETE', now });
}

describe('gameReducer', () => {
  describe('START_GAME', () => {
    it('replaces the state wholesale', () => {
      const first = newGame('CRANE');
      const second = createGame({ id: 'g2', wordLength: 4, answer: 'WORD' });

      expect(gameReducer(first, startGame(second))).toBe(second);
    });

    it('can restart from a finished game (FR-5)', () => {
      const finished: GameState = { ...newGame(), status: 'won' };
      const fresh = createGame({ id: 'g2', wordLength: 5, answer: 'SLOTH' });

      expect(gameReducer(finished, startGame(fresh)).status).toBe('playing');
    });
  });

  describe('ADD_LETTER', () => {
    it('appends an uppercase letter to the current input', () => {
      const state = gameReducer(newGame(), { type: 'ADD_LETTER', letter: 'c', now: NOW });

      expect(state.currentInput).toBe('C');
    });

    it('starts the clock on the first keystroke only (FR-22)', () => {
      const first = gameReducer(newGame(), { type: 'ADD_LETTER', letter: 'C', now: NOW });
      expect(first.startedAt).toBe(NOW);

      const second = gameReducer(first, { type: 'ADD_LETTER', letter: 'R', now: NOW + 5000 });
      expect(second.startedAt).toBe(NOW);
    });

    it('ignores letters past the word length, with no error (FR-7, AC-3)', () => {
      const full = type(newGame('WORD'), 'WORD');
      const overflowed = gameReducer(full, { type: 'ADD_LETTER', letter: 'S', now: NOW });

      expect(overflowed).toBe(full);
      expect(overflowed.currentInput).toBe('WORD');
    });

    it('ignores non-alphabetic input (EC-3)', () => {
      const state = newGame();

      for (const letter of ['1', '!', ' ', '-', 'é', 'ab']) {
        expect(gameReducer(state, { type: 'ADD_LETTER', letter, now: NOW })).toBe(state);
      }
    });

    it('is ignored while revealing (FR-11, EC-8)', () => {
      const revealing: GameState = { ...newGame(), status: 'revealing' };

      expect(gameReducer(revealing, { type: 'ADD_LETTER', letter: 'A', now: NOW })).toBe(revealing);
    });

    it.each(['won', 'lost', 'loading', 'error', 'idle'] as const)(
      'is ignored in %s status (FR-11)',
      (status) => {
        const state: GameState = { ...newGame(), status };

        expect(gameReducer(state, { type: 'ADD_LETTER', letter: 'A', now: NOW })).toBe(state);
      },
    );
  });

  describe('REMOVE_LETTER', () => {
    it('drops the last letter (FR-8)', () => {
      const state = gameReducer(type(newGame(), 'CRA'), { type: 'REMOVE_LETTER' });

      expect(state.currentInput).toBe('CR');
    });

    it('does nothing on an empty row', () => {
      const empty = newGame();

      expect(gameReducer(empty, { type: 'REMOVE_LETTER' })).toBe(empty);
    });

    it('is ignored while revealing', () => {
      const revealing: GameState = { ...newGame(), currentInput: 'CR', status: 'revealing' };

      expect(gameReducer(revealing, { type: 'REMOVE_LETTER' })).toBe(revealing);
    });
  });

  describe('SUBMIT_GUESS', () => {
    it('appends an evaluated guess and clears the input', () => {
      const state = gameReducer(type(newGame(), 'SLOTH'), {
        type: 'SUBMIT_GUESS',
        word: 'SLOTH',
        now: NOW,
      });

      expect(state.guesses).toHaveLength(1);
      expect(state.guesses[0]?.word).toBe('SLOTH');
      expect(state.guesses[0]?.evaluation).toHaveLength(5);
      expect(state.currentInput).toBe('');
    });

    it('enters revealing rather than resolving immediately (FR-52)', () => {
      const state = gameReducer(newGame(), { type: 'SUBMIT_GUESS', word: 'CRANE', now: NOW });

      // Even a winning guess stays hidden until the flip finishes.
      expect(state.status).toBe('revealing');
    });

    it('rejects a word of the wrong length', () => {
      const state = newGame();

      expect(gameReducer(state, { type: 'SUBMIT_GUESS', word: 'CRAN', now: NOW })).toBe(state);
      expect(gameReducer(state, { type: 'SUBMIT_GUESS', word: 'CRANES', now: NOW })).toBe(state);
    });

    it('refuses to exceed the guess limit', () => {
      let state = newGame();
      for (let i = 0; i < MAX_GUESSES; i += 1) {
        state = playGuess(state, 'SLOTH');
      }

      expect(state.guesses).toHaveLength(MAX_GUESSES);
      expect(gameReducer(state, { type: 'SUBMIT_GUESS', word: 'SLOTH', now: NOW })).toBe(state);
    });

    it('guards the guess limit independently of status, in case state is restored full', () => {
      // A tampered or malformed saved session (EC-12) could present a full
      // board still marked `playing`. The limit must hold on its own.
      const full: GameState = {
        ...newGame(),
        status: 'playing',
        guesses: Array.from({ length: MAX_GUESSES }, () => ({
          word: 'SLOTH',
          evaluation: ['absent', 'absent', 'absent', 'absent', 'absent'] as const,
        })),
      };

      expect(gameReducer(full, { type: 'SUBMIT_GUESS', word: 'CRANE', now: NOW })).toBe(full);
    });

    it('starts the clock if the player somehow submits without typing', () => {
      const state = gameReducer(newGame(), { type: 'SUBMIT_GUESS', word: 'SLOTH', now: NOW });

      expect(state.startedAt).toBe(NOW);
    });

    it('is ignored while already revealing', () => {
      const revealing: GameState = { ...newGame(), status: 'revealing' };

      expect(gameReducer(revealing, { type: 'SUBMIT_GUESS', word: 'SLOTH', now: NOW })).toBe(
        revealing,
      );
    });

    it('allows the same word twice (FR-16)', () => {
      const state = playGuess(playGuess(newGame(), 'SLOTH'), 'SLOTH');

      expect(state.guesses).toHaveLength(2);
    });
  });

  describe('REVEAL_COMPLETE', () => {
    it('returns to playing after a non-winning guess', () => {
      const state = playGuess(newGame(), 'SLOTH');

      expect(state.status).toBe('playing');
      expect(state.finishedAt).toBeNull();
    });

    it('resolves to won when the guess matches (FR-18)', () => {
      const state = playGuess(newGame('CRANE'), 'CRANE', NOW);

      expect(state.status).toBe('won');
      expect(state.finishedAt).toBe(NOW);
    });

    it('resolves to lost after the final wrong guess (FR-19)', () => {
      let state = newGame();
      for (let i = 0; i < MAX_GUESSES; i += 1) {
        state = playGuess(state, 'SLOTH');
      }

      expect(state.status).toBe('lost');
      expect(state.finishedAt).toBe(NOW);
    });

    it('wins on the last guess rather than losing', () => {
      let state = newGame('CRANE');
      for (let i = 0; i < MAX_GUESSES - 1; i += 1) {
        state = playGuess(state, 'SLOTH');
      }
      state = playGuess(state, 'CRANE');

      expect(state.status).toBe('won');
      expect(state.guesses).toHaveLength(MAX_GUESSES);
    });

    it('is ignored when not revealing', () => {
      const playing = newGame();

      expect(gameReducer(playing, { type: 'REVEAL_COMPLETE', now: NOW })).toBe(playing);
    });

    it('is idempotent, so a duplicate animation callback cannot double-resolve', () => {
      const won = playGuess(newGame('CRANE'), 'CRANE');
      const again = gameReducer(won, { type: 'REVEAL_COMPLETE', now: NOW + 1 });

      expect(again).toBe(won);
    });
  });

  describe('SET_STATUS', () => {
    it('changes status', () => {
      expect(gameReducer(newGame(), { type: 'SET_STATUS', status: 'loading' }).status).toBe(
        'loading',
      );
    });

    it('returns the same reference when the status is unchanged', () => {
      const state = newGame();

      expect(gameReducer(state, { type: 'SET_STATUS', status: 'playing' })).toBe(state);
    });
  });

  describe('purity', () => {
    it('never mutates the state it is given', () => {
      const state = newGame();
      const snapshot = structuredClone(state);

      run(
        state,
        { type: 'ADD_LETTER', letter: 'C', now: NOW },
        { type: 'REMOVE_LETTER' },
        { type: 'SUBMIT_GUESS', word: 'SLOTH', now: NOW },
        { type: 'REVEAL_COMPLETE', now: NOW },
      );

      expect(state).toEqual(snapshot);
    });

    it('produces the same result for the same inputs', () => {
      const state = newGame();
      const action: GameAction = { type: 'ADD_LETTER', letter: 'C', now: NOW };

      expect(gameReducer(state, action)).toEqual(gameReducer(state, action));
    });
  });

  describe('a full game', () => {
    it('plays through to a win, recording every guess', () => {
      let state = newGame('CRANE');
      state = playGuess(state, 'SLOTH', NOW);
      state = playGuess(state, 'ABBEY', NOW + 1000);
      state = playGuess(state, 'CRANE', NOW + 2000);

      expect(state.status).toBe('won');
      expect(state.guesses.map((g) => g.word)).toEqual(['SLOTH', 'ABBEY', 'CRANE']);
      expect(state.startedAt).toBe(NOW);
      expect(state.finishedAt).toBe(NOW + 2000);
    });
  });
});
