# Wordwright — Architecture

**Scope:** V1 implementation design. Companion to [`SPEC.md`](./SPEC.md) (what) and [`DECISIONS.md`](./DECISIONS.md) (why).

---

## 1. System Overview

Wordwright is a client-only SPA with three concentric layers:

```
┌──────────────────────────────────────────────────────────┐
│  React UI            components/ · hooks/                 │
│  ─ renders state, dispatches intents, owns animation      │
├──────────────────────────────────────────────────────────┤
│  Adapters            state/ · storage/ · dictionary/      │
│  ─ providers, LocalStorage repositories, lazy word lists  │
├──────────────────────────────────────────────────────────┤
│  Engine              engine/                              │
│  ─ pure TypeScript: rules, reducer, evaluation, scoring   │
└──────────────────────────────────────────────────────────┘
```

**The dependency rule:** arrows point inward only. `engine/` imports nothing from the outer layers — no React, no DOM, no `localStorage`, no timers. This makes rules testable in milliseconds and reusable by any future host (V2 daily challenge worker, V3 server validator).

---

## 2. Folder Structure

```
wordwright/
├── docs/
│   ├── SPEC.md  ARCHITECTURE.md  TASKS.md
│   ├── CONTRIBUTING.md  ACCEPTANCE.md  DECISIONS.md
├── prompts/
│   ├── implementation.md
│   └── review.md
├── public/
│   └── favicon.svg
├── src/
│   ├── engine/
│   │   ├── types.ts               # GameState, Evaluation, LetterState, WordLength …
│   │   ├── constants.ts           # MAX_GUESSES, WORD_LENGTHS, SCORE_WEIGHTS
│   │   ├── evaluate.ts            # evaluateGuess() — the two-pass algorithm
│   │   ├── keyboardState.ts       # deriveKeyStates() with precedence merge
│   │   ├── validate.ts            # validateGuess() → Result<string, GuessError>
│   │   ├── score.ts               # scoreGame()
│   │   ├── createGame.ts          # newGame(), answer picker w/ no-repeat buffer
│   │   ├── reducer.ts             # gameReducer(state, action) — the state machine
│   │   ├── selectors.ts           # isGameOver, currentRow, remainingGuesses …
│   │   ├── random.ts              # RandomSource interface + mulberry32 PRNG
│   │   ├── index.ts               # public barrel — the engine's API surface
│   │   └── __tests__/
│   ├── dictionary/
│   │   ├── data/
│   │   │   ├── answers-4.ts  guesses-4.ts
│   │   │   ├── answers-5.ts  guesses-5.ts
│   │   │   ├── answers-6.ts  guesses-6.ts
│   │   │   └── README.md          # provenance & licensing
│   │   ├── registry.ts            # WordLength → () => Promise<RawLists>
│   │   ├── loadDictionary.ts      # cache + Set construction + error mapping
│   │   ├── types.ts               # Dictionary { answers: string[]; guesses: Set<string> }
│   │   └── __tests__/             # invariants: length, case, uniqueness, superset
│   ├── storage/
│   │   ├── keys.ts                # 'wordwright:v1:<slice>'
│   │   ├── safeStorage.ts         # availability probe + in-memory fallback
│   │   ├── createRepository.ts    # generic typed get/set/remove + validation
│   │   ├── migrations.ts          # version chain, v0 → v1 → …
│   │   ├── schemas.ts             # runtime guards for each persisted shape
│   │   ├── statsRepository.ts     # aggregate + per-length + recent games
│   │   ├── settingsRepository.ts
│   │   ├── sessionRepository.ts   # in-progress game
│   │   └── __tests__/
│   ├── state/
│   │   ├── GameProvider.tsx       # useReducer(gameReducer) + persistence effects
│   │   ├── StatsProvider.tsx
│   │   ├── SettingsProvider.tsx
│   │   ├── ToastProvider.tsx
│   │   └── contexts.ts            # context objects + typed useX() hooks
│   ├── components/
│   │   ├── layout/    AppShell.tsx  Header.tsx  ErrorBoundary.tsx
│   │   ├── board/     Board.tsx  Row.tsx  Tile.tsx  tileAppearance.ts  BoardSkeleton.tsx
│   │   ├── keyboard/  Keyboard.tsx  KeyboardRow.tsx  Key.tsx
│   │   ├── help/      HelpModal.tsx
│   │   ├── stats/     StatsModal.tsx  StatTile.tsx  GuessDistribution.tsx  RecentGames.tsx
│   │   ├── settings/  SettingsModal.tsx  ThemeSelector.tsx  ToggleRow.tsx  DangerZone.tsx
│   │   ├── game/      ResultPanel.tsx  LengthSelector.tsx  DictionaryError.tsx
│   │   └── ui/        Modal.tsx  Toast.tsx  ToastRegion.tsx  Button.tsx  Spinner.tsx  ConfirmDialog.tsx  VisuallyHidden.tsx
│   ├── hooks/
│   │   ├── usePhysicalKeyboard.ts
│   │   ├── useTheme.ts
│   │   ├── useReducedMotion.ts
│   │   ├── useFocusTrap.ts
│   │   ├── useAnnouncer.ts
│   │   ├── useRevealTimeline.ts
│   │   └── useMediaQuery.ts
│   ├── lib/
│   │   ├── clock.ts               # monotonic now()
│   │   ├── format.ts              # duration, percentage, average formatting
│   │   ├── cn.ts                  # class merge helper
│   │   └── result.ts              # Result<T, E> discriminated union
│   ├── styles/
│   │   ├── index.css              # Tailwind entry + @theme tokens
│   │   └── animations.css         # keyframes, reduced-motion overrides
│   ├── test/
│   │   ├── setup.ts               # jest-dom, matchMedia & storage mocks
│   │   ├── fixtures.ts            # deterministic dictionaries & stats
│   │   └── renderWithProviders.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── index.html
├── vite.config.ts        vitest.config.ts (or `test` block in vite config)
├── tsconfig*.json        eslint.config.js       .prettierrc.json
├── tailwind/postcss config
└── package.json
```

