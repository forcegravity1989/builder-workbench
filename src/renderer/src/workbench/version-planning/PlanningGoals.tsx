import { useEffect, useState, type Ref } from 'react'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  MessageSquarePlus,
  Plus,
  Presentation,
  RefreshCw,
  Trash2
} from 'lucide-react'
import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'
import { goalCardViewKey } from '../cycle-view-state'
import type { CycleScope, CycleTaskRead, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
import { PlanGoalMetrics } from './PlanGoalMetrics'
import type { usePlanMetrics } from './use-plan-metrics'

const ISSUE_GROUPS = [
  { key: 'bug', label: 'Bug 类' },
  { key: 'feature', label: 'Feature 类' },
  { key: 'unclassified', label: '未分类' }
] as const

function issueClass(labels: string[] | undefined): (typeof ISSUE_GROUPS)[number]['key'] {
  const normalized = labels?.map((label) => label.trim()).filter(Boolean) ?? []
  if (normalized.some((label) => /^(bug|缺陷)/i.test(label))) {
    return 'bug'
  }
  if (normalized.length) {
    return 'feature'
  }
  return 'unclassified'
}

function issueKey(reference: PlanningMaterial['tasks'][number]) {
  return `${reference.provider}:${reference.repository}:${reference.number}`
}

function readableTaskState(state: string): string {
  switch (state.trim().toLowerCase()) {
    case 'open':
    case 'opened':
      return '开放'
    case 'in_progress':
    case 'in-progress':
      return '进行中'
    case 'closed':
    case 'merged':
      return '已关闭'
    case 'unknown':
      return 'Unknown'
    default:
      return state.trim() || 'Unknown'
  }
}

function PlanIssueGroups({
  goal,
  plan,
  reads,
  onTask,
  onPrepare
}: {
  goal: VersionGoal
  plan: PlanningMaterial
  reads: CycleTaskRead[] | null
  onTask(task: CycleTaskSnapshot): Promise<void>
  onPrepare(): Promise<void>
}) {
  const related = plan.tasks.filter((task) => task.goalId === goal.goalId)
  const byReference = new Map((reads ?? []).map((item) => [issueKey(item.reference), item]))
  return (
    <details className="vp-issue-blocks" aria-label={`${goal.title} 关联 Issue`}>
      <summary className="vp-issue-blocks-summary">关联 Issue · {related.length}</summary>
      <div className="vp-issue-blocks-head">
        <span className="vp-label">关联 Issue</span>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm"
          title="在当前计划会话中逐条拆解关联 Issue"
          onClick={() => void onPrepare()}
        >
          <MessageSquarePlus size={14} aria-hidden="true" />
          在会话中拆解
        </button>
      </div>
      {!related.length && <p className="vp-muted">该目标暂无关联 Issue；在会话中拆解并关联。</p>}
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
          <details className="vp-issue-group" key={group.key}>
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
                    {read?.kind === 'ready'
                      ? `${readableTaskState(read.task.state)}${read.task.assignee ? ` · ${read.task.assignee}` : ''}`
                      : (read?.error ?? '未读取')}
                  </span>
                </div>
              )
            })}
          </details>
        )
      })}
    </details>
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
  onTask,
  onPrepareIssues
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
  onPrepareIssues(goal: VersionGoal): Promise<void>
}) {
  const [reads, setReads] = useState<CycleTaskRead[] | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [expandedSignal, setExpandedSignal] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const referenceKey = JSON.stringify(plan?.tasks ?? [])
  useEffect(() => {
    if (!scope || !plan?.tasks.length) {
      setReads(plan?.tasks.length ? null : [])
      setReadError(null)
      return
    }
    let active = true
    setReads(null)
    void taskPort.listVersion(scope, plan.tasks).then(
      (items) => {
        if (active) {
          setReads(items)
          setReadError(null)
        }
      },
      (reason) => {
        if (active) {
          setReadError(reason instanceof Error ? reason.message : String(reason))
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

  const refreshIssues = async () => {
    if (!scope || !plan?.tasks.length || refreshing) {
      return
    }
    setRefreshing(true)
    setReadError(null)
    try {
      setReads(await taskPort.refresh(scope, plan.tasks))
    } catch (reason) {
      setReadError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRefreshing(false)
    }
  }

  const changeGoal = (goal: VersionGoal) => {
    if (plan) {
      edit({
        ...plan,
        goals: plan.goals.map((item) => (item.goalId === goal.goalId ? goal : item))
      })
    }
  }
  const removeGoal = (goalId: string) => {
    if (!plan) {
      return
    }
    edit({
      ...plan,
      goals: plan.goals.filter((goal) => goal.goalId !== goalId),
      tasks: plan.tasks.map((task) =>
        task.goalId === goalId ? { ...task, goalId: undefined } : task
      )
    })
  }
  return (
    <section ref={sectionRef}>
      <div className="vp-section-heading">
        <h2>当前版本 Top 3 目标</h2>
        {readError && (
          <span className="vp-muted" role="status">
            Issue 状态未知：{readError}
          </span>
        )}
        <div className="vp-section-actions" aria-label="目标操作">
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm vp-icon-btn"
            title="全部展开"
            aria-label="全部展开"
            onClick={() => {
              setExpanded(true)
              setExpandedSignal((value) => value + 1)
            }}
          >
            <ChevronsDownUp size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm vp-icon-btn"
            title="全部收起"
            aria-label="全部收起"
            onClick={() => {
              setExpanded(false)
              setExpandedSignal((value) => value + 1)
            }}
          >
            <ChevronsUpDown size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm vp-icon-btn"
            title={refreshing ? '正在刷新 Issue' : '刷新 Issue'}
            aria-label={refreshing ? '正在刷新 Issue' : '刷新 Issue'}
            disabled={disabled || !scope || !plan?.tasks.length || refreshing}
            onClick={() => void refreshIssues()}
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={refreshing ? 'is-spinning' : undefined}
            />
          </button>
          <button className="wb-btn wb-btn-sm" disabled={!plan} onClick={onMinutes}>
            <Presentation size={14} />
            预览纪要
          </button>
        </div>
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
          const issueCountLabel = reads === null ? 'Unknown' : issueCount
          return (
            <VersionGoalCard
              key={goal.goalId}
              viewStateKey={goalCardViewKey(scope, plan.version, goal.goalId)}
              goal={goal}
              index={index}
              onChange={changeGoal}
              expanded={expanded}
              expandedSignal={expandedSignal}
              summary={
                <span className="vp-goal-summary">
                  {goal.deadline && <span>计划 {goal.deadline}</span>}
                  <span>负责人 {goal.owner || '未指派'}</span>
                  {issueCount > 0 && <span>Issue {issueCountLabel}</span>}
                </span>
              }
              extra={
                <PlanIssueGroups
                  goal={goal}
                  plan={plan}
                  reads={reads}
                  onTask={onTask}
                  onPrepare={() => onPrepareIssues(goal)}
                />
              }
              metrics={
                <PlanGoalMetrics
                  goal={goal}
                  onChange={changeGoal}
                  metrics={metrics}
                  prepare={prepare}
                />
              }
              actions={
                <button
                  type="button"
                  className="wb-btn wb-btn-ghost wb-btn-sm vc-goal-delete vp-icon-btn"
                  title="删除目标"
                  aria-label={`删除目标 ${index + 1}`}
                  onClick={() => removeGoal(goal.goalId)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
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
