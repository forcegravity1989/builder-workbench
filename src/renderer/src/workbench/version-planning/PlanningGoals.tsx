import { useEffect, useState, type Ref } from 'react'
import { Plus, Presentation } from 'lucide-react'
import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'
import type { CycleScope, CycleTaskRead, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
import { PlanGoalMetrics } from './PlanGoalMetrics'
import type { usePlanMetrics } from './use-plan-metrics'

const ISSUE_GROUPS = [
  { key: 'bug', label: 'Bug 类' },
  { key: 'feature', label: 'Feature 类' },
  { key: 'unclassified', label: '未分类' }
] as const

function issueClass(labels: string[] | undefined): (typeof ISSUE_GROUPS)[number]['key'] {
  if (labels?.some((label) => /^(bug|缺陷)/i.test(label))) {
    return 'bug'
  }
  if (labels?.some((label) => /^(feature|功能)/i.test(label))) {
    return 'feature'
  }
  return 'unclassified'
}

function issueKey(reference: PlanningMaterial['tasks'][number]) {
  return `${reference.provider}:${reference.repository}:${reference.number}`
}

function PlanIssueGroups({
  goal,
  plan,
  reads,
  onTask
}: {
  goal: VersionGoal
  plan: PlanningMaterial
  reads: CycleTaskRead[] | null
  onTask(task: CycleTaskSnapshot): Promise<void>
}) {
  const related = plan.tasks.filter((task) => task.goalId === goal.goalId)
  if (!related.length) {
    return null
  }
  const byReference = new Map((reads ?? []).map((item) => [issueKey(item.reference), item]))
  return (
    <section className="vp-issue-blocks" aria-label={`${goal.title} 关联 Issue`}>
      {ISSUE_GROUPS.map((group) => {
        const items = related.filter((reference) => {
          const read = byReference.get(issueKey(reference))
          return read?.kind === 'ready'
            ? issueClass(read.task.labels) === group.key
            : group.key === 'unclassified'
        })
        if (!items.length) {
          return null
        }
        return (
          <details className="vp-issue-group" key={group.key} open>
            <summary>
              {group.label} · {items.length}
            </summary>
            {items.map((reference) => {
              const read = byReference.get(issueKey(reference))
              return (
                <div className="vp-issue-row" key={issueKey(reference)}>
                  {read?.kind === 'ready' ? (
                    <button
                      type="button"
                      className="vp-issue-link"
                      onClick={() => void onTask(read.task)}
                    >
                      #{read.task.iid} {read.task.title}
                    </button>
                  ) : (
                    <span>#{reference.number} · 状态未知</span>
                  )}
                  <span className="vp-muted">
                    {read?.kind === 'ready' ? read.task.state : (read?.error ?? '未读取')}
                  </span>
                </div>
              )
            })}
          </details>
        )
      })}
    </section>
  )
}

export function PlanningGoals({
  plan,
  disabled,
  edit,
  metrics,
  prepare,
  sectionRef,
  onMinutes,
  scope,
  taskPort,
  onTask
}: {
  plan?: PlanningMaterial
  disabled: boolean
  edit(plan: PlanningMaterial): void
  metrics: ReturnType<typeof usePlanMetrics>
  prepare(): void
  sectionRef: Ref<HTMLElement>
  onMinutes(): void
  scope: CycleScope | null
  taskPort: TaskPort
  onTask(task: CycleTaskSnapshot): Promise<void>
}) {
  const [reads, setReads] = useState<CycleTaskRead[] | null>(null)
  const referenceKey = JSON.stringify(plan?.tasks ?? [])
  useEffect(() => {
    if (!scope || !plan?.tasks.length) {
      setReads(plan?.tasks.length ? null : [])
      return
    }
    let active = true
    setReads(null)
    void taskPort.listVersion(scope, plan.tasks).then(
      (items) => {
        if (active) {
          setReads(items)
        }
      },
      () => {
        if (active) {
          setReads(
            plan.tasks.map((reference) => ({
              reference,
              kind: 'unavailable' as const,
              error: '任务状态读取失败',
              readAt: new Date().toISOString()
            }))
          )
        }
      }
    )
    return () => {
      active = false
    }
  }, [plan?.tasks, referenceKey, scope, taskPort])

  const changeGoal = (goal: VersionGoal) => {
    if (plan) {
      edit({
        ...plan,
        goals: plan.goals.map((item) => (item.goalId === goal.goalId ? goal : item))
      })
    }
  }
  return (
    <section ref={sectionRef}>
      <div className="vp-section-heading">
        <h2>当前版本目标</h2>
        <span className="vp-muted">Top 3</span>
        <button className="wb-btn wb-btn-sm" disabled={!plan} onClick={onMinutes}>
          <Presentation size={14} />
          预览纪要
        </button>
      </div>
      <fieldset disabled={disabled} className="vp-goals">
        {(plan?.goals.length ?? 0) === 0 && (
          <p className="vp-empty-goals vp-muted">
            {plan
              ? '从一条清楚的结果目标开始。'
              : '选择已有版本，或在左侧“新建计划”中明确本版目标。'}
          </p>
        )}
        {plan?.goals.map((goal, index) => {
          const issueCount = plan.tasks.filter((task) => task.goalId === goal.goalId).length
          return (
            <VersionGoalCard
              key={goal.goalId}
              goal={goal}
              index={index}
              onChange={changeGoal}
              summary={
                issueCount > 0 ? (
                  <span className="vp-goal-issues">Issue {issueCount}</span>
                ) : undefined
              }
              extra={<PlanIssueGroups goal={goal} plan={plan} reads={reads} onTask={onTask} />}
              metrics={
                <PlanGoalMetrics
                  goal={goal}
                  onChange={changeGoal}
                  metrics={metrics}
                  prepare={prepare}
                />
              }
            />
          )
        })}
        {plan && (
          <div className="vp-add-goal">
            <button
              className="wb-btn wb-btn-sm"
              onClick={() =>
                edit({
                  ...plan,
                  goals: [
                    ...plan.goals,
                    { goalId: crypto.randomUUID(), title: '', metricTargets: [] }
                  ]
                })
              }
            >
              <Plus size={14} />
              添加目标
            </button>
          </div>
        )}
      </fieldset>
    </section>
  )
}
