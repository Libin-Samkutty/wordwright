# Wordwright — Product Requirements Document (SPEC)

**Version:** 1.0 · **Scope:** V1 (MVP) · **Status:** Approved contract for implementation

This is the single source of truth for _what_ Wordwright V1 does. Anything not stated here is out of scope. Requirements are identified (`FR-x`, `NFR-x`, `A11Y-x`, `EC-x`, `AC-x`) so tests, tasks, and reviews can cite them.

---

## 1. Vision

A word-guessing game that feels as polished as the commercial original, but is entirely self-contained: it loads once, works forever offline, respects the player's device preferences, and keeps their history private on their own machine. Variable word length (4/5/6) is the differentiator — the same crisp loop at three difficulty flavours.

## 2. Goals

| #   | Goal                                               | Measure                                                              |
| --- | -------------------------------------------------- | -------------------------------------------------------------------- |
| G1  | Faithful Wordle rules, including duplicate letters | Engine passes the full evaluation truth table (§6.3)                 |
| G2  | Three word lengths, one shared engine              | Adding a 7-letter mode requires only data + one registry entry       |
| G3  | Fully playable offline                             | App functions with network disabled after first load                 |
| G4  | Production polish                                  | Animations, loading states, error handling, no dead ends             |
| G5  | Accessible to keyboard and screen-reader users     | A11Y-1…A11Y-9 satisfied; axe reports zero serious/critical issues    |
| G6  | Trustworthy statistics                             | Stats survive refresh, migrate across schema versions, never corrupt |
| G7  | Maintainable                                       | `npm run verify` green; engine coverage 100% branches                |

## 3. Non-Goals (V1)

Explicitly **not** built:

- Any server, API, database, account, or sync
- Daily challenge, hard mode, timed/survival/practice modes, seeded or custom games, share links
- Sound effects, confetti, achievements, alternate themes beyond light/dark/system
- PWA install / service worker / offline caching layer
- Charts, heatmaps, or trend visualisations (raw stats only)
- Localisation, non-English dictionaries, user-supplied word lists
- Analytics, telemetry, cookies, third-party scripts
- Mobile native apps

Rationale in [`DECISIONS.md`](./DECISIONS.md).

## 4. Personas & User Stories

**P1 — Casual player.** Wants a quick game on a phone, one-handed.
**P2 — Daily habit player.** Cares about streaks and stats.
**P3 — Keyboard/AT user.** Plays without a mouse, may use a screen reader.

| ID    | Story                                                                                                  | Priority |
| ----- | ------------------------------------------------------------------------------------------------------ | -------- |
| US-1  | As a player, I can start a game and guess words so I can play Wordle.                                  | Must     |
| US-2  | As a player, I can choose 4, 5, or 6 letters so I can vary difficulty.                                 | Must     |
| US-3  | As a player, I see colour feedback per letter so I can deduce the answer.                              | Must     |
| US-4  | As a player, I am told when my guess isn't a real word so I don't waste a turn.                        | Must     |
| US-5  | As a player, I can play again immediately after a win or loss.                                         | Must     |
| US-6  | As a player, I can restart mid-game if I want a fresh word.                                            | Must     |
| US-7  | As a player, I can see the answer after losing so the game feels resolved.                             | Must     |
| US-8  | As a returning player, my in-progress game survives an accidental refresh.                             | Must     |
| US-9  | As a habit player, I can view detailed statistics including streaks and distribution.                  | Must     |
| US-10 | As a habit player, I can see a log of my recent games.                                                 | Should   |
| US-11 | As a player, I can choose light, dark, or system theme.                                                | Must     |
| US-12 | As a player, I can reset my statistics and history.                                                    | Must     |
| US-13 | As a colourblind player, I can enable a high-distinction palette.                                      | Must     |
| US-14 | As a keyboard user, I can reach and operate every control without a mouse.                             | Must     |
| US-15 | As a screen-reader user, I hear my guess results announced.                                            | Must     |
| US-16 | As a motion-sensitive player, animations are reduced or removed.                                       | Must     |
| US-17 | As a player on a plane, everything works with no connection.                                           | Must     |
| US-18 | As a player, I see a clear message if something goes wrong instead of a blank screen.                  | Must     |
| US-19 | As a new player, I can learn the rules inside the game so I can start playing without looking them up. | Must     |

