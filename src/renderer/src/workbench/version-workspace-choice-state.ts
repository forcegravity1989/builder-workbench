import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { Worktree } from '../../../shared/worktree/types'
import type { ExecutionHostId } from '../../../shared/execution-host'

/**
 * G2 多候选工作区选择器状态（P4）：同一任务在本版有多个明确绑定的工作区时，
 * 由人在选择器中挑选，绝不自动取第一棵。模块级 store（沿 project-page-state
 * 范式）：任务列表行与任务详情弹窗共用同一选择器，不经原生 model 钻透。
 */

export type WorkbenchWorkspaceChoice = {
  title: string
  candidates: Worktree[]
}

let choice: WorkbenchWorkspaceChoice | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function openWorkbenchWorkspaceChoice(next: WorkbenchWorkspaceChoice): void {
  choice = next
  emit()
}

export function closeWorkbenchWorkspaceChoice(): void {
  if (choice) {
    choice = null
    emit()
  }
}

/**
 * 宿主限定激活选项（STA-4343：同 repoId::path 的 id 可跨宿主重复，激活须带
 * 登记归属宿主）；本机/未限定行返回 undefined，沿原生默认解析。统一
 * Start/Open 各直开点共用，不在调用端各写条件展开。
 */
export function worktreeActivationHostOpts(
  worktree: Pick<Worktree, 'hostId'>
): { executionHostId: ExecutionHostId } | undefined {
  return worktree.hostId ? { executionHostId: worktree.hostId } : undefined
}

export function chooseWorkbenchWorkspace(worktree: Worktree): void {
  choice = null
  emit()
  const result = activateAndRevealWorktree(worktree.id, worktreeActivationHostOpts(worktree))
  if (result === false) {
    toast.error('无法打开所选工作区，请在原生项目工作区中核对。')
  }
}

export function useWorkbenchWorkspaceChoice(): WorkbenchWorkspaceChoice | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => choice,
    () => null
  )
}
