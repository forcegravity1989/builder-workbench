import { createContext, useContext } from 'react'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { VersionCycleContext } from './cycle-context'
import type { FixedAcceptanceBrowse } from '../cycle-view-state'

export type ReadonlyCycleBrowse = { version: string; fixedAcceptance?: FixedAcceptanceBrowse }

export type CycleWorkspace = {
  workflow: VersionWorkflow
  context: VersionCycleContext
  busy: boolean
  notice: string | null
  /**
   * 无流程树的历史版本或计划引用的固定验收来源，均用只读材料视图；
   * 非 null 时 context.worktreeId 为 null，壳渲染只读材料视图，不建树。
   */
  readonlyBrowse: ReadonlyCycleBrowse | null
  /** Opens a native session with one editable draft; only the user submits it. */
  start(version?: string | null): Promise<boolean>
  configure(): Promise<void>
  prepareMetrics(): Promise<void>
}

/** The launch/configure surface the boards' first-row collaboration card consumes. */
export type CycleEntry = Pick<
  CycleWorkspace,
  'workflow' | 'busy' | 'notice' | 'start' | 'configure'
>

export const CycleWorkspaceContext = createContext<CycleWorkspace | null>(null)
export const useCycleWorkspace = () => useContext(CycleWorkspaceContext)
