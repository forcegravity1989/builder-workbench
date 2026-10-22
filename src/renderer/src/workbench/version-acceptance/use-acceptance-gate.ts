import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VersionHistoryPort, VersionTreePlan } from '../../../../shared/workbench/version-history'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { ArchivePrPort, ArchivePrScope } from '../version-cycle/ports'

export type AcceptanceGateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'merged' }
  | { kind: 'blocked'; reason: string }

/**
 * Empty-board hard gate: acceptance cannot start until this version's plan
 * archive PR is merged. The draft pre-acceptance channel is retired, so an
 * unmerged (or unrecorded, or unreadable) plan leaves the board empty with an
 * honest reason instead of opening a partial acceptance.
 *
 * Unreadable stays unknown and therefore blocked — a missing status never
 * impersonates a merged plan. The gate governs *starting*: once acceptance
 * material exists the board renders it, and re-checking stays a notice rather
 * than a lockout.
 */
export function useAcceptanceGate({
  history,
  scope,
  archiveScope,
  archivePort,
  source,
  materialRefresh
}: {
  history: VersionHistoryPort
  /** History reads take the widened metric scope. */
  scope: MetricScope
  /** The archive port needs the branded host identity and runtime owner. */
  archiveScope: ArchivePrScope
  archivePort: ArchivePrPort
  source: VersionTreePlan | undefined
  materialRefresh: number | undefined
}) {
  const [state, setState] = useState<AcceptanceGateState>({ kind: 'idle' })
  const [retryToken, setRetryToken] = useState(0)
  const sequence = useRef(0)
  const planKey = source ? JSON.stringify(source) : ''
  const parsedSource = useMemo(
    () => (planKey ? (JSON.parse(planKey) as VersionTreePlan) : undefined),
    [planKey]
  )

  const check = useCallback(async () => {
    const token = ++sequence.current
    if (!parsedSource) {
      setState({ kind: 'idle' })
      return null
    }
    setState({ kind: 'checking' })
    try {
      const plan = await history.readPlan({
        scope,
        planRef: {
          kind: 'committed',
          version: parsedSource.version,
          cycleId: parsedSource.cycleId,
          sourceCommit: parsedSource.sourceCommit,
          revision: parsedSource.revision
        }
      })
      const archivePr = plan.document.workflow?.archivePr
      if (token !== sequence.current) {
        return null
      }
      if (!archivePr) {
        setState({
          kind: 'blocked',
          reason: `未检测到 ${parsedSource.version} 计划的归档 PR 记录，无法开始验收。`
        })
        return null
      }
      const status: ArchivePrStatusResult = await archivePort.readStatus(archiveScope, archivePr)
      if (token !== sequence.current) {
        return null
      }
      if (status.state === 'merged') {
        setState({ kind: 'merged' })
        return { archivePr, status }
      }
      setState({
        kind: 'blocked',
        reason:
          status.state === 'unknown'
            ? `读不到 ${parsedSource.version} 计划归档 PR #${archivePr.number} 的状态（${status.reason}），无法确认已合入。`
            : `未检测到本版计划的归档 PR 已合入（当前读回：#${archivePr.number} ${
                status.state === 'open' ? '待合入' : '已关闭'
              }）。`
      })
      return null
    } catch (reason) {
      if (token === sequence.current) {
        setState({
          kind: 'blocked',
          reason: reason instanceof Error ? reason.message : String(reason)
        })
      }
      return null
    }
  }, [parsedSource, history, scope, archiveScope, archivePort])

  useEffect(() => {
    void check()
  }, [check, materialRefresh, retryToken])

  return { state, recheck: check, retry: () => setRetryToken((value) => value + 1) }
}
