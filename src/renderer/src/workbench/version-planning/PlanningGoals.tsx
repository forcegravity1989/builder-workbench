import { ChartNoAxesCombined, ChevronDown, ChevronRight, Info, Plus, RefreshCw } from 'lucide-react'
import { useState, type Ref } from 'react'
import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'
import { goalCardViewKey, writeGoalCardExpanded } from '../cycle-view-state'
import type { AnnotationMatch } from '../annotations/types'
import { BoardIconButton } from '../board-ui'
import type { SendActionWrap } from '../plan-send-menu'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import {
  materialProblemFile,
  materialProblemRequest,
  type CycleMaterialProblem
} from '../version-cycle/cycle-start-request'
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
  onOpenAnnotationPanel,
  entry,
  problems,
  version
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
  entry: CycleEntry
  problems: CycleMaterialProblem[]
  version: string | null
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
          <p>{version ? `${version} 计划尚未建立。` : '尚未选定版本，可在页头选择已有版本。'}</p>
          <PlanningStartButton entry={entry} problems={problems} version={version} />
          <PlanningMaterialProblems problems={problems} />
        </div>
      ) : (
        <fieldset disabled={disabled} className="g3-goal-fieldset">
          {/* Material problems of other versions stay visible while a plan is open — the retired always-on start card used to carry them. */}
          <PlanningMaterialProblems problems={problems} />
          {plan.goals.length === 0 ? (
            // #436 伴飞裁定（CF-9）：prepare 已 create-only 初始化空计划（有材料、
            // goals=[]）时也要有会话入口——照验收屏空板语义补「与计划助手新建计
            // 划」，点击走同一条 entry.start 注入链（cycle-prompt 绑定分支）。
            <div className="g3-empty-board">
              <p>{plan.version} 计划已建立，还没有目标。</p>
              <PlanningStartButton entry={entry} problems={problems} version={plan.version} />
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

/**
 * The single plan-creation launch entry (G2 seam: sessions start from the
 * board button, versions ride in from the sidebar later). Runs the registered
 * automation manually through the existing ensure chain; material problems ride
 * along as one-shot context. No second version-picker lives here.
 */
function PlanningStartButton({
  entry,
  problems,
  version
}: {
  entry: CycleEntry
  problems: CycleMaterialProblem[]
  version: string | null
}) {
  return (
    <button
      type="button"
      disabled={entry.busy}
      onClick={() =>
        void entry.start(
          [
            version ? `本次计划版本：${version}。请读取该版本的当前材料并继续协作。` : '',
            problems.length ? materialProblemRequest(problems, 'plan', version) : ''
          ]
            .filter(Boolean)
            .join('\n') || undefined
        )
      }
    >
      {entry.busy ? '正在打开会话…' : '与计划助手新建计划'}
    </button>
  )
}

function PlanningMaterialProblems({ problems }: { problems: CycleMaterialProblem[] }) {
  if (!problems.length) {
    return null
  }
  return (
    <p
      className="vc-start-problem"
      role="alert"
      title={problems
        .map((item) => `${materialProblemFile(item, 'plan')}：${item.error ?? item.state}`)
        .join('\n')}
    >
      <Info size={14} aria-hidden="true" />
      <span>
        {[...new Set(problems.map((item) => item.version))].join('、')} 的版本材料格式
        {problems.every((item) => item.state === 'migration-required') ? '较旧' : '有问题'}
        ，暂无法读取；点「与计划助手新建计划」会把具体文件和迁移请求带入会话，由模型说明方案、经你确认后转换，不留旧文件副本。
      </span>
    </p>
  )
}
