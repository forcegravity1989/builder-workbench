import { defineConfig } from '@stablyai/playwright-test'
import path from 'node:path'
import base from '../tests/playwright.config'

export default defineConfig({
  ...base,
  globalSetup: path.resolve('tests/e2e/global-setup.ts'),
  globalTeardown: path.resolve('tests/e2e/global-teardown.ts'),
  outputDir: path.resolve('.scratch/issue388-results'),
  workers: 1,
  projects: [
    {
      name: 'electron-headless',
      testDir: path.resolve('tests/e2e'),
      testMatch: 'workbench-cycle-smoke.spec.ts',
      metadata: { workbenchHeadful: false }
    },
    {
      name: 'issue-388-publication',
      testDir: path.resolve('.scratch/e2e'),
      testMatch: 'issue388.spec.ts',
      metadata: { workbenchHeadful: false }
    }
  ]
})
