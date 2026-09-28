import type React from 'react'
import { useCycleWorkspace } from './cycle-workspace-context'

/** Only the workflow action is BW-owned; tab creation, grouping and agent controls stay native. */
export function CycleStartButton({ worktreeId }: { worktreeId: string }) {
  const workspace = useCycleWorkspace()
  if (!workspace || workspace.context.worktreeId !== worktreeId) {
    return null
  }
  return (
    <button
      type="button"
      className="vc-start-button"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      disabled={workspace.busy}
      onClick={() => void workspace.start()}
    >
      {workspace.workflow === 'plan' ? '新建计划' : '新建验收'}
    </button>
  )
}
