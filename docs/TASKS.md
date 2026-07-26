# Wordwright — Implementation Roadmap

Ordered, phased backlog for V1. Every task is **independently completable**: it has a clear deliverable, explicit acceptance, and can be shipped as one commit or PR without breaking `main`.

**Conventions**

- `T-xx` — task id, cited in commits (`feat(engine): add evaluateGuess (T-06)`).
- **Req** — the `SPEC.md` requirements the task satisfies.
- **DoD** — done when these are true, _in addition to_ the global bar: `npm run verify` passes, no console errors, docs updated if behaviour changed.
- Phases are sequential; tasks inside a phase are mostly parallelisable unless a dependency is noted.

**Progress:** 48 / 48 complete — all phases done, plus a full review pass (2026-07-26). See [`REVIEW.md`](./REVIEW.md).

---

## Phase 0 — Project Setup (T-01 … T-05) ✅ COMPLETE

### ✅ T-01 · Scaffold the Vite + React + TypeScript project

Create the app with Vite's `react-ts` template. Enable `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and the `@/*` path alias in `tsconfig` and `vite.config.ts`. Remove all template boilerplate (demo CSS, logos, counter).
**Req:** NFR-7 · **DoD:** `npm run dev` serves a blank shell; `npm run build` succeeds; no template assets remain.

### ✅ T-02 · Tailwind + design tokens

Install and configure Tailwind. Create `styles/index.css` with the semantic token set (`--color-tile-correct|present|absent`, `--color-key-*`, `--color-surface`, `--color-text`, `--color-border`, `--color-focus`) for three variants: light, `.dark`, and `[data-palette="cb"]`. Add `styles/animations.css` with keyframes (`flip`, `pop`, `shake`, `bounce`) and a reduced-motion override block.
**Req:** FR-43, FR-44, A11Y-7, A11Y-9 · **Depends:** T-01 · **DoD:** toggling the `dark` class and `data-palette` on `<html>` in devtools visibly re-themes a sample element; all token pairs pass AA contrast (record the ratios in the PR).

### ✅ T-03 · ESLint + Prettier

Flat ESLint config: `typescript-eslint` recommended-type-checked, `react-hooks`, `react-refresh`, `jsx-a11y`. Prettier with `prettier-plugin-tailwindcss`. Add a custom rule/override banning raw colour utilities in `src/components/**` (ADR-008) — an `eslint-plugin-no-restricted-syntax` pattern or a documented review rule if tooling proves awkward.
**Req:** NFR-7 · **Depends:** T-01 · **DoD:** `npm run lint` and `npm run format:check` pass clean on the scaffold.

### ✅ T-04 · Vitest + Testing Library

Configure Vitest with two projects/environments (node for `engine|lib|storage`, jsdom for components), `src/test/setup.ts` (jest-dom, `matchMedia` mock, `localStorage` mock), coverage thresholds (100% branches for `src/engine/**`, 85% statements overall), and `renderWithProviders`.
**Req:** NFR-8 · **Depends:** T-01 · **DoD:** a placeholder test passes in both environments; `npm run test:coverage` reports and enforces thresholds.

### ✅ T-05 · npm scripts, folder skeleton, app shell

Add every script from the README table including `verify`. Create the full empty folder tree from ARCHITECTURE §2 with barrel files. Add `index.html` (title, meta viewport, theme-flash-prevention inline script), `main.tsx`, and a minimal `App.tsx` rendering `header`/`main`/`footer` landmarks and one `h1`.
**Req:** A11Y-12, EC-17 · **Depends:** T-01…T-04 · **DoD:** `npm run verify` passes; the shell renders with correct landmarks; theme class is set before first paint (no flash on reload in dark mode).

---

### Phase 0 verification record (2026-07-26)

