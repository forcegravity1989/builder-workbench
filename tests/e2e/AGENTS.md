# AGENTS.md — Workbench smoke test

The directory contains the Workbench Electron smoke test and the small fixture closure it needs, plus Orca and dedicated-lane E2E sources. The Workbench allowlist is `workbench-allowlist.ts`: `tests/playwright.config.ts` discovers only `workbench-cycle-smoke.spec.ts`, and `tests/playwright.overview.config.ts` discovers only `workbench-version-overview.spec.ts`. Other specs are not BW feature coverage; they remain owned by their dedicated workflows or historical source policy and must not be admitted to the Workbench lane by wildcard matching.

The discovered spec covers the cycle main chain, project configuration and milestone planning. The configuration journey uses real charter RPC and filesystem writes in a disposable repository, checks conflict protection and reload read-back, and emits screenshots on success as well as failure. The headful milestone journey exercises inline edits, pointer dragging, row ordering, grouped undo/redo across same-revision refresh, materializing unused workweek windows, rendering existing source dates, version navigation and source return, safe submission failure without a remote, and unsent-draft recovery after reload and a new process. These journeys do not create a remote PR. Retain the fixture-owned ChildProcess before the test because Playwright's process handle can be disposed by force-quit. Windows profile cleanup may retain only explicitly identified locked external Sogou log files and reports their profile path; all other cleanup failures remain errors.


A focused version-overview journey uses `tests/playwright.overview.config.ts` and the same Electron fixture. It reads GitHub through the operator-provided authentication, seeds only a per-test disposable Git repository, and validates real material/source reads, native navigation and process restart. Run it explicitly with the local `node_modules/@playwright/test/cli.js`; it does not add external-provider requirements to the default CI smoke. Screenshots and traces remain local evidence.

## Register one main journey per active feature

The Workbench lane keeps at most one main user journey for each of the five Explore BW work journeys. The feature matrix maps feature ownership and gaps onto those cross-feature journeys; the 30+ feature entries do not become 30+ journey specs. A single spec may cover several features when the product flow naturally crosses their boundaries. Give each registered journey the ID used by the Explore/spec catalog, and record the covered features, file, test title, execution project, read-back point and current status in the feature `STATUS.md`. An acceptance-point check is capped at one per feature and should reuse the main journey when it already observes the boundary. A second physical E2E needs a named risk; more than two needs human approval.

Explore BW's work journeys and feature catalog are the coverage index, not a substitute for real feature evidence. Keep one small Explore smoke for catalog navigation; map each active feature to its one real Electron journey. Before adding a spec, classify the need as a protocol check, an acceptance-point check or a main journey. Move pure calculations and data contracts to the relevant unit or protocol suite. Merge checks that exercise the same user result and read-back. Add a branch or failure journey only when the feature specification names the risk and the existing main journey cannot observe it. The default Workbench CI entrypoint is the `testMatch` set in `tests/playwright.config.ts`, so a source file outside that entrypoint is not coverage until the configuration and feature registration both point to it.

This is the target rule for new coverage. Existing feature `STATUS.md` IDs such as PJ/AJ/CJ/IJ/J/QL/RJ remain historical until the feature-asset migration establishes a W01–W05 crosswalk; do not treat their presence as current registration or add a same-named spec during the migration gap.

## Workbench test locations

- TDD and protocol checks stay beside the implementation under `src/**` as `*.test.ts(x)` and are governed by the Workbench Vitest ratchet.
- Feature acceptance E2E and cross-feature journey E2E stay under this directory. The current Workbench-owned allowlist has two spec files: the PR smoke entrypoint and the explicit version-overview entrypoint in `workbench-allowlist.ts`.
- The five Explore journeys are logical registrations, not five mandatory files. Add a file only when an existing allowlisted test cannot observe the real user result.

## Build the App With `--mode e2e` Before Running the Smoke Test

E2E tests read Zustand state via `window.__store`. That global is only assigned when the preload bundle is built in `e2e` mode, which is applied when you pass `--mode e2e` to `electron-vite build`. A plain `pnpm build` or `pnpm build:electron-vite` produces an `out/` tree **without** the store exposed, so reusing it with `SKIP_BUILD=1` makes every spec hang on `waitForFunction(() => Boolean(window.__store))` and time out at 30s.

- Default path: `pnpm run test:e2e` — `globalSetup` runs `electron-vite build --mode e2e` for you.
- Fast iteration: `pnpm exec electron-vite build --mode e2e` once, then `SKIP_BUILD=1 pnpm run test:e2e …`.
- If **every** E2E test times out at the `window.__store` line, do **not** assume the harness is broken. The `out/` build is almost certainly stale or was produced without `--mode e2e`. Rebuild with `--mode e2e` and retry before changing test code.

## Prefer a Store-Slice Unit Test When the Logic Is Pure

An E2E spec that calls `store.getState().someAction(...)` inside `page.evaluate` is a unit test paying the cost of an Electron launch (~1.5s) for no extra coverage. Before adding one, check `src/renderer/src/store/slices/*.test.ts` — most store-level behavior (tab moves, splits, reorders, merges, no-op guards) is already covered there with `createTestAppStore()`.

Reach for E2E only when the test needs something a unit test genuinely cannot reach:

- Real dnd-kit / pointer events, focus, keyboard shortcuts, or drag-and-drop UI cues.
- IPC round-trips through the main process (repos, filesystem, PTY, Git).
- Persistence: app restart, userData dir, session rehydration.
- Multi-window or multi-worktree interactions that depend on Electron lifecycle.

If the test could be rewritten to import the slice and drive it directly without losing fidelity, do that instead.

## E2E Assertions Must Target the DOM, Not the Store

`window.__store` is fine for _setup_ (seeding a repo, pre-filling a draft, stubbing hydration timing) but the thing a spec finally `expect()`s on must be user-observable — `getByRole`, `toBeVisible`, `toHaveText`, `toContainText`. A spec that both writes to the store and reads it back is asserting that Zustand's setter works, not that Workbench works.

Why this matters: the `'create-worktree'` modal key lived on in the `activeModal` union long after `AddWorktreeDialog.tsx` was deleted in #710, so `store.openModal('create-worktree')` + `store.activeModal === 'create-worktree'` round-trips succeeded against a modal that rendered nothing. That tautology is what let #1186 (React error #31 in `StartFromField`) ship — the store-layer test passed while the composer actively crashed for real users.

Concretely:

- Use the store to reach a state; use the DOM to prove the state is correct.
- If a render-layer regression would leave the store clean but the UI broken, a store-only test will not catch it. Mount the affected subtree and assert on what the user sees.
- Headless (`ORCA_E2E_HEADLESS=1`) does not exempt you from this rule — Playwright drives the real DOM via CDP regardless of window visibility. The rare cases that need focus or pointer capture use the headful project via `project.metadata.workbenchHeadful` (it also swaps launch args). Separately, on GitHub Actions' ubuntu runners (Linux + `GITHUB_ACTIONS` + `DISPLAY` without an explicit `ORCA_BACKGROUND_LAUNCH`, i.e. xvfb) the helper launches every project with the `ORCA_E2E_HEADFUL=1` env instead: a never-shown window keeps `document.visibilityState` 'hidden', where Chromium pauses rAF outright and click actionability starves, so the window is mapped there via `showInactive()` — visible, still never focus-stealing (see `helpers/workbench-app.ts`). To reproduce the CI smoke on a local Linux box under xvfb, add `ORCA_E2E_FORCE_HEADFUL=1` — the guard only recognizes GitHub Actions runners, so without it the local run stays windowless and post-reload clicks starve.
