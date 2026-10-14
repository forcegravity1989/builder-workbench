/**
 * Shared Electron fixture for Workbench E2E tests.
 *
 * Why: Playwright's native _electron.launch() is used instead of CDP.
 * It launches the Electron app directly from the built output, gives
 * full access to the BrowserWindow, and handles lifecycle automatically.
 * No need to manually start the app or pass --remote-debugging-port.
 *
 * Why: the fixture adds a dedicated test repo to the app so tests are
 * idempotent — they don't depend on whatever the user has open.
 *
 * Prerequisites:
 *   electron-vite build must have run first (globalSetup handles this).
 */

import {
  test as base,
  expect as playwrightExpect,
  _electron as electron,
  type Page,
  type ElectronApplication,
  type TestInfo
} from '@stablyai/playwright-test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TEST_REPO_PATH_FILE } from '../global-setup'
import { cleanupE2EDaemons, closeElectronAppForE2E } from './electron-process-shutdown'
import { getWorkbenchElectronLaunchArgs } from './workbench-launch-args'
import { retryTransientMainEvaluate } from './electron-main-evaluate-retry'
import { getE2ECompletedOnboardingProfile } from './e2e-completed-onboarding-profile'
import {
  assertElectronResolvedIsolatedHome,
  createElectronHomeIsolation
} from './electron-home-isolation'
import { createSeededTestRepo, isValidGitRepo } from './workbench-test-repo'

type WorkbenchTestFixtures = {
  electronApp: ElectronApplication
  registerPostElectronShutdownCleanup: (cleanup: () => Promise<void>) => void
  sharedPage: Page
  workbenchPage: Page
  // Why: every fresh userData dir paints the first-launch onboarding overlay
  // (closedAt=null), which is `fixed inset-0 z-[100]` and intercepts pointer
  // events for every other test. Dismiss it by default; onboarding.spec.ts
  // opts out via `test.use({ dismissOnboarding: false })`.
  dismissOnboarding: boolean
  // Why: most E2E specs need a ready project before assertions start. Golden
  // first-run specs opt out so they can prove the zero-project onboarding path.
  seedTestRepo: boolean
  seededRepoPath: string
  // Synthetic-list specs need only the primary checkout; switching specs keep the two-row default.
  minimumSeededWorktreeCount: number
  // Why: spec-scoped launch env. Mutating process.env at spec module scope
  // leaks into other specs when a worker reloads files without replaying the
  // first spec's afterAll; per-test launch env cannot leak.
  workbenchAppExtraEnv: Record<string, string>
  // Why: spec-scoped Chromium switches (e.g. --enable-precise-memory-info for
  // memory benchmarks). Prepended before the main entry so Electron forwards
  // them to Chromium without affecting other specs' launches.
  workbenchAppExtraArgs: string[]
  // Why: a few IPC repro specs need to launch the Electron app with a scoped
  // PATH/token environment. Keep this fixture-owned so tests never mutate the
  // developer's shell or already-running Workbench instance.
  launchEnv: NodeJS.ProcessEnv
}

type WorkbenchWorkerFixtures = {
  /** Absolute path to the test git repo created by globalSetup. */
  testRepoPath: string
}

// Why: parse + warn at module scope so a bad ORCA_E2E_SLOWMO_MS value logs once
// per worker instead of once per test (otherwise hundreds of lines per CI run).
const ORCA_E2E_SLOWMO_MS_RAW = process.env.ORCA_E2E_SLOWMO_MS
const ORCA_E2E_SLOWMO_MS = ((): number => {
  if (ORCA_E2E_SLOWMO_MS_RAW === undefined) {
    return 0
  }
  const parsed = Number(ORCA_E2E_SLOWMO_MS_RAW)
  if (!Number.isFinite(parsed)) {
    console.warn(
      `[workbench-e2e] ORCA_E2E_SLOWMO_MS="${ORCA_E2E_SLOWMO_MS_RAW}" is not a number; ignoring (using 0).`
    )
    return 0
  }
  return Math.max(parsed, 0)
})()

