import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CycleScope,
  CycleTaskReference,
  CycleTaskSnapshot,
  TaskPort
} from '../version-cycle/ports'
import { issueReadState } from '../version-acceptance/acceptance-issue-annotations'

export type PriorLiveOpenState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ready'
      open: CycleTaskSnapshot[]
      failedCount: number
      /** How many references were actually read back; 0 means empty snapshot. */
      readCount: number
    }
  | { kind: 'error'; reason: string }

/**
 * Live open-state readback for the prior-version row (2026-10-22 真机反馈轮).
 * Only used when the frozen acceptance recorded no Issue marks at all: it states
 * the current open facts of the frozen snapshot's references through the same
 * native task-read layer the board uses — never a human-confirmed carryover
 * conclusion. Async and non-blocking; partial failures surface as a count,
 * total failure as error + retry. Absent references read as empty.
 */
export function usePriorLiveOpen(
  scope: CycleScope | null,
  worktreeId: string | null,
  taskPort: TaskPort | undefined,
  references: CycleTaskReference[] | null,
  enabled: boolean,
  refreshToken?: number
): { state: PriorLiveOpenState; retry(): void } {
  const key = useMemo(
    () =>
      JSON.stringify([
        scope
          ? {
              repoId: scope.repoId,
              hostId: scope.hostId,
              runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
            }
          : null,
        worktreeId,
        enabled ? references?.map((ref) => [ref.provider, ref.repository, ref.number]) : null
      ]),
    [scope, worktreeId, references, enabled]
  )
  const identity = useMemo(
    () =>
      JSON.parse(key) as [
        { repoId: string; hostId: string; runtimeOwnerEnvironmentId?: string } | null,
        string | null,
        [string, string, number][] | null
      ],
    [key]
  )
  const request = useRef(0)
  // Why: the serialized identity key drops goalId; the refresh call must use
  // the original reference objects so native detail origins stay complete.
  const referencesRef = useRef(references)
  referencesRef.current = references
  const [retryToken, setRetryToken] = useState(0)
  const [state, setState] = useState<{ key: string; value: PriorLiveOpenState }>({
    key,
    value: { kind: 'idle' }
  })
  useEffect(() => {
    const [, treeId, refsPart] = identity
    if (!scope || !treeId || !taskPort || !enabled || !refsPart) {
      request.current++
      setState({ key, value: { kind: 'idle' } })
      return
    }
    if (refsPart.length === 0) {
      request.current++
      setState({ key, value: { kind: 'ready', open: [], failedCount: 0, readCount: 0 } })
      return
    }
    const token = ++request.current
    setState({ key, value: { kind: 'loading' } })
    const refs = referencesRef.current ?? []
    void taskPort.refresh(scope, refs).then(
      (reads) => {
        if (request.current !== token) {
          return
        }
        const failed = reads.filter((read) => issueReadState(read) === 'unknown').length
        if (failed === reads.length) {
          const first = reads[0]
          setState({
            key,
            value: {
              kind: 'error',
              reason: first && first.kind === 'unavailable' ? first.error : '读回失败'
            }
          })
          return
        }
        setState({
          key,
          value: {
            kind: 'ready',
            open: reads
              .filter((read) => issueReadState(read) === 'open')
              .map((read) => (read.kind === 'ready' ? read.task : null))
              .filter((task): task is CycleTaskSnapshot => task !== null),
            failedCount: failed,
            readCount: reads.length
          }
        })
      },
      (reason: unknown) => {
        if (request.current === token) {
          setState({
            key,
            value: {
              kind: 'error',
              reason: reason instanceof Error ? reason.message : String(reason)
            }
          })
        }
      }
    )
  }, [key, identity, taskPort, enabled, scope, refreshToken, retryToken])
  const retry = useCallback(() => setRetryToken((token) => token + 1), [])
  return { state: state.key === key ? state.value : { kind: 'loading' }, retry }
}
