import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { Worktree } from '../../../shared/worktree/types'

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

export function chooseWorkbenchWorkspace(worktree: Worktree): void {
  choice = null
  emit()
  // 跨宿主同 id 实例按登记归属宿主解析（STA-4343）；本机未限定行沿原生默认解析。
  const result = activateAndRevealWorktree(worktree.id, {
    ...(worktree.hostId ? { executionHostId: worktree.hostId } : {})
  })
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
