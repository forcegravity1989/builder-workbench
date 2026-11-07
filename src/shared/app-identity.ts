declare const WORKBENCH_SHELL: string | undefined

export const WORKBENCH_APP_NAME = 'builder-workbench'

export function isWorkbenchProduct(
  env = typeof process === 'undefined' ? undefined : process.env
): boolean {
  if (env?.ORCA_PRODUCT_NAME === 'Workbench' || env?.WORKBENCH_SHELL === '1') {
    return true
  }
  // The build constant is absent in plain Node entry points and source-level tests.
  // oxlint-disable-next-line unicorn/no-typeof-undefined
  return typeof WORKBENCH_SHELL !== 'undefined' && WORKBENCH_SHELL === '1'
}

export const DESKTOP_PRODUCT_NAME = isWorkbenchProduct() ? WORKBENCH_APP_NAME : 'Orca'

export type AppIdentity = {
  name: string
  isDev: boolean
  devLabel: string | null
  devBranch: string | null
  devWorktreeName: string | null
  devRepoRoot: string | null
  dockBadgeLabel: string | null
}
