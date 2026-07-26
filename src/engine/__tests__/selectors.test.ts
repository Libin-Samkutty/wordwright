import { describe, expect, it } from 'vitest';

import { MAX_GUESSES } from '../constants';
import { createGame } from '../createGame';
import { gameReducer } from '../reducer';
import {
  boardRows,
  currentRowIndex,
  guessesUsed,
  isGameOver,
  remainingGuesses,
} from '../selectors';
import type { GameState } from '../types';

const NOW = 1_700_000_000_000;

function newGame(answer = 'CRANE'): GameState {
  return createGame({ id: 'g1', wordLength: answer.length as 4 | 5 | 6, answer });
}

function playGuess(state: GameState, word: string): GameState {
  const submitted = gameReducer(state, { type: 'SUBMIT_GUESS', word, now: NOW });
  return gameReducer(submitted, { type: 'REVEAL_COMPLETE', now: NOW });
}

describe('isGameOver', () => {
  it.each([
    ['won', true],
    ['lost', true],
    ['playing', false],
    ['revealing', false],
    ['loading', false],
    ['idle', false],
    ['error', false],
  ] as const)('is %s -> %s', (status, expected) => {
    expect(isGameOver({ ...newGame(), status })).toBe(expected);
  });
});

describe('counters', () => {
  it('tracks guesses used and remaining', () => {
    let state = newGame();
    expect(guessesUsed(state)).toBe(0);
    expect(remainingGuesses(state)).toBe(MAX_GUESSES);

    state = playGuess(state, 'SLOTH');
    expect(guessesUsed(state)).toBe(1);
    expect(remainingGuesses(state)).toBe(MAX_GUESSES - 1);
  });

  it('never reports negative remaining guesses', () => {
    let state = newGame();
    for (let i = 0; i < MAX_GUESSES; i += 1) state = playGuess(state, 'SLOTH');

    expect(remainingGuesses(state)).toBe(0);
  });

  it('advances the active row with each guess', () => {
    let state = newGame();
    expect(currentRowIndex(state)).toBe(0);

    state = playGuess(state, 'SLOTH');
    expect(currentRowIndex(state)).toBe(1);
  });

  it('clamps the active row at the guess limit', () => {
    let state = newGame();
    for (let i = 0; i < MAX_GUESSES; i += 1) state = playGuess(state, 'SLOTH');

    expect(currentRowIndex(state)).toBe(MAX_GUESSES);
  });
});

describe('boardRows', () => {
  it('always renders six rows, whatever the state (FR-50)', () => {
    expect(boardRows(newGame())).toHaveLength(MAX_GUESSES);

    let state = newGame();
    for (let i = 0; i < 3; i += 1) state = playGuess(state, 'SLOTH');
    expect(boardRows(state)).toHaveLength(MAX_GUESSES);
  });

  it.each([4, 5, 6] as const)('renders %i tiles per row', (length) => {
    const answer = 'ABCDEF'.slice(0, length);
    const rows = boardRows(createGame({ id: 'g', wordLength: length, answer }));

    for (const row of rows) {
      expect(row.tiles).toHaveLength(length);
    }
  });

  it('marks an untouched board empty', () => {
    const [first] = boardRows(newGame());

    expect(first?.tiles.every((tile) => tile.state === 'empty' && tile.letter === '')).toBe(true);
  });

  it('shows typed letters as filled in the active row (FR-51)', () => {
    const state = gameReducer(newGame(), { type: 'ADD_LETTER', letter: 'C', now: NOW });
    const [first] = boardRows(state);

    expect(first?.tiles[0]).toEqual({ letter: 'C', state: 'filled' });
    expect(first?.tiles[1]).toEqual({ letter: '', state: 'empty' });
  });

  it('shows evaluated letters in a submitted row', () => {
    const state = playGuess(newGame('CRANE'), 'CRANE');
    const [first] = boardRows(state);

    expect(first?.tiles.map((tile) => tile.state)).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ]);
  });

  it('marks exactly one row active while playing', () => {
    const state = playGuess(newGame(), 'SLOTH');
    const rows = boardRows(state);

    expect(rows.filter((row) => row.isActive)).toHaveLength(1);
    expect(rows[1]?.isActive).toBe(true);
  });

  it('marks no row active once the game is over', () => {
    const state = playGuess(newGame('CRANE'), 'CRANE');

    expect(boardRows(state).some((row) => row.isActive)).toBe(false);
  });

  it('flags the just-submitted row as revealing (FR-52)', () => {
    const state = gameReducer(newGame(), { type: 'SUBMIT_GUESS', word: 'SLOTH', now: NOW });
    const rows = boardRows(state);

    expect(rows[0]?.isRevealing).toBe(true);
    expect(rows.filter((row) => row.isRevealing)).toHaveLength(1);
  });

  it('stops flagging a row as revealing once the reveal completes', () => {
    const state = playGuess(newGame(), 'SLOTH');

    expect(boardRows(state).some((row) => row.isRevealing)).toBe(false);
  });

  it('keeps input out of rows other than the active one', () => {
    const state = gameReducer(playGuess(newGame(), 'SLOTH'), {
      type: 'ADD_LETTER',
      letter: 'A',
      now: NOW,
    });
    const rows = boardRows(state);

    expect(rows[1]?.tiles[0]?.letter).toBe('A');
    expect(rows[2]?.tiles[0]?.letter).toBe('');
  });
});
