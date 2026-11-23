import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import type { Worktree } from '../../../shared/worktree/types'

/** Only a version binding enables the Workbench workflow inside a native workspace. */
export function cycleWorkflowForWorktree(
  worktree: Pick<Worktree, 'branch' | 'workbenchVersionBinding'> | null | undefined
) {
  const binding = normalizeStoredWorkbenchVersionBinding(worktree?.workbenchVersionBinding)
  return binding?.workflow === 'plan' || binding?.workflow === 'acceptance'
    ? binding.workflow
    : null
}
