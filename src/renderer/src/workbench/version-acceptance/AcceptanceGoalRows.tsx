import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useState, type Ref } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { AnnotationMatch } from '../annotations/types'
import { BoardIconButton } from '../board-ui'
import { goalCardViewKey } from '../cycle-view-state'
import type { CycleScope, CycleTaskRead, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
import { useCycleTaskReads } from '../version-cycle/use-cycle-task-reads'
import { AcceptanceGoalRow } from './AcceptanceGoalRow'

/**
 * Showcase goals come from the fixed plan. Each goal has one human decision;
 * Issue counts remain provider facts and never infer goal attainment.
 */
export function AcceptanceGoalRows({
  plan,
  document,
  disabled,
  scope,
  taskPort,
  onGoalChange,
  onTask,
  onSnapshot,
  numbersFor,
  onOpenAnnotationPanel,
  sectionRef
}: {
  plan: PlanningMaterial
  document: AcceptanceMaterial
  disabled: boolean
  scope: CycleScope
  taskPort: TaskPort
  onGoalChange(next: AcceptanceMaterial, goalId: string): void
  onTask(task: CycleTaskSnapshot): Promise<void>
  /** Feeds the material task snapshot the human verdict's ledger revision cites. */
  onSnapshot(reads: CycleTaskRead[]): void
  numbersFor(match: AnnotationMatch): number[]
  onOpenAnnotationPanel(): void
  sectionRef: Ref<HTMLElement>
}) {
  const [expanded, setExpanded] = useState(false)
  const [expandedSignal, setExpandedSignal] = useState(0)
  // Issue 读数走两屏共享的渲染进程快照缓存（use-cycle-task-reads，#432）：切屏/
  // 重挂载立即回显上次读数、后台静默重读，不再整列闪「状态未知」；「刷新 Issue」
  // 强制重读，转圈即缓存条目 busy。快照仍随每次读取落地更新（新读数即新证据），
  // 缓存回显不喂快照；保存快照改文档也不会重触发读取（effect 只认序列化 key，
  // 旧 tasksRef/referenceKeyRef 守卫随机制结构化消失）。
  const {
    reads,
    error: readError,
    busy: refreshing,
    refresh: refreshIssues
  } = useCycleTaskReads({ scope, tasks: plan.tasks, taskPort, onFreshReads: onSnapshot })

  const readsByReference = reads
    ? new Map(
        reads.map((item) => [
          `${item.reference.provider}:${item.reference.repository}:${item.reference.number}`,
          item
        ])
      )
    : null

  return (
    <section id="showcase" ref={sectionRef} aria-label="Showcase">
      <div className="acc-section-title">
        <h2>Showcase</h2>
        <span className="acc-title-actions">
          <BoardIconButton
            label={refreshing ? '正在刷新 Issue' : '刷新 Issue'}
            disabled={disabled || !plan.tasks.length || refreshing}
            onClick={() => void refreshIssues()}
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={refreshing ? 'is-spinning' : undefined}
            />
          </BoardIconButton>
          {readError && (
            <span className="acc-muted" role="status">
              Issue 状态未知：{readError}
            </span>
          )}
          {plan.goals.length > 0 && (
            <BoardIconButton
              label={expanded ? '全部收起' : '全部展开'}
              onClick={() => {
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
      </div>
      <fieldset disabled={disabled} className="acc-goal-fieldset">
        <div className="acc-goal-list">
          {plan.goals.map((goal, index) => (
            <AcceptanceGoalRow
              key={goal.goalId}
              goal={goal}
              index={index}
              plan={plan}
              document={document}
              disabled={disabled}
              relatedTasks={plan.tasks.filter((task) => task.goalId === goal.goalId)}
              reads={readsByReference}
              onTask={onTask}
              onGoalChange={onGoalChange}
              numbersFor={numbersFor}
              onOpenAnnotationPanel={onOpenAnnotationPanel}
              expanded={expanded}
              expandedSignal={expandedSignal}
              viewStateKey={goalCardViewKey(scope, plan.version, goal.goalId)}
            />
          ))}
        </div>
      </fieldset>
    </section>
  )
}
