import type { WordLength } from '@/engine';

/**
 * Small deterministic dictionaries for component and integration tests.
 *
 * Never use the real word lists in UI tests: they are large, they slow every
 * case down, and a regenerated list would break unrelated assertions.
 */
export const FIXTURE_LISTS: Record<WordLength, { answers: string[]; guesses: string[] }> = {
  4: {
    answers: ['WORD', 'GAME', 'PLAY'],
    guesses: ['WORD', 'GAME', 'PLAY', 'TEST', 'MAZE', 'LOOK', 'BALL'],
  },
  5: {
    answers: ['CRANE', 'SLOTH', 'ABBEY'],
    guesses: ['CRANE', 'SLOTH', 'ABBEY', 'BABES', 'SPEED', 'GEESE', 'LEVEL', 'ROBIN', 'STAMP'],
  },
  6: {
    answers: ['SILVER', 'PLANET'],
    guesses: ['SILVER', 'PLANET', 'LISTEN', 'SILENT', 'ROCKET'],
  },
};

/** Installs the fixture lists in place of the real dictionary modules. */
export function fixtureDictionaryModule(length: WordLength): {
  answers: string[];
  guesses: string[];
} {
  return FIXTURE_LISTS[length];
}
