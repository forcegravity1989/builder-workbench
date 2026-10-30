import { defineConfig } from '@stablyai/playwright-test'

/**
 * Playwright config for the Workbench Electron smoke test.
 *
 * Run:
 *   pnpm run test:e2e:workbench    — build + run the Workbench smoke test (headless)
 *   pnpm run test:e2e:headful      — run with visible window (for pointer-capture tests)
 *   SKIP_BUILD=1 pnpm run test:e2e — skip rebuild (faster iteration)
 *
 * globalSetup builds the Electron app and creates a seeded test git repo.
 * globalTeardown cleans up the test repo.
 * The smoke test uses _electron.launch() to start the app — no manual setup needed.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // Why: this suite launches a fresh Electron app and isolated userData dir per
  // test. Cold-starts late in the run can exceed 60s on CI even when the app is
  // healthy, so the per-test budget needs to cover startup plus assertions.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  // Why: the headless Electron specs launch isolated app instances and can
  // safely fan out across workers, which cuts the default E2E runtime
  // substantially. The few visible-window tests that still rely on real
  // pointer interaction are marked serial in their spec file instead.
  fullyParallel: true,
  // Why: each CI worker launches a real Electron/Chromium process tree against
  // a mutable seeded repo. Release runners showed two apps per VM can contend
  // on Xvfb/git enough to create false E2E failures, so CI uses one worker.
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    // Why: this suite intentionally runs with retries disabled so first-failure
    // traces are the only reliable debugging artifact we can collect in CI.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'electron-headless',
      // The Workbench lane owns the cycle and project configuration journeys. Legacy Orca
      // specs remain in the tree for source compatibility, but are not part of
      // the current CI entrypoint.
      testMatch: ['workbench-cycle-smoke.spec.ts', 'workbench-stale-runtime-session.spec.ts'],
      grepInvert: /@headful/,
      metadata: {
        workbenchHeadful: false
      }
    },
    {
      name: 'electron-headful',
      // Keep manual headful verification on the same Workbench smoke journey;
      // restored legacy Orca specs are source-only compatibility material.
      testMatch: ['workbench-cycle-smoke.spec.ts', 'workbench-stale-runtime-session.spec.ts'],
      metadata: {
        workbenchHeadful: true
      }
    }
  ]
})
