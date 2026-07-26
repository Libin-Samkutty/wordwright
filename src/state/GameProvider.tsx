import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { loadDictionary, type Dictionary } from '@/dictionary';
import {
  MAX_GUESSES,
  boardRows,
  createGame,
  deriveKeyStates,
  gameReducer,
  isGameOver,
  pickAnswer,
  scoreGame,
  systemRandom,
  validateGuess,
  type GameState,
  type LetterState,
  type RowView,
  type WordLength,
} from '@/engine';
import { clampDuration, now } from '@/lib/clock';
import { describeEvaluation } from '@/lib/format';
import {
  createMetaRepository,
  createSessionRepository,
  isSessionUsable,
  rememberAnswer,
} from '@/storage';

import { reportStorageIssue } from './storageIssues';
import { useSettings, useStats, useToast } from './contexts';
import { GameContext } from './gameContexts';

/** Status of the dictionary load, distinct from the game's own status. */
export type DictionaryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GameContextValue {
  readonly state: GameState;
  readonly rows: readonly RowView[];
  readonly keyStates: ReadonlyMap<string, LetterState>;
  readonly dictionaryStatus: DictionaryStatus;
  readonly wordLength: WordLength;
  /** True while a row is flipping; input is locked (FR-11). */
  readonly isRevealing: boolean;
  readonly isGameOver: boolean;
  /** Latest board announcement for the live region (A11Y-3). */
  readonly announcement: string;
  readonly addLetter: (letter: string) => void;
  readonly removeLetter: () => void;
  /** Returns false when the guess was rejected, so the view can shake. */
  readonly submitGuess: () => boolean;
  /** Called by the reveal animation when the flip finishes. */
  readonly completeReveal: () => void;
  readonly restart: () => void;
  readonly setWordLength: (length: WordLength) => void;
  readonly retryDictionary: () => void;
}

/** Placeholder until the dictionary resolves and a real game starts. */
function placeholderGame(wordLength: WordLength): GameState {
  return {
    id: 'pending',
    wordLength,
    answer: '',
    guesses: [],
    currentInput: '',
    status: 'loading',
    startedAt: null,
    finishedAt: null,
  };
}

/** Session writes are debounced; keystrokes are far more frequent than reloads. */
const SESSION_WRITE_DEBOUNCE_MS = 150;

/**
 * True when a state is a real game worth persisting.
 *
 * `loading`/`error` describe app startup rather than play, and the placeholder
 * game carries a sentinel id. Writing either would leave a session that
 * `validateSession` then has to reject on the next load.
 */
function isPersistable(state: GameState): boolean {
  return state.status !== 'loading' && state.status !== 'error' && state.id !== 'pending';
}

