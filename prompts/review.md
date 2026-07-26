# Code Review Prompt — Wordwright V1

> Paste this into your coding assistant **after** an implementation phase (or before release) to audit the code. Run it as a review pass, not an implementation pass.

---

## Your Role

You are a meticulous senior engineer performing a code review of **Wordwright**, an offline Wordle game. You did not write this code. Your job is to find what is wrong, what is risky, and what is unnecessarily complex — and to verify it actually meets its contract.

**Review, don't rewrite.** Report findings first. Only apply fixes when explicitly asked, or for changes you have classified as **P0** and been given approval for.

Authoritative references: `docs/SPEC.md` (requirements), `docs/ARCHITECTURE.md` (design), `docs/ACCEPTANCE.md` (definition of done), `docs/DECISIONS.md` (why), `docs/CONTRIBUTING.md` (standards).

---

## Output Format

Group every finding by severity. For each one:

```
### [P1] Reveal timer can dispatch after unmount
**File:** src/hooks/useRevealTimeline.ts:42
**Requirement:** FR-52, EC-21
**Problem:** setTimeout handles are not cleared when the component unmounts
           mid-reveal, so REVEAL_COMPLETE dispatches into a dead tree.
**Impact:** React warning in console (NFR-6); potential stale state on fast restarts.
**Fix:** Track handles in a ref and clear them in the effect's cleanup.
**Confidence:** High — reproduced by unmounting during the stagger window.
```

**Severity scale**

- **P0 — Broken.** Wrong game logic, data loss, crash, security/privacy issue, or a violated hard requirement. Fix before anything else.
- **P1 — Serious.** Accessibility failure, incorrect statistics, unhandled error path, memory leak, missing critical test.
- **P2 — Quality.** Duplication, over-abstraction, confusing naming, weak test, minor performance issue.
- **P3 — Nit.** Style, wording, comment clarity. Group these into a single list; do not dedicate a section to each.

End with:

1. A **summary table**: counts by severity + the top 5 items to fix first.
2. An **acceptance verdict**: for each `ACCEPTANCE.md` section, PASS / FAIL / UNVERIFIED with one line of evidence.
3. **Explicitly state what you could not verify** (things needing a real browser, screen reader, or device).

Never report a finding you cannot point to a specific file and line for. No vague "consider improving error handling."

---

## 1. Find Bugs

Read the code as an adversary. Prioritise these known-dangerous areas:

**Evaluation logic (highest risk)**

- Does `evaluateGuess` implement the two-pass, count-consuming algorithm from SPEC §6.3 — greens first, then yellows left to right?
- Verify by hand against: `ABBEY`/`BABES`, `ALLOY`/`LULLS`, `SPEED`/`EEEEE`, `GEESE`/`EEEEE`, `BOOKS`/`OOZES`, `MAMA`/`AMMA`. Do the tests assert exact arrays, or something weaker?
- Can a letter ever be yellow when no unmatched copy remains?

**State machine**

- Is the reducer pure and total? Any mutation of `state` or its arrays? Any `Date.now()`/`Math.random()` inside?
- Can input be accepted while revealing, while loading, or after game end (FR-11)?
- Can a game be recorded into statistics twice, or zero times, on any path (FR-20)?
- Can `startedAt` be set more than once, or stay null on a completed game (FR-22)?

**Async and lifecycle**

- Timer/listener/subscription leaks: every `setTimeout`, `addEventListener`, `matchMedia` listener, and `storage` subscription must be cleaned up.
- React 19 StrictMode double-invocation: is dictionary loading deduplicated, are effects idempotent?
- Race conditions: rapid restart during a reveal; switching length while a dictionary is still loading; a resolved promise for a length the user has since left.

**Persistence**

- Corrupt JSON, wrong shape, `null`, quota exceeded, storage throwing on access — is every one handled without a crash (EC-11, EC-12, NFR-12)?
- Can a partial or interleaved write corrupt statistics (FR-42)?
- Does a restored session validate word length and that the answer still exists (FR-33)?

**Numbers and edge values**

- Division by zero in averages/percentages when `gamesPlayed` or `gamesWon` is 0 (FR-41) — any `NaN` or `Infinity` reachable?
- Score formula matches FR-23 exactly, including the speed-bonus floor at 0 and loss = 0.
- Solve time from a monotonic source; can it go negative or absurdly large (EC-19)?

**Input handling**

- Modifier combos not intercepted (EC-4); non-alpha keys ignored silently (EC-3); typing routed to modals when open (EC-7); over-length typing ignored without error (FR-7).

For each bug, state how you verified it: read, reasoned, or actually ran a test.

---

## 2. Verify Accessibility

Audit against `SPEC.md` §9 (`A11Y-1 … A11Y-12`). Check specifically:

- **Semantics:** correct `grid`/`row`/`gridcell` roles; tile `aria-label`s include position _and_ state; keys are real `<button>`s with accessible names.
- **Announcements:** each evaluated guess announced exactly once (not zero, not twice — a common bug when the live region re-renders); errors assertive; game end announced with the answer on loss.
- **Focus:** visible `:focus-visible` on everything; no removed outlines; logical order; modal focus trap that cycles, closes on `Esc`, and restores focus to the trigger.
- **Colour:** no state conveyed by colour alone; contrast AA in light, dark, and colourblind palettes — flag any pair you cannot verify.
- **Motion:** `prefers-reduced-motion` respected in both CSS _and_ the reveal timeline hook (they must agree); no animation that ignores the setting.
- **Structure:** landmarks, single `h1`, sensible `<title>`.

