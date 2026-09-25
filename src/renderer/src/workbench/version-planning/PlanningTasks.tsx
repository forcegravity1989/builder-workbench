import { useEffect, useMemo, useState, type Ref } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { CycleScope, CycleTaskRead, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
import { cycleScopeKey } from '../version-cycle/native-cycle-workspace'

export function PlanningTasks({
  scope,
  plan,
  taskPort,
  sectionRef,
  open,
  onOpen,
  goalFilter,
  onFilter,
  onTask
}: {
  scope: CycleScope | null
  plan: PlanningMaterial
  taskPort: TaskPort
  sectionRef: Ref<HTMLElement>
  open: boolean
  onOpen(value: boolean): void
  goalFilter: string
  onFilter(value: string): void
  onTask(task: CycleTaskSnapshot): Promise<void>
}) {
  const [refresh, setRefresh] = useState(0)
  const referenceKey = JSON.stringify(plan.tasks)
  const references = useMemo(
    () => JSON.parse(referenceKey) as PlanningMaterial['tasks'],
    [referenceKey]
  )
  const key = JSON.stringify([
    scope && cycleScopeKey(scope),
    plan.version,
    plan.cycleId,
    referenceKey,
    refresh
  ])
  const [result, setResult] = useState<{
    key: string
    items: CycleTaskRead[]
    error?: string
  } | null>(null)
  useEffect(() => {
    let active = true
    if (scope) {
      void taskPort[refresh ? 'refresh' : 'listVersion'](scope, references).then(
        (items) => {
          if (active) {
            setResult({ key, items })
          }
        },
        (reason) => {
          if (active) {
            setResult({ key, items: [], error: String(reason) })
          }
        }
      )
    }
    return () => {
      active = false
    }
  }, [scope, references, taskPort, refresh, key])
  const current = result?.key === key ? result : null
  return (
    <section ref={sectionRef} className="vp-tasks">
      <button className="vp-task-summary" onClick={() => onOpen(!open)}>
        {open ? '▾' : '▸'} 版本任务 <strong>{plan.tasks.length}</strong>
        <span className="vp-muted">展开核对真实状态</span>
      </button>
      {open && (
        <>
          <div className="vp-inline">
            <select
              aria-label="按目标筛选任务"
              value={goalFilter}
              onChange={(event) => onFilter(event.target.value)}
            >
              <option value="">所有目标</option>
              {plan.goals.map((goal, index) => (
                <option value={goal.goalId} key={goal.goalId}>
                  G{index + 1} {goal.title}
                </option>
              ))}
            </select>
            <button
              className="wb-btn wb-btn-ghost wb-btn-sm"
              onClick={() => setRefresh((value) => value + 1)}
            >
              刷新任务
            </button>
          </div>
          {!current && <p className="vp-muted">正在读取任务状态…</p>}
          {current?.error && <p role="status">任务状态未知：{current.error}</p>}
          {current?.items
            .filter((item) => !goalFilter || item.reference.goalId === goalFilter)
            .map((item) => (
              <div
                className="vp-task"
                key={`${item.reference.provider}:${item.reference.repository}:${item.reference.number}`}
              >
                {item.kind === 'ready' ? (
                  <>
                    <button onClick={() => void onTask(item.task)}>
                      #{item.task.iid} {item.task.title}
                    </button>
                    <span>{item.task.state}</span>
                    <small>读取于 {item.task.readAt}</small>
                  </>
                ) : (
                  <span>
                    #{item.reference.number} · 状态未知：{item.error}
                  </span>
                )}
              </div>
            ))}
          {!plan.tasks.length && (
            <p className="vp-muted">尚未关联任务；可在会话中核对已有工作并拆解。</p>
          )}
        </>
      )}
    </section>
  )
}
