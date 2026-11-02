import { defineConfig } from '@stablyai/playwright-test'
import { resolveBuildSourceCommit } from '../config/scripts/build-source-commit.mjs'

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
  // Keep checkout provenance without fetching the PR base during test setup.
  captureGitInfo: { commit: false, diff: false },
  metadata: { sourceCommit: resolveBuildSourceCommit() },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // Budget startup plus assertions: fresh app/profile launches can exceed 60s late in CI.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  // Isolated hidden apps can fan out; visible-window pointer specs serialize themselves.
  fullyParallel: true,
  // CI scales by shards: two real Electron trees per VM contended on Xvfb/git and caused false failures.
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    // Disable retries so CI retains the first failure’s reliable trace.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'electron-headless',
      // The Workbench lane owns the cycle and project configuration journeys. Legacy Orca
      // specs remain in the tree for source compatibility, but are not part of
      // the current CI entrypoint.
      testMatch: 'workbench-cycle-smoke.spec.ts',
      grepInvert: /@headful/,
      metadata: {
        workbenchHeadful: false
      }
    },
    {
      name: 'electron-headful',
      // Keep manual headful verification on the same Workbench smoke journey;
      // restored legacy Orca specs are source-only compatibility material.
      testMatch: 'workbench-cycle-smoke.spec.ts',
      metadata: {
        workbenchHeadful: true
      }
    }
  ]
})
