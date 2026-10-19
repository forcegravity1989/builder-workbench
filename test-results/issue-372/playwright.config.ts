import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: '.', testMatch: 'recall.spec.ts', timeout: 180000, workers: 1, reporter: 'list', outputDir: './runs', use: { trace: 'off' } })
