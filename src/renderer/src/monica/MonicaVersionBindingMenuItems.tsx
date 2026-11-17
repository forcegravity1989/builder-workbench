import { notifyMonicaError } from './error-feedback'
import React from 'react'
import { Link2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { Worktree } from '../../../shared/worktree/types'
import { normalizeStoredMonicaVersionBinding } from '../../../shared/monica/version-binding'
import { isMonicaShell } from './is-monica-shell'
import { nativeVersionBindingPort } from './version-binding-port'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { selectVersionBindingTree } from './version-tree-binding-state'

export function MonicaVersionBindingMenuItems({
  worktree,
  disabled
}: {
  worktree: Worktree
  disabled: boolean
}): React.JSX.Element | null {
  if (!isMonicaShell() || worktree.isMainWorktree || worktree.isArchived) {
    return null
  }
  const binding = normalizeStoredMonicaVersionBinding(worktree.workbenchVersionBinding)

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
      toast.success('已解除版本绑定。')
    } catch (reason) {
      notifyMonicaError('无法保存版本绑定', reason, '可重新选择版本后重试。')
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