async function removeUserDataDirAfterShutdown(userDataDir: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(userDataDir, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) {
        throw error
      }
      // Why: Windows can briefly keep Electron profile files locked after the
      // process exits; retrying avoids turning a passed flow into teardown noise.
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
}

function shouldLaunchHeadful(testInfo: TestInfo): boolean {
  // Why: ORCA_E2E_FORCE_HEADFUL lets a developer watch any spec in a real
  // window without retagging it `@headful` or switching projects.
  if (process.env.ORCA_E2E_FORCE_HEADFUL === '1') {
    return true
  }
  return testInfo.project.metadata.workbenchHeadful === true
}

// Why: exported so specs that launch their own ElectronApplication outside
// this fixture (e.g. multi-instance lifecycle tests) can still opt into the
// same ORCA_E2E_FORWARD_APP_LOGS-gated stdout/stderr capture.
export function forwardElectronProcessLogs(app: ElectronApplication, testInfo: TestInfo): void {
  if (process.env.ORCA_E2E_FORWARD_APP_LOGS !== '1') {
    return
  }

  const child = app.process()
  const prefix = `[electron:${testInfo.title}]`
  child.stdout?.on('data', (chunk: Buffer) => {
    console.log(`${prefix} stdout: ${chunk.toString().trimEnd()}`)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    console.error(`${prefix} stderr: ${chunk.toString().trimEnd()}`)
  })
  child.on('exit', (code, signal) => {
    console.log(`${prefix} exit: code=${code ?? 'null'} signal=${signal ?? 'null'}`)
  })
}

/**
 * Extended Playwright test with Workbench-specific fixtures.
 *
 * `workbenchPage` — the main Workbench renderer window.
 *
 * Test-scoped: each test gets a fresh Electron instance and isolated
 * userData directory so state cannot leak across specs through persistence.
 */
