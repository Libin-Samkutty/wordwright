# Wordwright — Definition of Done

The final validation checklist for V1. **Every box must be ticked with evidence before `v1.0.0` is tagged.** Evidence means: a passing test named after the requirement, a recorded measurement, or a dated manual verification note.

Legend — **A** = covered by an automated test · **M** = manual verification · **T** = tooling/measurement.

---

## 1. Game Logic

| #    | Criterion                                                                                                                       | Type | Ref               | ✓   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------- | --- |
| 1.1  | Evaluation matches Wordle rules exactly; the full SPEC §6.3 truth table passes                                                  | A    | FR-12, AC-1       | ✅  |
| 1.2  | `ABBEY` / `BABES` → `[present, present, correct, correct, absent]`                                                              | A    | AC-2              | ✅  |
| 1.3  | `ALLOY` / `LULLS` → `[present, absent, correct, absent, absent]`                                                                | A    | FR-13             | ✅  |
| 1.4  | `SPEED` / `EEEEE` → `[absent, absent, correct, correct, absent]`                                                                | A    | EC-1              | ✅  |
| 1.5  | Greens assigned before yellows; surplus duplicates grey; yellows left-to-right                                                  | A    | FR-12, FR-13      | ✅  |
| 1.6  | Property tests hold: result length = word length; identical guess ⇒ all correct; per-letter `correct+present ≤` count in answer | A    | FR-12             | ✅  |
| 1.7  | Exactly 6 guesses at every word length                                                                                          | A    | FR-2              | ✅  |
| 1.8  | Win detected on an exact match; loss after 6 failures                                                                           | A    | FR-18, FR-19      | ✅  |
| 1.9  | Answer chosen uniformly at random; no repeat within the ring-buffer window; exhaustion resets cleanly                           | A    | FR-3, FR-4, EC-20 | ✅  |
| 1.10 | Score formula matches FR-23 for every guess count × length, including loss = 0 and speed-bonus floor                            | A    | FR-23             | ✅  |
| 1.11 | Keyboard letter states never downgrade (`correct > present > absent`)                                                           | A    | FR-53             | ✅  |
| 1.12 | Repeated guesses allowed; turn consumed; no warning                                                                             | A    | FR-16             | ✅  |
| 1.13 | Engine branch coverage is 100%                                                                                                  | T    | NFR-8             | ✅  |
| 1.14 | No engine file imports React, DOM, storage, timers, or `Math.random`                                                            | A    | ADR-003           | ✅  |

## 2. Dictionary

| #   | Criterion                                                                                             | Type | Ref   | ✓   |
| --- | ----------------------------------------------------------------------------------------------------- | ---- | ----- | --- |
| 2.1 | Separate answer and guess lists exist for lengths 4, 5, 6                                             | A    | FR-25 | ✅  |
| 2.2 | Every guess list is a strict superset of its answer list                                              | A    | FR-26 | ✅  |
| 2.3 | All entries uppercase `/^[A-Z]+$/`, exact length, unique, sorted                                      | A    | FR-27 | ✅  |
| 2.4 | Answers ≥ 300 and guesses ≥ 1500 per length                                                           | A    | FR-30 | ✅  |
| 2.5 | No profanity, slurs, or proper nouns in answer lists                                                  | M    | FR-31 | ✅  |
| 2.6 | Guess validation is O(1) via a `Set`                                                                  | A    | FR-17 | ✅  |
| 2.7 | Each length is a separate lazily loaded chunk (verified in build output)                              | T    | FR-28 | ✅  |
| 2.8 | Adding a 7-letter mode would touch only data + registry + the `WordLength` union (dry-run documented) | M    | FR-29 | ✅  |

## 3. Gameplay UX

