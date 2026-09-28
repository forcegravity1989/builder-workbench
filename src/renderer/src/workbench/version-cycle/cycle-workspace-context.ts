import { createContext, useContext } from 'react'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { VersionCycleContext } from './cycle-context'

export type CycleWorkspace = {
  workflow: VersionWorkflow
  context: VersionCycleContext
  busy: boolean
  notice: string | null
  start(): Promise<void>
  configure(): Promise<void>
  prepareMetrics(): Promise<void>
}

export const CycleWorkspaceContext = createContext<CycleWorkspace | null>(null)
export const useCycleWorkspace = () => useContext(CycleWorkspaceContext)
