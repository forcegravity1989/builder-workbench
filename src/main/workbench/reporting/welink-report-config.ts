// WeLink group-space reporting configuration (Issue #553 第一件事).
//
// Configuration surface (human decision 2026-11-11, superseding the
// build-env-only design): the group space id is a **Settings → Integrations
// input** persisted in GlobalSettings (`workbenchWelinkSpaceId`). A build-time
// define (`WORKBENCH_WELINK_SPACE_ID`) acts as the deployment lock: when a
// package ships with it, the value wins and the settings input renders
// read-only — the "fixed default, not modifiable" mode the product plans for
// once the group space settles. No runtime env override: a hidden env that
// beats the visible settings value would make the UI lie about where reports
// go.
//
// The id travels through CLI args (and a WSL shell string), so every source
// passes the numeric allow-list before use.

import { ipcMain } from 'electron'
import type { WelinkReportConfigState } from '../../../shared/workbench/welink-report-config'

// WORKBENCH_WELINK_SPACE_ID is ambient-declared in src/types/build-constants.d.ts
// (file-local `declare const` would trip unicorn/no-typeof-undefined, review F1).

/**
 * Fixed folder inside the group space, ensured via folder-list/folder-new on
 * first upload (list-first because folder-new's same-name behavior is
 * unverified — Issue #553 调研 §8). Chinese display name is fine: the CLI was
 * field-tested with CJK names and spaces (调研 §6).
 */
export const WORKBENCH_REPORT_FOLDER_NAME = 'Workbench 上报'

export type WelinkReportConfig = {
  /** Numeric onebox space id of the target WeLink group space (群空间 ID ≠ 群聊 group_id). */
  readonly spaceId: string
}

// Numeric-only on purpose: the id travels through CLI args and, on the WSL
// route, through a shell command string. Digits make injection impossible
// without relying on quoting alone.
const SPACE_ID_PATTERN = /^\d{1,20}$/

/** Injected by the IPC composition root (register-core-handlers), telemetry-storeRef style. */
let settingsSpaceIdReader: (() => string | null) | null = null

export function setWelinkReportSettingsReader(reader: (() => string | null) | null): void {
  settingsSpaceIdReader = reader
}

function resolveBuildLockedSpaceId(): string | null {
  const fromBuild =
    typeof WORKBENCH_WELINK_SPACE_ID !== 'undefined'
      ? WORKBENCH_WELINK_SPACE_ID
      : ((globalThis as { WORKBENCH_WELINK_SPACE_ID?: string | null }).WORKBENCH_WELINK_SPACE_ID ??
        null)
  const trimmed = typeof fromBuild === 'string' ? fromBuild.trim() : ''
  return trimmed && SPACE_ID_PATTERN.test(trimmed) ? trimmed : null
}

/** Settings value as persisted (already sanitized by settings-update); null when absent/invalid. */
function readSettingsSpaceId(): string | null {
  const value = settingsSpaceIdReader?.() ?? null
  return value && SPACE_ID_PATTERN.test(value) ? value : null
}

export function getWelinkReportConfigState(): WelinkReportConfigState {
  const lockedSpaceId = resolveBuildLockedSpaceId()
  return {
    locked: lockedSpaceId !== null,
    lockedSpaceId,
    settingsSpaceId: readSettingsSpaceId()
  }
}

export function resolveWelinkReportConfig(): WelinkReportConfig | null {
  const state = getWelinkReportConfigState()
  const spaceId = state.locked ? state.lockedSpaceId : state.settingsSpaceId
  return spaceId ? { spaceId } : null
}

/** User-facing guidance when no space id is configured (前提 2:明确可操作文案,不是失败 toast). */
export const WELINK_REPORT_CONFIG_MISSING_MESSAGE =
  '尚未配置 WeLink 群空间(设置 → 集成 → WeLink 群空间 ID),无法发送;请填写或联系 BW 管理员。'

export function registerWelinkReportConfigHandlers(): void {
  ipcMain.removeHandler('workbench:welink-report-config')
  ipcMain.handle('workbench:welink-report-config', (): WelinkReportConfigState => {
    return getWelinkReportConfigState()
  })
}
