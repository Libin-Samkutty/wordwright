# Code Review — Wordwright V1

**Date:** 2026-07-26 · **Scope:** full codebase against [`ACCEPTANCE.md`](./ACCEPTANCE.md) · **Method:** [`prompts/review.md`](../prompts/review.md)

---

## Summary

| Severity         | Found | Fixed | Open |
| ---------------- | ----- | ----- | ---- |
| **P0 — Broken**  | 0     | 0     | 0    |
| **P1 — Serious** | 3     | 3     | 0    |
| **P2 — Quality** | 1     | 1     | 0    |
| **P3 — Nit**     | 0     | 0     | 0    |

**Top findings, in order of severity:**

1. **[P1]** Storage-unavailable warning was never shown to the player (EC-11, SPEC §11)
2. **[P1]** Corrupt-data warning was never shown to the player (EC-12, SPEC §11)
3. **[P1]** `role="radiogroup"` promised arrow-key navigation that did not exist (A11Y-1)
4. **[P2]** Duplicated persistence guard across two overlapping effects

The evaluation algorithm, state machine, storage layer, and boundary rules came through clean. Everything below was found by mechanical checking, differential testing, or driving the real browser — not by reading code and forming opinions.

---

## Verification performed

| Check                     | Method                                                                                                                                                                                      | Result                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Evaluation correctness    | **206,561 cases** vs an independently written reference: exhaustive over all 4-letter words on a 3-letter alphabet (the duplicate-heavy space), plus 200k random cases at all three lengths | **0 mismatches**                               |
| Engine purity (ADR-003)   | grep for React/DOM/`Date.now`/`Math.random` imports                                                                                                                                         | clean                                          |
| Storage boundary (NFR-11) | grep for `localStorage` outside `src/storage`                                                                                                                                               | clean                                          |
| Design tokens (ADR-008)   | grep for raw palette utilities in components                                                                                                                                                | clean                                          |
| Type safety (NFR-7)       | grep for `any`, non-null assertions, stray `console`                                                                                                                                        | clean                                          |
| Timer/listener leaks      | every `setTimeout`/`addEventListener` paired against its cleanup, file by file                                                                                                              | all balanced                                   |
| Double-recording (FR-20)  | completed a game, then reloaded twice, reading `gamesPlayed` from storage each time                                                                                                         | 1 → 1 → 1                                      |
| Load races                | hammered the length selector 16× faster than chunks resolve; switched length mid-reveal                                                                                                     | settles correctly, board stays usable          |
| Test honesty              | scanned every test for a missing `expect`, `expect(true)`, or bare `toBeTruthy`                                                                                                             | 548 assertions, none vacuous                   |
| Skipped tests             | grep for `.only` / `.skip` / `xit`                                                                                                                                                          | none                                           |
| Scope (§12)               | grep for daily/hard-mode/multiplayer/PWA/achievement code                                                                                                                                   | none (only the word `DAILY` in the dictionary) |
| Dependencies (NFR-10)     | `package.json`                                                                                                                                                                              | `react`, `react-dom` only                      |
| Network (NFR-5)           | grep for `fetch`/`XHR`/`axios`                                                                                                                                                              | none                                           |

---

## Findings

### [P1] Storage-unavailable warning never reached the player

**File:** `src/state/` (missing wiring) · **Requirement:** EC-11, SPEC §11

**Problem.** `safeStorage.isPersistent` correctly reported when storage was blocked — Safari private mode, disabled cookies — and the in-memory fallback kept the game playable. But nothing consumed that flag. `grep isPersistent` outside `safeStorage.ts` returned nothing.

**Impact.** A player could build a long streak believing it was being saved, close the tab, and lose everything with no warning. SPEC §11 mandates the notice; the app degraded silently instead.

**Fix.** Added `StorageNotices`, mounted inside the toast provider, which raises `Progress can't be saved in this browser mode` once per session. Verified in Chromium with `localStorage` stubbed to throw.

---

### [P1] Corrupt-data warning never reached the player

**File:** `src/state/` (missing wiring) · **Requirement:** EC-12, SPEC §11

**Problem.** `createRepository` accepted an `onIssue` callback and called it correctly on unparseable or malformed data. No caller ever passed one, so every repository discarded bad data silently.

**Impact.** Statistics could reset to zero with no explanation — indistinguishable from a bug, and alarming to a player who had just lost a 40-game streak.

**Fix.** `reportStorageIssue` is now passed to all four repositories; `StorageNotices` surfaces `Saved data was reset because it couldn't be read`. The flag lives in a plain module (`storageIssues.ts`) because the failure occurs inside a `useState` initialiser, before any component can hold state.

---

### [P1] `role="radiogroup"` promised keyboard behaviour it did not implement

