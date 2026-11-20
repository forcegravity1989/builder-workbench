/** Compile-time flag from electron.vite `define` (packaged Monica builds). */
declare const MONICA_SHELL: string | undefined

/**
 * Monica 构建显式保留既有 profile 和单实例身份，避免更名后丢失会话或激活 Orca。
 */
export function isMonicaProduct(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ORCA_PRODUCT_NAME === 'Monica' || env.MONICA_SHELL === '1') {
    return true
  }
  // The build constant is absent in plain Node entry points and source-level tests.
  // oxlint-disable-next-line unicorn/no-typeof-undefined
  return typeof MONICA_SHELL !== 'undefined' && MONICA_SHELL === '1'
}

export const MONICA_APP_NAME = 'Monica'
/** 安装升级与加密凭据沿用既有身份，展示名称独立使用 Monica。 */
export const MONICA_STORAGE_APP_NAME = 'Workbench'
export const MONICA_APP_USER_MODEL_ID = 'com.stablyai.workbench.dev'
export const MONICA_USER_DATA_DIR_NAME = 'workbench'
/** Dev (`pnpm run dev:monica`) profile — keeps ordinary `orca-dev` untouched. */
export const MONICA_DEV_USER_DATA_DIR_NAME = 'workbench-dev'
export const MONICA_DEFAULT_WINDOWS_WORKSPACE_DIR = 'D:\\builders-workbench\\workspaces'
/** First-launch default — common laptop / external-monitor design target. */
export const MONICA_DEFAULT_WINDOW_WIDTH = 1920
export const MONICA_DEFAULT_WINDOW_HEIGHT = 1080

export function clampMonicaDefaultWindowBounds(workArea: { width: number; height: number }): {
  width: number
  height: number
} {
  return {
    width: Math.min(MONICA_DEFAULT_WINDOW_WIDTH, workArea.width),
    height: Math.min(MONICA_DEFAULT_WINDOW_HEIGHT, workArea.height)
  }
}
