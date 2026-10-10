import { createContext, useContext } from 'react'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { VersionCycleContext } from './cycle-context'

export type CycleWorkspace = {
  workflow: VersionWorkflow
  context: VersionCycleContext
  busy: boolean
  notice: string | null
  /** Runs the registered native automation; `oneShot` rides with the saved prompt, once. */
  start(oneShot?: string): Promise<void>
  configure(): Promise<void>
  /** Opens the AI composer session; the user's one-line request rides once. */
  compose(request: string): Promise<void>
  prepareMetrics(): Promise<void>
}

/** The launch/configure surface the boards' first-row collaboration card consumes. */
export type CycleEntry = Pick<
  CycleWorkspace,
  'workflow' | 'busy' | 'notice' | 'start' | 'configure' | 'compose'
>

export const CycleWorkspaceContext = createContext<CycleWorkspace | null>(null)
export const useCycleWorkspace = () => useContext(CycleWorkspaceContext)