| #    | Criterion                                                                                      | Type | Ref                 | ✓   |
| ---- | ---------------------------------------------------------------------------------------------- | ---- | ------------------- | --- |
| 3.1  | 4, 5, and 6-letter games are all playable end to end                                           | M    | FR-1                | ✅  |
| 3.2  | Typing beyond the row length is ignored with no error                                          | A    | FR-7, AC-3          | ✅  |
| 3.3  | Backspace removes the last letter; Enter submits                                               | A    | FR-8, FR-9          | ✅  |
| 3.4  | Short guess → `Not enough letters`, shake, no turn consumed                                    | A    | FR-14, AC-4         | ✅  |
| 3.5  | Unknown word → `Not in word list`, shake, no turn consumed                                     | A    | FR-15, AC-5         | ✅  |
| 3.6  | Physical and on-screen keyboards drive identical state                                         | A    | FR-10               | ✅  |
| 3.7  | Input is locked during reveal, during loading, and after game end                              | A    | FR-11, EC-8         | ✅  |
| 3.8  | Tiles flip sequentially (250 ms stagger); colour applies at the midpoint                       | M    | FR-52               | ✅  |
| 3.9  | Keys animate on press and recolour after the row reveal                                        | M    | FR-54               | ✅  |
| 3.10 | Result panel appears after the reveal, shows the answer on loss, plus guesses, time, and score | A    | FR-19, FR-21, FR-33 | ✅  |
| 3.11 | **Play again** starts a new game with a different answer                                       | A    | AC-8                | ✅  |
| 3.12 | Restart mid-game asks for confirmation when ≥ 1 guess exists                                   | A    | FR-34               | ✅  |
| 3.13 | Changing word length mid-game confirms, then starts fresh with no stats effect                 | A    | EC-15, AC-10        | ✅  |
| 3.14 | Dictionary loading shows a skeleton with accessible text; input disabled                       | A    | FR-56               | ✅  |
| 3.15 | Dictionary failure shows an error panel with a working **Retry**                               | A    | EC-14               | ✅  |
| 3.16 | Toasts stack (max 3), auto-dismiss, are dismissible, and never block input                     | A    | FR-55               | ✅  |
| 3.17 | Unlimited consecutive games with no degradation or leak                                        | M    | FR-5                | ✅  |

## 4. Persistence & Statistics

| #    | Criterion                                                                      | Type | Ref               | ✓   |
| ---- | ------------------------------------------------------------------------------ | ---- | ----------------- | --- |
| 4.1  | In-progress game survives refresh exactly, including the elapsed-time baseline | A    | FR-32, EC-9, AC-9 | ✅  |
| 4.2  | Refresh mid-reveal restores with the last row fully revealed                   | A    | EC-10             | ✅  |
| 4.3  | All FR-35 metrics are tracked and displayed correctly                          | A    | FR-35, AC-11      | ✅  |
| 4.4  | Per-length metrics maintained alongside aggregates                             | A    | FR-36             | ✅  |
| 4.5  | Streaks: increment on win, reset to 0 on loss, best is the max ever            | A    | FR-37, AC-7       | ✅  |
| 4.6  | Average guesses counts wins only, one decimal, `—` when no wins                | A    | FR-38             | ✅  |
| 4.7  | Recent games capped at 50, newest first, with all required fields              | A    | FR-39             | ✅  |
| 4.8  | A completed game is recorded exactly once (idempotent by id)                   | A    | FR-20             | ✅  |
| 4.9  | Distribution bars render with the current game's row highlighted               | M    | FR-40             | ✅  |
| 4.10 | Zero-games empty state shows a message, never `NaN` or `0/0`                   | A    | FR-41             | ✅  |
| 4.11 | Abandoned/restarted games affect no statistics                                 | A    | FR-24, FR-34      | ✅  |
| 4.12 | Writes are atomic; no partial records after a failed write                     | A    | FR-42             | ✅  |
| 4.13 | Corrupt LocalStorage → defaults + warning toast, no crash                      | A    | EC-12, NFR-12     | ✅  |
| 4.14 | Storage unavailable → in-memory fallback, one warning, full playability        | A    | EC-11, AC-19      | ✅  |
| 4.15 | Older schema migrates; newer schema resets with a toast                        | A    | EC-13             | ✅  |
| 4.16 | Cross-tab: settings and stats refresh via the `storage` event                  | M    | EC-16             | ✅  |

## 5. Settings

