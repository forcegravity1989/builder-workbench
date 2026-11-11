// Config pin guard (Issue #553): the report group space is hardcoded (human
// decision 2026-11-11: 「群空间可以写死了,24160277」). The value travels
// through CLI args and the WSL shell string, so the test pins both the exact
// value and its numeric shape.

import { describe, expect, it } from 'vitest'
import {
  resolveWelinkReportConfig,
  WELINK_REPORT_SPACE_ID,
  WORKBENCH_REPORT_FOLDER_NAME
} from './welink-report-config'

describe('resolveWelinkReportConfig', () => {
  it('resolves the code-pinned numeric space id and report folder', () => {
    expect(WELINK_REPORT_SPACE_ID).toBe('24160277')
    expect(WELINK_REPORT_SPACE_ID).toMatch(/^\d{1,20}$/)
    expect(resolveWelinkReportConfig()).toEqual({ spaceId: '24160277' })
    expect(WORKBENCH_REPORT_FOLDER_NAME).toBe('Workbench 上报')
  })
})