---

## 3. Engine Design

### 3.1 Core types

```ts
export const WORD_LENGTHS = [4, 5, 6] as const;
export type WordLength = (typeof WORD_LENGTHS)[number];

export type LetterState = 'correct' | 'present' | 'absent';
export type TileState = LetterState | 'empty' | 'filled';
export type Evaluation = readonly LetterState[];

export type GameStatus = 'idle' | 'loading' | 'playing' | 'won' | 'lost' | 'error';

export interface Guess {
  readonly word: string; // uppercase, length === wordLength
  readonly evaluation: Evaluation;
}

export interface GameState {
  readonly id: string; // uuid; idempotency key for stats
  readonly wordLength: WordLength;
  readonly answer: string;
  readonly guesses: readonly Guess[];
  readonly currentInput: string;
  readonly status: GameStatus;
  readonly startedAt: number | null; // set on first keystroke (FR-22)
  readonly finishedAt: number | null;
  readonly error: GameError | null;
}
```

### 3.2 The reducer state machine

`gameReducer(state, action): GameState` is pure, synchronous, and total — unknown actions return the same reference.

```
Actions
  START_GAME  { wordLength, answer, id, now }
  ADD_LETTER  { letter, now }        // sets startedAt if null
  REMOVE_LETTER
  SUBMIT_GUESS { now }               // validation happens in a guard, see below
  REVEAL_COMPLETE                    // unlocks input, applies won/lost
  RESTART     { answer, id }
  SET_ERROR / CLEAR_ERROR
```

Transitions:

```
idle ──START_GAME──▶ playing ──SUBMIT_GUESS──▶ playing (revealing)
                        │                          │
                        │                    REVEAL_COMPLETE
                        │                    ┌─────┴─────┐
                        ▼                    ▼           ▼
                     RESTART                won         lost
                                             └── RESTART ─┘
```

**Validation placement.** The reducer cannot import the dictionary (dependency rule) so `SUBMIT_GUESS` carries the outcome of a pure guard executed by the provider:

```ts
// engine/validate.ts — pure, dictionary injected
export function validateGuess(
  input: string,
  wordLength: WordLength,
  isAllowed: (word: string) => boolean,
): Result<string, GuessError>; // GuessError = 'too-short' | 'not-a-word'
```

