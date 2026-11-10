// WeLink group-space reporting configuration (Issue #553 第一件事).
// Build-time define + env fallback follows the ORCA_DIAGNOSTICS_TOKEN_URL
// precedent (electron.vite.config.ts define block; the ambient declaration
// lives in src/types/build-constants.d.ts). Difference: env WINS here.
// The native pin exists so a user env cannot redirect uploads that carry a
// server-issued bearer token; the WeLink sink authenticates with the
// operator's own welink-cli login, so an env override only redirects that
// user's own reports to another space they can already access — and the env
// path is how dev/acceptance runs point at a real group space without a
// rebuild.

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

export function resolveWelinkReportConfig(): WelinkReportConfig | null {
  const fromEnv = process.env.WORKBENCH_WELINK_SPACE_ID?.trim()
  const fromBuild =
    typeof WORKBENCH_WELINK_SPACE_ID !== 'undefined'
      ? WORKBENCH_WELINK_SPACE_ID
      : ((globalThis as { WORKBENCH_WELINK_SPACE_ID?: string | null }).WORKBENCH_WELINK_SPACE_ID ??
        null)
  const spaceId = fromEnv || (typeof fromBuild === 'string' ? fromBuild.trim() : '')
  if (!spaceId || !SPACE_ID_PATTERN.test(spaceId)) {
    return null
  }
  return { spaceId }
}

/** User-facing guidance when the space id is absent/invalid (前提 2:明确可操作文案,不是失败 toast). */
export const WELINK_REPORT_CONFIG_MISSING_MESSAGE =
  '尚未配置 WeLink 群空间(WORKBENCH_WELINK_SPACE_ID),无法发送;请联系 BW 管理员完成配置。'
