import React, { useEffect } from 'react'
import { GitBranch } from 'lucide-react'
import type { Worktree } from '../../../shared/worktree/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getWorktreeAttachmentLabel } from '@/lib/worktree-attachment-label'
import {
  chooseWorkbenchWorkspace,
  closeWorkbenchWorkspaceChoice,
  useWorkbenchWorkspaceChoice
} from './version-workspace-choice-state'

/**
 * G2 多候选工作区选择器（P4）：行形态复用原生标签推导，激活走原生
 * activateAndRevealWorktree 链；挂在 TaskPage Surface 层，列表行与详情弹窗共用。
 */

function hostLabel(worktree: Worktree): string {
  if (worktree.runtimeOwnerEnvironmentId) {
    return `配对宿主 ${worktree.runtimeOwnerEnvironmentId}`
  }
  const hostId = worktree.hostId ?? 'local'
  return hostId === 'local' ? '本机' : hostId
}

export function WorkbenchWorkspaceChoiceDialog(): React.JSX.Element | null {
  const choice = useWorkbenchWorkspaceChoice()
  // 任务屏卸载（导航离开）时清掉模块态，防止下次进入凭空弹出。
  useEffect(() => closeWorkbenchWorkspaceChoice, [])
  if (!choice) {
    return null
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          closeWorkbenchWorkspaceChoice()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>选择要打开的工作区</DialogTitle>
          <DialogDescription>
            {choice.title} 在本版有 {choice.candidates.length} 个明确归属的工作区，请选择其一。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {choice.candidates.map((worktree) => (
            <Button
              key={worktree.id}
              type="button"
              variant="outline"
              className="h-auto justify-start whitespace-normal px-3 py-2"
              onClick={() => chooseWorkbenchWorkspace(worktree.id)}
            >
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="truncate text-sm font-medium">
                  {getWorktreeAttachmentLabel(worktree)}
                </span>
                <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <GitBranch className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{worktree.branch.replace(/^refs\/heads\//, '')}</span>
                  <span className="shrink-0">· {hostLabel(worktree)}</span>
                </span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