The provider calls `validateGuess` with the loaded `Set.has`, dispatches `SUBMIT_GUESS` on success, or raises a toast on failure. The reducer stays dictionary-free and 100% unit-testable.

### 3.3 Evaluation

`evaluateGuess(guess, answer)` implements SPEC §6.3 exactly: a `Map<string, number>` count pool, greens first, then left-to-right yellows. O(n) time, no allocation beyond the result array. This is the most-tested function in the codebase (full truth table + property tests: result length always equals word length; a guess equal to the answer is all-correct; counts of `correct + present` for a letter never exceed its count in the answer).

### 3.4 Randomness is injected

```ts
export interface RandomSource {
  next(): number;
} // [0, 1)
export const systemRandom: RandomSource;
export function seededRandom(seed: number): RandomSource; // mulberry32
```

The engine never calls `Math.random()` directly. Tests inject a fixed sequence; **V2 seeded/daily games inject `seededRandom(dateToSeed(day))` with no engine change.**

### 3.5 No-repeat answer picking

`pickAnswer(pool, recentlyUsed, random)` filters out the recent ring buffer (`min(50, floor(pool.length / 4))` entries, persisted per length), picks uniformly from the remainder, and resets the buffer when the remainder is empty (EC-20).

---

## 4. Component Hierarchy

```
<ErrorBoundary>
  <SettingsProvider>            theme, colourblind, motion, default length
    <ToastProvider>             queue, auto-dismiss, live region
      <StatsProvider>           aggregate + per-length + recent games
        <GameProvider>          useReducer(gameReducer) + dictionary + persistence
          <AppShell>
            <Header>
              <IconButton "How to play" />
              <LengthSelector />       ← radio group, 4 / 5 / 6
              <IconButton "Statistics" />
              <IconButton "Settings" />
            <main>
              <Board>                  ← role="grid"
                <Row × 6>              ← role="row"
                  <Tile × wordLength>  ← role="gridcell"
              <BoardSkeleton />        ← while dictionary loads (FR-56)
              <DictionaryError />      ← EC-14, with Retry
              <ResultPanel />          ← after REVEAL_COMPLETE on won/lost
            <Keyboard>
              <KeyboardRow × 3><Key /></KeyboardRow>
            <ToastRegion />            ← portal, top-centre
            <HelpModal />              ← portal, focus-trapped
            <StatsModal />             ← portal, focus-trapped
            <SettingsModal />          ← portal, focus-trapped
```

**Provider order matters:** Settings is outermost (theme must apply before anything paints), Toast next (everything can raise toasts), Stats before Game (the game writes results into stats on completion).

Components are presentational by default; only providers and a thin set of container components hold logic. `Tile`, `Key`, `Row`, `StatTile` are `React.memo`'d pure functions of their props.

---

## 5. State Management

| Slice            | Owner                                    | Persisted             | Shape                             |
| ---------------- | ---------------------------------------- | --------------------- | --------------------------------- |
| Active game      | `GameProvider` (`useReducer`)            | Yes, debounced 150 ms | `GameState`                       |
| Dictionary       | `GameProvider` (ref + `useState` status) | No (bundled)          | `Dictionary`                      |
| Statistics       | `StatsProvider` (`useReducer`)           | Yes, immediate        | `StatsState`                      |
| Settings         | `SettingsProvider` (`useState`)          | Yes, immediate        | `Settings`                        |
| Toasts           | `ToastProvider` (`useReducer`)           | No                    | `Toast[]`                         |
| Reveal animation | `useRevealTimeline` (local)              | No                    | `{ revealingRow, revealedTiles }` |
| Modal open/close | `AppShell` local state                   | No                    | booleans                          |

**Why Context + `useReducer` and not Redux/Zustand/Jotai:** four independent slices, shallow trees, no cross-cutting async. Contexts are split by slice so a toast never re-renders the board. Every context value is `useMemo`'d and every callback `useCallback`'d. If profiling ever shows a problem, `useSyncExternalStore` over a tiny store is a drop-in — but do not pre-optimise (see ADR-006).

**Ephemeral vs persistent:** animation, focus, and modal state never touch storage. Only game session, stats, and settings persist.

---

## 6. Data Flow

### 6.1 A guess, end to end