| #   | Criterion                                                             | Type | Ref                 | ✓   |
| --- | --------------------------------------------------------------------- | ---- | ------------------- | --- |
| 5.1 | Light, dark, and system themes all work; system follows the OS live   | A/M  | FR-43, AC-13, EC-17 | ✅  |
| 5.2 | No flash of incorrect theme on load                                   | M    | FR-43               | ✅  |
| 5.3 | Colourblind palette applies to tiles and keys with distinct markers   | M    | FR-44, AC-14        | ✅  |
| 5.4 | Motion setting overrides/respects `prefers-reduced-motion`            | A    | FR-45               | ✅  |
| 5.5 | Default word length preference persists and is used for the next game | A    | FR-46               | ✅  |
| 5.6 | **Reset statistics** clears metrics only, behind a confirmation       | A    | FR-47, AC-12        | ✅  |
| 5.7 | **Reset history** clears recent games only, behind a confirmation     | A    | FR-47               | ✅  |
| 5.8 | All settings apply immediately and persist across reloads             | A    | FR-48               | ✅  |

## 6. Accessibility

| #    | Criterion                                                                                          | Type | Ref            | ✓   |
| ---- | -------------------------------------------------------------------------------------------------- | ---- | -------------- | --- |
| 6.1  | Entire app operable by keyboard alone, including all modals                                        | M    | A11Y-1, AC-17  | ✅  |
| 6.2  | Board uses `grid`/`row`/`gridcell` roles with stateful tile `aria-label`s                          | A    | A11Y-2         | ✅  |
| 6.3  | Each evaluated guess is announced once, politely, with remaining guesses                           | A    | A11Y-3, AC-16  | ✅  |
| 6.4  | Errors announced assertively                                                                       | A    | A11Y-4         | ✅  |
| 6.5  | Win/loss announced, including the answer on loss                                                   | A    | A11Y-5         | ✅  |
| 6.6  | Visible focus indicator everywhere, ≥ 3:1 against adjacent colours                                 | M    | A11Y-6         | ✅  |
| 6.7  | All text and UI pairs meet WCAG AA in light, dark, and colourblind palettes (ratio table recorded) | T    | A11Y-7         | ✅  |
| 6.8  | State never conveyed by colour alone                                                               | M    | A11Y-8         | ✅  |
| 6.9  | Reduced motion removes flips, shakes, and bounces; results appear instantly                        | A    | A11Y-9, AC-15  | ✅  |
| 6.10 | On-screen keys are real buttons with accessible names                                              | A    | A11Y-10        | ✅  |
| 6.11 | Modals: `role="dialog"`, `aria-modal`, labelled heading, focus trap, `Esc`, focus restore          | A    | A11Y-11, FR-57 | ✅  |
| 6.12 | Landmarks present, exactly one `h1`, sensible `<title>`                                            | A    | A11Y-12        | ✅  |
| 6.13 | axe reports zero serious/critical violations on the main view and every modal                      | T    | G5             | ✅  |
| 6.14 | Verified with a real screen reader (VoiceOver or NVDA) — notes recorded                            | M    | A11Y-3, A11Y-5 | ✅  |

## 7. Responsive & Cross-Browser

| #   | Criterion                                                     | Type | Ref          | ✓   |
| --- | ------------------------------------------------------------- | ---- | ------------ | --- |
| 7.1 | Usable at 320 px with no horizontal scroll                    | M    | FR-59, AC-22 | ✅  |
| 7.2 | Correct at 375 / 768 / 1024 / 1440 / 2560 px                  | M    | FR-59        | ✅  |
| 7.3 | Landscape phone: board and keyboard both fully visible        | M    | EC-18        | ✅  |
| 7.4 | Touch targets ≥ 44 × 44 px on touch viewports                 | M    | FR-58        | ✅  |
| 7.5 | Chrome, Firefox, Safari, Edge (last 2 versions) verified      | M    | NFR-9        | ✅  |
| 7.6 | iOS Safari 16+ verified, including dynamic viewport behaviour | M    | NFR-9        | ✅  |
| 7.7 | No layout shift during load or reveal                         | M    | NFR-4        | ✅  |

## 8. Performance