| Check            | Result                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `npm run verify` | ✅ typecheck + lint + format:check + 5 tests, zero warnings                                    |
| `npm run build`  | ✅ 191 KB raw / **60.35 KB gzipped** entry bundle — NFR-1 budget is 200 KB gzipped             |
| `npm audit`      | ✅ 0 vulnerabilities (see ADR-016)                                                             |
| Dev server       | ✅ Vite 8 ready in 362 ms, HTTP 200, theme script inlined                                      |
| Test projects    | ✅ `unit` (node) and `ui` (jsdom) both execute                                                 |
| Coverage gate    | ✅ verified by probe: the `src/engine/**` 100% rule fails independently of the global 85% rule |
| Design tokens    | ✅ compile to `var(--color-*)`; light / `.dark` / `[data-palette="cb"]` all emitted            |
| Guard: ADR-003   | ✅ `import 'react'` inside `src/engine/**` → error                                             |
| Guard: ADR-009   | ✅ `Math.random()` / `Date.now()` inside `src/engine/**` → error                               |
| Guard: ADR-008   | ✅ `bg-green-500` inside `src/components/**` → error                                           |
| Guard: NFR-11    | ✅ `localStorage` outside `src/storage/**` → error                                             |

**Pinned toolchain:** React 19.2 · Vite 8.1 · TypeScript 6.0 · Tailwind 4.3 · Vitest 4.1 · ESLint 9.39 (see ADR-015 for why TS 6 and ESLint 9 rather than 7 and 10).

---

## Phase 1 — Dictionary Data (T-06 … T-08) ✅ COMPLETE

### ✅ T-06 · Source and generate word lists

Produce `answers-{4,5,6}` (≥ 300 each, common/solvable/no profanity/no proper nouns) and `guesses-{4,5,6}` (≥ 1500 each, superset of answers). Emit as TS modules of uppercase, sorted, deduplicated string arrays. Write `data/README.md` documenting source and licence.
**Req:** FR-25, FR-26, FR-27, FR-30, FR-31 · **DoD:** all six modules exist and satisfy the invariants; provenance documented.

### ✅ T-07 · Dictionary invariant tests

Test every list: `/^[A-Z]+$/`, exact length, unique, sorted, minimum size, `answers ⊆ guesses`.
**Req:** FR-26, FR-27, FR-30 · **Depends:** T-06 · **DoD:** the suite fails loudly if any invariant is violated (verify by temporarily corrupting a list).

### ✅ T-08 · Registry + lazy loader

Implement `registry.ts` (length → dynamic import), `loadDictionary.ts` with in-memory cache, in-flight promise dedup, `Set` construction, and a typed `DictionaryLoadError`.
**Req:** FR-17, FR-28, FR-29, EC-14 · **Depends:** T-06 · **DoD:** unit tests cover cache hit, concurrent-call dedup, and rejection mapping; `vite build` emits one chunk per length (verify in build output).

---

## Phase 2 — Game Engine (T-09 … T-17) ✅ COMPLETE · _test-first, no UI_

### ✅ T-09 · Engine types and constants

`types.ts` and `constants.ts` per ARCHITECTURE §3.1: `WORD_LENGTHS`, `MAX_GUESSES = 6`, `LetterState`, `TileState`, `Evaluation`, `Guess`, `GameStatus`, `GameState`, `GameError`, score weights.
**Req:** FR-1, FR-2 · **DoD:** compiles; no `any`; all state unions exhaustive.

### ✅ T-10 · `evaluateGuess`

Two-pass count-based algorithm, SPEC §6.3.
**Req:** FR-12, FR-13, EC-1 · **Depends:** T-09 · **DoD:** the full truth table passes as table-driven tests, plus property tests (result length invariant; identical guess ⇒ all correct; per-letter `correct+present ≤` count in answer); 100% branch coverage.

### ✅ T-11 · `validateGuess`

Returns `Result<string, 'too-short' | 'not-a-word'>`; uppercases input; takes an injected `isAllowed` predicate.
**Req:** FR-6, FR-14, FR-15, FR-16, FR-17 · **Depends:** T-09 · **DoD:** tests for short, unknown, valid, lowercase, and repeated-guess-allowed cases.

### ✅ T-12 · `deriveKeyStates`

