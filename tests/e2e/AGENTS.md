# AGENTS.md — Workbench smoke test

The directory contains the Workbench Electron smoke test and the small fixture closure it needs, plus the historical Orca E2E specs, fixtures and helpers retained as frozen source after the Orca CI/E2E isolation (see `ref/upstream.md`). `tests/playwright.config.ts` discovers only `workbench-cycle-smoke.spec.ts`, so the legacy files never run in the Workbench lane — do not "clean them up" and do not assume they execute. Keep new coverage focused on Workbench journeys and update this file when the smoke harness changes.

The discovered spec covers the cycle main chain and project configuration. The configuration journey uses real charter RPC and filesystem writes in a disposable repository, checks conflict protection and reload read-back, and emits screenshots on success as well as failure. It does not create a remote PR.

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
