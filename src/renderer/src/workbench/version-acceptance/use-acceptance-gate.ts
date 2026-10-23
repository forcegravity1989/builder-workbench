import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  VersionHistoryPort,
  VersionTreePlan
} from '../../../../shared/workbench/version-history'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { ArchivePrPort, ArchivePrScope } from '../version-cycle/ports'

export type AcceptanceGateState =
  /** Nothing checked yet — no version selected, or the start click has not run. */
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
 * The check is click-driven — it runs when the start entry asks for a verdict
 * (and after 「更新代码」, whose refresh re-checks because a trunk sync may have
 * merged the PR), never on entering the screen. `check` returns the verdict it
 * published so the entry can chain straight into initialization; `undefined`
 * means a newer call superseded this one. Unknown never passes: an unrecorded
 * archive PR, an unreadable status and a missing plan source all block.
 *
 * Every input is reduced to a stable string key before entering a dependency
 * array, so `check` keeps a stable identity and the reset effect below cannot
 * loop.
 */
export function useAcceptanceGate({
  history,
  scope,
  archiveScope,
  archivePort,
  source,
  versionSelected,
  catalogLoaded
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
}) {
  const [state, setState] = useState<AcceptanceGateState>({ kind: 'idle' })
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

  const check = useCallback(async (): Promise<AcceptanceGateState | undefined> => {
    const token = ++sequence.current
    if (!versionSelected) {
      const next: AcceptanceGateState = { kind: 'idle' }
      publish(next)
      return next
    }
    if (!parsedSource) {
      // Still loading is not "missing"; only a settled catalog can say the plan
      // is absent, and until then the honest verdict is "try again shortly".
      const next: AcceptanceGateState = catalogLoaded
        ? {
            kind: 'blocked',
            reason: '未在验收分支上找到本版已提交的计划，无法核对归档状态。'
          }
        : { kind: 'blocked', reason: '版本目录仍在读取，请稍后重新核对。' }
      publish(next)
      return next
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
        return undefined
      }
      if (!archivePr) {
        const next: AcceptanceGateState = {
          kind: 'blocked',
          reason: `未检测到 ${parsedSource.version} 计划的归档 PR 记录，无法开始验收。`
        }
        publish(next)
        return next
      }
      const status: ArchivePrStatusResult = await archivePort.readStatus(parsedArchive, archivePr)
      if (token !== sequence.current) {
        return undefined
      }
      const next: AcceptanceGateState =
        status.state === 'merged'
          ? { kind: 'merged' }
          : {
              kind: 'blocked',
              reason:
                status.state === 'unknown'
                  ? `读不到 ${parsedSource.version} 计划归档 PR #${archivePr.number} 的状态（${status.reason}），无法确认已合入。`
                  : `未检测到本版计划的归档 PR 已合入（当前读回：#${archivePr.number} ${
                      status.state === 'open' ? '待合入' : '已关闭'
                    }）。`
            }
      publish(next)
      return next
    } catch (reason) {
      if (token !== sequence.current) {
        return undefined
      }
      const next: AcceptanceGateState = {
        kind: 'blocked',
        reason: reason instanceof Error ? reason.message : String(reason)
      }
      publish(next)
      return next
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

  // A verdict belongs to one version's plan source. Switching versions — or the
  // catalog producing a different source — leaves it stale, so clear it until
  // the next click-driven check instead of showing another version's verdict.
  useEffect(() => {
    publish({ kind: 'idle' })
  }, [versionSelected, sourceKey, publish])

  return { state, recheck: check }
}
