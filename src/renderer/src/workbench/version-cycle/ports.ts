import type { ReactNode } from 'react'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'

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
  cycleId: string
  version?: string
}

export type CycleSessionPort = {
  list(scope: CycleScope): Promise<CycleSession[]>
  start(scope: CycleScope): Promise<CycleSession>
  continue(session: CycleSession): Promise<CycleSession>
  associate(session: CycleSession, version: string): Promise<CycleSession>
  prepareRequest(session: CycleSession, text: string): Promise<void>
  configureAutomation(scope: CycleScope): Promise<void>
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

export type ArchiveReference = {
  provider: string
  repository: string
  number: number
  materialRevision: string
}
export type ArchiveStatus =
  | { kind: 'unknown'; reason: string }
  | { kind: 'not-created'; checkedAt: string }
  | {
      kind: 'open' | 'merged' | 'closed'
      reference: ArchiveReference
      url: string
      checkedAt: string
      checks: 'unknown' | 'pending' | 'passed' | 'failed'
      review: 'unknown' | 'pending' | 'approved' | 'changes-requested'
      matchesRevision: boolean
    }
export type ArchiveInput = CycleScope & {
  worktreeId: string
  version: string
  cycleId: string
  revision: string
  reference?: ArchiveReference
}
export type ArchivePort = {
  readStatus(input: ArchiveInput): Promise<ArchiveStatus>
  prepareRequest(input: ArchiveInput, session: CycleSession): Promise<void>
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
