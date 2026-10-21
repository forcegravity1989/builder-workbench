import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const windowsTestWorkerOptions = process.platform === 'win32' ? { maxWorkers: 4 } : {}

export default defineConfig({
  define: {
    ORCA_FEATURE_WALL_ENABLED: 'true'
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    // Why: Node 26's undefined Web Storage globals prevent Vitest from installing happy-dom's.
    // Why --expose-gc: retention tests need a deterministic collection point to measure what a queue really holds.
    execArgv: ['--no-experimental-webstorage', '--expose-gc'],
    // Why: happy-dom drops MutationObserver callbacks on GC; keep them alive like a browser does.
    setupFiles: [
      resolve('config/scripts/happy-dom-offscreen-canvas.ts'),
      resolve('config/scripts/happy-dom-mutation-observer-retention.ts'),
      resolve('config/scripts/vitest-host-ports-setup.ts')
    ],
    // CI/E2E contract tests from the historical Orca harness are retained as
    // source, but are not part of the Workbench test entrypoint.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Why: the full suite runs heavy TS transforms plus real git/http fixtures;
    // the Vitest 5s defaults are too tight for the slowest integration cases.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    // Why: Windows process and shell startup are slower under full-suite load;
    // macOS/Linux keep Vitest's default worker parallelism.
    ...windowsTestWorkerOptions
  }
})
