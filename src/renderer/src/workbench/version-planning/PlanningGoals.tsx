import { ChartNoAxesCombined, ChevronDown, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { useState, type Ref } from 'react'
import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'
import { goalCardViewKey, writeGoalCardExpanded } from '../cycle-view-state'
import type { AnnotationMatch } from '../annotations/types'
import { BoardIconButton } from '../board-ui'
import type { SendActionWrap } from '../plan-send-menu'
import type { CycleScope, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
import { useCycleTaskReads } from '../version-cycle/use-cycle-task-reads'
import { PlanningGoalCard } from './PlanningGoalCard'
import type { usePlanMetrics } from './use-plan-metrics'

export function PlanningGoals({
  plan,
  disabled,
  edit,
  metrics,
  prepare,
  sectionRef,
  scope,
  taskPort,
  onTask,
  onRemoveGoal,
  onSendAction,
  numbersFor,
  onOpenAnnotationPanel
}: {
  plan?: PlanningMaterial
  disabled: boolean
  edit(plan: PlanningMaterial): void
  metrics: ReturnType<typeof usePlanMetrics>
  prepare(): void
  sectionRef: Ref<HTMLElement>
  scope: CycleScope | null
  taskPort: TaskPort
  onTask(task: CycleTaskSnapshot): Promise<void>
  /** Board-level cascade: goal + its task references + its annotations leave the plan. */
  onRemoveGoal(goalId: string): void
  onSendAction: SendActionWrap
  numbersFor(match: AnnotationMatch): number[]
  onOpenAnnotationPanel(): void
}) {
  const [expanded, setExpanded] = useState(false)
  const [expandedSignal, setExpandedSignal] = useState(0)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  // Issue 读数走两屏共享的渲染进程快照缓存（use-cycle-task-reads，#432）：
  // 切屏/材料保存重挂载立即回显上次读数、后台静默重读，不再整列闪「状态未知」；
  // 「刷新 Issue」强制重读，转圈即缓存条目 busy（按键控条目走，在途切版本不会
  // 卡死按钮——旧组件级 refreshing 状态的复位守卫问题随机制结构化消失）。
  const {
    reads,
    error: readError,
    busy: refreshing,
    refresh: refreshIssues
  } = useCycleTaskReads({ scope, tasks: plan?.tasks, taskPort })

  const changeGoal = (goal: VersionGoal) => {
    if (plan) {
      edit({
        ...plan,
        goals: plan.goals.map((item) => (item.goalId === goal.goalId ? goal : item))
      })
    }
  }

  const addGoal = () => {
    if (!plan) {
      return
    }
    const goalId = crypto.randomUUID()
    edit({
      ...plan,
      goals: [...plan.goals, { goalId, title: '', metricTargets: [] }]
    })
    writeGoalCardExpanded(goalCardViewKey(scope, plan.version, goalId), true)
    setEditingGoalId(goalId)
    requestAnimationFrame(() =>
      document.getElementById(`goal-${goalId}`)?.scrollIntoView({ block: 'nearest' })
    )
  }

  const readsByReference = reads
    ? new Map(
        reads.map((item) => [
          `${item.reference.provider}:${item.reference.repository}:${item.reference.number}`,
          item
        ])
      )
    : null

  return (
    <section id="goals" ref={sectionRef} aria-label="本版目标">
      <div className="g3-section-title">
        <h2>
          {plan ? `${plan.version} ` : ''}
          <span>本版目标</span>
          <small>{plan ? `${plan.goals.length} 个目标` : '未建'}</small>
        </h2>
        {plan && (
          <span className="g3-title-actions">
            {readError && (
              <span className="g3-muted" role="status">
                Issue 状态未知：{readError}
              </span>
            )}
            <button
              type="button"
              className="g3-text-button"
              title="新建会话，配置指标"
              onClick={prepare}
            >
              <ChartNoAxesCombined size={13} aria-hidden="true" /> 配置指标
            </button>
            <BoardIconButton
              label={refreshing ? '正在刷新 Issue' : '刷新 Issue'}
              disabled={disabled || !scope || !plan.tasks.length || refreshing}
              onClick={() => void refreshIssues()}
            >
              <RefreshCw
                size={15}
                aria-hidden="true"
                className={refreshing ? 'is-spinning' : undefined}
              />
            </BoardIconButton>
            {plan.goals.length > 0 && (
              <BoardIconButton
                label={expanded ? '全部收起' : '全部展开'}
                onClick={() => {
                  setEditingGoalId(null)
                  setExpanded(!expanded)
                  setExpandedSignal((value) => value + 1)
                }}
              >
                {expanded ? (
                  <ChevronDown size={16} aria-hidden="true" />
                ) : (
                  <ChevronRight size={16} aria-hidden="true" />
                )}
              </BoardIconButton>
            )}
          </span>
        )}
      </div>
      {!plan ? (
        <div className="g3-empty-board">
          <p>尚无目标</p>
        </div>
      ) : (
        <fieldset disabled={disabled} className="g3-goal-fieldset">
          {plan.goals.length === 0 ? (
            <div className="g3-empty-board">
              <p>尚无目标</p>
            </div>
          ) : null}
          <div className="g3-goal-list">
            {plan.goals.map((goal, index) => (
              <PlanningGoalCard
                key={goal.goalId}
                goal={goal}
                index={index}
                relatedTasks={plan.tasks.filter((task) => task.goalId === goal.goalId)}
                reads={readsByReference}
                version={plan.version}
                onChange={changeGoal}
                onRemove={(goalId) => {
                  setEditingGoalId(null)
                  onRemoveGoal(goalId)
                }}
                onTask={onTask}
                onSendAction={onSendAction}
                metrics={metrics}
                expanded={expanded}
                expandedSignal={expandedSignal}
                viewStateKey={goalCardViewKey(scope, plan.version, goal.goalId)}
                editing={editingGoalId === goal.goalId}
                onEditingChange={(next) => setEditingGoalId(next ? goal.goalId : null)}
                numbersFor={numbersFor}
                onOpenAnnotationPanel={onOpenAnnotationPanel}
              />
            ))}
          </div>
          <div className="g3-goals-bottom">
            <BoardIconButton label="添加目标" onClick={addGoal}>
              <Plus size={16} aria-hidden="true" />
            </BoardIconButton>
            <span>与计划助手一起明确目标、拆解 Issue。</span>
          </div>
        </fieldset>
      )}
    </section>
  )
}
