# AGENTS.md — Workbench E2E test locations and rules

Workbench has exactly three test kinds:

1. **TDD** — 核心算法和数据协议，跟随实现放在 `src/**` 的 `*.test.ts(x)`。
2. **Feature acceptance E2E** — one feature's user-visible acceptance boundary, under `tests/e2e/workbench/acceptance/`.
3. **跨特性用户旅程 E2E** — 一条完整的探索 BW 工作旅程，放在 `tests/e2e/workbench/journeys/`。

The two E2E kinds share the `workbench/` parent because both exercise the real Electron shell. Their directory is the classification: a file in `acceptance/` cannot be counted as a journey, and a file in `journeys/` cannot be counted as a feature acceptance check. A journey may observe an acceptance boundary; that does not create another acceptance file.

Explore BW's five work journeys and 30+ feature entries are the coverage index. They do not require 30+ E2E files. Keep at most one journey file for each work journey and at most one acceptance file for each feature. Add a second file only when the existing file cannot observe a named specification risk and the PR explains that gap.

## Workbench E2E inventory and CI entrypoints

`workbench-allowlist.ts` is the single inventory. Every Workbench E2E file must appear there:

- `WORKBENCH_PR_ALLOWLIST` contains the small default PR set: W01 project handoff, W02 cycle main chain, and project settings acceptance.
- `WORKBENCH_EXPLICIT_ALLOWLIST` contains the remaining acceptance checks for deliberate runs: fixed workspaces and milestones.
- `WORKBENCH_VERSION_OVERVIEW_SPEC` is the separate provider-backed version overview check and is run only with `tests/playwright.overview.config.ts`.

`tests/playwright.config.ts` reads only `WORKBENCH_PR_ALLOWLIST`; there is no wildcard discovery of Workbench files. `tests/playwright.overview.config.ts` reads only the version overview entry. Release packaging does not run business E2E. The manually triggered E2E workflow currently uses the same PR allowlist. Run the broader registered acceptance set with `pnpm run test:e2e:workbench:explicit`; this opt-in command runs the headless set and the headful milestone check, and is not part of PR or release packaging.

不要再增加第四种用户可见测试类型或别名。Explore 导航和功能演示属于产品/UI 证据，不是 Workbench 业务 E2E，不得加入任一白名单。纯计算和数据协议放入 TDD。

When reviewing or adding a test, record only the stable mapping in the feature matrix and the relevant feature `STATUS.md`: journey ID or feature ID, file, test title, and independent read-back. Every real Workbench E2E captures a screenshot at its key successful result; failures retain the Playwright screenshot or trace. Screenshots are human evidence and do not replace DOM, file, Git, or process read-back. Workbench CI uses Playwright's native `_electron.launch()`; CDP belongs to `workbench-start` real-desktop verification and is not another test kind. Do not maintain a run-by-run count or a changelog in this directory.

## Build the App With `--mode e2e` Before Running Workbench E2E

E2E tests read Zustand state via `window.__store`. That global is only assigned when the preload bundle is built in `e2e` mode, which is applied when you pass `--mode e2e` to `electron-vite build`. A plain `pnpm build` or `pnpm build:electron-vite` produces an `out/` tree **without** the store exposed, so reusing it with `SKIP_BUILD=1` makes every spec hang on `waitForFunction(() => Boolean(window.__store))` and time out at 30s.

- Default path: `pnpm run test:e2e:workbench` — `globalSetup` runs `electron-vite build --mode e2e` for you.
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
- Headless (`ORCA_E2E_HEADLESS=1`) does not exempt you from this rule — Playwright drives the real DOM via CDP regardless of window visibility. The rare cases that need focus or pointer capture use the headful project via `project.metadata.workbenchHeadful` (it also swaps launch args). Separately, on GitHub Actions' ubuntu runners (Linux + `GITHUB_ACTIONS` + `DISPLAY` without an explicit `ORCA_BACKGROUND_LAUNCH`, i.e. xvfb) the helper launches every project with the `ORCA_E2E_HEADFUL=1` env instead: a never-shown window keeps `document.visibilityState` 'hidden', where Chromium pauses rAF outright and click actionability starves, so the window is mapped there via `showInactive()` — visible, still never focus-stealing (see `helpers/workbench-app.ts`). To reproduce the CI PR E2E on a local Linux box under xvfb, add `ORCA_E2E_FORCE_HEADFUL=1` — the guard only recognizes GitHub Actions runners, so without it the local run stays windowless and post-reload clicks starve.
