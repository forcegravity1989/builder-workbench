import { useMemo } from 'react'
import { VersionCycleShell, type VersionCycleContext } from '../version-cycle/VersionCycleShell'
import { nativeMetricsPort } from '../metrics-port'
import { nativeVersionHistoryPort } from '../version-history-port'
import { nativeAcceptanceCandidatePort } from './acceptance-candidate-port'
import { AcceptanceBoard } from './AcceptanceBoard'

function ConnectedAcceptanceBoard({ context }: { context: VersionCycleContext }) {
  const owner = context.scope?.runtimeOwnerEnvironmentId
  const metrics = useMemo(() => nativeMetricsPort(owner), [owner])
  const history = useMemo(() => nativeVersionHistoryPort(owner), [owner])
  const candidate = useMemo(
    () =>
      context.scope && context.worktreeId
        ? nativeAcceptanceCandidatePort({ ...context.scope, worktreeId: context.worktreeId })
        : null,
    [context.scope, context.worktreeId]
  )
  if (!candidate) {
    return (
      <div className="va-empty">
        <h1>版本验收</h1>
        <p>选择或新建本次原生验收会话，定位独立验收工作区。</p>
        {context.error && <p role="alert">{context.error}</p>}
      </div>
    )
  }
  return (
    <AcceptanceBoard context={context} history={history} metrics={metrics} candidate={candidate} />
  )
}

export function AcceptancePage() {
  return (
    <VersionCycleShell workflow="acceptance">
      {(context) => <ConnectedAcceptanceBoard context={context} />}
    </VersionCycleShell>
  )
}
