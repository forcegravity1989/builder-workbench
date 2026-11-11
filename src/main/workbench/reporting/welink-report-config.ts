// The BW user-group destination is fixed; changing it requires a reviewed code change.

/** Numeric onebox space id of the BW report group space (群空间 ID ≠ 群聊 group_id). */
export const WELINK_REPORT_SPACE_ID = '24160277'

export const WORKBENCH_REPORT_FOLDER_NAME = 'Workbench 上报'

// Keep periodic telemetry batches out of the human-facing reports directory.
export const WORKBENCH_TELEMETRY_FOLDER_NAME = 'Workbench 遥测'

export type WelinkReportConfig = {
  readonly spaceId: string
}

export function resolveWelinkReportConfig(): WelinkReportConfig {
  return { spaceId: WELINK_REPORT_SPACE_ID }
}
