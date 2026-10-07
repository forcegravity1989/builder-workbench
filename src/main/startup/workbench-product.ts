/** Compile-time flag from electron.vite `define` (packaged Workbench builds). */
declare const WORKBENCH_SHELL: string | undefined

/**
 * Workbench trial package must not share Orca's userData / single-instance lock.
 * Electron defaults userData from package.json `name` ("orca"); Workbench builds
 * override identity + path so a second click does not activate /Applications/Orca.app.
 */
export function isWorkbenchProduct(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ORCA_PRODUCT_NAME === 'Workbench' || env.WORKBENCH_SHELL === '1') {
    return true
  }
  // The build constant is absent in plain Node entry points and source-level tests.
  // oxlint-disable-next-line unicorn/no-typeof-undefined
  return typeof WORKBENCH_SHELL !== 'undefined' && WORKBENCH_SHELL === '1'
}

export const WORKBENCH_APP_NAME = 'Workbench'
export const WORKBENCH_APP_USER_MODEL_ID = 'com.stablyai.workbench.dev'
export const WORKBENCH_USER_DATA_DIR_NAME = 'workbench'
/** Dev (`pnpm run dev:workbench`) profile — keeps ordinary `orca-dev` untouched. */
export const WORKBENCH_DEV_USER_DATA_DIR_NAME = 'workbench-dev'
/** First-launch default — common laptop / external-monitor design target. */
export const WORKBENCH_DEFAULT_WINDOW_WIDTH = 1920
export const WORKBENCH_DEFAULT_WINDOW_HEIGHT = 1080

export function clampWorkbenchDefaultWindowBounds(workArea: { width: number; height: number }): {
  width: number
  height: number
} {
  return {
    width: Math.min(WORKBENCH_DEFAULT_WINDOW_WIDTH, workArea.width),
    height: Math.min(WORKBENCH_DEFAULT_WINDOW_HEIGHT, workArea.height)
  }
}
