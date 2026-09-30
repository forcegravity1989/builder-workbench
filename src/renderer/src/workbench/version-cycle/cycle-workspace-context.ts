import { createContext, useContext } from 'react'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { VersionCycleContext } from './cycle-context'

export type CycleWorkspace = {
  workflow: VersionWorkflow
  context: VersionCycleContext
  busy: boolean
  notice: string | null
  /** Opens a native session on the fixed worktree and leaves the prompt in the composer. */
  start(oneShot?: string): Promise<void>
  prepareMetrics(): Promise<void>
}

/** The launch surface the boards' first-row collaboration card consumes. */
export type CycleEntry = Pick<CycleWorkspace, 'workflow' | 'busy' | 'notice' | 'start'>

export const CycleWorkspaceContext = createContext<CycleWorkspace | null>(null)
export const useCycleWorkspace = () => useContext(CycleWorkspaceContext)
