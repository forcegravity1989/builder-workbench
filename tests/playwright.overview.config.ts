import { defineConfig } from '@stablyai/playwright-test'
import workbench from './playwright.config'
import { WORKBENCH_VERSION_OVERVIEW_SPEC } from './e2e/workbench-allowlist'

// The provider-backed version overview acceptance check needs the operator's read-only authentication, not CI test doubles.
export default defineConfig(workbench, {
  projects: workbench.projects?.map((project) => ({
    ...project,
    testMatch: WORKBENCH_VERSION_OVERVIEW_SPEC
  }))
})
