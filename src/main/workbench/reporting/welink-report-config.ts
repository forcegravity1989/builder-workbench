// WeLink group-space reporting configuration (Issue #553 第一件事).
//
// The report destination is **pinned in code** (human decision 2026-11-11:
// 「群空间可以写死了,24160277」, superseding both the build-env-only design
// and the interim settings-input design). Changing the group space is a code
// change with PR review: no build define, settings field or runtime env can
// redirect reports elsewhere.

/** Numeric onebox space id of the BW report group space (群空间 ID ≠ 群聊 group_id). */
export const WELINK_REPORT_SPACE_ID = '24160277'

/**
 * Fixed folder inside the group space, ensured via folder-list/folder-new on
 * first upload (list-first because folder-new's same-name behavior is
 * unverified — Issue #553 调研 §8). Chinese display name is fine: the CLI was
 * field-tested with CJK names and spaces (调研 §6).
 */
export const WORKBENCH_REPORT_FOLDER_NAME = 'Workbench 上报'

/**
 * Telemetry batches land in their own folder (BW #553 决策⑧ 修订,人工确认):
 * opt-in usage events accumulate steadily and must not bury the human-facing
 * feedback/crash/diagnostics reports in one listing.
 */
export const WORKBENCH_TELEMETRY_FOLDER_NAME = 'Workbench 遥测'

export type WelinkReportConfig = {
  readonly spaceId: string
}

export function resolveWelinkReportConfig(): WelinkReportConfig {
  return { spaceId: WELINK_REPORT_SPACE_ID }
}
