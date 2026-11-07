export { isWorkbenchProduct, WORKBENCH_APP_NAME } from '../../shared/app-identity'

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