Fold guesses into `Map<string, LetterState>` with `correct > present > absent` precedence; never downgrade.
**Req:** FR-53 · **Depends:** T-10 · **DoD:** tests prove a letter yellow-then-green becomes green and green-then-yellow stays green.

### ✅ T-13 · Randomness + answer picking

`RandomSource`, `systemRandom`, `seededRandom` (mulberry32), and `pickAnswer(pool, recentlyUsed, random)` with the no-repeat ring buffer and reset-on-exhaustion.
**Req:** FR-3, FR-4, EC-20 · **Depends:** T-09 · **DoD:** seeded source is reproducible; no repeat within the buffer window; exhaustion resets rather than throwing.

### ✅ T-14 · `scoreGame`

Implements FR-23 exactly (base, length multiplier, speed bonus, loss = 0).
**Req:** FR-23, FR-24 · **Depends:** T-09 · **DoD:** table tests for each guess count × length × representative solve times, plus the 0-score loss case and the `speedBonus` floor at 0.

### ✅ T-15 · `gameReducer`

All actions and transitions from ARCHITECTURE §3.2. Pure and total; returns the same reference for no-op actions; enforces input locking (FR-11) and the max-length cap (FR-7).
**Req:** FR-5, FR-7, FR-8, FR-9, FR-11, FR-18, FR-19, FR-22, EC-2, EC-3, EC-5, EC-8 · **Depends:** T-10, T-13 · **DoD:** state-machine tests for every transition, including illegal actions in each status; `startedAt` set exactly once on first letter; 100% branch coverage.

### ✅ T-16 · Selectors

`isGameOver`, `currentRowIndex`, `remainingGuesses`, `boardRows(state)` (6 rows of tile view-models), `guessesUsed`.
**Req:** FR-50, FR-51 · **Depends:** T-15 · **DoD:** `boardRows` returns a stable 6×n structure for empty, partial, and complete boards.

### ✅ T-17 · Engine barrel + coverage gate

`engine/index.ts` exports the public surface only. Verify no engine file imports React/DOM/storage (add a lint rule or an import-boundary test).
**Req:** NFR-8, ADR-003 · **Depends:** T-09…T-16 · **DoD:** engine branch coverage is 100%; the boundary test fails if a forbidden import is added.

---

### Phase 1 & 2 verification record (2026-07-26)

