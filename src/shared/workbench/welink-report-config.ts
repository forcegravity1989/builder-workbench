// BW #553: WeLink group-space reporting config contract (shared between the
// main-process sink, its IPC state channel and the renderer settings input).

export type WelinkReportConfigState = {
  /** True when a build-time WORKBENCH_WELINK_SPACE_ID define pins the space; the settings input is read-only then. */
  readonly locked: boolean
  readonly lockedSpaceId: string | null
  /** Sanitized persisted settings value; null when absent or invalid. */
  readonly settingsSpaceId: string | null
}

export type WelinkReportConfigApi = {
  getState: () => Promise<WelinkReportConfigState>
}
