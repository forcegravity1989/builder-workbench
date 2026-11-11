import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveWelinkReportConfig } from './welink-report-config'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('resolveWelinkReportConfig', () => {
  it('uses only the fixed build destination and rejects missing or malformed ids', () => {
    vi.stubGlobal('WORKBENCH_WELINK_SPACE_ID', '123456')
    vi.stubEnv('WORKBENCH_WELINK_SPACE_ID', '999')
    expect(resolveWelinkReportConfig()).toEqual({ spaceId: '123456' })

    for (const value of [null, '', '123abc; rm -rf /', '1'.repeat(21)]) {
      vi.stubGlobal('WORKBENCH_WELINK_SPACE_ID', value)
      expect(resolveWelinkReportConfig()).toBeNull()
    }
  })
})