| Check                  | Result                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run verify`       | ✅ exit 0 — typecheck + lint + format + **238 tests**, zero warnings                                                     |
| Engine coverage        | ✅ **100% statements / branches / functions / lines** across every `src/engine` module                                   |
| Dictionary coverage    | ✅ 100% on `loadDictionary`, `registry`, `types`                                                                         |
| Code splitting         | ✅ verified by build probe: `lists-4` 10.66 KB, `lists-5` 24.59 KB, `lists-6` 45.77 KB gzipped, as three separate chunks |
| Entry bundle           | ✅ 61 KB gzipped with a dictionary imported — NFR-1 budget is 200 KB                                                     |
| Engine purity          | ✅ `boundaries.test.ts` (24 assertions) greps every engine file for React/DOM/storage/`Date.now`/`Math.random`           |
| Evaluation truth table | ✅ all 10 SPEC §6.3 rows pass, plus 4 property tests                                                                     |

**Word lists generated** by `scripts/build-dictionaries.mjs` from ENABLE1 (public domain), ranked by Google Trillion Word Corpus frequency:

| Length | Answers | Guesses |
| ------ | ------- | ------- |
| 4      | 700     | 3,903   |
| 5      | 700     | 8,636   |
| 6      | 700     | 15,232  |

Answer pools are filtered for plurals, two-distinct-letter words, offensive terms, proper-noun readings, and clipped forms — see `src/dictionary/data/README.md`. All filtered words remain valid _guesses_ (ADR-004).

**Note on `v8 ignore` comments:** four defensive branches in the engine are unreachable by construction (the reducer's exhaustiveness `default`, and three `??` fallbacks that exist only to satisfy `noUncheckedIndexedAccess`). Each carries a comment explaining why, rather than an artificial test. The 100% figure is honest, not gamed.

---

## Phase 3 — Storage Layer (T-18 … T-22) ✅ COMPLETE

### ✅ T-18 · `safeStorage`

Availability probe with try/catch, in-memory `Map` fallback, exported `isPersistent` flag.
**Req:** EC-11, NFR-12 · **DoD:** tests simulate a throwing `localStorage` and assert the fallback keeps working.

### ✅ T-19 · `createRepository` + schemas

Generic typed repository (`read`/`write`/`clear`/`subscribe`) with runtime validation guards and defaults-on-failure. Cross-tab `storage` event subscription.
**Req:** FR-42, EC-12, EC-16, NFR-11, NFR-12 · **Depends:** T-18 · **DoD:** tests cover valid read, corrupt JSON, wrong shape, quota throw on write, and a cross-tab event firing subscribers.

### ✅ T-20 · Migration chain

`meta.schemaVersion`, ordered migration map, newer-version-resets-to-defaults behaviour.
**Req:** EC-13 · **Depends:** T-19 · **DoD:** tests run a synthetic v0 → v1 migration and the newer-version reset path.

### ✅ T-21 · Settings repository

`Settings { theme, colorblind, motion, defaultWordLength }` with defaults `system / false / system / 5`.
**Req:** FR-43…FR-46, FR-48 · **Depends:** T-19 · **DoD:** round-trip and default-fallback tests pass.

### ✅ T-22 · Stats & session repositories

`StatsState` (aggregate + `perLength` + `recentGames` capped at 50) with an idempotent `recordGame` reducer keyed by game id; `sessionRepository` for the in-progress `GameState` with debounced writes and a `visibilitychange`/`pagehide` flush, discarding mismatched or stale sessions on read.
**Req:** FR-20, FR-32, FR-33, FR-35…FR-39, FR-42, EC-9, EC-10 · **Depends:** T-19 · **DoD:** unit tests for streak increment/reset, distribution buckets, averages, fastest solve, the 50-item cap, double-record idempotency, and session restore/discard.

---

## Phase 4 — Providers & Wiring (T-23 … T-26) ✅ COMPLETE

### ✅ T-23 · SettingsProvider + `useTheme`

Applies `dark` class and `data-palette` / `data-motion` attributes; live `matchMedia` subscription for `system`.
**Req:** FR-43, FR-44, FR-45, FR-48, EC-17 · **Depends:** T-21 · **DoD:** integration test flips the mocked media query and asserts the class updates without reload.

### ✅ T-24 · ToastProvider

Queue capped at 3, auto-dismiss 2 s (errors 3 s), manual dismiss, polite + assertive live regions.
**Req:** FR-55, A11Y-4 · **DoD:** fake-timer tests for auto-dismiss, cap/eviction, and severity → live-region routing.

### ✅ T-25 · StatsProvider

Wraps the stats repository; exposes `stats` and `recordGame`; guarantees single-record-per-game.
**Req:** FR-20, FR-35…FR-39 · **Depends:** T-22 · **DoD:** recording the same game id twice changes nothing.

### ✅ T-26 · GameProvider

`useReducer(gameReducer)` + dictionary loading (status `loading`/`error`/`playing`) + validation guard + session persistence + stats recording on completion + announcements. Exposes `{ state, boardRows, keyStates, addLetter, removeLetter, submitGuess, restart, setWordLength, retryDictionary }`.
**Req:** FR-10, FR-11, FR-18…FR-21, FR-32, FR-33, FR-34, FR-56, EC-14, EC-15, NFR-11 · **Depends:** T-08, T-17, T-24, T-25 · **DoD:** integration tests with a fixture dictionary cover win, loss, invalid word, short guess, restore, and dictionary failure + retry.

---

## Phase 5 — Core UI (T-27 … T-34) ✅ COMPLETE

### ✅ T-27 · `Tile`

Memoised; renders `empty | filled | correct | present | absent`; flip animation with per-tile delay; colour applied at flip midpoint; colourblind marker; full `aria-label`.
**Req:** FR-51, FR-52, A11Y-2, A11Y-8 · **Depends:** T-02, T-16 · **DoD:** component tests assert accessible name per state; reduced motion renders the final state with no animation.

### ✅ T-28 · `Row` + `Board`

`role="grid"`/`row"`/`gridcell"` structure, always 6 rows, shake animation on invalid submit, responsive `clamp()` sizing.
**Req:** FR-50, FR-59, A11Y-2, EC-18 · **Depends:** T-27 · **DoD:** grid semantics assertions pass; board renders correctly for all three lengths at 320 px.

### ✅ T-29 · On-screen `Keyboard`

Three QWERTY rows, Enter/Backspace with `aria-label`s, state colours derived from `deriveKeyStates`, press animation, ≥ 44 px targets.
**Req:** FR-10, FR-53, FR-54, FR-58, A11Y-10 · **Depends:** T-12, T-26 · **DoD:** clicking keys drives the board; key colours update only after the row reveal completes.

### ✅ T-30 · `usePhysicalKeyboard`

Window listener; A–Z, Enter, Backspace/Delete; ignores modifier combos, non-alpha keys, and events while a modal is open or input is locked.
**Req:** FR-6, FR-9, FR-10, FR-11, EC-3, EC-4, EC-5, EC-7 · **Depends:** T-26 · **DoD:** tests assert `Ctrl+R` is not intercepted and typing during a reveal is ignored.

### ✅ T-31 · `useRevealTimeline`

Staggered reveal (250 ms), completion callback dispatching `REVEAL_COMPLETE`, stagger collapsed to 0 under reduced motion, cleanup on unmount/restart.
**Req:** FR-52, A11Y-9 · **Depends:** T-26 · **DoD:** fake-timer tests verify ordering, total duration, instant mode, and no post-unmount dispatch.

### ✅ T-32 · Loading, error, and skeleton states

`BoardSkeleton` with accessible "Loading dictionary…" text; `DictionaryError` panel with a working Retry.
**Req:** FR-56, EC-14 · **Depends:** T-26 · **DoD:** both states are reachable in tests; input is disabled while loading.

### ✅ T-33 · `ResultPanel`

Shows win/loss, the answer on loss, guesses used, solve time, score; **Play again** and **Change length**; announced to screen readers; appears only after the reveal finishes.
**Req:** FR-18, FR-19, FR-21, A11Y-5 · **Depends:** T-31 · **DoD:** appears post-reveal; **Play again** yields a different answer (AC-8).

### ✅ T-34 · `Header` + `LengthSelector`

Accessible radio group for 4/5/6, stats and settings buttons with labels, confirmation dialog when switching length mid-game with guesses made.
**Req:** FR-34, FR-49, EC-15, AC-10 · **Depends:** T-26, T-36 · **DoD:** confirmation appears only when ≥ 1 guess exists; cancelling preserves the game.

---

## Phase 6 — Statistics & Settings UI (T-35 … T-39) ✅ COMPLETE

### ✅ T-35 · `Modal` + `useFocusTrap` + `ConfirmDialog`

Portal, `role="dialog" aria-modal="true"`, labelled heading, focus trap, `Esc`/backdrop close, focus restoration; `ConfirmDialog` built on it.
**Req:** FR-57, A11Y-11, EC-7 · **DoD:** keyboard-only test: open → Tab cycles inside → `Esc` closes → focus returns to the trigger.

### ✅ T-36 · `StatsModal`

All FR-35 metrics, distribution bars with the current game highlighted, recent games list, per-length view, empty state.
**Req:** FR-35…FR-41 · **Depends:** T-25, T-35 · **DoD:** with fixture stats, every displayed value matches a hand-computed expectation (AC-11); 0-games shows the empty state, never `NaN`.

### ✅ T-37 · `SettingsModal`

Theme radio group, colourblind toggle, motion toggle, default-length preference, danger zone.
**Req:** FR-43…FR-46, FR-48 · **Depends:** T-23, T-35 · **DoD:** every control persists and applies immediately.

### ✅ T-38 · Danger zone — reset statistics / reset history

Two separate destructive actions, each behind a confirmation naming exactly what is deleted.
**Req:** FR-47, AC-12 · **Depends:** T-36, T-37 · **DoD:** resetting stats leaves settings and the active game untouched; resetting history clears only recent games.

### ✅ T-39 · `ErrorBoundary`

Full-screen recovery UI with **Reload** and **Reset data**; no stack traces shown to the user.
**Req:** EC-21 · **DoD:** a test child that throws renders the recovery UI; **Reset data** clears all namespaced keys.

---

### Phase 3–6 verification record (2026-07-26)

| Check             | Result                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run verify`  | ✅ exit 0 — **336 tests**, zero errors, zero warnings; three consecutive clean runs                    |
| Production build  | ✅ entry **72 KB gzipped** (NFR-1 budget 200 KB), dictionaries still split per length                  |
| Integration suite | ✅ 23 flows driven entirely through accessible queries (`getByRole` / `getByLabelText`)                |
| Storage           | ✅ 69 tests: corrupt JSON, wrong shape, quota throw, unavailable storage, cross-tab events, migrations |

