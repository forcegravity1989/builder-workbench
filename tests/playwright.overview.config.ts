import { defineConfig } from '@stablyai/playwright-test'
import workbench from './playwright.config'
import { WORKBENCH_EXPLICIT_SPEC } from './e2e/workbench-allowlist'

// The native GitHub journey needs the operator's read-only authentication, not CI test doubles.
export default defineConfig(workbench, {
  projects: workbench.projects?.map((project) => ({
    ...project,
    testMatch: WORKBENCH_EXPLICIT_SPEC
  }))
})
