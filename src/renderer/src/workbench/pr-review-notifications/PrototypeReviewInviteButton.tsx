import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getRelativePathInsideRoot } from '@/lib/path'
import { useAppStore } from '@/store'
import { getKnownExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { isWorkbenchShell } from '../is-workbench-shell'
import { prototypeReviewPageFor } from './prototype-review-target'
import { openPrototypeReviewSendDialog } from './send-dialog-store'

/** Toolbar action that asks connected team members to review the previewed HTML document. */
export function PrototypeReviewInviteButton({
  worktreeId,
  filePath
}: {
  worktreeId: string
  filePath: string
}): React.JSX.Element | null {
  // Why: a reviewer can only open a file inside the shared worktree, so an invite for any other file
  // would fail on their side with no way for the owner to see why.
  const insideWorktree = useAppStore((state) => {
    if (getKnownExecutionHostIdForWorktree(state, worktreeId) !== 'local') {
      return false
    }
    const root = state.getKnownWorktreeById(worktreeId)?.path
    return root ? getRelativePathInsideRoot(filePath, root) !== null : true
  })
  if (!isWorkbenchShell() || !insideWorktree) {
    return null
  }
  const label = '邀请评审'
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      onClick={() => openPrototypeReviewSendDialog(prototypeReviewPageFor(worktreeId, filePath))}
      title={label}
      aria-label={label}
    >
      <UserPlus className="size-4" />
    </Button>
  )
}