**Two real bugs found and fixed during this phase, both caught by tests rather than by reading:**

1. **`safeStorage` bound its backend at module load.** It captured whatever `localStorage` was at import time, so settings silently failed to load. In production this would also have broken any browser that revokes storage access mid-session. Now resolved lazily on first use, with `resetSafeStorage()` as a test seam.
2. **Every guess announcement was silently dropped (A11Y-3).** Two effects fought over the "already announced" counter; the reset effect depended on `guesses.length`, so it ran on every guess and marked it announced before the announcing effect saw it. Screen-reader users would have received no feedback at all. Fixed by keying the counter on game id, and guarded by a regression test that was verified to fail against the old code.

A third issue — a flaky assertion on the win announcement — was traced to the result panel and the live region being written by separate effects; the test now waits rather than assuming a single commit.

---

## Phase 7 — Accessibility Pass (T-40 … T-43) ✅ COMPLETE

### ✅ T-40 · Announcements

`useAnnouncer` + polite region for per-guess results and game end; assertive region for errors; exactly one announcement per event.
**Req:** A11Y-3, A11Y-4, A11Y-5, AC-16 · **Depends:** T-26, T-31 · **DoD:** tests assert message text and that no duplicate announcement fires.

### ✅ T-41 · Focus management & tab order

