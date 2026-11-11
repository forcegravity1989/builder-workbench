// Config resolution guard (Issue #553): the group-space id now lives in
// settings (editable input) with a build define as deployment lock; the
// numeric-only contract is a data protocol because the id travels through
// CLI args and the WSL shell string.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getWelinkReportConfigState,
  resolveWelinkReportConfig,
  setWelinkReportSettingsReader,
  WORKBENCH_REPORT_FOLDER_NAME
} from './welink-report-config'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))

const buildConstant = globalThis as { WORKBENCH_WELINK_SPACE_ID?: string | null }
let settingsValue: string | null = null

describe('resolveWelinkReportConfig', () => {
  beforeEach(() => {
    settingsValue = null
    delete buildConstant.WORKBENCH_WELINK_SPACE_ID
    setWelinkReportSettingsReader(() => settingsValue)
  })

  it('reads settings, lets a build define lock the value, and rejects malformed ids', () => {
    settingsValue = '123456'
    expect(resolveWelinkReportConfig()).toEqual({ spaceId: '123456' })
    expect(getWelinkReportConfigState()).toEqual({
      locked: false,
      lockedSpaceId: null,
      settingsSpaceId: '123456'
    })

    // Deployment lock wins and flips the UI state to read-only.
    buildConstant.WORKBENCH_WELINK_SPACE_ID = '999'
    expect(resolveWelinkReportConfig()).toEqual({ spaceId: '999' })
    expect(getWelinkReportConfigState()).toMatchObject({ locked: true, lockedSpaceId: '999' })
    delete buildConstant.WORKBENCH_WELINK_SPACE_ID

    // Defense in depth: a malformed persisted value (store sanitize bypassed)
    // degrades to unconfigured instead of reaching a command line.
    settingsValue = '123abc; rm -rf /'
    expect(resolveWelinkReportConfig()).toBeNull()
    settingsValue = ''
    expect(resolveWelinkReportConfig()).toBeNull()
    expect(getWelinkReportConfigState()).toEqual({
      locked: false,
      lockedSpaceId: null,
      settingsSpaceId: null
    })
    expect(WORKBENCH_REPORT_FOLDER_NAME).toBe('Workbench 上报')
  })
})
