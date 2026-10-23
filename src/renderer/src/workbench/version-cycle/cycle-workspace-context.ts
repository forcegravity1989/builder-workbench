import { createContext, useContext } from 'react'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { VersionCycleContext } from './cycle-context'

export type CycleWorkspace = {
  workflow: VersionWorkflow
  context: VersionCycleContext
  busy: boolean
  notice: string | null
  /**
   * G2（P3b）：无绑定树且无旧固定树的浏览版本 → 只读回看（主干已提交材料）；
   * 非 null 时 context.worktreeId 为 null，壳渲染只读材料视图，不建树。
   */
  readonlyBrowse: { version: string } | null
  /** Runs the registered native automation; `oneShot` rides with the saved prompt, once. */
  start(oneShot?: string): Promise<void>
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