export const test = base.extend<WorkbenchTestFixtures, WorkbenchWorkerFixtures>({
  // Worker-scoped: read the test repo path once
  testRepoPath: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring here.
    async ({}, provideFixture) => {
      const persistedRepoPath = existsSync(TEST_REPO_PATH_FILE)
        ? readFileSync(TEST_REPO_PATH_FILE, 'utf-8').trim()
        : ''
      const repoPath = isValidGitRepo(persistedRepoPath)
        ? persistedRepoPath
        : createSeededTestRepo()
      await provideFixture(repoPath)
    },
    { scope: 'worker' }
  ],

  // Why: Windows keeps watched worktrees locked until Electron and its
  // detached test daemons exit. Tests register fixture cleanup here so it runs
  // after electronApp teardown instead of masking the real assertion failure.
  registerPostElectronShutdownCleanup: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring here.
    async ({}, provideFixture) => {
      const cleanups: (() => Promise<void>)[] = []
      await provideFixture((cleanup) => cleanups.push(cleanup))
      for (const cleanup of cleanups.toReversed()) {
        await cleanup()
      }
    },
    { scope: 'test' }
  ],

  // Test-scoped: one Electron app per test
  electronApp: async (
    {
      dismissOnboarding,
      launchEnv,
      workbenchAppExtraEnv,
      workbenchAppExtraArgs,
      registerPostElectronShutdownCleanup
    },
    provideFixture,
    testInfo
  ) => {
    // Establish fixture ordering: registered path cleanup must run only after
    // this Electron fixture has released watchers, terminals, and daemons.
    void registerPostElectronShutdownCleanup
    const mainPath = path.join(process.cwd(), 'out', 'main', 'index.js')
    const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'workbench-e2e-userdata-'))

    if (dismissOnboarding) {
      // Why: onboarding renders a fullscreen `fixed inset-0 z-[100]` overlay
      // when persisted `closedAt` is null, which intercepts pointer events for
      // every other test. Seed a completed-onboarding fresh-install profile:
      // an empty file would make persistence treat the profile as an
      // existing-user upgrade cohort and mount the telemetry notice overlay.
      writeFileSync(
        // Why orca-data.json under a Workbench fixture: the persistence layer's
        // data-file name is product-independent (user-data-path.ts hardcodes
        // 'orca-data.json'); a workbench-data.json seed would never be read and
        // the onboarding overlay would swallow every click.
        path.join(userDataDir, 'orca-data.json'),
        `${JSON.stringify(getE2ECompletedOnboardingProfile(), null, 2)}\n`
      )
    }
    const headful = shouldLaunchHeadful(testInfo)
    // Why: strip ELECTRON_RUN_AS_NODE before spawning. Some host shells (e.g.
    // A host agent runtime may set it so Electron behaves as a plain Node
    // binary. Playwright's _electron.launch passes --remote-debugging-port,
    // which Node rejects with "bad option" and the process exits immediately.
    const { ELECTRON_RUN_AS_NODE: _unused, ...cleanEnv } = process.env
    void _unused
    const homeIsolation = createElectronHomeIsolation({
      inheritedEnv: cleanEnv,
      launchEnv,
      extraEnv: workbenchAppExtraEnv,
      userDataDir
    })
    // Why: ORCA_E2E_SLOWMO_MS adds a pause between every Playwright action so a
    // developer running with ORCA_E2E_FORCE_HEADFUL=1 can actually watch what
    // the test does. Defaults to 0 (no slowdown) for normal runs.
    const slowMo = ORCA_E2E_SLOWMO_MS
    // Why: ORCA_E2E_RECORD_VIDEO=1 captures a webm of the renderer so a
    // developer can replay the run later — Electron's Playwright trace viewer
    // does not produce DOM snapshots, so video is the only reliable replay.
    // Why: testInfo.outputDir is created lazily by Playwright; on Windows the
    // dir may not exist when the fixture initializes, and Electron silently
    // drops the recording. mkdir up-front so the recorder always has a home.
    const recordVideoDir = process.env.ORCA_E2E_RECORD_VIDEO === '1' ? testInfo.outputDir : null
    if (recordVideoDir) {
      mkdirSync(recordVideoDir, { recursive: true })
    }
    // Why: ORCA_E2E_HEADLESS suppresses mainWindow.show() (isWindowlessLaunch
    // in foreground-activation-policy) to keep the window off a developer's
    // real desktop; ORCA_E2E_HEADFUL overrides for runs that need a visible
    // window (e.g. pointer-capture drag tests). Under xvfb (CI) there is no
    // desktop to disturb and the suppression backfires: the never-shown window
    // keeps document visibilityState 'hidden', Chromium pauses
    // requestAnimationFrame outright (the disable-backgrounding launch flags
    // do not lift visibility gating), and Playwright actionability's stability
    // check starves — deterministically after page.reload(), when the fresh
    // document's visibility resyncs (workbench-cycle-smoke spec:150; pre-reload
    // the initial document still gets sparse frames, so the same click ran
    // ~15x slow instead of hanging).
    // Why HEADFUL and not "no env at all": isWindowlessLaunch turns false so
    // the window maps and frames flow, while isBackgroundLaunch stays true and
    // the foreground-activation policy survives — showInactive() displays
    // without focus and the dashboard-popout / focus-existing-window steal
    // paths stay disabled (tests/AGENTS.md: tests must never take the
    // foreground; a bare env-less launch would re-enable window.show() and
    // app.focus({ steal: true }) on any Linux box with CI set and a real
    // display, e.g. `CI=1 pnpm run test:e2e` on a developer desktop).
    const showOnVirtualDisplay = !headful && Boolean(process.env.CI && process.env.DISPLAY)
    const app = await electron.launch({
      args: [...workbenchAppExtraArgs, ...getWorkbenchElectronLaunchArgs(mainPath, headful)],
      ...(slowMo > 0 ? { slowMo } : {}),
      ...(recordVideoDir ? { recordVideo: { dir: recordVideoDir } } : {}),
      // Why: keep NODE_ENV=development so window.__store is exposed and
      // dev-only helpers activate. ORCA_E2E_USER_DATA_DIR overrides the usual
      // shared dev profile so every spec gets a clean persistence root.
      env: {
        ...homeIsolation.env,
        NODE_ENV: 'development',
        ...(headful || showOnVirtualDisplay
          ? { ORCA_E2E_HEADFUL: '1' }
          : { ORCA_E2E_HEADLESS: '1' })
      }
    })
    forwardElectronProcessLogs(app, testInfo)
    try {
      const resolvedHome = await retryTransientMainEvaluate(() =>
        app.evaluate(({ app }) => app.getPath('home'))
      )
      assertElectronResolvedIsolatedHome(resolvedHome, homeIsolation)
    } catch (error) {
      await closeElectronAppForE2E(app)
      await cleanupE2EDaemons(userDataDir)
      await removeUserDataDirAfterShutdown(userDataDir)
      throw error
    }
    await provideFixture(app)
    // Why: the Playwright close promise can settle before all Electron and PTY
    // descendants are gone in CI; worker teardown then hangs on open handles.
    await closeElectronAppForE2E(app)
    await cleanupE2EDaemons(userDataDir)
    await removeUserDataDirAfterShutdown(userDataDir)
  },

  // Default: dismiss the onboarding overlay so it doesn't intercept clicks.
  dismissOnboarding: [true, { option: true }],
  seedTestRepo: [true, { option: true }],
  // Test-scoped so generation scenarios can isolate Git indexes and remotes.
  seededRepoPath: async ({ testRepoPath }, provideFixture) => {
    await provideFixture(testRepoPath)
  },
  minimumSeededWorktreeCount: [2, { option: true }],
  launchEnv: [{}, { option: true }],
  workbenchAppExtraEnv: [{}, { option: true }],
  workbenchAppExtraArgs: [[], { option: true }],

  // Test-scoped: grab the first BrowserWindow, add the test repo, and wait
  // until the session is fully ready with a worktree active.
  sharedPage: async (
    { electronApp, minimumSeededWorktreeCount, seedTestRepo, seededRepoPath },
    provideFixture
  ) => {
    // Why: the Electron app may take a while to create the first window,
    // especially on cold start with no prior dev userData. Isolated per-test
    // profiles make late-suite launches slower, so use the full test budget.
    const page = await electronApp.firstWindow({ timeout: 120_000 })
    await page.waitForLoadState('domcontentloaded')

    // Wait for the store to be available
    await page.waitForFunction(() => Boolean(window.__store), null, { timeout: 30_000 })

    if (!seedTestRepo) {
      await page.waitForFunction(
        () => window.__store?.getState().workspaceSessionReady === true,
        null,
        { timeout: 30_000 }
      )
      await provideFixture(page)
      return
    }

    const repoPath = isValidGitRepo(seededRepoPath) ? seededRepoPath : createSeededTestRepo()

    // Add the test repo via the IPC bridge
    // Why: calling window.api.repos.add() goes through the same code path as
    // the "Add Project" UI flow, ensuring worktrees are fetched and the session
    // initializes properly.
    const seededRepoId = await page.evaluate(async (repoPath) => {
      const result = await window.api.repos.add({ path: repoPath })
      if ('error' in result) {
        throw new Error(result.error)
      }
      return result.repo.id
    }, repoPath)

    // Fetch repos in the renderer store so it picks up the new repo, then opt
    // this disposable repo into showing external worktrees.
    // Why: repos.add() fires a repos:changed echo that triggers a *concurrent*
    // fetchRepos() in the renderer; the store's generation guard can then drop
    // this awaited fetch's result, leaving `repos` briefly stale. Poll the
    // public fetch path until the repo lands instead of asserting on the first
    // tick (mirrors the seeded-worktree poll below). updateRepo is idempotent,
    // so running it once the repo appears is safe across poll ticks.
    await playwrightExpect
      .poll(
        () =>
          page.evaluate(async (repoId) => {
            const store = window.__store
            if (!store) {
              return false
            }
            await store.getState().fetchRepos()
            const repo = store.getState().repos.find((candidate) => candidate.id === repoId)
            if (!repo) {
              return false
            }
            // Why: the fixture deliberately creates external Git worktrees. New
            // repos hide those by default after the visibility rollout.
            await store.getState().updateRepo(repo.id, { externalWorktreeVisibility: 'show' })
            return true
          }, seededRepoId),
        {
          timeout: 30_000,
          message: `Expected e2e repo to be loaded: ${repoPath}`
        }
      )
      .toBe(true)

    // Best-effort fetch of the seeded repo's worktrees. Why: the renderer can still
    // re-navigate during initial hydration and destroy the execution context
    // mid-evaluate; the authoritative seeded-worktree poll below is the real wait,
    // so swallow a hydration-reload failure here instead of failing setup.
    await page
      .evaluate(async (repoId) => {
        const store = window.__store
        if (!store) {
          return
        }
        await store.getState().fetchWorktrees(repoId)
      }, seededRepoId)
      .catch(() => false)

    // Why: parallel specs mutate real git worktrees in the shared fixture repo.
    // A first scan can briefly return no rows while git holds a worktree lock,
    // so poll the public fetch path until the seeded primary + secondary load.
    await playwrightExpect
      .poll(
        () =>
          page.evaluate(async (repoId) => {
            const store = window.__store
            if (!store) {
              return 0
            }
            await store.getState().fetchWorktrees(repoId)
            return store.getState().worktreesByRepo[repoId]?.length ?? 0
          }, seededRepoId),
        {
          timeout: 30_000,
          message: 'seeded e2e worktrees did not load'
        }
      )
      .toBeGreaterThanOrEqual(minimumSeededWorktreeCount)

    // Wait for workspaceSessionReady to become true
    await page.waitForFunction(
      () => {
        const store = window.__store
        return store?.getState().workspaceSessionReady === true
      },
      null,
      { timeout: 30_000 }
    )

    // Re-activate the test repo's primary worktree after session hydration.
    // Why: workspaceSessionReady restoration can overwrite activeWorktreeId
    // after earlier setup calls. Selecting it here ensures every test starts on
    // the seeded repo instead of the "Select a worktree" empty state.
    await page.evaluate((repoId: string) => {
      const store = window.__store
      if (!store) {
        return
      }

      const state = store.getState()
      // Why: provider-returned identity is stable across Windows path casing
      // and separator normalization, unlike comparing renderer path strings.
      const testWorktree = state.worktreesByRepo[repoId]?.find(
        (worktree) => worktree.isMainWorktree
      )
      if (testWorktree) {
        state.setActiveWorktree(testWorktree.id)
      }
    }, seededRepoId)

    // Best-effort seed of a baseline terminal tab when a fresh isolated
    // profile has none yet.
    // Why: terminal-focused suites call ensureTerminalVisible(), which does the
    // authoritative wait. The shared fixture itself should not block non-
    // terminal suites on tab creation timing.
    await page.evaluate(() => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      if (!state.activeWorktreeId) {
        return
      }
      const tabs = state.tabsByWorktree[state.activeWorktreeId] ?? []
      if (tabs.length === 0) {
        state.createTab(state.activeWorktreeId)
      }
    })

    await provideFixture(page)
  },

  // Test-scoped: each test gets the shared page
  workbenchPage: async ({ sharedPage }, provideFixture) => {
    await provideFixture(sharedPage)
  }
})

export { expect } from '@stablyai/playwright-test'
