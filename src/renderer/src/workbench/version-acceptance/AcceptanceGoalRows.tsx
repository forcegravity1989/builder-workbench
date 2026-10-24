import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, type Ref } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { AnnotationMatch } from '../annotations/types'
import { BoardIconButton } from '../board-ui'
import { goalCardViewKey } from '../cycle-view-state'
import type { CycleScope, CycleTaskRead, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
import { AcceptanceGoalRow } from './AcceptanceGoalRow'

/**
 * Second zone: the showcase checklist. Goal rows reuse the plan screen's row form
 * in read-only trim — the goals come from the fixed plan and are never edited,
 * added or removed here. The only human verdict is the mutually exclusive
 * 达成/不达成 pair at the row end; clicking the active one again clears it back to
 * unmarked, and unmarked stays blank rather than being inferred. Whether
 * something was demonstrated never enters the material.
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
  const [reads, setReads] = useState<CycleTaskRead[] | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [expandedSignal, setExpandedSignal] = useState(0)
  const referenceKey = JSON.stringify(plan.tasks ?? [])
  const [refreshing, setRefreshing] = useState(false)
  const referenceKeyRef = useRef(referenceKey)
  referenceKeyRef.current = referenceKey
  // Keyed on the serialized references, not the array identity: the fixed plan is
  // re-read after a save and hands back a fresh array each time.
  const tasksRef = useRef(plan.tasks)
  tasksRef.current = plan.tasks
  // Held in a ref and called from the fetch handler rather than an effect: a
  // snapshot save changes the document, which must not retrigger the capture.
  const snapshot = useRef(onSnapshot)
  snapshot.current = onSnapshot

  useEffect(() => {
    const tasks = tasksRef.current
    if (!tasks.length) {
      setReads([])
      setReadError(null)
      return
    }
    let active = true
    setReads(null)
    void taskPort.listVersion(scope, tasks).then(
      (items) => {
        if (active) {
          setReads(items)
          setReadError(null)
          snapshot.current(items)
        }
      },
      (reason) => {
        if (active) {
          setReadError(reason instanceof Error ? reason.message : String(reason))
          setReads(
            tasks.map((reference) => ({
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
  }, [referenceKey, scope, taskPort])

  const readsByReference = reads
    ? new Map(
        reads.map((item) => [
          `${item.reference.provider}:${item.reference.repository}:${item.reference.number}`,
          item
        ])
      )
    : null

  /** 手动重读 Issue 状态（计划屏区块头同款，验收屏 2026-10-23 补齐）；在途时
      切换版本不得让旧读回覆盖新列表。快照同步更新：新读数即新证据。 */
  const refreshIssues = async () => {
    if (!plan.tasks.length || refreshing) {
      return
    }
    const requestedKey = referenceKey
    setRefreshing(true)
    setReadError(null)
    try {
      const items = await taskPort.refresh(scope, plan.tasks)
      if (requestedKey === referenceKeyRef.current) {
        setReads(items)
        snapshot.current(items)
      }
    } catch (reason) {
      if (requestedKey === referenceKeyRef.current) {
        setReadError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      // 复位转圈不设 key 守卫：刷新在途时切版本会让守卫跳过复位，按钮永久禁用、
      // 图标永久转圈（组件不卸载）。守卫只该保护读回结果与快照的落点。
      setRefreshing(false)
    }
  }

  const judged = plan.goals.filter(
    (goal) => document.results.find((item) => item.goalId === goal.goalId)?.decision
  ).length

  return (
    <section id="showcase" ref={sectionRef} aria-label="Showcase">
      <div className="acc-section-title">
        <h2>
          Showcase
          <small>
            勾勾表 · 人判 {judged}/{plan.goals.length}
          </small>
        </h2>
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