Audit every interactive element: visible `:focus-visible` ring, logical order, no traps outside modals, skip-to-content if needed.
**Req:** A11Y-1, A11Y-6, AC-17 · **DoD:** a full keyboard-only play-through and settings change with no mouse.

### ✅ T-42 · Contrast & colourblind verification

Measure every text/background and tile pair in light, dark, and colourblind palettes; document ratios; add non-colour markers.
**Req:** A11Y-7, A11Y-8, AC-14 · **DoD:** all pairs ≥ AA; ratio table recorded in the PR.

### ✅ T-43 · Automated a11y sweep

Run axe (via `@axe-core/react` in dev or `vitest-axe` in tests) over the main view and each modal.
**Req:** G5, NFR-4 · **DoD:** zero serious/critical violations.

---

## Phase 8 — Testing & Hardening (T-44 … T-45) ✅ COMPLETE

### ✅ T-44 · Integration test suite

End-to-end flows through providers with a fixture dictionary: full win, full loss, invalid inputs, restart, length switch, refresh-restore, stats accumulation across several games, reset flows, storage-unavailable mode.
**Req:** AC-1…AC-12, AC-19 · **Depends:** Phases 4–7 · **DoD:** each listed AC has at least one asserting test, cited by ID in the test name.

### ✅ T-45 · Edge case sweep

One test (or documented manual check) per `EC-1…EC-21`.
**Req:** EC-1…EC-21 · **DoD:** a table in the PR maps every EC to its test or manual verification note.

---

