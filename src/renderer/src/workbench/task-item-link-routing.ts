import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { parseTaskItemLink, type TaskItemLink } from '../../../shared/task-item-link'
import { isWorkbenchShell } from './is-workbench-shell'

let navigationRequest = 0

export function workbenchTaskItemLink(url: string): TaskItemLink | null {
  return isWorkbenchShell() ? parseTaskItemLink(url, useAppStore.getState().repos) : null
}

export async function openWorkbenchTaskItemLink(url: string): Promise<void> {
  const link = workbenchTaskItemLink(url)
  if (!link) {
    return
  }
  const request = ++navigationRequest
  let originActive = true
  // 离开后即使返回原视图，也不允许尚未完成的旧点读抢回导航。
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (
      state.activeView !== previous.activeView ||
      state.activeRepoId !== previous.activeRepoId ||
      state.activeWorktreeId !== previous.activeWorktreeId ||
      state.activeTabId !== previous.activeTabId ||
      state.activeTabType !== previous.activeTabType ||
      state.activeFileId !== previous.activeFileId ||
      state.activeBrowserTabId !== previous.activeBrowserTabId ||
      state.worktreeNavHistoryIndex !== previous.worktreeNavHistoryIndex ||
      state.worktreeNavHistory[state.worktreeNavHistoryIndex] !==
        previous.worktreeNavHistory[previous.worktreeNavHistoryIndex]
    ) {
      originActive = false
    }
  })
  const isCurrent = () => request === navigationRequest && originActive
  try {
    // 详情及 CLI 适配按需加载，避免普通链接入口加载任务屏的依赖图。
    const navigation = await import('./task-item-link-navigation')
    if (isCurrent()) {
      await navigation.openWorkbenchTaskItemLink(url, link, isCurrent)
    }
  } catch (error) {
    if (isCurrent()) {
      toast.error(
        `无法在任务中打开：${error instanceof Error ? error.message : String(error)}。请检查本机 CLI 登录与访问权限，或选择浏览器打开。`
      )
    }
  } finally {
    unsubscribe()
  }
}
