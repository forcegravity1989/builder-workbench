import type { CycleTaskRead } from './version-cycle/ports'
import { issueReadState } from './version-acceptance/acceptance-issue-annotations'
import type { VersionCatalogState } from './use-version-catalog'
import type { VersionWorkflowProgress } from './version-workflow-progress'

export type WallCardReadings =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'unknown'; reason: string }
  | {
      kind: 'version'
      version: string
      goals: string[]
      plan: VersionWorkflowProgress
      acceptance: VersionWorkflowProgress
      tasks: { closed: number; total: number } | null
      catalog: VersionCatalogState
    }

/** Use the same provider states as the plan and acceptance screens. */
export function wallTaskCounts(
  reads: readonly CycleTaskRead[]
): { closed: number; total: number } | null {
  const states = reads.map(issueReadState)
  return states.includes('unknown')
    ? null
    : {
        closed: states.filter((state) => state === 'closed').length,
        total: reads.length
      }
}
