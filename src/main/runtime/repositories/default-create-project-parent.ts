import { homedir } from 'node:os'
import { isAbsolute, join, win32 } from 'node:path'
import type { GlobalSettings } from '../../../shared/settings/global-settings-types'
import { getDefaultWorkspaceDir } from '../../../shared/orca-profiles/constants'
import { normalizeRuntimePathForComparison } from '../../../shared/file-access/cross-platform-path'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host/execution-host'
import { getEffectiveHostSetting } from '../../../shared/execution-host/host-setting-overrides'
import {
  isWorkbenchProduct,
  WORKBENCH_DEFAULT_WINDOWS_WORKSPACE_DIR
} from '../../startup/workbench-product'

/** Where Create project suggests new projects on this host. Ignores the seeded workspaceDir (treating it as user intent nests projects inside the worktree root) and repo-relative ones like .orca/worktrees, which name no folder until there is a repo. */
export function getDefaultCreateProjectParent(
  settings: Pick<GlobalSettings, 'hostSettingOverrides'> & { workspaceDir?: string }
): string {
  const home = homedir()
  const configured = getEffectiveHostSetting(
    settings,
    LOCAL_EXECUTION_HOST_ID,
    'defaultWorktreeLocation',
    settings.workspaceDir ?? ''
  ).trim()
  if (
    isWorkbenchProduct() &&
    normalizeRuntimePathForComparison(configured) ===
      normalizeRuntimePathForComparison(WORKBENCH_DEFAULT_WINDOWS_WORKSPACE_DIR)
  ) {
    return win32.join(WORKBENCH_DEFAULT_WINDOWS_WORKSPACE_DIR, '..', 'projects')
  }
  const isUntouchedDefault =
    normalizeRuntimePathForComparison(configured) ===
    normalizeRuntimePathForComparison(getDefaultWorkspaceDir(home))
  if (configured && isAbsolute(configured) && !isUntouchedDefault) {
    return configured
  }
  return join(home, 'orca', 'projects')
}