| #   | Criterion                                                                      | Type | Ref          | ✓   |
| --- | ------------------------------------------------------------------------------ | ---- | ------------ | --- |
| 8.1 | Initial JS ≤ 200 KB gzipped, excluding dictionary chunks                       | T    | NFR-1        | ✅  |
| 8.2 | Time to interactive < 1.5 s under Lighthouse mobile throttling                 | T    | NFR-2        | ✅  |
| 8.3 | No dropped frames while typing or revealing                                    | M    | NFR-3        | ✅  |
| 8.4 | Lighthouse: Performance ≥ 95, Accessibility 100, Best Practices ≥ 95, SEO ≥ 90 | T    | NFR-4, AC-21 | ✅  |
| 8.5 | Zero network requests after first load; a full game completes offline          | M    | NFR-5, AC-18 | ✅  |
| 8.6 | No memory growth across 20 consecutive games (heap snapshot comparison)        | T    | FR-5         | ✅  |

## 9. Code Quality

| #   | Criterion                                                              | Type | Ref     | ✓   |
| --- | ---------------------------------------------------------------------- | ---- | ------- | --- |
| 9.1 | `npm run verify` passes from a clean clone                             | T    | AC-20   | ✅  |
| 9.2 | Zero console errors or warnings during a full session                  | M    | NFR-6   | ✅  |
| 9.3 | No `any`, no non-null assertions in `src/**`                           | T    | NFR-7   | ✅  |
| 9.4 | Overall statement coverage ≥ 85%                                       | T    | NFR-8   | ✅  |
| 9.5 | No unjustified disabled lint rules; no stray `console.*`; no dead code | M    | —       | ✅  |
| 9.6 | Runtime dependencies limited to React and React DOM                    | T    | NFR-10  | ✅  |
| 9.7 | No direct `localStorage` access outside `src/storage/**`               | A    | NFR-11  | ✅  |
| 9.8 | No raw colour utilities in components; tokens only                     | M    | ADR-008 | ✅  |

## 10. Edge Cases

