import { useCallback, useEffect, useRef } from 'react'
import type {
  CycleScope,
  CycleTaskReference,
  CycleTaskSnapshot,
  TaskPort
} from '../version-cycle/ports'
import { nativeTaskPort } from '../native-task-port'
import { useCycleTaskReads } from '../version-cycle/use-cycle-task-reads'
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
  const ready = Boolean(scope && worktreeId && taskPort && enabled && references)
  const { reads, error, refresh } = useCycleTaskReads({
    scope: ready ? scope : null,
    tasks: ready ? (references ?? undefined) : undefined,
    taskPort: taskPort ?? nativeTaskPort()
  })
  const previousRefresh = useRef(refreshToken)
  useEffect(() => {
    const changed = previousRefresh.current !== refreshToken
    previousRefresh.current = refreshToken
    if (changed && ready) {
      void refresh()
    }
  }, [refreshToken, ready, refresh])
  const retry = useCallback(() => {
    void refresh()
  }, [refresh])
  if (!ready) {
    return { state: { kind: 'idle' }, retry }
  }
  if (!reads) {
    return { state: { kind: 'loading' }, retry }
  }
  const failed = reads.filter((read) => issueReadState(read) === 'unknown').length
  if (error || (reads.length > 0 && failed === reads.length)) {
    const first = reads[0]
    return {
      state: {
        kind: 'error',
        reason: error ?? (first?.kind === 'unavailable' ? first.error : '读回失败')
      },
      retry
    }
  }
  return {
    state: {
      kind: 'ready',
      open: reads
        .filter((read) => issueReadState(read) === 'open')
        .flatMap((read) => (read.kind === 'ready' ? [read.task] : [])),
      failedCount: failed,
      readCount: reads.length
    },
    retry
  }
}
