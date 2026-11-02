import type { ExecutionHostId } from '../execution-host'
import type { TaskSourceContext } from '../task-source-context'
import type { WorktreeMeta } from '../worktree/meta-types'
import type { WorkspaceAttachmentMutation } from '../workspace-attachment-mutation'

/** A host spelling changes only with an exact owner and repository match. */
export function projectTaskSourceHost<T extends TaskSourceContext | null | undefined>(
  context: T,
  from: ExecutionHostId,
  to: ExecutionHostId,
  repoIds: ReadonlySet<string>
): T {
  if (
    !context ||
    from === to ||
    context.hostId !== from ||
    !context.repoId ||
    !repoIds.has(context.repoId)
  ) {
    return context
  }
  return { ...context, hostId: to } as T
}

type TaskSourceFields = Pick<
  WorktreeMeta,
  'workbenchVersionBinding' | 'linkedTaskSourceContext' | 'linkedItems'
> &
  WorkspaceAttachmentMutation

/** Keep the primary task, BW binding and attachment merge base in the same identity space. */
export function projectWorktreeTaskSources<T extends TaskSourceFields>(
  value: T,
  from: ExecutionHostId,
  to: ExecutionHostId,
  repoIds: ReadonlySet<string>
): T {
  return mapWorktreeTaskSources(value, (context) =>
    projectTaskSourceHost(context, from, to, repoIds)
  )
}

/** A foreign client's local source has no portable identity; never reinterpret it as the server. */
export function localizeWorktreeTaskSources<T extends TaskSourceFields>(
  value: T,
  from: ExecutionHostId,
  repoIds: ReadonlySet<string>
): T {
  return mapWorktreeTaskSources(value, (context) => {
    if (
      context?.hostId === 'local' &&
      (from !== 'local' || !context.repoId || !repoIds.has(context.repoId))
    ) {
      throw new Error(
        'Cannot transfer a desktop-local task source to another host. Open the task from its owning host before moving or linking this workspace.'
      )
    }
    return projectTaskSourceHost(context, from, 'local', repoIds)
  })
}

function mapWorktreeTaskSources<T extends TaskSourceFields>(
  value: T,
  project: <C extends TaskSourceContext | null | undefined>(context: C) => C
): T {
  let result = value
  const replace = <K extends keyof TaskSourceFields>(key: K, next: TaskSourceFields[K]) => {
    if (next !== value[key]) {
      result = { ...result, [key]: next }
    }
  }
  const binding = value.workbenchVersionBinding
  if (binding?.taskSource) {
    const taskSource = project(binding.taskSource)
    if (taskSource !== binding.taskSource) {
      replace('workbenchVersionBinding', { ...binding, taskSource })
    }
  }
  if ('linkedTaskSourceContext' in value) {
    replace('linkedTaskSourceContext', project(value.linkedTaskSourceContext))
  }
  for (const key of ['linkedItems', 'linkedItemsBase'] as const) {
    const entries = value[key]
    if (!entries) {
      continue
    }
    const projected = entries.map((item) => {
      const taskSourceContext = project(item.taskSourceContext)
      return taskSourceContext === item.taskSourceContext ? item : { ...item, taskSourceContext }
    })
    if (projected.some((item, i) => item !== entries[i])) {
      replace(key, projected)
    }
  }
  return result
}
