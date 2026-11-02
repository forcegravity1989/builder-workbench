// Build current E2E output and create an isolated fixture repo whose path is shared with workers.

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { prepareDockerSshHostImage } from './helpers/docker-ssh-host-image'

import {
  createSeededTestRepo,
  E2E_TEST_REPO_PATH_FILE_ENV,
  TEST_REPO_PATH_FILE
} from './helpers/workbench-test-repo'
export {
  E2E_TEST_REPO_PATH_FILE_ENV,
  TEST_REPO_PATH_FILE,
  workerTestRepositoryPathFile
} from './helpers/workbench-test-repo'
const ELECTRON_E2E_BUILD_TIMEOUT_MS = 300_000
const CLI_E2E_BUILD_TIMEOUT_MS = 120_000
const WEB_E2E_BUILD_TIMEOUT_MS = 300_000

export default function globalSetup(): void {
  // Why: workers and teardown need this run's path, never another concurrent run's.
  process.env[E2E_TEST_REPO_PATH_FILE_ENV] = TEST_REPO_PATH_FILE
  const root = process.cwd()
  const outMain = path.join(root, 'out', 'main', 'index.js')
  const outCli = path.join(root, 'out', 'cli', 'index.js')
  const outWeb = path.join(root, 'out', 'web', 'web-index.html')

  if (process.env.SKIP_BUILD && existsSync(outMain)) {
    console.error('[e2e] SKIP_BUILD set and out/main/index.js exists — skipping build')
  } else {
    // Use E2E mode to expose window.__store; retain the env flag for older local overrides.
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
      // Allow healthy Windows renderer builds to outlast 120s before specs start.
      timeout: ELECTRON_E2E_BUILD_TIMEOUT_MS
    })
    console.error('[e2e] Build complete.')
  }
  if (process.env.SKIP_BUILD && existsSync(outCli)) {
    console.error('[e2e] SKIP_BUILD set and out/cli/index.js exists — skipping CLI build')
    // Artifact downloads lose executable bits; each runner still needs its local dev launcher.
    execSync('pnpm run prepare:cli-output', {
      cwd: root,
      stdio: 'inherit',
      timeout: CLI_E2E_BUILD_TIMEOUT_MS
    })
  } else {
    console.error('[e2e] Building bundled CLI...')
    execSync('pnpm run build:cli', {
      cwd: root,
      stdio: 'inherit',
      timeout: CLI_E2E_BUILD_TIMEOUT_MS
    })
    console.error('[e2e] CLI build complete.')
  }
  if (process.env.ORCA_E2E_WEB_CLIENT === '1') {
    if (process.env.SKIP_BUILD && existsSync(outWeb)) {
      console.error('[e2e] SKIP_BUILD set and web client exists — skipping web build')
    } else {
      // Why: paired-browser specs need the web bundle served by the runtime; ordinary Electron E2E does not.
      console.error('[e2e] Building paired runtime web client...')
      execSync('pnpm run build:web', {
        env: { ...process.env, VITE_EXPOSE_STORE: 'true' },
        cwd: root,
        stdio: 'inherit',
        timeout: WEB_E2E_BUILD_TIMEOUT_MS
      })
      console.error('[e2e] Web client build complete.')
    }
  }
  if (process.env.ORCA_E2E_SSH_DOCKER === '1') {
    console.error('[e2e] Preparing Docker OpenSSH fixture image...')
    prepareDockerSshHostImage(root)
  }

  const testRepoDir = createSeededTestRepo()
  console.error(`[e2e] Test repo created at ${testRepoDir}`)
}

// Shared by global setup and worker fallbacks so both seed paths stay identical.
export function seedTestRepository(): string {
  return createSeededTestRepo({ publishPath: false })
}