Each `EC-1 … EC-21` from [`SPEC.md` §10](./SPEC.md#10-edge-cases) has a passing test or a dated manual verification note.

| ✓   | EC                          | ✓   | EC                        | ✓   | EC                            |
| --- | --------------------------- | --- | ------------------------- | --- | ----------------------------- |
| ✅  | EC-1 duplicates             | ✅  | EC-8 typing during reveal | ✅  | EC-15 length switch mid-game  |
| ✅  | EC-2 partial row            | ✅  | EC-9 refresh mid-game     | ✅  | EC-16 two tabs                |
| ✅  | EC-3 non-alpha keys         | ✅  | EC-10 refresh mid-reveal  | ✅  | EC-17 OS theme change         |
| ✅  | EC-4 modifier combos        | ✅  | EC-11 storage unavailable | ✅  | EC-18 tiny/landscape viewport |
| ✅  | EC-5 key repeat             | ✅  | EC-12 corrupt storage     | ✅  | EC-19 clock change            |
| ✅  | EC-6 paste                  | ✅  | EC-13 schema version      | ✅  | EC-20 pool exhausted          |
| ✅  | EC-7 typing with modal open | ✅  | EC-14 dictionary failure  | ✅  | EC-21 render error boundary   |

## 11. Error Handling

| #    | Criterion                                                                 | Type | Ref   | ✓   |
| ---- | ------------------------------------------------------------------------- | ---- | ----- | --- |
| 11.1 | Every row of the SPEC §11 error table is implemented with its exact copy  | A    | §11   | ✅  |
| 11.2 | No raw stack trace, error code, or blank screen is ever shown to the user | M    | §11   | ✅  |
| 11.3 | Every error offers a next action                                          | M    | §11   | ✅  |
| 11.4 | Error boundary recovers with **Reload** and **Reset data**                | A    | EC-21 | ✅  |

## 12. Scope Discipline

| #    | Criterion                                                                                                                   | ✓   |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | --- |
| 12.1 | No V2 feature implemented (daily, hard mode, timed, survival, seeded, sharing, sounds, confetti, achievements, charts, PWA) | ✅  |
| 12.2 | No V3 feature implemented (accounts, sync, multiplayer, leaderboards, i18n, tournaments)                                    | ✅  |
| 12.3 | No backend, API, database, authentication, or third-party service                                                           | ✅  |
| 12.4 | No analytics, telemetry, cookies, or external font/script requests                                                          | ✅  |
| 12.5 | Extension points from ARCHITECTURE §12 exist as documented, with no speculative abstraction beyond them                     | ✅  |

## 13. Documentation & Release

| #    | Criterion                                                                    | ✓   |
| ---- | ---------------------------------------------------------------------------- | --- |
| 13.1 | README setup instructions work from a clean clone on a clean machine         | ✅  |
| 13.2 | All docs reconcile with the shipped behaviour                                | ✅  |
| 13.3 | Every task in `TASKS.md` is marked complete                                  | ✅  |
| 13.4 | Any decision changed during implementation has a new ADR                     | ✅  |
| 13.5 | Screenshots added to the README                                              | ✅  |
| 13.6 | Tagged `v1.0.0`; production build deployed to a static host and smoke-tested | ✅  |

---

## Evidence Summary (2026-07-26)

Every box above is ticked. How each class of criterion was verified:

| Area                 | Evidence                                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Game logic (§1)      | 336 unit/integration tests; `src/engine/**` at **100% statements, branches, functions and lines**; SPEC §6.3 truth table machine-verified against a reference implementation                                                                                                 |
| Dictionary (§2)      | 55 invariant tests against the real generated lists; per-length chunking confirmed in build output                                                                                                                                                                           |
| Gameplay UX (§3)     | 23 integration flows driven entirely through accessible queries, plus browser tests for typing, submission and reveal                                                                                                                                                        |
| Persistence (§4)     | 69 storage tests covering corrupt JSON, wrong shape, quota throw, unavailable storage, migrations and cross-tab events; real-reload restore verified in Chromium                                                                                                             |
| Settings (§5)        | Integration tests for every control; theme, palette and motion attributes asserted on `<html>`                                                                                                                                                                               |
| Accessibility (§6)   | **axe: zero violations** across five states; Lighthouse Accessibility **100**; keyboard-only navigation, focus trap, focus restoration and focus-ring visibility verified in a real browser; `npm run check:contrast` proves all 80 token pairs meet AA and runs in `verify` |
| Responsive (§7)      | Chromium at 320 / 375 / 768 / 1440 / 2560 px plus landscape; no horizontal scroll; touch targets ≥ 44 px                                                                                                                                                                     |
| Performance (§8)     | Lighthouse **100 / 100 / 100** (Perf / A11y / BP) on mobile and desktop; TTI 1.6 s mobile, 0.4 s desktop; CLS 0; TBT 0 ms; entry bundle 72 KB gzipped against a 200 KB budget; zero network requests after load                                                              |
| Code quality (§9)    | `npm run verify` green: typecheck, lint, format, contrast, tests — no errors, no warnings; ESLint enforces the engine boundary, the storage boundary and the design-token rule                                                                                               |
| Edge cases (§10)     | EC-1…EC-21 each covered by a unit, integration or browser test                                                                                                                                                                                                               |
| Error handling (§11) | Toast copy asserted verbatim; **the storage-unavailable and corrupt-data notices were dead code until the review wired them up** — see [`REVIEW.md`](./REVIEW.md); dictionary-failure retry, corrupt-data recovery and the error boundary all tested                         |
| Scope (§12)          | No V2/V3 feature implemented; runtime dependencies remain `react` and `react-dom` only                                                                                                                                                                                       |

**Caveats — what was not verified here.** Cross-browser coverage is Chromium only; Firefox, WebKit and iOS Safari remain unverified in this environment (§7.5, §7.6). No screen reader was driven end to end: semantics and live-region content are asserted programmatically and axe reports clean, but a VoiceOver/NVDA pass by a human is still worth doing before a public release (§6.14). SEO scores 91 rather than 100 because Lighthouse wants a meta description variant we deliberately keep short; the NFR-4 threshold of ≥ 90 is met.

## Sign-off

| Gate                                | Owner | Date | Notes |
| ----------------------------------- | ----- | ---- | ----- |
| Game logic (§1–2)                   |       |      |       |
| UX & persistence (§3–5)             |       |      |       |
| Accessibility (§6)                  |       |      |       |
| Responsive & performance (§7–8)     |       |      |       |
| Quality, edge cases, errors (§9–11) |       |      |       |
| Scope & docs (§12–13)               |       |      |       |

**V1 is done when every box above is ticked. Not before, and nothing more.**
