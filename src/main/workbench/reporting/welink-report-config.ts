export const WORKBENCH_REPORT_FOLDER_NAME = 'Workbench 上报'

export type WelinkReportConfig = {
  readonly spaceId: string
}

// The destination is fixed by the build; runtime settings and environment
// variables must not redirect reports to another group.
export function resolveWelinkReportConfig(): WelinkReportConfig | null {
  const value =
    typeof WORKBENCH_WELINK_SPACE_ID !== 'undefined'
      ? WORKBENCH_WELINK_SPACE_ID
      : ((globalThis as { WORKBENCH_WELINK_SPACE_ID?: string | null }).WORKBENCH_WELINK_SPACE_ID ??
        null)
  const spaceId = typeof value === 'string' ? value.trim() : ''
  return /^\d{1,20}$/.test(spaceId) ? { spaceId } : null
}

export const WELINK_REPORT_CONFIG_MISSING_MESSAGE =
  '此版本尚未配置 BW 用户群上报空间，请联系 BW 管理员。'