export function GameProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { settings, setDefaultWordLength } = useSettings();
  const { show } = useToast();
  const { recordGame } = useStats();

  const sessionRepo = useRef(createSessionRepository(reportStorageIssue));
  const metaRepo = useRef(createMetaRepository(reportStorageIssue));

  const [wordLength, setLength] = useState<WordLength>(settings.defaultWordLength);
  const [dictionaryStatus, setDictionaryStatus] = useState<DictionaryStatus>('loading');
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [state, dispatch] = useReducer(gameReducer, wordLength, placeholderGame);

  // Reload token: bumping it re-runs the dictionary effect for Retry (EC-14).
  const [loadToken, setLoadToken] = useState(0);

  /** Starts a fresh game for the given length, remembering the answer (FR-4). */
  const startFreshGame = useCallback((dict: Dictionary): void => {
    const meta = metaRepo.current.read();
    const answer = pickAnswer(dict.answers, meta.recentAnswers[dict.wordLength], systemRandom);

    metaRepo.current.write(rememberAnswer(meta, dict.wordLength, answer));
    dispatch({
      type: 'START_GAME',
      game: createGame({ id: crypto.randomUUID(), wordLength: dict.wordLength, answer }),
    });
  }, []);

  // Load the dictionary for the active length, then restore or start a game.
  useEffect(() => {
    let cancelled = false;

    // Status is set inside the async continuation rather than synchronously in
    // the effect body, which would force an extra render pass before the load
    // even begins.
    loadDictionary(wordLength)
      .then((dict) => {
        // The player switched length while this was in flight; drop the result.
        if (cancelled) return;

        setDictionary(dict);
        setDictionaryStatus('ready');

        const answers = new Set(dict.answers);
        const saved = sessionRepo.current.read();

        if (isSessionUsable(saved, wordLength, (word) => answers.has(word))) {
          dispatch({ type: 'START_GAME', game: saved });
        } else {
          startFreshGame(dict);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDictionaryStatus('error');
        dispatch({ type: 'SET_STATUS', status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [wordLength, loadToken, startFreshGame]);

  /*
   * Persist the session (FR-32).
   *
   * Debounced, because a keystroke is far more frequent than a reload, plus a
   * synchronous flush when the page is hidden — `pagehide` and
   * `visibilitychange` are reliable on iOS where `beforeunload` is not.
   */
  useEffect(() => {
    if (!isPersistable(state)) return;

    const write = (): void => {
      sessionRepo.current.write(state);
    };

    const timer = setTimeout(write, SESSION_WRITE_DEBOUNCE_MS);
    window.addEventListener('pagehide', write);
    document.addEventListener('visibilitychange', write);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', write);
      document.removeEventListener('visibilitychange', write);
    };
  }, [state]);

  // Record a completed game exactly once (FR-20).
  const recordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== 'won' && state.status !== 'lost') return;
    if (recordedRef.current === state.id) return;

    recordedRef.current = state.id;

    const solveMs = clampDuration((state.finishedAt ?? 0) - (state.startedAt ?? 0));
    const won = state.status === 'won';
    const guessesUsed = state.guesses.length;

    recordGame({
      id: state.id,
      playedAt: state.finishedAt ?? now(),
      wordLength: state.wordLength,
      answer: state.answer,
      guessesUsed,
      won,
      solveMs,
      score: scoreGame({ won, guessesUsed, wordLength: state.wordLength, solveMs }),
    });

    setAnnouncement(
      won
        ? `You won in ${String(guessesUsed)} ${guessesUsed === 1 ? 'guess' : 'guesses'}.`
        : `Game over. The word was ${state.answer}.`,
    );
  }, [state, recordGame]);

  const addLetter = useCallback((letter: string): void => {
    dispatch({ type: 'ADD_LETTER', letter, now: now() });
  }, []);

  const removeLetter = useCallback((): void => {
    dispatch({ type: 'REMOVE_LETTER' });
  }, []);

  /**
   * Validates then submits (ARCHITECTURE §6.1).
   *
   * Validation lives here rather than in the reducer because the engine may
   * not depend on the dictionary (ADR-003). A rejected guess raises a toast
   * and consumes no turn.
   */
  const submitGuess = useCallback((): boolean => {
    if (!dictionary || state.status !== 'playing') return false;

    const result = validateGuess(state.currentInput, state.wordLength, (word) =>
      dictionary.guesses.has(word),
    );

    if (!result.ok) {
      show(result.error === 'too-short' ? 'Not enough letters' : 'Not in word list', 'error');
      return false;
    }

    dispatch({ type: 'SUBMIT_GUESS', word: result.value, now: now() });
    return true;
  }, [dictionary, state.currentInput, state.status, state.wordLength, show]);

  const completeReveal = useCallback((): void => {
    dispatch({ type: 'REVEAL_COMPLETE', now: now() });
  }, []);

  /*
   * Announce each evaluated guess exactly once (A11Y-3).
   *
   * Keyed by game id as well as guess count: a new game resets the count to 0
   * without the reset itself suppressing the next announcement. An earlier
   * version used a second effect to clear the counter, but it depended on
   * `guesses.length` and so ran on every guess, marking each one announced
   * before the announcing effect saw it — which silently dropped every
   * announcement for screen-reader users.
   */
  const announcedRef = useRef<{ gameId: string; count: number }>({ gameId: '', count: 0 });

  useEffect(() => {
    if (state.status !== 'playing') return;

    const seen = announcedRef.current;
    const count = seen.gameId === state.id ? seen.count : 0;
    if (state.guesses.length === 0 || state.guesses.length === count) {
      announcedRef.current = { gameId: state.id, count: state.guesses.length };
      return;
    }

    announcedRef.current = { gameId: state.id, count: state.guesses.length };

    const last = state.guesses[state.guesses.length - 1];
    if (!last) return;

    const remaining = MAX_GUESSES - state.guesses.length;
    const message =
      `${last.word}: ${describeEvaluation(last.word, last.evaluation)}. ` +
      `${String(remaining)} ${remaining === 1 ? 'guess' : 'guesses'} remaining.`;

    /*
     * The live region mirrors the last evaluated guess. Deriving it during
     * render would re-announce on every unrelated re-render, so it is written
     * once, here, when the guess list grows.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setAnnouncement(message);
  }, [state.id, state.guesses, state.status]);

  const restart = useCallback((): void => {
    if (!dictionary) return;
    setAnnouncement('New game started.');
    startFreshGame(dictionary);
  }, [dictionary, startFreshGame]);

  const setWordLength = useCallback(
    (length: WordLength): void => {
      // Discard the old session immediately so a mid-load refresh cannot
      // restore a game for the length we just left.
      sessionRepo.current.clear();
      setLength(length);
      // Persist the choice so the next visit opens on it (FR-46).
      setDefaultWordLength(length);
    },
    [setDefaultWordLength],
  );

  const retryDictionary = useCallback((): void => {
    setLoadToken((token) => token + 1);
  }, []);

  const rows = useMemo(() => boardRows(state), [state]);
  const keyStates = useMemo(() => deriveKeyStates(state.guesses), [state.guesses]);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      rows,
      keyStates,
      dictionaryStatus,
      wordLength,
      isRevealing: state.status === 'revealing',
      isGameOver: isGameOver(state),
      announcement,
      addLetter,
      removeLetter,
      submitGuess,
      completeReveal,
      restart,
      setWordLength,
      retryDictionary,
    }),
    [
      state,
      rows,
      keyStates,
      dictionaryStatus,
      wordLength,
      announcement,
      addLetter,
      removeLetter,
      submitGuess,
      completeReveal,
      restart,
      setWordLength,
      retryDictionary,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