## 5. Glossary

- **Answer** — the secret word for the current game.
- **Answer list** — curated, common, solvable words; the pool answers are drawn from.
- **Guess list** — the superset of words accepted as valid input (includes the answer list).
- **Guess** — a submitted word of exactly `wordLength` letters.
- **Evaluation** — array of `correct | present | absent`, one per letter of a guess.
- **Row** — one of 6 guess slots. **Tile** — one letter cell in a row.
- **Key state** — best-known evaluation for a letter on the on-screen keyboard.
- **Completed game** — a game that reached `won` or `lost`. Only completed games affect statistics.

---

## 6. Gameplay Rules

### 6.1 Setup

- **FR-1** Word length is 4, 5, or 6; default 5.
- **FR-2** Every game allows exactly **6 guesses**, regardless of word length.
- **FR-3** The answer is chosen uniformly at random from the answer list for the active length.
- **FR-4** Answers do not repeat until the pool for that length is exhausted (a "recently used" ring buffer of `min(50, floor(pool/4))` words is skipped); when exhausted the buffer resets.
- **FR-5** Games are unlimited; a new game can be started at any time.

### 6.2 Input

- **FR-6** Accepted input is A–Z only, case-insensitive, normalised to uppercase.
- **FR-7** Typing appends a letter to the current row until it holds `wordLength` letters; further letters are ignored (no error).
- **FR-8** Backspace/Delete removes the last letter of the current row.
- **FR-9** Enter submits the current row.
- **FR-10** Input is accepted from the physical keyboard and the on-screen keyboard; both drive the same state.
- **FR-11** Input is blocked while a reveal animation is playing, while the dictionary is loading, and after the game ends.

### 6.3 Evaluation (the critical algorithm)

Two-pass, count-based:

```
evaluate(guess, answer):
  result = ['absent'] * n
  pool   = multiset of answer letters

  # Pass 1 — exact matches consume their letter first
  for i in 0..n-1:
    if guess[i] == answer[i]:
      result[i] = 'correct'
      pool.remove(guess[i])

  # Pass 2 — present only while unconsumed copies remain, left to right
  for i in 0..n-1:
    if result[i] != 'correct' and pool.contains(guess[i]):
      result[i] = 'present'
      pool.remove(guess[i])

  return result
```

- **FR-12** Greens are assigned before yellows. A letter is yellow only if an unmatched copy remains in the answer.
- **FR-13** Surplus copies of a letter are grey, and yellows are assigned **left to right**.

**Truth table (must be covered by tests):**

| Answer      | Guess   | Expected     |
| ----------- | ------- | ------------ |
| `CRANE`     | `CRANE` | G G G G G    |
| `CRANE`     | `SLOTH` | ⬛⬛⬛⬛⬛   |
| `ABBEY`     | `BABES` | Y Y G G ⬛   |
| `ALLOY`     | `LULLS` | Y ⬛ G ⬛ ⬛ |
| `SPEED`     | `ERASE` | Y ⬛ ⬛ Y Y  |
| `SPEED`     | `EEEEE` | ⬛ ⬛ G G ⬛ |
| `GEESE`     | `EEEEE` | ⬛ G G ⬛ G  |
| `BOOKS`     | `OOZES` | Y G ⬛ ⬛ G  |
| `LOLLY` (5) | `LILLY` | G ⬛ G G G   |
| `MAMA` (4)  | `AMMA`  | Y Y G G      |

