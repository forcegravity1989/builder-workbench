import type { PackagePipelinePort } from '../../../../shared/workbench/package-pipeline'
import type { VersionHistoryPort } from '../../../../shared/workbench/version-history'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { AcceptanceBoardContent } from './AcceptanceBoardContent'

export type AcceptanceBoardProps = {
  context: VersionCycleContext
  history: VersionHistoryPort
  packages: PackagePipelinePort
  entry: CycleEntry
}

export function AcceptanceBoard(props: AcceptanceBoardProps) {
  const { context } = props
  if (!context.scope || !context.worktreeId || !context.materialPort) {
    return (
      <div className="acc-empty-screen">
        <h1>版本验收</h1>
        <p>打开验收工作区，再明确版本与计划来源。</p>
        {context.error && <p role="alert">{context.error}</p>}
      </div>
    )
  }
  const identity = JSON.stringify([
    context.scope.projectId,
    context.scope.repoId,
    context.scope.hostId,
    context.scope.runtimeOwnerEnvironmentId,
    context.worktreeId,
    context.worktreeInstanceId,
    context.version
  ])
  return (
    <AcceptanceBoardContent
      key={identity}
      {...props}
      recoveryKey={`bw:acceptance:draft:${identity}`}
    />
  )
}