```
User presses Enter (physical or on-screen)
      │
      ▼
usePhysicalKeyboard / <Key onClick>  →  useGame().submitGuess()
      │
      ▼
GameProvider guard:
   validateGuess(input, wordLength, dictionary.guesses.has)
      │                                   │
   Err('too-short'|'not-a-word')      Ok(word)
      │                                   │
   toast + shake                     dispatch SUBMIT_GUESS { now }
   (no turn consumed)                     │
                                          ▼
                             reducer: evaluateGuess() → append Guess,
                             clear input, set status, lock input
                                          │
                                          ▼
                    Board re-renders → useRevealTimeline staggers tiles
                    (250 ms apart; instant if reduced motion)
                                          │
                                          ▼
                    onComplete → dispatch REVEAL_COMPLETE
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    still playing       won             lost
                                          │               │
                                          └──── StatsProvider.recordGame(record)
                                                (idempotent by game id, FR-20)
                                                          │
                                                statsRepository.save()  → LocalStorage
                                                announcer.announce(result)  → aria-live
```

### 6.2 Keyboard letter states

Derived, never stored: `deriveKeyStates(guesses)` folds every evaluation into a `Map<string, LetterState>` using precedence `correct > present > absent`. Memoised on `guesses`. No possibility of drift between board and keyboard.

### 6.3 Startup

```
main.tsx → App
  1. SettingsProvider reads settings (sync, before first paint via a small
     inline script that sets the `dark` class to avoid a flash)
  2. StatsProvider reads + migrates stats
  3. GameProvider reads the saved session
       ├─ valid session → status 'loading' → load that length's dictionary
       │     → validate answer still exists → status 'playing' (restored)
       └─ none/invalid → load default-length dictionary → START_GAME
  4. Dictionary chunk resolves → Set built → board interactive
```

---

## 7. LocalStorage Strategy

### 7.1 Keys and versioning

```
wordwright:v1:settings   Settings
wordwright:v1:stats      StatsState  (aggregate + perLength + recentGames)
wordwright:v1:session    GameState   (in-progress)
wordwright:v1:meta       { schemaVersion: number, recentAnswers: Record<WordLength, string[]> }
```

One namespace prefix, one slice per key. Slices are independent so a corrupt session never destroys stats.

### 7.2 The repository pattern

Components never touch `localStorage`. A single generic factory provides typed access:

```ts
interface Repository<T> {
  read(): T;                  // always returns valid data (falls back to defaults)
  write(value: T): void;      // best-effort; swallows quota errors into a warning
  clear(): void;
  subscribe(fn: (value: T) => void): () => void;   // cross-tab `storage` events (EC-16)
}

createRepository<T>({ key, defaults, validate, migrate }): Repository<T>
```

`read()` pipeline: `getItem` → `JSON.parse` (guarded) → `migrate(raw)` → `validate(candidate)` → value, **or** defaults + a `corrupt-data` warning toast on any failure (EC-12).

### 7.3 Storage availability

`safeStorage.ts` probes with a write/read/delete of a sentinel key inside `try/catch`. If it throws (Safari private mode, disabled cookies, quota 0), it exports an in-memory `Map`-backed implementation with the same interface and flags `isPersistent = false`, which drives the one-time warning of EC-11. The rest of the app is unaware.

### 7.4 Migrations

```ts
type Migration = (data: unknown) => unknown;
const migrations: Record<number, Migration> = {/* 1: v0→v1, … */};
```

`meta.schemaVersion` drives the chain: run each migration from the stored version up to `CURRENT_SCHEMA_VERSION`. A stored version **newer** than the app's resets to defaults with a toast (EC-13). V1 ships version 1 and an empty chain, but the machinery exists so V2 can add fields without data loss.

### 7.5 Write policy

- Settings & stats: write immediately (rare, small, must not be lost).
- Session: debounced 150 ms, plus a flush on `visibilitychange`/`pagehide` (mobile-safe; `beforeunload` is unreliable on iOS).
- Serialisation is whole-slice; no partial writes (FR-42).

---

## 8. Dictionary Loading

### 8.1 Shape

```ts
// dictionary/registry.ts
export const DICTIONARY_REGISTRY: Record<WordLength, () => Promise<RawLists>> = {
  4: () => import('./data/lists-4'),
  5: () => import('./data/lists-5'),
  6: () => import('./data/lists-6'),
};
```

