import { defineConfig } from '@stablyai/playwright-test'
import workbench from './playwright.config'
import { WORKBENCH_EXPLICIT_ALLOWLIST } from './e2e/workbench-allowlist'

/** Deliberate Workbench run for all registered non-provider acceptance checks. */
export default defineConfig(workbench, {
  projects: workbench.projects?.map((project) => ({
    ...project,
    testMatch: [...WORKBENCH_EXPLICIT_ALLOWLIST],
    ...(project.name === 'electron-headless' ? { grepInvert: /@headful/ } : { grep: /@headful/ })
  }))
})
