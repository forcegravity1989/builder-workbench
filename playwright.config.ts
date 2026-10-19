import { defineConfig } from '@stablyai/playwright-test'
export default defineConfig({
  testDir: '.', testMatch: 'certificate.spec.ts', workers: 1, retries: 0,
  timeout: 240000, expect: { timeout: 30000 }, reporter: 'list',
  outputDir: '../issue370-output', use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
})