Each data module exports `answers: string[]` and `guesses: string[]` as plain TS arrays. Vite code-splits each into its own chunk, so a 5-letter player never downloads the 6-letter list. Everything is bundled at build time — **no `fetch`, no runtime network** (NFR-5). Dynamic `import()` of a bundled chunk is served from the same origin's already-cached assets and works offline after first load.

### 8.2 Loader

```ts
export async function loadDictionary(length: WordLength): Promise<Dictionary>;
```

- In-memory `Map<WordLength, Dictionary>` cache; a second call is synchronous-fast and never re-imports.
- An in-flight `Map<WordLength, Promise>` deduplicates concurrent requests (React 19 StrictMode double-effect safety).
- Builds `guesses` as a `Set<string>` once (FR-17, O(1) validation).
- Rejects with a typed `DictionaryLoadError`, surfaced as EC-14's retry panel.

### 8.3 Data invariants (enforced by tests, FR-27)

For every list: uppercase, `/^[A-Z]+$/`, exact length, no duplicates, sorted, `answers ⊆ guesses`, `answers.length ≥ 300`, `guesses.length ≥ 1500`.

---

## 9. Styling & Theming

- Tailwind utility classes in components; **no CSS-in-JS**, no styled-components.
- Semantic design tokens as CSS custom properties in `styles/index.css`, consumed by Tailwind:
  `--color-tile-correct`, `--color-tile-present`, `--color-tile-absent`, `--color-key-*`, `--color-surface`, `--color-text`, `--color-focus`.
- **Dark mode:** `dark` class on `<html>`, toggled by `useTheme`; `system` subscribes to a `matchMedia` listener (FR-43, EC-17). An inline script in `index.html` sets the class before hydration to prevent a flash of the wrong theme.
- **Colourblind mode:** `data-palette="cb"` on `<html>` re-points the same tokens to blue/orange. Because every component uses tokens, no component knows the palette exists — that is the extension point for V2 themes (ADR-008).
- **Motion:** `data-motion="reduced"` on `<html>` plus a `@media (prefers-reduced-motion: reduce)` block; both zero out durations in `animations.css`. The `useRevealTimeline` hook also collapses its stagger to 0 so logic and CSS agree (A11Y-9).
- Layout uses flex column with `min-h-dvh`, `clamp()`-sized tiles, and container-driven sizing so 320 px and landscape phones both fit (FR-59, EC-18).
- The help dialog's example tiles (FR-60) reuse the board's own token classes and colourblind marker glyphs, exported from `board/tileAppearance.ts`, rather than a fixed `clamp()` size — so no new colour token exists and `scripts/check-contrast.mjs` needed no change.

---

## 10. Accessibility Implementation

| Concern              | Mechanism                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Board semantics      | `role="grid"` / `role="row"` / `role="gridcell"`, `aria-label` per tile including state (A11Y-2)                                              |
| Result announcements | `useAnnouncer` writes to a polite live region; the message is composed after reveal so it is announced once (A11Y-3)                          |
| Errors               | Separate assertive live region inside `ToastRegion` (A11Y-4)                                                                                  |
| Focus trap           | `useFocusTrap` — first focusable on open, cycle on Tab, `Esc` to close, restore to trigger (FR-57, A11Y-11)                                   |
| Focus ring           | Global `:focus-visible` ring using `--color-focus`; `outline: none` is never used without a replacement (A11Y-6)                              |
| Keys                 | Real `<button>`s with `aria-label` + `aria-pressed`-free state text (A11Y-10)                                                                 |
| Physical keyboard    | A single window listener that ignores events when `event.metaKey/ctrlKey/altKey` (EC-4) or when a modal is open (EC-7)                        |
| Landmarks            | `header` / `main` / `footer`, one `h1` (A11Y-12)                                                                                              |
| Help examples        | Decorative tiles are `aria-hidden`; the sentence beneath carries the meaning, so no `gridcell` appears outside the board's own grid (A11Y-13) |

---

## 11. Testing Strategy

### Pyramid

