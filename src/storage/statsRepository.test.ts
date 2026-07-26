import { describe, expect, it } from 'vitest';

import type { GameRecord } from '@/engine/types';

import { defaultStats, type StatsState } from './schemas';
import {
  averageGuesses,
  averageSolveMs,
  recordGame,
  resetHistory,
  resetStatistics,
  winPercentage,
} from './statsRepository';

let counter = 0;

function game(overrides: Partial<GameRecord> = {}): GameRecord {
  counter += 1;
  return {
    id: `game-${counter}`,
    playedAt: 1_700_000_000_000 + counter,
    wordLength: 5,
    answer: 'CRANE',
    guessesUsed: 3,
    won: true,
    solveMs: 30_000,
    score: 480,
    ...overrides,
  };
}

function play(records: readonly GameRecord[]): StatsState {
  return records.reduce(recordGame, defaultStats());
}

describe('recordGame', () => {
  it('counts a win in the overall bucket', () => {
    const stats = play([game({ guessesUsed: 3, score: 480, solveMs: 30_000 })]);

    expect(stats.overall.gamesPlayed).toBe(1);
    expect(stats.overall.gamesWon).toBe(1);
    expect(stats.overall.totalScore).toBe(480);
    expect(stats.overall.totalSolveMs).toBe(30_000);
    expect(stats.overall.fastestSolveMs).toBe(30_000);
  });

  it('counts a loss without incrementing wins or the distribution', () => {
    const stats = play([game({ won: false, guessesUsed: 6, score: 0 })]);

    expect(stats.overall.gamesPlayed).toBe(1);
    expect(stats.overall.gamesWon).toBe(0);
    expect(stats.overall.distribution.every((n) => n === 0)).toBe(true);
    expect(stats.overall.fastestSolveMs).toBeNull();
  });

  it('is idempotent by game id, so a replayed completion cannot double-count (FR-20)', () => {
    const record = game();
    const once = recordGame(defaultStats(), record);
    const twice = recordGame(once, record);

    expect(twice).toBe(once);
    expect(twice.overall.gamesPlayed).toBe(1);
  });

  describe('streaks (FR-37)', () => {
    it('increments on each win', () => {
      const stats = play([game(), game(), game()]);

      expect(stats.overall.currentStreak).toBe(3);
      expect(stats.overall.bestStreak).toBe(3);
    });

    it('resets to zero on a loss but preserves the best (AC-7)', () => {
      const stats = play([game(), game(), game({ won: false }), game()]);

      expect(stats.overall.currentStreak).toBe(1);
      expect(stats.overall.bestStreak).toBe(2);
    });

    it('keeps the best streak across a later, shorter run', () => {
      const stats = play([
        game(),
        game(),
        game(),
        game(), // streak of 4
        game({ won: false }),
        game(),
        game(), // streak of 2
      ]);

      expect(stats.overall.currentStreak).toBe(2);
      expect(stats.overall.bestStreak).toBe(4);
    });

    it('counts streaks across word lengths, not per length', () => {
      const stats = play([
        game({ wordLength: 4, answer: 'WORD' }),
        game({ wordLength: 6, answer: 'SILVER' }),
      ]);

      expect(stats.overall.currentStreak).toBe(2);
    });
  });

  describe('distribution (FR-40)', () => {
    it('buckets wins by guess count, one-indexed', () => {
      const stats = play([
        game({ guessesUsed: 1 }),
        game({ guessesUsed: 3 }),
        game({ guessesUsed: 3 }),
        game({ guessesUsed: 6 }),
      ]);

      expect(stats.overall.distribution).toEqual([1, 0, 2, 0, 0, 1]);
    });

    it('ignores losses', () => {
      const stats = play([game({ won: false, guessesUsed: 6 })]);

      expect(stats.overall.distribution).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });

  describe('per-length metrics (FR-36)', () => {
    it('tracks each length separately while also aggregating', () => {
      const stats = play([
        game({ wordLength: 4, answer: 'WORD', guessesUsed: 2, score: 500 }),
        game({ wordLength: 5, answer: 'CRANE', guessesUsed: 4, score: 360 }),
        game({ wordLength: 5, answer: 'SLOTH', guessesUsed: 4, score: 360 }),
      ]);

      expect(stats.perLength[4].gamesPlayed).toBe(1);
      expect(stats.perLength[5].gamesPlayed).toBe(2);
      expect(stats.perLength[6].gamesPlayed).toBe(0);
      expect(stats.overall.gamesPlayed).toBe(3);
      expect(stats.perLength[5].totalScore).toBe(720);
    });
  });

  describe('fastest solve', () => {
    it('keeps the minimum across wins', () => {
      const stats = play([
        game({ solveMs: 45_000 }),
        game({ solveMs: 12_000 }),
        game({ solveMs: 30_000 }),
      ]);

      expect(stats.overall.fastestSolveMs).toBe(12_000);
    });

    it('is unaffected by losses', () => {
      const stats = play([game({ solveMs: 40_000 }), game({ won: false, solveMs: 1 })]);

      expect(stats.overall.fastestSolveMs).toBe(40_000);
    });
  });

  describe('recent games (FR-39)', () => {
    it('lists newest first', () => {
      const stats = play([game({ answer: 'FIRST' }), game({ answer: 'THIRD' })]);

      expect(stats.recentGames[0]?.answer).toBe('THIRD');
      expect(stats.recentGames[1]?.answer).toBe('FIRST');
    });

    it('caps at 50 entries', () => {
      const stats = play(Array.from({ length: 60 }, () => game()));

      expect(stats.recentGames).toHaveLength(50);
      expect(stats.overall.gamesPlayed).toBe(60);
    });

    it('bounds the recorded-id list so it cannot grow without limit', () => {
      const stats = play(Array.from({ length: 300 }, () => game()));

      expect(stats.recordedGameIds.length).toBeLessThanOrEqual(100);
    });
  });

  it('matches a hand-computed expectation over ten games (AC-11)', () => {
    // 7 wins (guesses 2,3,3,4,4,5,1) and 3 losses; last game is a win.
    const stats = play([
      game({ guessesUsed: 2, won: true, score: 500, solveMs: 20_000 }),
      game({ guessesUsed: 3, won: true, score: 400, solveMs: 30_000 }),
      game({ won: false, score: 0, solveMs: 60_000 }),
      game({ guessesUsed: 3, won: true, score: 400, solveMs: 25_000 }),
      game({ guessesUsed: 4, won: true, score: 300, solveMs: 40_000 }),
      game({ won: false, score: 0, solveMs: 70_000 }),
      game({ guessesUsed: 4, won: true, score: 300, solveMs: 35_000 }),
      game({ won: false, score: 0, solveMs: 80_000 }),
      game({ guessesUsed: 5, won: true, score: 200, solveMs: 50_000 }),
      game({ guessesUsed: 1, won: true, score: 600, solveMs: 10_000 }),
    ]);

    expect(stats.overall.gamesPlayed).toBe(10);
    expect(stats.overall.gamesWon).toBe(7);
    expect(winPercentage(stats.overall)).toBe(70);
    expect(stats.overall.distribution).toEqual([1, 1, 2, 2, 1, 0]);
    expect(stats.overall.totalScore).toBe(2700);
    // Wins only: (2+3+3+4+4+5+1) / 7 = 22 / 7
    expect(averageGuesses(stats.overall)).toBeCloseTo(22 / 7, 5);
    // Wins only: (20+30+25+40+35+50+10) seconds / 7
    expect(averageSolveMs(stats.overall)).toBeCloseTo(210_000 / 7, 5);
    expect(stats.overall.fastestSolveMs).toBe(10_000);
    expect(stats.overall.currentStreak).toBe(2);
    expect(stats.overall.bestStreak).toBe(2);
  });
});

describe('derived values', () => {
  it('reports 0% with no games rather than NaN (FR-41)', () => {
    expect(winPercentage(defaultStats().overall)).toBe(0);
  });

  it('reports null averages with no wins, so the UI can show a dash (FR-38)', () => {
    const stats = play([game({ won: false })]);

    expect(averageGuesses(stats.overall)).toBeNull();
    expect(averageSolveMs(stats.overall)).toBeNull();
  });

  it('rounds the win percentage', () => {
    const stats = play([game(), game(), game({ won: false })]);

    expect(winPercentage(stats.overall)).toBe(67);
  });

  it('averages guesses over wins only (FR-38)', () => {
    const stats = play([
      game({ guessesUsed: 2 }),
      game({ guessesUsed: 4 }),
      game({ won: false, guessesUsed: 6 }),
    ]);

    expect(averageGuesses(stats.overall)).toBe(3);
  });
});

describe('resets (FR-47)', () => {
  it('resetStatistics clears metrics but keeps history', () => {
    const stats = play([game(), game()]);
    const reset = resetStatistics(stats);

    expect(reset.overall.gamesPlayed).toBe(0);
    expect(reset.overall.bestStreak).toBe(0);
    expect(reset.perLength[5].gamesPlayed).toBe(0);
    expect(reset.recentGames).toHaveLength(2);
  });

  it('resetHistory clears the log but keeps metrics (AC-12)', () => {
    const stats = play([game(), game()]);
    const reset = resetHistory(stats);

    expect(reset.recentGames).toHaveLength(0);
    expect(reset.overall.gamesPlayed).toBe(2);
    expect(reset.overall.bestStreak).toBe(2);
  });

  it('allows a cleared game to be recorded again after resetHistory', () => {
    const record = game();
    const stats = recordGame(defaultStats(), record);
    const cleared = resetHistory(stats);

    expect(recordGame(cleared, record).overall.gamesPlayed).toBe(2);
  });
});

describe('immutability', () => {
  it('never mutates the state it is given', () => {
    const before = play([game()]);
    const snapshot = structuredClone(before);

    recordGame(before, game());

    expect(before).toEqual(snapshot);
  });
});
