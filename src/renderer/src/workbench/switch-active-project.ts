import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { closeProjectPage } from './project-page-state'

/** Switch active project from the wall / after onboard, then land on 总览. */
export async function switchActiveProject(repoId: string): Promise<boolean> {
  const store = useAppStore.getState()
  const repo = store.repos.find((r) => r.id === repoId)
  if (!repo) {
    toast.error('找不到该项目')
    return false
  }

  await store.fetchWorktrees(repoId)
  const worktrees = useAppStore.getState().worktreesByRepo[repoId] ?? []
  const main = worktrees.find((w) => w.isMainWorktree) ?? worktrees[0]
  if (!main) {
    toast.error('项目还没有可打开的工作区')
    return false
  }

  activateAndRevealWorktree(main.id, { revealInSidebar: true })
  closeProjectPage()
  useAppStore.getState().openActivityPage()
  return true
}