| Layer       | Tool                 | Scope                                         | Target                             |
| ----------- | -------------------- | --------------------------------------------- | ---------------------------------- |
| Unit        | Vitest (node env)    | `engine/`, `lib/`, `storage/` pure parts      | **100% branches in engine**        |
| Data        | Vitest               | dictionary invariants                         | all lists                          |
| Component   | Vitest + RTL (jsdom) | Tile, Key, Board, Keyboard, modals            | behaviour, not markup              |
| Integration | Vitest + RTL         | full flows via `renderWithProviders`          | win, loss, restart, restore, reset |
| Manual      | Checklist            | Lighthouse, axe, real devices, screen readers | [`ACCEPTANCE.md`](./ACCEPTANCE.md) |

### Rules

1. **Engine first.** No UI work begins until the engine is green (TASKS Phase 2).
2. **Test behaviour through the DOM the user sees** — query by role/label, never by class or test id unless there is no accessible alternative.
3. **Determinism:** inject `seededRandom`, use fake timers for reveal/toast timing, use fixture dictionaries (≈20 words) in component tests — never the real lists.
4. **Storage tests** run against a mocked `localStorage` and must cover: happy path, corrupt JSON, wrong shape, quota throw, unavailable storage, migration chain.
5. **Accessibility assertions live in the component tests** (`getByRole`, `toHaveAccessibleName`), so a11y regressions fail CI rather than waiting for a manual audit.
6. No snapshot tests of whole components; they encode markup, not behaviour.

---

## 12. Extension Points (how V2/V3 land without a rewrite)

| Future feature                    | Seam that already exists                                                | Work required                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Daily challenge**               | `RandomSource` injection + `pickAnswer`                                 | Inject `seededRandom(dateSeed)`; add a `mode` field to `GameState`; new provider prop. No engine rules change.  |
| **Seeded / shareable games**      | Same PRNG, URL parse in `main.tsx`                                      | Read `?seed=` → seeded source.                                                                                  |
| **Hard mode**                     | Validation is an injected predicate                                     | Add a `hardModeRule(previousGuesses)` composed into `validateGuess`. Reducer untouched.                         |
| **Timed / survival modes**        | `startedAt`/`finishedAt` + monotonic `clock.ts`                         | New provider wrapping the same reducer; add statuses to the `GameStatus` union.                                 |
| **New word length (e.g. 7)**      | `WORD_LENGTHS` const + registry map                                     | Add two data modules + one registry entry + widen the tuple + one `HELP_EXAMPLES` entry, type-enforced (FR-29). |
| **Per-length analytics / charts** | `stats.perLength` is already recorded (FR-36)                           | Pure presentation layer.                                                                                        |
| **Calendar heatmap / trends**     | `recentGames` carries `playedAt`                                        | Increase the retention cap; add a chart component.                                                              |
| **Achievements**                  | Game completion is a single funnel (`recordGame`)                       | Subscribe an achievements evaluator to that call.                                                               |
| **Sound effects**                 | Reveal/keypress already emit discrete events via the timeline hook      | Add an audio adapter listening to those events.                                                                 |
| **Themes**                        | Everything is a design token                                            | Add token sets keyed by `data-theme`.                                                                           |
| **PWA**                           | No runtime network, all assets static                                   | Add `vite-plugin-pwa` + manifest + icons. Zero app-code change.                                                 |
| **Cloud sync (V3)**               | Repository interface                                                    | Implement a remote `Repository<T>` with the same contract; swap at the provider.                                |
| **i18n (V3)**                     | Dictionary registry is keyed data; UI strings centralised in one module | Key the registry by `locale + length`; add a string catalogue.                                                  |

**Anti-goal:** none of these get abstract base classes, plugin systems, or config flags in V1. The seams above are ordinary function parameters and data maps — the cheapest possible form of flexibility (ADR-005).

---

## 13. Performance Notes

- `React.memo` on `Tile` and `Key`; both take primitive props only.
- `deriveKeyStates` and board row slices are `useMemo`'d on `guesses`.
- Contexts are split per slice to bound re-render fan-out.
- Animations use `transform`/`opacity` only (compositor-friendly, no layout thrash).
- Dictionary chunks are lazy and cached; the 6-letter list never loads for a 4-letter player.
- Bundle budget NFR-1 checked with `vite build --report` / `rollup-plugin-visualizer` at the polish phase.
