import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { closeProjectPage } from './project-page-state'
import { requestVersionSidebarFocus } from './version-sidebar-state'

/** Project selection must not activate a native worktree or resume its sessions. */
export async function switchActiveProject(repoId: string): Promise<boolean> {
  const store = useAppStore.getState()
  if (!store.repos.some((repo) => repo.id === repoId)) {
    toast.error('找不到该项目')
    return false
  }
  store.setActiveRepo(repoId)
  closeProjectPage()
  useAppStore.getState().openActivityPage()
  requestVersionSidebarFocus(repoId)
  return true
}