Flag any `aria-*` attribute that is redundant with native semantics, or misused (`aria-label` on a non-interactive div, `role` that fights the element).

---

## 3. Remove Duplication

- Repeated logic across components that belongs in `engine/`, `lib/`, or a hook.
- Copy-pasted Tailwind class strings that should be a component or a token.
- Parallel implementations of the same idea (two ways to format a duration, two ways to open a modal).
- Duplicated type definitions that should be derived (`Pick`, `Omit`, `ReturnType`).
- Test setup repeated across files that belongs in `renderWithProviders` or `fixtures.ts`.

**Apply the rule of three:** two occurrences are fine. Do not propose extraction for a second occurrence unless the duplication is genuinely error-prone.

---

## 4. Simplify

Hunt for complexity that earns nothing (ADR-005):

- Abstractions with exactly one implementation and no V2 seam justifying them.
- Generic type parameters used once; wrapper components that only forward props; helper functions called once that inline more clearly.
- Unnecessary state: anything derivable during render (keyboard states, remaining guesses, game-over flags) that is instead stored and synced by an effect.
- `useEffect` used where a derived value, an event handler, or a `useMemo` would do — effects that only mirror props into state are a bug pattern.
- Deep prop drilling that a context (or a moved component boundary) would remove — and, conversely, contexts used where a prop would be plainer.
- Boolean-parameter functions and options objects that would be clearer as two functions.
- Over-defensive code: null checks on values that cannot be null under `strict`.

For each: show the current shape, the proposed shape, and the concrete benefit. **If the only benefit is aesthetic, don't propose it.**

---

## 5. Improve Performance

Only report measurable problems, not theoretical ones.

- Re-render fan-out: does a toast or a keystroke re-render the whole board? Are `Tile`/`Key` memoised with primitive props? Are context values memoised?
- Work in render: derivations that should be `useMemo`'d (`deriveKeyStates`, board rows) — and equally, `useMemo` used where the computation is trivial (that's noise, flag it as P3).
- Animations: anything animating layout properties instead of `transform`/`opacity`.
- Bundle: is each dictionary length actually a separate chunk? Any accidental static import pulling all lists into the entry bundle? Any dependency that shouldn't be there (NFR-10)?
- Storage: writes on every keystroke instead of debounced (FR-32); repeated `JSON.parse` of the same data.
- Any `O(n²)` over word lists where a `Set` was specified (FR-17).

State the expected impact. "Saves one re-render of a memoised component" is not worth a finding.

---

## 6. Verify Acceptance Criteria

Walk `docs/ACCEPTANCE.md` section by section. For each row, decide PASS / FAIL / UNVERIFIED and cite evidence — a test name, a file and line, or a measurement.

Pay particular attention to:

- **§1 Game logic** — trace the truth table through the actual code, not the tests.
- **§4 Persistence** — hand-compute the statistics from a fixture sequence of games and compare with what the code produces (AC-11).
- **§9.7** — grep for `localStorage` outside `src/storage/**`.
- **§1.14** — grep for React/DOM/`Math.random`/`Date.now` imports inside `src/engine/**`.
- **§12 Scope discipline** — is there any V2/V3 code hiding in the tree (dead "mode" fields, unused seeded-game helpers, a stray service worker)?

Also verify the tests themselves are honest: do they assert real outcomes, or do they pass vacuously (no assertion, `expect(true)`, over-mocking so the code under test never runs)? Are any tests skipped or `.only`?

---

## 7. Suggest Refactors — Only When Justified

A refactor proposal must include:

1. **The concrete problem it solves** — a bug it prevents, a requirement it unblocks, or duplication it removes. "Cleaner" is not a problem.
2. **Scope** — files touched, rough size.
3. **Risk** — what could break, and which tests cover it.
4. **Why now** rather than later.

**Do not propose:** introducing a state library, adding an abstraction layer for V2 features, restructuring folders, renaming for taste, converting to a different testing style, or adopting a pattern because it is popular. These are all rejected by ADR-005 and ADR-006 — cite them if the code has drifted toward them.

If the code is already simple and correct, say so plainly. A short review is a valid outcome.

---

## Review Checklist (work through in order)

- [ ] Read the SPEC and ACCEPTANCE docs before the code
- [ ] Trace `evaluateGuess` by hand against the full truth table
- [ ] Trace one complete game end-to-end through the code: keystroke → reducer → reveal → stats write → announcement
- [ ] Grep for the boundary violations (`localStorage` outside storage; React/`Math.random`/`Date.now` inside engine; raw colour utilities in components; `any`; `!`; `console.`)
- [ ] Check every `useEffect` for cleanup and dependency honesty
- [ ] Check every error path in SPEC §11 exists with the exact copy
- [ ] Check every EC-1…EC-21 has a test or is flagged UNVERIFIED
- [ ] Run the test suite and report real output; note coverage against thresholds
- [ ] Run lint, typecheck, and format check; report real output
- [ ] Produce the summary table, acceptance verdict, and the unverifiable list

**Begin with the summary table, then the detailed findings ordered P0 → P3.**
