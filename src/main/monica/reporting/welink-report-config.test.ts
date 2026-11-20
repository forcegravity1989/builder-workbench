import { describe, expect, it } from 'vitest'
import {
  resolveWelinkReportConfig,
  WELINK_REPORT_SPACE_ID,
  MONICA_REPORT_FOLDER_NAME
} from './welink-report-config'

describe('resolveWelinkReportConfig', () => {
  it('keeps the report destination and default folder contract stable', () => {
    expect(WELINK_REPORT_SPACE_ID).toMatch(/^\d{1,20}$/)
    expect(resolveWelinkReportConfig()).toEqual({ spaceId: WELINK_REPORT_SPACE_ID })
    expect(MONICA_REPORT_FOLDER_NAME).toBe('Monica 上报')
  })
})