## Phase 9 — Polish & Release (T-46 … T-48) ✅ COMPLETE

### ✅ T-46 · Responsive & device pass

320 px → 2560 px, landscape phones, iOS Safari dynamic viewport (`dvh`), touch target sizes, no horizontal scroll.
**Req:** FR-58, FR-59, EC-18, AC-22 · **DoD:** screenshots at 320/375/768/1440 px plus landscape attached to the PR.

### ✅ T-47 · Performance & bundle budget

Bundle analysis against NFR-1, Lighthouse mobile run against NFR-4, verify per-length chunking and zero network requests during play.
**Req:** NFR-1…NFR-5, AC-18, AC-21 · **DoD:** Lighthouse scores and the network-tab evidence recorded in the PR.

### ✅ T-48 · Documentation & release readiness

Update README (screenshots, final scripts), reconcile docs with the built app, walk the entire `ACCEPTANCE.md` checklist, tag `v1.0.0`.
**Req:** All · **Depends:** T-01…T-47 · **DoD:** every `ACCEPTANCE.md` box is ticked with evidence; `npm run verify` green from a clean clone.

---

### Phase 7–9 verification record (2026-07-26)

Browser-level evidence, produced against the **production build** in Chromium (ADR-019).

| Check                               | Result                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| axe (WCAG 2.0/2.1 A + AA)           | ✅ **zero violations** on the game view, both dialogs, dark mode, and a played board                          |
| Lighthouse mobile                   | ✅ Performance **100**, Accessibility **100**, Best Practices **100**, SEO 91 · TTI 1.6 s · CLS 0 · TBT 0 ms  |
| Lighthouse desktop                  | ✅ Performance **100**, Accessibility **100**, Best Practices **100** · TTI 0.4 s                             |
| Contrast (`npm run check:contrast`) | ✅ all 80 token pairs across light / dark / colourblind / dark-colourblind meet AA — now enforced in `verify` |
| Responsive                          | ✅ 320 → 2560 px plus landscape, no horizontal scroll, all three word lengths                                 |
| Touch targets                       | ✅ keys and header controls ≥ 44 px on phone viewports                                                        |
| Offline                             | ✅ zero network requests after load; a full game plays with the network disabled                              |
| Storage failure                     | ✅ corrupt JSON and a throwing `localStorage` both leave the game playable                                    |
| Test totals                         | ✅ **336** unit/integration + **88** browser = 424 passing                                                    |

**Four real defects found in this phase, none of which any unit test had caught:**

1. **18 contrast pairs below AA** — including white-on-yellow tiles at 2.63:1 and dark-mode borders at 1.65:1. Fixed by computing compliant replacements rather than eyeballing them; the audit now runs in `verify`.
2. **43 px of horizontal overflow at 320 px** (AC-22) — the header could not fit its controls. Fixed by letting the title truncate and the keys flex.
3. **Keyboard below the fold in landscape** (EC-18) — board and keyboard now shrink together under `max-height: 560px`.
4. **`Enter` silently stopped submitting after opening any dialog** — closing a modal restores focus to its trigger (FR-57), and the old rule bailed out of Enter for _any_ focused button. A player who visited Settings once could not submit another guess. Fixed so a focused control only wins when the row is empty, and covered by a regression test.

A fifth issue, the production build being OOM-killed, was traced to Tailwind's source scanner crawling `node_modules` in the absence of a git boundary — see ADR-018.

---

## Dependency Summary

```
Phase 0 ──▶ Phase 1 ──▶ Phase 2 ──▶ Phase 4 ──▶ Phase 5 ──▶ Phase 6 ──▶ Phase 7 ──▶ Phase 8 ──▶ Phase 9
              │            ▲           ▲
              └── Phase 3 ─┴───────────┘
```

Phase 2 (engine) and Phase 3 (storage) are independent of each other and can proceed in parallel; both must land before Phase 4.

## Out of Scope

No task in this roadmap implements any V2 or V3 feature. If a task appears to require one, stop and re-read [`SPEC.md` §3](./SPEC.md#3-non-goals-v1).
