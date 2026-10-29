import { defineConfig } from '@playwright/test'
import path from 'node:path'
const root = process.cwd()
export default defineConfig({
  testDir: '.', testMatch: 'issue469.spec.ts', workers: 1, timeout: 240000,
  expect: { timeout: 30000 }, retries: 0, reporter: 'list',
  outputDir: path.join(root, '.bw/runtime/verification/issue-469/results'),
  globalSetup: path.join(root, 'tests/e2e/global-setup.ts'),
  globalTeardown: path.join(root, 'tests/e2e/global-teardown.ts'),
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'issue469', metadata: { workbenchHeadful: false } }]
})
