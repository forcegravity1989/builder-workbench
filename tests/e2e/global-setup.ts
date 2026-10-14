/**
 * Playwright globalSetup: builds the Electron app and creates a test git repo.
 *
 * Why: _electron.launch() needs the compiled output in out/main/index.js.
 * Running electron-vite build here ensures the tests are always against
 * the current source, without requiring the user to remember a manual step.
 *
 * Why: a dedicated test repo makes the suite idempotent — tests don't
 * depend on whatever the user has open. The repo path is written to a
 * temp file so the worker fixture can pick it up at runtime.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  createSeededTestRepo,
  E2E_TEST_REPO_PATH_FILE_ENV,
  TEST_REPO_PATH_FILE
} from './helpers/workbench-test-repo'

// Why re-export: the disposable-repo path is owned by the seeded-repo helper,
// but legacy specs and global-teardown import it from './global-setup'. Keep
// that surface stable instead of touching every importer.
export { E2E_TEST_REPO_PATH_FILE_ENV, TEST_REPO_PATH_FILE }

const ELECTRON_E2E_BUILD_TIMEOUT_MS = 300_000

export default function globalSetup(): void {
  // Why: workers and teardown need this run's path, never another concurrent run's.
  process.env[E2E_TEST_REPO_PATH_FILE_ENV] = TEST_REPO_PATH_FILE
  const root = process.cwd()
  const outMain = path.join(root, 'out', 'main', 'index.js')

  // ── 1. Build the Electron app ──────────────────────────────────────
  if (process.env.SKIP_BUILD && existsSync(outMain)) {
    console.error('[e2e] SKIP_BUILD set and out/main/index.js exists — skipping build')
  } else {
    // Why: --mode e2e is the build-time signal that exposes window.__store;
    // the explicit env var keeps older local overrides working too.
    // Why the Workbench triple: this playwright config only serves the
    // Workbench smoke lane, and the shell is build-time baked —
    // isWorkbenchShell() reads import.meta.env.VITE_WORKBENCH_SHELL, which
    // electron.vite.config.ts derives from these vars in the build process
    // env. Without them the build yields a plain Orca renderer and the smoke
    // never sees [data-workbench-nav]. Setting them here (not per-shell in
    // package.json) keeps Windows cmd, POSIX shells and CI on one source.
    console.error('[e2e] Building Electron app with electron-vite build --mode e2e...')
    execSync('npx electron-vite build --mode e2e', {
      env: {
        ...process.env,
        VITE_EXPOSE_STORE: 'true',
        WORKBENCH_SHELL: '1',
        VITE_WORKBENCH_SHELL: '1',
        ORCA_PRODUCT_NAME: 'Workbench'
      },
      cwd: root,
      stdio: 'inherit',
      // Why: Windows renderer builds can exceed 120s on local/CI hosts even
      // when healthy; global setup should not fail before specs can run.
      timeout: ELECTRON_E2E_BUILD_TIMEOUT_MS
    })
    console.error('[e2e] Build complete.')
  }

  // ── 2. Create a seeded test git repo ───────────────────────────────
  // Why: each test run gets its own git repo so the suite is fully
  // idempotent. No test depends on whatever repos the user has open. The
  // helper seeds files, commits, adds a secondary worktree, and publishes the
  // repo path to TEST_REPO_PATH_FILE for the worker fixture to read.
  const testRepoDir = createSeededTestRepo()
  console.error(`[e2e] Test repo created at ${testRepoDir}`)
}
