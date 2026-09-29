import { useEffect, useRef, useState, type Ref } from 'react'
import type {
  PlanningMaterial,
  VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import type { CycleTaskRead, TaskOrigin, TaskPort } from '../version-cycle/ports'
import { taskReferenceKey } from './acceptance-task-evidence'

/** One derivation for the list and the board header: counts come only from real reads;
 * unread or failed items never collapse into a completion-style 0/0 fraction. */
export function taskSnapshotFacts(snapshot: VersionTaskSnapshot[], referenced: number) {
  const states = new Map<string, number>()
  let readAt: string | null = null
  for (const item of snapshot) {
    const state = item.kind === 'ready' ? item.state : '读取失败'
    states.set(state, (states.get(state) ?? 0) + 1)
    if (readAt === null || item.readAt > readAt) {
      readAt = item.readAt
    }
  }
  return { states, unread: Math.max(0, referenced - snapshot.length), readAt }
}

export function taskSnapshotSummary(snapshot: VersionTaskSnapshot[], referenced: number): string {
  const facts = taskSnapshotFacts(snapshot, referenced)
  const parts = [...facts.states].map(([state, count]) => `${state} ${count}`)
  if (facts.unread > 0) {
    parts.push(`待读取 ${facts.unread}`)
  }
  if (facts.readAt) {
    parts.push(`快照 ${facts.readAt}`)
  }
  return `Issue ${parts.length > 0 ? parts.join(' · ') : `待读取 ${referenced} 项`}`
}

export function AcceptanceTasks({
  plan,
  port,
  origin,
  snapshot,
  disabled,
  getScrollTop,
  onSnapshot,
  ref
}: {
  plan: PlanningMaterial
  port: TaskPort
  origin: TaskOrigin
  snapshot?: VersionTaskSnapshot[]
  disabled: boolean
  getScrollTop(): number
  onSnapshot(tasks: CycleTaskRead[]): void
  ref?: Ref<HTMLDetailsElement>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sourceKey = JSON.stringify([
    plan,
    origin.repoId,
    origin.hostId,
    origin.runtimeOwnerEnvironmentId,
    origin.worktreeId,
    origin.version,
    origin.cycleId,
    origin.sessionId,
    disabled
  ])
  const latestKey = useRef(sourceKey)
  latestKey.current = sourceKey
  const request = useRef({ sequence: 0 }).current
  useEffect(() => {
    setBusy(false)
    setError(null)
    return () => {
      request.sequence++
    }
  }, [sourceKey, port, request])
  const tasks: CycleTaskRead[] | null =
    snapshot?.map((item) =>
      item.kind === 'ready' ? { kind: 'ready', reference: item.reference, task: item } : item
    ) ?? null
  const facts = taskSnapshotFacts(snapshot ?? [], plan.tasks.length)
  async function refresh() {
    if (disabled) {
      return
    }
    const token = ++request.sequence
    const current = () => request.sequence === token && latestKey.current === sourceKey
    setBusy(true)
    try {
      const reads = await port.refresh(origin, plan.tasks)
      if (!current()) {
        return
      }
      onSnapshot(reads)
      setError(null)
    } catch (reason) {
      if (current()) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (current()) {
        setBusy(false)
      }
    }
  }
  return (
    <details className="va-tasks" id="acceptance-tasks" ref={ref}>
      <summary>
        Issue 状态核对 · {plan.tasks.length} 项引用
        {[...facts.states].map(([state, count]) => ` · ${state} ${count}`)}
        {facts.unread > 0 && ` · 待读取 ${facts.unread}`}
      </summary>
      <button
        className="wb-btn wb-btn-ghost wb-btn-sm"
        disabled={disabled || busy}
        onClick={() => void refresh()}
      >
        {busy ? '读取中…' : '刷新真实状态'}
      </button>
      {!plan.tasks.length && (
        <p className="va-muted">固定计划未引用 Issue；不由此推断目标已达成。</p>
      )}
      {tasks?.map((item) => (
        <div
          className="va-task"
          key={`${taskReferenceKey(item.reference)}:${item.reference.goalId ?? ''}`}
        >
          <span>
            {item.reference.provider} · {item.reference.repository} #{item.reference.number}
          </span>
          {item.kind === 'ready' ? (
            <>
              <button
                className="va-task-title"
                onClick={() =>
                  void port
                    .openDetail(item.task, {
                      ...origin,
                      scrollTop: getScrollTop(),
                      goalId: plan.tasks.find(
                        (reference) =>
                          taskReferenceKey(reference) === taskReferenceKey(item.reference)
                      )?.goalId
                    })
                    .catch((reason) => setError(String(reason)))
                }
              >
                {item.task.title}
              </button>
              <span>{item.task.state}</span>
              <time>{item.task.readAt}</time>
            </>
          ) : (
            <>
              <span className="va-warning">读取失败：{item.error}</span>
              <time>{item.readAt}</time>
            </>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="va-error">
          {error}；已有快照保留，不显示为零项。
        </p>
      )}
    </details>
  )
}
