import type { ReactNode } from 'react'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { WorkflowArchivePr } from '../../../../shared/workbench/version-workflow'

/** Native identity, not a path-derived project or a title-derived run. */
export type CycleScope = {
  projectId: string
  repoId: string
  hostId: ExecutionHostId
  runtimeOwnerEnvironmentId?: string
  workflow: VersionWorkflow
}

export type CycleSession = CycleScope & {
  worktreeId: string
  sessionId: string
  tabId: string
  paneKey?: string
  kind: 'terminal' | 'structured'
  title: string
  runId?: string
}

export type TaskOrigin = CycleScope & {
  page: 'plan' | 'acceptance'
  version: string
  cycleId: string
  worktreeId: string
  sessionId?: string
  goalId?: string
  scrollTop: number
  draftKey: string
}

export type CycleTaskReference = PlanningMaterial['tasks'][number]
export type CycleTaskSnapshot = {
  reference: CycleTaskReference
  source: TaskSourceContext
  iid: number
  title: string
  state: string
  url: string
  readAt: string
}
export type CycleTaskRead =
  | { reference: CycleTaskReference; kind: 'ready'; task: CycleTaskSnapshot }
  | {
      reference: CycleTaskReference
      kind: 'unavailable'
      error: string
      readAt: string
      source?: TaskSourceContext
    }

export type TaskPort = {
  listVersion(
    scope: CycleScope,
    references: readonly CycleTaskReference[]
  ): Promise<CycleTaskRead[]>
  refresh(scope: CycleScope, references: readonly CycleTaskReference[]): Promise<CycleTaskRead[]>
  openDetail(task: CycleTaskSnapshot, origin: TaskOrigin): Promise<void>
}

export type ArchivePrScope = {
  repoId: string
  worktreeId: string
  hostId: ExecutionHostId
  runtimeOwnerEnvironmentId?: string
}
export type ArchivePrPort = {
  /** Status of the one recorded archive PR, read on the worktree's owning runtime. */
  readStatus(scope: ArchivePrScope, pr: WorkflowArchivePr): Promise<ArchivePrStatusResult>
}

export type VersionGoalCardProps = {
  goal: VersionGoal
  index: number
  readOnly?: boolean
  onChange?: (goal: VersionGoal) => void
  metrics?: ReactNode
  result?: ReactNode
  actions?: ReactNode
}
