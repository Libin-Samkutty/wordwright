# Contributing to Wordwright

Working agreements for humans and AI assistants. Read [`SPEC.md`](./SPEC.md) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) first — this document covers _how we work_, not _what we build_.

---

## 1. Ground Rules

1. **The docs are the contract.** If code and docs disagree, either the code is wrong or the doc needs updating **in the same PR**.
2. **V1 only.** Anything in the V2/V3 lists is rejected on sight, however small. Cite [`SPEC.md` §3](./SPEC.md#3-non-goals-v1).
3. **KISS.** Prefer the simplest thing that satisfies the requirement (ADR-005). Abstract on the third occurrence, not the first.
4. **Engine purity is non-negotiable.** No React, DOM, storage, timer, or `Math.random` import inside `src/engine/**` (ADR-003).
5. **Tests are part of the change,** not a follow-up.

---

## 2. Getting Set Up

```bash
npm install
npm run dev
npm run verify      # typecheck + lint + format:check + test:run — run before every commit
```

Node >= 20.19, npm >= 10. Use the repo's ESLint/Prettier — no personal overrides committed.

---

## 3. Coding Standards

### TypeScript

- `strict` mode. **No `any`.** No non-null assertions (`!`) in `src/**` outside test fixtures. Prefer type narrowing and `unknown` at boundaries.
- `type` for unions and object shapes; `interface` only for extensible contracts (`Repository<T>`, `RandomSource`).
- Discriminated unions for state; exhaustive `switch` with a `never` default:
  ```ts
  default: { const _exhaustive: never = action; return state; }
  ```
- `readonly` on engine state fields and array props. Data flowing through the engine is immutable — never mutate, always return new objects.
- Named exports everywhere except React page-level components. No default-export barrels.
- Explicit return types on all exported functions.

### React

- Function components with hooks only. No classes except `ErrorBoundary` (React requires it).
- One component per file; the filename matches the component (`Tile.tsx` → `Tile`).
- Props: an explicit `interface XProps`; destructure in the signature; no prop spreading except in low-level `ui/` wrappers.
- Presentational components take primitives and callbacks — they never read context. Container components and providers own the wiring.
- `React.memo` on components rendered in loops (`Tile`, `Key`). Memoise context values and callbacks (`useMemo`/`useCallback`).
- Effects: one concern per effect, always with cleanup, and an honest dependency array. Never disable `react-hooks/exhaustive-deps` — restructure instead.
- No business logic in components. Rules belong in `engine/`, persistence in `storage/`, reusable behaviour in `hooks/`.

### Styling

- Tailwind utilities only; semantic design tokens for every colour. **A raw colour utility (`bg-green-500`) in a component is a review-blocking defect** (ADR-008).
- Order classes with the Prettier Tailwind plugin (automatic).
- Long class strings: extract a component, not a class-name abstraction.
- Animations use `transform`/`opacity` only, and must have a reduced-motion path.

### Naming

| Kind               | Convention                                       | Example                         |
| ------------------ | ------------------------------------------------ | ------------------------------- |
| Components / files | `PascalCase`                                     | `GuessDistribution.tsx`         |
| Hooks              | `useCamelCase`                                   | `usePhysicalKeyboard.ts`        |
| Functions / vars   | `camelCase`                                      | `evaluateGuess`                 |
| Constants          | `SCREAMING_SNAKE`                                | `MAX_GUESSES`                   |
| Types              | `PascalCase`, no `I`/`T` prefix                  | `GameState`                     |
| Booleans           | `is`/`has`/`can`/`should`                        | `isRevealing`                   |
| Handlers           | `handleX` (local), `onX` (prop)                  | `handleKeyPress` / `onKeyPress` |
| Test files         | `*.test.ts(x)` next to source or in `__tests__/` | `evaluate.test.ts`              |

### Comments

Explain **why**, never **what**. Every non-obvious algorithm cites its requirement:

```ts
// Greens are consumed before yellows so surplus duplicates stay grey (SPEC §6.3, FR-12).
```

No commented-out code, no `TODO` without an owner and a task id.

### Accessibility (enforced in review)

- Semantic HTML first; ARIA only when semantics are insufficient.
- Every interactive element has an accessible name; every icon-only button has `aria-label`.
- Never remove focus outlines without an equivalent replacement.
- State is never communicated by colour alone.

---

## 4. Git Workflow

- `main` is always releasable and protected: no direct pushes, PRs only, `npm run verify` green.
- Branch naming: `<type>/<task-id>-<slug>` — `feat/T-10-evaluate-guess`, `fix/T-31-reveal-timer-leak`, `docs/T-48-readme-screenshots`.
- One task per branch, one logical change per commit. Rebase onto `main` before opening a PR; keep history linear (squash-merge).
- Never commit: `.env`, build output, `node_modules`, editor configs, or generated coverage.

---

## 5. Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject> (<task-id>)

[optional body — why, not what]
[optional footer — BREAKING CHANGE, Refs]
```

**Types:** `feat` · `fix` · `docs` · `style` (formatting only) · `refactor` · `perf` · `test` · `build` · `ci` · `chore` · `revert`
**Scopes:** `engine` · `dict` · `storage` · `state` · `ui` · `board` · `keyboard` · `stats` · `settings` · `a11y` · `test` · `build` · `docs`

Subject: imperative mood, lower case, no trailing period, ≤ 72 chars.

```
feat(engine): add two-pass guess evaluation (T-10)
fix(board): stop reveal timer firing after unmount (T-31)
test(storage): cover corrupt json and quota failures (T-19)
docs(spec): correct ALLOY/LULLS truth table row
refactor(ui): extract ConfirmDialog from DangerZone (T-38)
```

Body when the _why_ isn't obvious:

```
feat(state): debounce session writes to 150ms (T-22)

Writing on every keystroke caused a visible jank on low-end Android.
Flush on visibilitychange/pagehide keeps iOS safe where beforeunload is unreliable.
```

---

## 6. Pull Request Checklist

Copy into the PR description; every box must be ticked or explicitly justified.

**Scope**

- [ ] Implements exactly one task from [`TASKS.md`](./TASKS.md); the task id is in the title
- [ ] No V2/V3 functionality snuck in ([`SPEC.md` §3](./SPEC.md#3-non-goals-v1))
- [ ] Requirement IDs satisfied are listed (`FR-x`, `A11Y-x`, `EC-x`)

**Code quality**

- [ ] `npm run verify` passes locally
- [ ] No `any`, no non-null assertions, no disabled lint rules (or each is justified inline)
- [ ] No dead code, no commented-out blocks, no stray `console.*`
- [ ] No new runtime dependency (or the PR argues for it explicitly)
- [ ] Engine files import nothing from React/DOM/storage
- [ ] No raw colour utilities in components — tokens only

**Testing**

- [ ] New logic has unit tests; new UI has behaviour tests queried by role/label
- [ ] Engine changes keep branch coverage at 100%
- [ ] Edge cases from the SPEC that this touches are covered
- [ ] Tests are deterministic (seeded randomness, fake timers, fixture dictionaries)

**Accessibility**

- [ ] Keyboard-only operable; focus order sensible; focus visible
- [ ] Accessible names on all new interactive elements
- [ ] State changes announced where a sighted user would see feedback
- [ ] Reduced-motion path verified
- [ ] Contrast checked for any new colour pairing

**UX**

- [ ] Works at 320 px and on a landscape phone
- [ ] Loading and error states handled — no dead ends
- [ ] No layout shift or flash of wrong theme

**Documentation**

- [ ] Docs updated if behaviour changed
- [ ] A new significant decision is recorded in [`DECISIONS.md`](./DECISIONS.md)
- [ ] Task marked complete in [`TASKS.md`](./TASKS.md)

---

## 7. Testing Expectations

| Change       | Required tests                                                       |
| ------------ | -------------------------------------------------------------------- |
| Engine logic | Unit tests, table-driven where a truth table exists, 100% branches   |
| Storage      | Happy path + corrupt data + unavailable storage + migration          |
| Hooks        | Behaviour via a test component, fake timers for anything time-based  |
| Components   | Role/label queries, keyboard interaction, accessible name assertions |
| Flows        | Integration test through `renderWithProviders`, citing the AC id     |
| Bug fix      | A regression test that fails before the fix                          |

**Rules.** Test behaviour, not implementation — no snapshots of whole components, no querying by class name, `data-testid` only when no accessible query exists. Never test against the real dictionaries; use `src/test/fixtures.ts`. Name tests after the requirement: `it('assigns yellow left-to-right when the answer has fewer copies (FR-13)')`.

---

## 8. Documentation Guidelines

- Update the doc in the same PR as the behaviour change; a follow-up PR is not acceptable.
- Requirements keep stable IDs. Never renumber; deprecate instead.
- New architectural decisions become a new ADR — existing ADRs are immutable and are superseded, never edited.
- README stays accurate for setup and scripts; it is the first thing a new contributor reads.
- Prefer tables and short sections over prose. Code snippets in docs must be valid TypeScript.

---

## 9. Review Guidelines

Reviewers check, in order: **correctness against the SPEC → accessibility → tests → simplicity → performance → style** (style is mostly automated, so spend attention on the first four).

Reject: speculative abstraction (ADR-005), business logic in components, untested engine branches, colour-only state, new dependencies without justification, silent failures.

Be specific and cite requirement or ADR IDs. Suggest refactors only when they are justified by a concrete, present problem — see [`prompts/review.md`](../prompts/review.md).
