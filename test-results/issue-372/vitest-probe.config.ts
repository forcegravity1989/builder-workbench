import base from '../../config/vitest.config'
import { defineConfig } from 'vitest/config'
export default defineConfig({ ...base, test: { ...base.test, include: ['test-results/issue-372/*.probe.test.tsx'] } })
