import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  if (!isWorkbenchShell()) {
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
