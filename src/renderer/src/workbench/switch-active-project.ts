import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { closeProjectPage, openFilteredProjectOverview } from './project-page-state'
import { requestVersionSidebarFocus } from './version-sidebar-state'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { WallProjectFilters } from './use-wall-projects'

/** Project selection must not activate a native worktree or resume its sessions. */
export async function switchActiveProject(
  repoId: string,
  hostId?: ExecutionHostId,
  filters?: WallProjectFilters
): Promise<boolean> {
  const store = useAppStore.getState()
  if (!store.repos.some((repo) => repo.id === repoId)) {
    toast.error('找不到该项目')
    return false
  }
  store.setActiveRepo(repoId)
  if (hostId) {
    useAppStore.setState({ activeWorkspaceExecutionHostId: hostId })
  }
  if (hostId && filters && (filters.location !== 'all' || filters.type !== 'all')) {
    openFilteredProjectOverview(repoId, hostId, filters)
  } else {
    closeProjectPage()
    useAppStore.getState().openActivityPage()
  }
  requestVersionSidebarFocus(repoId)
  return true
}