_Worked example — `ALLOY` / `LULLS`: index 2 is an exact `L` (green, consumes one of the answer's two `L`s). Pass 2 walks left to right: index 0 `L` takes the one remaining unmatched `L` → yellow; index 3 `L` finds none left → grey; `U` and `S` are absent → `[present, absent, correct, absent, absent]`. Tests must assert the exact array, not prose._

### 6.4 Validation

- **FR-14** Submitting fewer than `wordLength` letters → error toast `"Not enough letters"`, row shakes, no turn consumed.
- **FR-15** Submitting a word absent from the guess list → toast `"Not in word list"`, row shakes, no turn consumed.
- **FR-16** Repeated guesses are permitted (matches the original game); no warning, turn is consumed.
- **FR-17** Validation is a case-insensitive lookup in an O(1) `Set` built once per length.

### 6.5 Win / Loss

- **FR-18** Win when a submitted guess equals the answer → status `won`, reveal, then a result banner after the flip completes.
- **FR-19** Loss after 6 non-matching guesses → status `lost`, result banner reveals the answer in plain text.
- **FR-20** On completion the game record is written to statistics exactly once (idempotent by game id).
- **FR-21** The result panel offers **Play again** (same length) and **Change length**.
- **FR-22** Solve time is measured from the first keystroke of the game to submission of the winning guess, in milliseconds, using a monotonic clock (`performance.now()` offset from `Date.now()` at mount).

### 6.6 Scoring

- **FR-23** Score for a completed game:

```
if lost:  score = 0
else:
  base        = (7 - guessesUsed) * 100          # 600 for a 1-guess win … 100 for a 6-guess win
  lengthMult  = { 4: 1.0, 5: 1.2, 6: 1.5 }[wordLength]
  speedBonus  = max(0, 120 - floor(solveMs / 1000)) * 2   # 0…240, wall-clock seconds
  score       = round(base * lengthMult) + speedBonus
```

- **FR-24** Total score is the sum of all completed-game scores. Abandoned/restarted games score nothing and are not recorded.

---

## 7. Functional Requirements by Area

### 7.1 Dictionary

- **FR-25** Two lists per word length, bundled in the app: `answers-<n>` (curated, common) and `guesses-<n>` (large, permissive).
- **FR-26** The guess list is a superset of the answer list; a build-time/test assertion enforces this.
- **FR-27** All entries are uppercase A–Z, exactly `n` characters, unique, and sorted. A test asserts these invariants for every list.
- **FR-28** Lists are loaded per length through dynamic `import()` so each length is a separate chunk; loaded chunks are cached in memory for the session.
- **FR-29** Adding a new length requires: add two data modules, add one entry to the dictionary registry, extend the `WordLength` union, plus one `HELP_EXAMPLES` entry (FR-60) — the `Record<WordLength, …>` type makes that last one a compile error until it is added, rather than a silently blank dialog.
- **FR-30** Minimum sizes: answers ≥ 300, guesses ≥ 1500 per length (real English words only).
- **FR-31** No profanity or slurs in the answer list.

### 7.2 Game session

- **FR-32** The in-progress game (answer, guesses, evaluations, start time, length) is persisted to LocalStorage after every state change and restored on load.
- **FR-33** A restored game with a schema/length mismatch, or whose answer is no longer in the list, is discarded silently and a fresh game starts.
- **FR-34** Restarting or switching length abandons the current game with no statistical effect. If ≥1 guess has been made, a confirmation dialog is shown first.

### 7.3 Statistics

- **FR-35** Persisted aggregate metrics: games played, games won, current streak, best streak, guess distribution (buckets 1–6), total guesses (for averaging), total score, total solve time, fastest solve, plus the derived-on-read win %, average guesses, average solve time.
- **FR-36** The same bucket of metrics is also maintained **per word length** (used by the UI's length filter and by V2 analytics).
- **FR-37** Current streak increments on a win and resets to 0 on a loss; best streak is the max ever observed. Streaks are counted across all lengths.
- **FR-38** Average guesses counts **wins only** (`totalGuessesInWins / gamesWon`), displayed to one decimal; `—` when `gamesWon == 0`.
- **FR-39** Recent games: last 50 completed games, newest first, each storing `{ id, playedAt, wordLength, answer, guessesUsed, won, solveMs, score }`.
- **FR-40** The statistics panel shows the guess distribution as horizontal bars with the current game's row highlighted.
- **FR-41** Empty state: with 0 games played, the panel shows a friendly "No games yet" message rather than zeros and `NaN`.
- **FR-42** Stats are written atomically: read → transform → serialise → write; a failed write must never leave a partial record.

### 7.4 Settings

- **FR-43** Theme: `light | dark | system` (default `system`), applied by toggling a `dark` class on `<html>`; `system` subscribes to `prefers-color-scheme` changes live.
- **FR-44** Colourblind mode: boolean (default off) swapping green/yellow for a blue/orange palette with distinct tile glyph markers.
- **FR-45** Motion: `system | reduced | full` (default `system`, honouring `prefers-reduced-motion`).
- **FR-46** Default word length preference persists and is used for the next new game.
- **FR-47** **Reset statistics** clears aggregate + per-length metrics and the distribution. **Reset history** clears the recent-games log only. Both require a confirmation dialog naming exactly what will be deleted, and both are irreversible.
- **FR-48** Settings changes apply immediately, with no page reload, and persist.

### 7.5 UI behaviour

- **FR-49** Layout: header (title, help button, length selector, stats button, settings button) → board → keyboard. Vertically centred, board scales to available space.
- **FR-50** The board renders 6 rows × `wordLength` tiles at all times, including empty rows.
- **FR-51** Tile states: `empty`, `filled` (letter typed, pre-submission — border emphasis, pop animation), `correct`, `present`, `absent`.
- **FR-52** Flip reveal: each tile flips sequentially with a 250 ms stagger, 500 ms per flip; colour applies at the midpoint. Input is locked until the row finishes.
- **FR-53** Keyboard keys adopt the best state seen so far, precedence `correct > present > absent`; a key never downgrades.
- **FR-54** Keys animate on press (physical or pointer) and transition colour after the row reveal completes.
- **FR-55** Toasts appear top-centre, stack up to 3, auto-dismiss after 2 s (errors 3 s), are dismissible, and never block input.
- **FR-56** Loading state: while a dictionary chunk loads, the board area shows a skeleton/spinner with accessible text `"Loading dictionary…"`; input is disabled.
- **FR-57** Modals (stats, settings, confirmations) trap focus, close on `Esc` and backdrop click, and restore focus to the invoking control.
- **FR-58** All interactive targets are ≥ 44 × 44 CSS px on touch viewports.
- **FR-59** The app renders correctly from 320 px to 2560 px wide, and in landscape on short viewports (≤ 480 px tall) without the keyboard being cut off.
- **FR-60** A **How to play** dialog, opened from a header control, states the guess count and the active word length from the engine constants and shows three worked tile examples (correct, present, absent), each with a plain-language sentence. Example words follow the selected length. The dialog is never opened by the app itself (ADR-020).

---

## 8. Non-Functional Requirements

| ID     | Requirement                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| NFR-1  | Initial JS payload ≤ 200 KB gzipped, excluding lazily loaded dictionary chunks.                                             |
| NFR-2  | Time to interactive < 1.5 s on a mid-tier mobile device (Lighthouse mobile throttling).                                     |
| NFR-3  | Guess evaluation + render < 16 ms; typing never drops a frame.                                                              |
| NFR-4  | Lighthouse: Performance ≥ 95, Accessibility 100, Best Practices ≥ 95, SEO ≥ 90.                                             |
| NFR-5  | Zero network requests after first load (verified in DevTools with the app running).                                         |
| NFR-6  | Zero console errors or warnings during a full play session.                                                                 |
| NFR-7  | TypeScript `strict` with no `any`, no non-null assertions in `src/**` (test fixtures excepted).                             |
| NFR-8  | Test coverage: 100% branches in `src/engine/**`; ≥ 85% statements overall.                                                  |
| NFR-9  | Supported browsers: last 2 versions of Chrome, Firefox, Safari, Edge; iOS Safari 16+.                                       |
| NFR-10 | No runtime dependency beyond React, React DOM, and (dev) tooling.                                                           |
| NFR-11 | All state mutations flow through the engine reducer or a storage repository — no ad-hoc `localStorage` calls in components. |
| NFR-12 | The app must not crash on corrupted LocalStorage; it degrades to defaults.                                                  |

---

## 9. Accessibility Requirements

| ID      | Requirement                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A11Y-1  | Every action is reachable and operable by keyboard alone; logical tab order; no keyboard traps outside intentional modal traps.                                                                     |
| A11Y-2  | Board is `role="grid"` with `role="row"`/`role="gridcell"` children; each tile exposes `aria-label` like `"Row 2, letter 3: A, correct position"`.                                                  |
| A11Y-3  | A polite `aria-live` region announces each evaluated guess in words (e.g. `"CRANE: C correct, R absent, A present, N absent, E correct. 4 guesses remaining."`).                                    |
| A11Y-4  | Errors are announced via an assertive live region as well as visually.                                                                                                                              |
| A11Y-5  | Game end is announced (`"You won in 4 guesses"` / `"Game over, the word was CRANE"`).                                                                                                               |
| A11Y-6  | Visible focus indicator on all focusable elements, ≥ 3:1 contrast against adjacent colours, never removed.                                                                                          |
| A11Y-7  | Text and UI contrast meets WCAG 2.1 AA (4.5:1 text, 3:1 large text/UI). Tile text on all five states verified.                                                                                      |
| A11Y-8  | Colour is never the only signal: colourblind mode plus optional tile markers; state is always in the `aria-label`.                                                                                  |
| A11Y-9  | `prefers-reduced-motion: reduce` (or the reduced setting) removes flips, shakes, bounces, and confetti-like motion; transitions become instant colour swaps.                                        |
| A11Y-10 | On-screen keyboard keys are real `<button>`s with `aria-label`s (`"Backspace"`, `"Enter"`, letter + state).                                                                                         |
| A11Y-11 | Modals use `role="dialog" aria-modal="true"` with a labelled heading.                                                                                                                               |
| A11Y-12 | The page has a sensible `<title>`, one `<h1>`, and landmark regions (`header`, `main`, `footer`).                                                                                                   |
| A11Y-13 | Help examples are decorative: the tiles are hidden from assistive technology and the meaning is carried by the sentence beneath, so no orphan `gridcell` semantics appear outside the board's grid. |

---

## 10. Edge Cases

| ID    | Case                                                       | Expected behaviour                                                                                                   |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| EC-1  | Duplicate letters in guess and/or answer                   | Per §6.3 algorithm; verified by truth table                                                                          |
| EC-2  | Enter with an empty or partial row                         | `"Not enough letters"`, shake, no turn used                                                                          |
| EC-3  | Non-alphabetic keys (digits, symbols, arrows, F-keys)      | Ignored, no toast                                                                                                    |
| EC-4  | Modifier combos (`Ctrl+R`, `Cmd+C`, `Alt+Tab`)             | Never intercepted; browser behaviour preserved                                                                       |
| EC-5  | Key repeat from a held key                                 | Treated as normal input, capped by row length                                                                        |
| EC-6  | Paste into the page                                        | Ignored in V1 (no text input element to paste into)                                                                  |
| EC-7  | Typing while a modal is open                               | Goes to the modal, not the board                                                                                     |
| EC-8  | Typing during reveal animation                             | Buffered? No — ignored, to keep state predictable                                                                    |
| EC-9  | Refresh mid-game                                           | Game restored exactly, including elapsed time baseline                                                               |
| EC-10 | Refresh mid-reveal                                         | Restored with the last submitted row already fully revealed                                                          |
| EC-11 | LocalStorage unavailable (Safari private mode, quota)      | App runs on an in-memory fallback; one warning toast: `"Progress can't be saved in this browser mode"`               |
| EC-12 | Corrupted / hand-edited LocalStorage JSON                  | Discarded, defaults used, one warning toast; app never crashes                                                       |
| EC-13 | Stats schema from an older version                         | Migrated by the migration chain; unknown newer version → reset to defaults with a toast                              |
| EC-14 | Dictionary chunk fails to load                             | Error state with a **Retry** button; the game does not start until it succeeds                                       |
| EC-15 | Word length changed mid-game with guesses made             | Confirmation dialog; on confirm the game is abandoned (no stats effect)                                              |
| EC-16 | Two tabs open on the same origin                           | Last write wins; a `storage` event refreshes settings and stats in the other tab; the in-progress game is not synced |
| EC-17 | System theme changes while the app is open (`system` mode) | Theme updates live                                                                                                   |
| EC-18 | Very narrow (320 px) or short (landscape phone) viewport   | Board and keyboard both remain fully visible; tiles shrink, no horizontal scroll                                     |
| EC-19 | Extremely long session / clock change                      | Solve time uses a monotonic clock; never negative, capped and flagged if > 24 h                                      |
| EC-20 | Answer pool exhausted by the no-repeat rule                | Ring buffer resets; play continues                                                                                   |
| EC-21 | A rendering error inside the app                           | Error boundary shows a recovery screen with **Reload** and **Reset data**                                            |

---

## 11. Error Handling

| Condition               | Surface                          | Message                                            | Recovery                    |
| ----------------------- | -------------------------------- | -------------------------------------------------- | --------------------------- |
| Short guess             | Toast (assertive)                | `Not enough letters`                               | Keep typing                 |
| Unknown word            | Toast (assertive)                | `Not in word list`                                 | Try another word            |
| Dictionary load failure | Inline panel                     | `Couldn't load the word list.`                     | **Retry** button            |
| Storage unavailable     | Toast (polite, once per session) | `Progress can't be saved in this browser mode`     | Continue in memory          |
| Corrupt saved data      | Toast (polite)                   | `Saved data was reset because it couldn't be read` | Continue with defaults      |
| Unexpected render error | Full-screen error boundary       | `Something went wrong` + digest                    | **Reload** / **Reset data** |

Principles: never a raw stack trace in the UI; never a silent failure; every error has a next action; errors are announced to assistive tech.

---

## 12. Acceptance Criteria (Given / When / Then)

- **AC-1** Given a 5-letter game, when I submit a valid 5-letter word, then each tile flips in sequence and shows the correct state per §6.3.
- **AC-2** Given the answer `ABBEY`, when I guess `BABES`, then the evaluation is exactly `[present, present, correct, correct, absent]`.
- **AC-3** Given a 4-letter word, when I type a 5th letter, then nothing happens and no error appears.
- **AC-4** Given a partial row, when I press Enter, then I see `Not enough letters`, the row shakes, and my remaining guesses are unchanged.
- **AC-5** Given the word `ZZZZZ` is not in the guess list, when I submit it, then I see `Not in word list` and no turn is consumed.
- **AC-6** Given I guess the answer on turn 3, then the game ends as won, the result panel shows my score and time, and stats record a 3-guess win exactly once.
- **AC-7** Given I use all 6 guesses without success, then the game ends as lost, the answer is displayed, and my current streak becomes 0.
- **AC-8** Given a completed game, when I press **Play again**, then a new answer is chosen (different from the previous one) and the board resets.
- **AC-9** Given an in-progress game with 2 guesses, when I reload the page, then the same board, answer, and elapsed-time baseline are restored.
- **AC-10** Given I switch from 5 to 6 letters mid-game, then I am asked to confirm, and on confirm a fresh 6-letter game starts with no stats change.
- **AC-11** Given 10 completed games, when I open statistics, then played/won/win %/streaks/average guesses/distribution/total score/average & fastest solve all match a hand-computed expectation.
- **AC-12** Given I reset statistics, when I confirm, then all metrics return to zero and the empty state is shown; settings are untouched.
- **AC-13** Given theme `system` and OS dark mode, then the app renders dark; toggling the OS setting updates it live without reload.
- **AC-14** Given colourblind mode on, then correct/present tiles use the blue/orange palette and carry distinct markers, verified at AA contrast.
- **AC-15** Given `prefers-reduced-motion: reduce`, then no flip, shake, or bounce animation runs; results appear instantly.
- **AC-16** Given a screen reader, when a guess is evaluated, then the result and remaining guesses are announced once, in order.
- **AC-17** Given keyboard-only navigation, then I can open stats, change every setting, close modals with `Esc`, and return focus to the trigger.
- **AC-18** Given the network is disabled after first load, then a full game can be played end to end with zero failed requests.
- **AC-19** Given LocalStorage is blocked, then the app still plays a full game and shows the storage warning exactly once.
- **AC-20** Given `npm run verify`, then typecheck, lint, format check, and all tests pass with no warnings.
- **AC-21** Given a Lighthouse mobile run on the production build, then the NFR-4 thresholds are met.
- **AC-22** Given a 320 px-wide viewport, then the board and keyboard fit with no horizontal scrolling and all targets remain ≥ 44 px.
- **AC-23** Given a 4-letter game, when I open **How to play**, then the copy says "6 tries" and "valid 4 letter word" and each example row shows 4 tiles.

---

## 13. Traceability

Every requirement above maps to at least one task in [`TASKS.md`](./TASKS.md) and one checklist item in [`ACCEPTANCE.md`](./ACCEPTANCE.md). Changes to this document require updating both, in the same pull request.
