// Config resolution guard (Issue #553): the space id gates every upload and
// travels through CLI args, so the numeric-only contract is a data protocol.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveWelinkReportConfig, WORKBENCH_REPORT_FOLDER_NAME } from './welink-report-config'

const buildConstant = globalThis as { WORKBENCH_WELINK_SPACE_ID?: string | null }

describe('resolveWelinkReportConfig', () => {
  beforeEach(() => {
    delete process.env.WORKBENCH_WELINK_SPACE_ID
    delete buildConstant.WORKBENCH_WELINK_SPACE_ID
  })
  afterEach(() => {
    delete process.env.WORKBENCH_WELINK_SPACE_ID
    delete buildConstant.WORKBENCH_WELINK_SPACE_ID
  })

  it('prefers env over the build constant and only accepts numeric space ids', () => {
    buildConstant.WORKBENCH_WELINK_SPACE_ID = '111'
    process.env.WORKBENCH_WELINK_SPACE_ID = ' 222 '
    expect(resolveWelinkReportConfig()).toEqual({ spaceId: '222' })

    delete process.env.WORKBENCH_WELINK_SPACE_ID
    expect(resolveWelinkReportConfig()).toEqual({ spaceId: '111' })

    // Injection-shaped values must not pass, even quoted-looking ones.
    process.env.WORKBENCH_WELINK_SPACE_ID = "123'; rm -rf / #"
    expect(resolveWelinkReportConfig()).toBeNull()
    delete process.env.WORKBENCH_WELINK_SPACE_ID
    buildConstant.WORKBENCH_WELINK_SPACE_ID = null
    expect(resolveWelinkReportConfig()).toBeNull()
    expect(WORKBENCH_REPORT_FOLDER_NAME).toBe('Workbench 上报')
  })
})