**File:** `src/components/game/LengthSelector.tsx` · **Requirement:** A11Y-1

**Problem.** The length selector declared `role="radiogroup"` with `role="radio"` children, and the component's own doc comment claimed it "gives screen-reader users arrow-key navigation". Pressing `ArrowRight` did nothing. The comment described an intention that was never coded.

This is worse than plain buttons: the role tells assistive technology to expect arrow-key navigation and a "2 of 3" position, so a screen-reader user is actively misled. axe cannot catch it — the markup is valid; only the behaviour is missing.

**Fix.** Implemented the ARIA radiogroup pattern properly — Arrow keys move and wrap, `Home`/`End` jump to the ends, and a roving `tabIndex` makes the group a single tab stop. The handler sits on each radio rather than the container, so the group never needs to be focusable (which `jsx-a11y/interactive-supports-focus` correctly flagged when I first put it on the wrapper). Covered by two browser tests.

---

### [P2] Duplicated persistence guard across overlapping effects

**File:** `src/state/GameProvider.tsx` · **Requirement:** FR-32

**Problem.** Two effects both keyed on `[state]` and both repeated the same three-part condition:

```ts
if (state.status === 'loading' || state.status === 'error' || state.id === 'pending') return;
```

The condition is subtle — getting it wrong writes a session that `validateSession` must then reject on the next load — and it was stated twice, in two places that had to stay in sync.

**Fix.** Extracted a named `isPersistable(state)` predicate and merged the two effects into one that registers the debounce and both flush listeners together. Net −7 lines, one source of truth. Justified against ADR-005 not by count but by risk: the duplication was of a _condition_, where drift is silent.

---

## Considered and rejected

Following the prompt's instruction to propose refactors only when justified:

- **Splitting `GameProvider` (349 lines).** It is the single wiring point between engine, dictionary, storage and stats — that is its job. Splitting it would scatter one coherent concern across files and add indirection for no defect prevented. ADR-005.
- **Extracting a `<Toggle>` from `SettingsModal`.** Used twice, in one file, ~20 lines. Rule of three.
- **Memoising `formatDuration` / `formatNumber`.** Called a handful of times per render of a modal. No measurable cost.
- **Replacing Context with a store.** No measured re-render problem; contexts are already split per slice and values memoised. ADR-006.
- **Adding `robots.txt` variants to chase SEO 100.** The 91 comes from Lighthouse wanting a longer meta description than we want to ship. NFR-4 requires ≥ 90.

---

## Acceptance verdict

| Section            | Verdict                  | Evidence                                                                        |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| §1 Game logic      | **PASS**                 | 206,561-case differential test, 0 mismatches; engine 100% coverage              |
| §2 Dictionary      | **PASS**                 | 55 invariant tests against the real lists                                       |
| §3 Gameplay UX     | **PASS**                 | 23 integration flows + browser tests                                            |
| §4 Persistence     | **PASS**                 | 108 storage tests; double-record and reload-restore verified in browser         |
| §5 Settings        | **PASS**                 | All controls tested; attributes asserted on `<html>`                            |
| §6 Accessibility   | **PASS**                 | axe zero violations ×5 states; Lighthouse a11y 100; radiogroup pattern now real |
| §7 Responsive      | **PASS (Chromium only)** | 320–2560 px + landscape; Firefox/WebKit **UNVERIFIED**                          |
| §8 Performance     | **PASS**                 | Lighthouse 100/100/100; TTI 1.6 s mobile; 72 KB gzipped                         |
| §9 Code quality    | **PASS**                 | `npm run verify` exit 0; boundaries enforced by lint                            |
| §10 Edge cases     | **PASS**                 | EC-1…EC-21 each covered                                                         |
| §11 Error handling | **PASS** _(was FAIL)_    | All four messages now reachable; two were dead before this review               |
| §12 Scope          | **PASS**                 | No V2/V3 code; deps are react + react-dom                                       |

## Could not be verified here

Stated plainly, as the prompt requires:

- **Firefox, WebKit, iOS Safari.** Only Chromium is installed in this environment (§7.5, §7.6).
- **Real screen-reader behaviour.** Semantics are asserted programmatically and axe is clean, but no VoiceOver/NVDA session was run (§6.14). The radiogroup finding is precisely the kind of defect that only a real AT user or a behavioural test catches — worth a human pass before public release.
- **Physical device testing.** Emulated viewports only; no real touch hardware.
- **Long-run memory behaviour.** No 20-game heap-snapshot comparison (§8.6).

---

## Final state after review

```
npm run verify   exit 0   415 unit/integration tests, contrast audit, lint, types, format
npx playwright   98 passed (desktop + mobile)
```

Three P1 defects fixed, one P2 simplification, four new regression tests. No P0s found: the game logic, state machine, and persistence layer were correct as written.
