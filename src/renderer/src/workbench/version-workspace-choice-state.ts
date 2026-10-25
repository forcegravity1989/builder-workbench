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

type ScopedWorkspaceDispatch = 'opened' | 'choice-opened' | 'unavailable' | 'none'

/**
 * 统一 Start/Open 的公共分发壳（板面开工箭头、任务屏行、详情弹窗三处共用）：
 * 唯一候选 → 宿主限定直开，激活失败走 onUnavailable；多候选 → BW 选择器
 * （绝不取第一棵）；无候选 → 返回 'none' 由调用方回落原生语义。埋点与回落
 * 文案各处不同（toast/notify/创建器），留在调用方，不在此强行统一。
 */
export function dispatchScopedWorktrees<T extends Worktree>(args: {
  candidates: readonly T[]
  choiceTitle: string
  onUnavailable(): void
}): ScopedWorkspaceDispatch {
  const { candidates, choiceTitle, onUnavailable } = args
  if (candidates.length === 1) {
    const only = candidates[0]
    if (!only || activateAndRevealWorktree(only.id, worktreeActivationHostOpts(only)) === false) {
      onUnavailable()
      return 'unavailable'
    }
    return 'opened'
  }
  if (candidates.length > 1) {
    openWorkbenchWorkspaceChoice({ title: choiceTitle, candidates: [...candidates] })
    return 'choice-opened'
  }
  return 'none'
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
