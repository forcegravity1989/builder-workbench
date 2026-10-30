import React from 'react'
import { Link2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../shared/worktree/types'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { isWorkbenchShell } from './is-workbench-shell'
import { nativeVersionBindingPort } from './version-binding-port'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { selectVersionBindingTree } from './version-tree-binding-state'

export function WorkbenchVersionBindingMenuItems({
  worktree,
  disabled
}: {
  worktree: Worktree
  disabled: boolean
}): React.JSX.Element | null {
  // hook 必须先于下方 early return,保持每次渲染调用顺序一致。
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  if (!isWorkbenchShell() || worktree.isMainWorktree || worktree.isArchived) {
    return null
  }
  const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)

  async function unbind(): Promise<void> {
    if (!worktree.instanceId) {
      return
    }
    try {
      const scope = nativeWorkspaceScope(worktree)
      await nativeVersionBindingPort(scope).set(
        {
          repoId: worktree.repoId,
          worktreeId: worktree.id,
          hostId: scope.hostId,
          ...(worktree.projectId ? { projectId: worktree.projectId } : {}),
          instanceId: worktree.instanceId
        },
        null
      )
      // 解绑后树回流原生列表;目标内置顶(isPinned)语义不外溢成原生「已固定」,随手清掉。
      // 已未固定则跳过,不发多余持久化写(对齐原生 setWorktreesPinnedAndReveal 的目标态短路)。
      if (worktree.isPinned) {
        void updateWorktreeMeta(
          worktree.id,
          { isPinned: false },
          { executionHostId: worktree.hostId ?? 'local' }
        )
      }
      toast.success('已解除版本绑定。')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={disabled} onSelect={() => selectVersionBindingTree(worktree)}>
        <Link2 className="size-3.5" />
        {binding ? '更改版本绑定…' : '绑定版本…'}
      </DropdownMenuItem>
      {binding ? (
        <DropdownMenuItem
          disabled={disabled || !worktree.instanceId}
          onSelect={() => void unbind()}
        >
          <Unlink className="size-3.5" />
          解除版本绑定
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
