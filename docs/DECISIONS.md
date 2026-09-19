# Wordwright — Architecture Decision Records

ADR-style notes explaining _why_ the design is what it is. Each record is immutable once accepted: to change a decision, add a new ADR that supersedes it. This document exists to stop mid-implementation redesign debates.

**Format:** Context → Decision → Consequences → Alternatives considered.

| #                                                                     | Title                                           | Status   |
| --------------------------------------------------------------------- | ----------------------------------------------- | -------- |
| [001](#adr-001--no-backend)                                           | No backend                                      | Accepted |
| [002](#adr-002--localstorage-for-all-persistence)                     | LocalStorage for all persistence                | Accepted |
| [003](#adr-003--framework-independent-game-engine)                    | Framework-independent game engine               | Accepted |
| [004](#adr-004--separate-answer-and-guess-dictionaries)               | Separate answer and guess dictionaries          | Accepted |
| [005](#adr-005--kiss-over-abstraction)                                | KISS over abstraction                           | Accepted |
| [006](#adr-006--react-context--usereducer-instead-of-a-state-library) | Context + useReducer, no state library          | Accepted |
| [007](#adr-007--bundled-dictionaries-loaded-via-dynamic-import)       | Bundled dictionaries via dynamic import         | Accepted |
| [008](#adr-008--design-tokens-for-theming-and-colourblind-mode)       | Design tokens for theming                       | Accepted |
| [009](#adr-009--injected-randomness)                                  | Injected randomness                             | Accepted |
| [010](#adr-010--six-guesses-at-every-word-length)                     | Six guesses at every word length                | Accepted |
| [011](#adr-011--tailwind-for-styling)                                 | Tailwind for styling                            | Accepted |
| [012](#adr-012--vitest-over-jest)                                     | Vitest over Jest                                | Accepted |
| [013](#adr-013--no-pwa-in-v1)                                         | No PWA in V1                                    | Accepted |
| [014](#adr-014--documentation-first-workflow)                         | Documentation-first workflow                    | Accepted |
| [015](#adr-015--toolchain-version-pins-typescript-6-eslint-9)         | Toolchain version pins                          | Accepted |
| [016](#adr-016--dependency-overrides-for-the-glob-stack)              | Dependency overrides for the glob stack         | Accepted |
| [017](#adr-017--generated-word-lists-from-public-domain-sources)      | Generated word lists from public-domain sources | Accepted |
| [018](#adr-018--tailwind-source-scanning-must-be-scoped-explicitly)   | Tailwind source scanning scoped explicitly      | Accepted |
| [019](#adr-019--browser-level-testing-with-playwright)                | Browser-level testing with Playwright           | Accepted |
| [020](#adr-020--in-game-help-is-discoverable-not-interruptive)        | In-game help is discoverable, not interruptive  | Accepted |

---

## ADR-001 — No backend

**Context.** Wordle's core loop needs no server: the dictionary is small, evaluation is a pure function, and there is exactly one player. A server would add hosting cost, deployment complexity, latency, privacy obligations, and an availability dependency for a game that should work on a plane.

**Decision.** V1 ships as a static SPA. No API, no server-side rendering, no serverless functions, no third-party services (no analytics, no fonts from CDNs, no error reporting).

**Consequences.**

- Deployable to any static host; the build output is the product.
- The answer is present in client memory and LocalStorage — cheating is trivially possible. Accepted: this is a single-player puzzle, not a competition. V3 competitive modes will need server-side validation, which the pure engine can be reused for.
- No cross-device sync, no shared daily word for everyone. Daily challenge in V2 will be _deterministic-by-date_, computed locally from a seed, which gives the same word to everyone without a server.
- Zero attack surface, zero PII, no cookie banner, no GDPR footprint.

**Alternatives.** (a) Thin API for the daily word — rejected, a date-seeded PRNG achieves the same locally. (b) Edge function for anti-cheat — rejected as V3 scope.

---

## ADR-002 — LocalStorage for all persistence

**Context.** We must persist settings, statistics, and an in-progress game. Options: LocalStorage, IndexedDB, cookies, OPFS, in-memory only.

**Decision.** LocalStorage, behind a `Repository<T>` abstraction with versioned keys (`wordwright:v1:<slice>`), runtime validation, a migration chain, and an in-memory fallback.

**Consequences.**

- Synchronous reads mean settings and theme apply before first paint — no flash, no async provider gymnastics.
- Our largest payload (50 recent games + aggregates) is a few KB, far below the ~5 MB quota.
- LocalStorage is unavailable or throwing in some contexts (Safari private mode, blocked cookies, quota 0). The `safeStorage` probe plus in-memory fallback keeps the app playable (EC-11).
- Data is per-origin and per-browser; clearing site data wipes stats. Documented in the UI's danger zone.
- Cross-tab consistency handled by the `storage` event for settings and stats; the active session is intentionally _not_ synced (last write wins).

**Why the repository indirection at all,** given ADR-005? Because it is the single seam that makes V2 migrations and V3 cloud sync possible, it is ~60 lines, and it centralises the try/catch that would otherwise be scattered through every component. It pays for itself immediately.

**Alternatives.** (a) IndexedDB — async API, more code, transactional guarantees we don't need for kilobytes of data; reconsider only if V2 stores per-day history at scale. (b) Cookies — sent on every request, size-limited, pointless without a server. (c) In-memory only — fails the streak/stats requirement outright.

---

## ADR-003 — Framework-independent game engine

**Context.** Game rules (evaluation, validation, scoring, state transitions) are the highest-value, longest-lived, most bug-prone part of the app. UI frameworks change; Wordle rules do not.

**Decision.** All rules live in `src/engine/` as pure TypeScript with **zero imports from React, the DOM, `localStorage`, timers, or `Math.random`**. The engine exposes a reducer plus pure helpers. Impurity (randomness, clock, dictionary) is injected as parameters.

**Consequences.**

- Engine tests run in a node environment in milliseconds with no rendering — this is why 100% branch coverage is affordable (NFR-8).
- The duplicate-letter algorithm — historically the #1 source of Wordle-clone bugs — is isolated and exhaustively tested against a truth table.
- The same engine can back a V2 web worker, a V2 daily-challenge precomputation, or a V3 server-side validator with no changes.
- Cost: a small amount of plumbing, notably dictionary validation being performed in the provider and its _result_ dispatched into the reducer, rather than the reducer looking words up itself. This is a deliberate trade and is documented in ARCHITECTURE §3.2.

**Alternatives.** (a) Rules inside React hooks — faster to write, far harder to test, and couples the most stable code to the least stable layer. (b) A class-based `Game` object with internal state — mutable, harder to serialise for persistence, and a poor fit for React's snapshot rendering model.

---

## ADR-004 — Separate answer and guess dictionaries

**Context.** A single word list forces a bad choice: a small list rejects legitimate guesses ("that's a real word!"), while a large list yields obscure answers no one can deduce (`XYLYL`).

**Decision.** Two lists per length. `answers-<n>` is small and curated (common, fair, no profanity, no proper nouns). `guesses-<n>` is large and permissive, and is a strict superset of the answer list (enforced by a test).

**Consequences.**

- Answers are always solvable and satisfying; guesses are rarely rejected unfairly.
- Guess validation is one `Set.has` on the large list (O(1), FR-17).
- Two artefacts per length to curate and keep in sync; the superset invariant test catches drift.
- Slightly larger bundle — mitigated by per-length code splitting (ADR-007).
- Enables V2 difficulty settings ("common answers only" vs "expanded") purely as data selection, and V3 community dictionaries as an extra registry entry.

**Alternatives.** (a) One list — rejected for the reasons above; it is the single most common complaint about Wordle clones. (b) Runtime frequency filtering — needs frequency data and produces unpredictable results; curation at build time is simpler and reviewable.

---

## ADR-005 — KISS over abstraction

**Context.** V2 and V3 lists are long and tempting. The classic failure mode of a documentation-first project is building a plugin architecture for features that may never ship.

**Decision.** Build the simplest implementation that satisfies V1. Prepare for the future only through **cheap seams**: function parameters, data maps, discriminated-union fields, and design tokens. No abstract base classes, no plugin registries, no dependency-injection container, no premature generics, no "mode strategy" interfaces, no feature flags.

Concretely, allowed seams are exactly: `RandomSource`, the dictionary registry map, `Repository<T>`, injected validation predicates, the `GameStatus`/action unions, and CSS design tokens. Everything else is written for today's requirement.

**Consequences.**

- Less code, fewer files, faster comprehension, easier review.
- Some V2 features will require touching several files — that is acceptable and cheaper in expectation than maintaining speculative indirection.
- Reviewers have an explicit rule to cite when rejecting speculative abstraction: _"ADR-005 — is this needed by V1?"_
- Rule of thumb adopted: **abstract on the third occurrence**, not the first or second.

**Alternatives.** A generalised game-mode framework up front — rejected; it would triple the surface area for hypothetical requirements whose real shape we cannot know yet.

---

## ADR-006 — React Context + useReducer instead of a state library

**Context.** State comprises four small, mostly independent slices (game, stats, settings, toasts). Candidates: Redux Toolkit, Zustand, Jotai, XState, or built-in React.

**Decision.** `useReducer` + split Contexts, one per slice, with memoised values.

**Consequences.**

- Zero runtime dependencies beyond React (NFR-10) and no library API to learn.
- The game reducer is already a pure function of `(state, action)` — the engine _is_ the store; React just hosts it.
- Manual `useMemo`/`useCallback` discipline is required to avoid needless re-renders; split contexts bound the blast radius.
- Time-travel debugging and devtools are lost. Acceptable for this size; the reducer is trivially testable in isolation instead.
- If a real performance issue appears, migrating to `useSyncExternalStore` or Zustand is mechanical because all mutations already flow through reducers/repositories (NFR-11).

**Alternatives.** (a) Redux Toolkit — boilerplate and a dependency for four slices. (b) Zustand — attractive, but Context is sufficient and dependency-free. (c) XState — the state chart is genuinely small (§3.2); a hand-written reducer is clearer here.

---

## ADR-007 — Bundled dictionaries loaded via dynamic import

**Context.** Three lengths × two lists ≈ tens of thousands of words. Loading everything up front hurts TTI (NFR-2); fetching at runtime breaks the offline guarantee (NFR-5).

**Decision.** Word lists are TypeScript modules bundled at build time, loaded per length through `import('./data/lists-<n>')`, cached in memory, with in-flight deduplication.

**Consequences.**

- A 5-letter player never downloads 4- or 6-letter data; the initial bundle stays within NFR-1.
- Dynamic import of a same-origin, already-cached asset works offline after first load — no `fetch`, no network dependency.
- We get an honest loading state (FR-56) and a real error path (EC-14) instead of a fake one.
- Adding a length is two data files plus one registry line (FR-29).
- Cost: async initialisation on first play of each length, and StrictMode double-invocation must be deduplicated (handled in `loadDictionary`).
- Word lists are compiled by the bundler; they must be plain arrays with no computation so tree-shaking and minification stay predictable.

**Alternatives.** (a) JSON in `public/` fetched at runtime — reintroduces network semantics and a failure mode we would then have to cache manually. (b) One static import of everything — simplest, but ~150–300 KB of words on first paint for no benefit. (c) Compressed/encoded blobs — premature; revisit only if the bundle budget is breached.

---

## ADR-008 — Design tokens for theming and colourblind mode

**Context.** We need light, dark, system, and a colourblind-safe palette in V1, and arbitrary themes in V2, without rewriting components.

**Decision.** All colour flows through semantic CSS custom properties (`--color-tile-correct`, `--color-surface`, …). Themes are attribute switches on `<html>`: `class="dark"`, `data-palette="cb"`. Components reference tokens via Tailwind and never hard-code a colour.

**Consequences.**

- Colourblind mode is a token swap (blue/orange), not a component change — plus non-colour markers so colour is never the only signal (A11Y-8).
- V2 themes are new token sets; zero component churn.
- Contrast can be audited in one file rather than across dozens of components.
- Discipline required: a raw `bg-green-500` in a component is a review-blocking defect.
- Theme is applied by an inline script before hydration to avoid a flash of incorrect theme.

**Alternatives.** (a) Tailwind `dark:` variants everywhere — doubles class lists and does not extend to a third palette. (b) CSS-in-JS theme provider — a runtime dependency and styling cost we don't need.

---

## ADR-009 — Injected randomness

**Context.** Random answer selection makes tests non-deterministic, and V2 needs date-seeded and shareable-seed games.

**Decision.** The engine depends on a `RandomSource { next(): number }` interface. Production passes a `Math.random` wrapper; tests pass fixed sequences; V2 will pass `seededRandom(seed)` (mulberry32).

**Consequences.**

- Every engine test is deterministic and reproducible; a failing case can be pinned by seed.
- Daily challenge and shareable seeded games become configuration, not new rules (ARCHITECTURE §12).
- Trivial cost: one parameter threaded through `createGame`.

**Alternatives.** Calling `Math.random()` inside the engine and stubbing the global in tests — brittle, leaks between tests, and blocks seeded modes.

---

## ADR-010 — Six guesses at every word length

**Context.** 4-letter words have a smaller search space than 6-letter words, so a difficulty-scaled guess count (e.g. 5/6/7) is arguable.

**Decision.** Exactly 6 guesses for all lengths, per the product requirement.

**Consequences.**

- One board shape, one loop, one distribution bucket set (1–6) — stats stay comparable across lengths.
- 4-letter mode plays easier and 6-letter harder; this is expressed through the **score multiplier** (FR-23) rather than the guess count, which keeps the UI identical.
- `MAX_GUESSES` remains a single named constant, so a V2 mode that varies it is a small change if ever wanted.

**Alternatives.** Variable guesses per length — complicates the distribution chart, breaks cross-length comparability of stats, and adds a rule players must learn.

---

## ADR-011 — Tailwind for styling

**Context.** Required by the stack. Recording the consequences so the team applies it consistently.

**Decision.** Tailwind utilities in JSX, semantic tokens in CSS, `animations.css` for keyframes, no CSS modules or CSS-in-JS.

**Consequences.** Styles live next to markup; no naming ceremony; dead CSS is impossible; responsive and state variants are inline. Long class strings are managed with a small `cn()` helper and by extracting components (never by adding a class-name abstraction layer). Prettier's Tailwind plugin keeps class order canonical so diffs stay readable.

---

## ADR-012 — Vitest over Jest

**Context.** Required by the stack; the alternative would be Jest.

**Decision.** Vitest with jsdom for component tests and node for engine tests, plus React Testing Library.

**Consequences.** Shares Vite's transform pipeline, so there is one config and no separate Babel/ts-jest setup; ESM and TypeScript work natively; watch mode is fast enough for the test-first engine workflow. Jest-specific ecosystem snippets need light translation — acceptable.

---

## ADR-013 — No PWA in V1

**Context.** The app is offline-capable in the sense that it makes no network calls, but without a service worker it still needs the browser cache to load on a cold, disconnected start. PWA is explicitly a V2 item.

**Decision.** Ship V1 without a service worker, manifest, or install prompt.

**Consequences.**

- Avoids the hardest class of bugs in this project category — stale service-worker caches serving old bundles.
- "Offline" in V1 means: after first load, no request is made and gameplay continues with the network off (NFR-5, AC-18). Cold-start-while-offline is a V2 promise, not a V1 one, and the README/SPEC say so.
- Because all assets are static and no runtime fetching exists, adding `vite-plugin-pwa` in V2 requires no application-code change (ARCHITECTURE §12).

**Alternatives.** Ship a minimal service worker now — rejected; caching strategy, update prompts, and versioning are real work that would compete with V1 polish.

---

## ADR-014 — Documentation-first workflow

**Context.** AI coding assistants and human contributors both produce inconsistent results from short prompts, and re-litigate settled questions mid-build.

**Decision.** Write and stabilise the full document set (README, SPEC, ARCHITECTURE, TASKS, CONTRIBUTING, ACCEPTANCE, DECISIONS, prompts) _before_ any implementation. Requirements carry stable IDs (`FR-x`, `AC-x`) so code, tests, tasks, and reviews can cite them.

**Consequences.**

- The assistant implements a contract instead of inferring one; output is far more consistent across sessions.
- Scope creep is answerable with a document reference rather than an opinion.
- Docs can drift from code — mitigated by the PR checklist requiring doc updates in the same PR (CONTRIBUTING).
- Up-front cost before the first line of app code; repaid by the absence of mid-build redesign.

**Alternatives.** Prompt-and-iterate — faster to start, but produces architectural churn and inconsistent conventions across sessions, which is exactly what this project is set up to avoid.

---

## ADR-015 — Toolchain version pins (TypeScript 6, ESLint 9)

**Context.** At scaffold time (2026-07) the latest releases were TypeScript 7.0.2 and ESLint 10.8.0, but two required tools had not caught up:

- `typescript-eslint@8.65.0` declares `typescript: ">=4.8.4 <6.1.0"`. TypeScript 7 is outside that range, and no `typescript-eslint` release supports it yet.
- `eslint-plugin-jsx-a11y@6.10.2` declares `eslint: "^3 … ^9"`. ESLint 10 is outside that range.

Both tools are load-bearing rather than optional: type-aware linting enforces NFR-7, and `jsx-a11y` is a first line of defence for the accessibility requirements (A11Y-1…A11Y-12), which are graded criteria in this project rather than nice-to-haves.

**Decision.** Pin **TypeScript `^6.0.3`** and **ESLint `^9.39.5`** for now. Track the upstream support and upgrade when `typescript-eslint` ships TypeScript 7 support and `jsx-a11y` (or a maintained replacement) supports ESLint 10.

**Consequences.**

- Type-aware linting and accessibility linting both work today; nothing is disabled to chase a version number.
- `baseUrl` was removed from `tsconfig.app.json` — deprecated in TS 6 and slated for removal in TS 7. Path mapping now resolves relative to the config file, which is the TS 7-compatible form, so that migration is already done.
- We are one major behind on two tools. This is a deliberate, revisitable position, not neglect; re-check at the start of each phase.
- Upgrading later is low-risk: the flat ESLint config and `tsc -b` project references are the same shape in both majors.

**Alternatives.** (a) TypeScript 7 with type-aware linting disabled — rejected, it trades an enforced quality gate for a version number. (b) ESLint 10 without `jsx-a11y` — rejected for the same reason, and accessibility is a headline goal (G5). (c) `--legacy-peer-deps` — rejected; silently ignoring peer ranges produces failures that surface later as confusing runtime errors.

---

## ADR-016 — Dependency overrides for the glob stack

**Context.** A clean install pulled in `brace-expansion` versions affected by GHSA-mh99-v99m-4gvg (high severity: DoS via unbounded expansion). The vulnerable copies arrive transitively through `minimatch@3`, which is depended on by `eslint`, `@eslint/config-array`, `@eslint/eslintrc`, and `eslint-plugin-jsx-a11y`.

The fix is only published on the `brace-expansion@5.0.8` line, and `minimatch@3` cannot consume it — its calling convention predates the v2 API rewrite. Overriding `brace-expansion` alone produced a hard crash (`TypeError: expand is not a function`) the moment ESLint tried to match a glob, so a naive override is worse than the vulnerability.

**Decision.** Override the whole glob stack to the maintained major line in `package.json`:

```json
"overrides": { "minimatch": "^10.2.5", "brace-expansion": "^5.0.8" }
```

**Consequences.**

- `npm audit` reports **0 vulnerabilities**, and ESLint runs correctly — both verified.
- `minimatch@10` is API-compatible for the glob patterns ESLint and its plugins use; the full lint suite and every architectural guard rule were re-verified after the change.
- Overrides are a blunt instrument: they apply tree-wide and can mask a genuine incompatibility in a future transitive dependency. Re-evaluate whenever ESLint or its plugins are upgraded, and delete these entries once upstream ships patched ranges natively.
- These are dev-only dependencies; nothing here reaches the shipped bundle, which remains `react` + `react-dom` only (NFR-10).

**Alternatives.** (a) Leave the advisory unresolved — rejected; a green audit is part of the quality bar and a persistent warning trains people to ignore audits. (b) `npm audit fix --force` — rejected; it proposed downgrading `eslint-plugin-jsx-a11y` to 6.4.1, losing flat-config support. (c) Drop `jsx-a11y` — rejected, see ADR-015.

---

## ADR-017 — Generated word lists from public-domain sources

**Context.** V1 needs ~700 fair answers and thousands of valid guesses at each of three lengths — roughly 30,000 words. Hand-curation is infeasible and unauditable; an API is forbidden (ADR-001, NFR-5). We also need the lists to be _reproducible_, so a reviewer can check how a word got in.

**Decision.** Generate the lists with a committed script, `scripts/build-dictionaries.mjs`, run by hand during development and its **output committed**. Sources:

- **ENABLE1** (Alan Beale) — public domain, the standard free word-game lexicon. Supplies the guess list. Contains no capitalised proper nouns, no hyphenation, no punctuated abbreviations.
- **`popular.txt`** (dolph/dictionary) — an ENABLE1 subset used as a familiarity signal.
- **Norvig's `count_1w`** (Google Web Trillion Word Corpus) — frequency ranking that orders answer candidates. Word/frequency pairs are facts, not creative expression.

Sources are cached in `scripts/.cache/` (gitignored) so re-runs need no network.

**Consequences.**

- The script is the only thing in the repository that touches the network, and it never runs during `npm run build`, in tests, or in the browser. The shipped app still makes zero requests.
- Provenance is auditable: anyone can re-run the generator and diff the output. Each generated module carries a SHA-256 of its contents.
- The generator asserts the SPEC invariants itself (superset, sorting, uniqueness, casing, minimum sizes) and throws rather than emit a bad file — the same invariants are re-asserted by `data.test.ts` against the committed output, so both the process and the artefact are checked.
- Answer fairness is a set of explicit, reviewable filters rather than taste: trailing-S plurals, ≤2 distinct letters, offensive terms, proper-noun readings, clipped forms. **Every filtered word remains a valid guess** — rejecting a real word the player typed is a worse experience than never using it as a solution (ADR-004).
- The proper-noun filter is deliberately conservative and hand-maintained. `AMAZON`, `YAHOO`, `WARREN` and `WRIGHT` are genuine lowercase English words, but players read them as a company, a website and two surnames. Meanwhile `BROWN`, `GREEN`, `STONE`, `BAKER`, `KING` and `HOPE` are also surnames and are _kept_, because excluding every word that doubles as a name would gut the pool. This judgement cannot be automated, so it lives in a reviewed list with a comment explaining the rule.
- Cost: the filters need occasional human attention as odd words surface in play. That is accepted; the alternative is either an unfair pool or an unauditable one.

**Alternatives.** (a) Hand-curate — infeasible at 30,000 words and no more trustworthy. (b) Ship a raw frequency cut with no fairness filters — produces plurals and unpleasant answers, the most common complaint about clones. (c) Fetch lists at runtime — breaks NFR-5 and ADR-001 outright. (d) Generate at build time rather than committing output — makes builds non-deterministic and network-dependent for no benefit.

---

## ADR-018 — Tailwind source scanning must be scoped explicitly

**Context.** The production build began failing with `transforming... Killed` — an OOM kill confirmed in `dmesg`, with Rolldown reserving ~15 GB of virtual memory. Bisecting ruled out our CSS, the e2e files, minification, and thread count. Running `@tailwindcss/cli` on a file containing nothing but `@import 'tailwindcss'` reproduced it, which cleared Vite entirely.

The cause is Tailwind v4's automatic source detection. It walks the project root and relies on **git boundaries** to prune. This workspace had no `.git` directory, so `.gitignore` was never consulted and the scanner crawled `node_modules` (264 MB) plus the tool caches under the home directory.

**Decision.** Two changes, belt and braces:

1. Initialise a git repository, which is correct for the project regardless and restores Tailwind's normal pruning.
2. Declare sources explicitly in `src/styles/index.css`, so the build never depends on ambient detection:

```css
@source not '../../node_modules';
@source not '../../.npm';
@source not '../../.cache';
@source '../../index.html';
@source '../**/*.{ts,tsx}';
```

We also moved Tailwind from the Vite plugin to the PostCSS integration while diagnosing. That was not the fix — both paths OOM'd — but PostCSS is retained because the earlier build already warned that `@tailwindcss/vite` dominated build time, and the two produce identical output.

**Consequences.**

- Build time fell from ~4 s to ~0.6 s, and peak memory is now bounded.
- Class detection is explicit and reviewable: a class used outside `src/` or `index.html` will not be generated, which is a deliberate constraint rather than a surprise.
- The `@source not` lines are environment-specific belt-and-braces. They are harmless in a normal checkout and are the only thing standing between a contributor without `.git` and a mystifying OOM.
- Cost: one more thing to update if the source layout changes. The comment in the stylesheet explains why it exists.

**Alternatives.** (a) Rely on the git repository alone — works, but leaves anyone building from a tarball or a shallow copy exposed to the same failure. (b) Raise Node's heap limit — does not help; the allocation is in Rust, outside V8's budget. (c) Downgrade Tailwind — disproportionate for a configuration problem.

---

## ADR-019 — Browser-level testing with Playwright

**Context.** Several V1 requirements cannot be verified in jsdom, which reports zero for every dimension and implements no layout, paint, or preference model: contrast (A11Y-7), visible focus (A11Y-6), 320 px layout and touch targets (FR-58, FR-59, EC-18), true offline behaviour (NFR-5, AC-18), real reloads (EC-9), and Lighthouse budgets (NFR-4). Asserting these in jsdom would produce green tests that prove nothing.

**Decision.** Add Playwright (Chromium, desktop + Pixel 5 projects) running against the **production build** via `vite preview`, covering four specs: `a11y`, `responsive`, `edge-cases`, and `screenshots`. Accessibility is audited with `@axe-core/playwright`. Contrast is checked separately by `scripts/check-contrast.mjs`, which parses the real token values out of the stylesheet and is wired into `npm run verify`.

**Consequences.**

- 88 browser tests complement 336 unit and integration tests; the split is by _what only a browser can answer_, not by preference.
- Testing the production bundle means the audited artefact is the shipped artefact.
- Three real defects surfaced immediately that no unit test had caught: 43 px of horizontal overflow at 320 px, the keyboard falling below the fold in landscape, and `Enter` silently ceasing to submit after any modal visit.
- README screenshots are generated by a spec, so they cannot drift from the real UI.
- Cost: a ~115 MB browser download and a slower full-check cycle. E2E stays out of `npm run verify` and runs as a separate `npm run test:e2e`, so the inner loop remains fast.

**Alternatives.** (a) jsdom only — cannot answer any of the above honestly. (b) Manual checking — unrepeatable and unowned; the point of the acceptance checklist is that evidence is reproducible.

---

## ADR-020 — In-game help is discoverable, not interruptive

**Context.** The app explains nothing to a first-time player: no instructions, no legend for the tile colours. The obvious fix is the pattern the original Wordle uses: pop a "How to play" dialog open on a first visit. That needs a persisted "seen" flag, and the only sensible home for it is the settings record (`wordwright:v1:settings`) — where `validateSettings` is all-or-nothing and `createRepository.read()` treats a `null` result as corrupt. An additive required field there would silently reset every existing player's theme, colourblind, and motion preferences on upgrade, plus raise a "saved data was reset" toast for a change that added nothing they'd notice as a loss. It would also put a focus-trapped modal in front of every one of the 88 existing browser tests and the integration suite, all of which boot from empty storage.

**Decision.** Help (FR-60) is reachable only from a header control (`How to play`, first in the tab order). Nothing about it is persisted; `HelpModal` is a pure function of `isOpen` and the active `wordLength`, exactly like `StatsModal` and `SettingsModal`.

**Consequences.**

- No schema change, no migration, no upgrade risk, no seeding required in any existing test.
- The example tiles reuse the board's own colour tokens and marker glyphs (`board/tileAppearance.ts`) rather than `Tile` itself, since `Tile` renders `role="gridcell"` and an orphan gridcell outside a grid/row ancestry is a critical axe violation.
- The cost is discoverability: a player who never looks at the header never sees the dialog. Accepted for V1 — auto-open on first visit can be added later as its own change, and would then owe the tolerant-validation work this decision avoids (see Alternative a).
- FR-29's promise that a new word length costs "no other file changes" now has one more touchpoint: a `HELP_EXAMPLES` entry. The `Record<WordLength, …>` type this is stored as turns a missing entry into a compile error rather than a silently blank dialog, which is the honest version of that promise.

**Alternatives.**

- (a) Auto-open once, gated by a `helpSeen` flag on `Settings`. Needs `validateSettings` to treat the field as optional with an asymmetric default (absent record → unseen; present record missing the field → treated as seen, since that means a returning player) to avoid the upgrade-reset problem above, plus seeding every e2e spec and two existing unit suites so they don't boot behind a modal. Real option, deferred rather than rejected.
- (b) A separate storage key for the flag. Avoids touching the settings schema, but adds a key, a repository, and provider plumbing for a single boolean — against ADR-005's preference for the cheapest working shape.
- (c) An inline panel under the board instead of a modal. Competes for the same space as `ResultPanel` and risks pushing the keyboard below the fold on short viewports (EC-18), which a portalled, scrollable dialog does not.
