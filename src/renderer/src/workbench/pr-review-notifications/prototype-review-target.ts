import { useAppStore } from '@/store'
import { refreshWebRuntimeSessionTabsSnapshot } from '@/runtime/web-session-tabs-sync/inventory/web-runtime-session-snapshot'
import { isWebRuntimeSessionActive } from '@/runtime/web-session-tabs-sync/identity/web-runtime-session-environment'
import { selectWebRuntimeSessionBrowserWorktree } from '@/runtime/web-session-tabs-sync/workspace-selection/web-runtime-session-workspace-selection'
import type { PrototypeReviewPageRef } from '../../../../shared/workbench/prototype-review-request'

async function resolveEnvironmentId(page: PrototypeReviewPageRef): Promise<string> {
  if (page.sourceRuntimeId) {
    const snapshots = await window.api.runtimeEnvironments.getStatusSnapshots()
    const match = snapshots.find((item) => item.status?.runtimeId === page.sourceRuntimeId)
    if (match) {
      return match.environmentId
    }
  }
  return page.sourceEnvironmentId
}

export async function openPrototypeReviewPage(page: PrototypeReviewPageRef): Promise<void> {
  const environmentId = await resolveEnvironmentId(page)
  if (environmentId === 'local') {
    const state = useAppStore.getState()
    state.setActiveWorktree(page.worktreeId)
    state.focusBrowserTabInWorktree(page.worktreeId, page.browserPageId, { surfacePane: true })
    return
  }
  if (!isWebRuntimeSessionActive(environmentId)) {
    throw new Error(`${page.sourceHostName} 当前不可用`)
  }
  await refreshWebRuntimeSessionTabsSnapshot(environmentId, page.worktreeId, {
    acceptCurrentSnapshot: true,
    afterCurrentInFlight: true,
    errorMode: 'throw'
  })
  selectWebRuntimeSessionBrowserWorktree(page.worktreeId, environmentId)
  const state = useAppStore.getState()
  const workspaces = state.browserTabsByWorktree[page.worktreeId] ?? []
  const workspace = workspaces.find((tab) => (tab.pageIds ?? []).includes(page.browserPageId))
  if (!workspace) {
    throw new Error(`${page.sourceHostName} 的共享浏览器页签已关闭或暂时不可用`)
  }
  state.focusBrowserTabInWorktree(page.worktreeId, page.browserPageId, { surfacePane: true })
}
