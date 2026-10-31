import { defineConfig } from '@stablyai/playwright-test'
import workbench from './playwright.config'

// The native GitHub journey needs the operator's read-only authentication, not CI test doubles.
export default defineConfig(workbench, {
  projects: workbench.projects?.map((project) => ({
    ...project,
    testMatch: 'workbench-version-overview.spec.ts'
  }))
})
