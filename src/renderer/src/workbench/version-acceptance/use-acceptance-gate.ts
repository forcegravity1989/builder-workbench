import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  VersionHistoryPort,
  VersionTreePlan
} from '../../../../shared/workbench/version-history'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { ArchivePrPort, ArchivePrScope } from '../version-cycle/ports'

export type AcceptanceGateState =
  /** No version selected yet — nothing to check, the board asks for one. */
  { kind: 'idle' } | { kind: 'checking' } | { kind: 'merged' } | { kind: 'blocked'; reason: string }

function sameState(a: AcceptanceGateState, b: AcceptanceGateState): boolean {
  if (a.kind !== b.kind) {
    return false
  }
  return a.kind === 'blocked' && b.kind === 'blocked' ? a.reason === b.reason : true
}

/**
 * Empty-board hard gate: acceptance cannot start until this version's plan
 * archive PR is merged. The draft pre-acceptance channel is retired, so an
 * unmerged plan leaves the board empty with an honest reason.
 *
 * Unknown never passes: an unrecorded archive PR, an unreadable status and a
 * missing plan source all block. "Not found yet" is only treated as missing once
 * the catalog has actually finished loading, so a slow first read does not flash
 * a block. The gate governs *starting* — once acceptance material exists the
 * board renders it.
 *
 * Every input is reduced to a stable string key before entering a dependency
 * array: an inline scope object would give `check` a fresh identity each render
 * and spin this effect forever, leaving the gate stuck on `checking`.
 */
export function useAcceptanceGate({
  history,
  scope,
  archiveScope,
  archivePort,
  source,
  versionSelected,
  catalogLoaded,
  materialRefresh
}: {
  history: VersionHistoryPort
  /** History reads take the widened metric scope. */
  scope: MetricScope
  /** The archive port needs the branded host identity and runtime owner. */
  archiveScope: ArchivePrScope
  archivePort: ArchivePrPort
  source: VersionTreePlan | undefined
  versionSelected: boolean
  catalogLoaded: boolean
  materialRefresh: number | undefined
}) {
  const [state, setState] = useState<AcceptanceGateState>({ kind: 'idle' })
  const [retryToken, setRetryToken] = useState(0)
  const sequence = useRef(0)
  const scopeKey = JSON.stringify(scope)
  const archiveKey = JSON.stringify(archiveScope)
  const sourceKey = source ? JSON.stringify(source) : ''
  const parsedScope = useMemo(() => JSON.parse(scopeKey) as MetricScope, [scopeKey])
  const parsedArchive = useMemo(() => JSON.parse(archiveKey) as ArchivePrScope, [archiveKey])
  const parsedSource = useMemo(
    () => (sourceKey ? (JSON.parse(sourceKey) as VersionTreePlan) : undefined),
    [sourceKey]
  )
  /** Publish only on a real change — an equal object would re-render and re-run. */
  const publish = useCallback((next: AcceptanceGateState) => {
    setState((current) => (sameState(current, next) ? current : next))
  }, [])

  const check = useCallback(async () => {
    const token = ++sequence.current
    if (!versionSelected) {
      publish({ kind: 'idle' })
      return
    }
    if (!parsedSource) {
      // Still loading is not "missing"; only a settled catalog can block.
      publish(
        catalogLoaded
          ? {
              kind: 'blocked',
              reason: '未在验收分支上找到本版已提交的计划，无法核对归档状态。'
            }
          : { kind: 'checking' }
      )
      return
    }
    publish({ kind: 'checking' })
    try {
      const plan = await history.readPlan({
        scope: parsedScope,
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
        return
      }
      if (!archivePr) {
        publish({
          kind: 'blocked',
          reason: `未检测到 ${parsedSource.version} 计划的归档 PR 记录，无法开始验收。`
        })
        return
      }
      const status: ArchivePrStatusResult = await archivePort.readStatus(parsedArchive, archivePr)
      if (token !== sequence.current) {
        return
      }
      if (status.state === 'merged') {
        publish({ kind: 'merged' })
        return
      }
      publish({
        kind: 'blocked',
        reason:
          status.state === 'unknown'
            ? `读不到 ${parsedSource.version} 计划归档 PR #${archivePr.number} 的状态（${status.reason}），无法确认已合入。`
            : `未检测到本版计划的归档 PR 已合入（当前读回：#${archivePr.number} ${
                status.state === 'open' ? '待合入' : '已关闭'
              }）。`
      })
    } catch (reason) {
      if (token === sequence.current) {
        publish({
          kind: 'blocked',
          reason: reason instanceof Error ? reason.message : String(reason)
        })
      }
    }
  }, [
    versionSelected,
    parsedSource,
    catalogLoaded,
    history,
    parsedScope,
    parsedArchive,
    archivePort,
    publish
  ])

  useEffect(() => {
    void check()
  }, [check, materialRefresh, retryToken])

  return { state, recheck: check, retry: () => setRetryToken((value) => value + 1) }
}
