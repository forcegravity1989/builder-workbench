import { BrainCircuit, Check, ChevronDown, ChevronRight, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  VersionGoal,
  VersionTaskReference
} from '../../../../shared/workbench/version-material'
import { readGoalCardExpanded, writeGoalCardExpanded } from '../cycle-view-state'
import { annotationAttributes, type AnnotationMatch } from '../annotations/types'
import { AnnotationMarkers } from '../annotations/annotation-markers'
import { BoardIconButton, BoardLines, BoardActionButton } from '../board-ui'
import type { SendActionWrap } from '../plan-send-menu'
import type { CycleTaskRead, CycleTaskSnapshot } from '../version-cycle/ports'
import { PlanGoalMetrics } from './PlanGoalMetrics'
import { PlanningGoalTasks } from './PlanningGoalTasks'
import type { usePlanMetrics } from './use-plan-metrics'

function Field({
  label,
  value,
  onChange,
  placeholder,
  rows = 2
}: {
  label: string
  value: string | undefined
  onChange(value: string): void
  placeholder?: string
  rows?: number
}) {
  return (
    <label className="g3-field">
      <span>{label}</span>
      <textarea
        rows={rows}
        aria-label={label}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function PlanningGoalCard({
  goal,
  index,
  relatedTasks,
  reads,
  version,
  onChange,
  onRemove,
  onTask,
  onSendAction,
  metrics,
  expanded,
  expandedSignal,
  viewStateKey,
  editing,
  onEditingChange,
  numbersFor,
  onOpenAnnotationPanel
}: {
  goal: VersionGoal
  index: number
  relatedTasks: VersionTaskReference[]
  /** null while the provider read is in flight. */
  reads: Map<string, CycleTaskRead> | null
  /** 本版版本（Issue 行开工箭头的解析前提）。 */
  version: string
  onChange(goal: VersionGoal): void
  /** Whole-card delete: the parent drops the goal, its task references and annotations. */
  onRemove(goalId: string): void
  onTask(task: CycleTaskSnapshot): Promise<void>
  onSendAction: SendActionWrap
  metrics: ReturnType<typeof usePlanMetrics>
  expanded: boolean
  expandedSignal: number
  viewStateKey: string | undefined
  editing: boolean
  onEditingChange(next: boolean): void
  numbersFor(match: AnnotationMatch): number[]
  onOpenAnnotationPanel(): void
}) {
  const goalNumber = `G${index + 1}`
  const goalId = goal.goalId
  const [open, setOpen] = useState(() => readGoalCardExpanded(viewStateKey, expanded))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const previousStateKey = useRef(viewStateKey)
  const previousExpanded = useRef(expanded)
  const previousExpandedSignal = useRef(expandedSignal)
  useEffect(() => {
    const signalChanged = expandedSignal !== previousExpandedSignal.current
    const valueChanged = expanded !== previousExpanded.current
    if (viewStateKey !== previousStateKey.current) {
      setOpen(readGoalCardExpanded(viewStateKey, expanded))
    } else if (signalChanged || valueChanged) {
      setOpen(expanded)
      writeGoalCardExpanded(viewStateKey, expanded)
    }
    previousStateKey.current = viewStateKey
    previousExpanded.current = expanded
    previousExpandedSignal.current = expandedSignal
  }, [expanded, expandedSignal, viewStateKey])
  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false)
    }
  }, [open])

  const headNumbers = numbersFor({ kinds: ['goal-title', 'goal'], goalId })
  return (
    <article
      className={`g3-goal${open ? ' open' : ''}`}
      id={`goal-${goalId}`}
      data-goal-id={goalId}
      {...annotationAttributes({ kind: 'goal', goalId, label: `${goalNumber} 目标` })}
    >
      <div
        className="g3-goal-head"
        {...annotationAttributes({ kind: 'goal-title', goalId, label: `${goalNumber} · 目标句` })}
      >
        <button
          type="button"
          className="g3-goal-toggle"
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'} ${goalNumber}`}
          onClick={() => {
            onEditingChange(false)
            setConfirmingDelete(false)
            const next = !open
            setOpen(next)
            writeGoalCardExpanded(viewStateKey, next)
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="g3-goal-id">{goalNumber}</span>
          {!editing && <strong>{goal.title || '待明确目标'}</strong>}
        </button>
        {editing && (
          <textarea
            className="g3-title-input"
            rows={1}
            aria-label={`${goalNumber} 目标`}
            value={goal.title}
            onChange={(event) => onChange({ ...goal, title: event.target.value })}
          />
        )}
        <AnnotationMarkers
          numbers={headNumbers}
          label={`${goalNumber} 目标`}
          onOpenPanel={onOpenAnnotationPanel}
        />
        <span className="g3-goal-count">{relatedTasks.length} Issue</span>
        {open &&
          !confirmingDelete &&
          (editing ? (
            <BoardIconButton label="结束编辑目标" onClick={() => onEditingChange(false)}>
              <Check size={15} aria-hidden="true" />
            </BoardIconButton>
          ) : (
            <>
              <BoardIconButton label="编辑目标" onClick={() => onEditingChange(true)}>
                <Pencil size={15} aria-hidden="true" />
              </BoardIconButton>
              <BoardIconButton
                label={`删除目标 ${goalNumber}`}
                onClick={() => setConfirmingDelete(true)}
              >
                <X size={15} aria-hidden="true" />
              </BoardIconButton>
            </>
          ))}
        {open && confirmingDelete && (
          <span className="g3-goal-confirm">
            <button type="button" className="danger" onClick={() => onRemove(goalId)}>
              确认删除
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              取消
            </button>
          </span>
        )}
      </div>
      {!open && (
        <div className="g3-goal-meta">
          <span>{goal.owner || '负责人待明确'}</span>
          {goal.deadline && <span>{goal.deadline}</span>}
        </div>
      )}
      {open && (
        <div className="g3-goal-body">
          <div className="g3-goal-meta">
            {editing ? (
              <>
                <label>
                  负责人{' '}
                  <input
                    aria-label={`${goalNumber} 负责人`}
                    value={goal.owner ?? ''}
                    onChange={(event) => onChange({ ...goal, owner: event.target.value })}
                  />
                </label>
                <label>
                  计划完成{' '}
                  <input
                    aria-label={`${goalNumber} 计划完成`}
                    value={goal.deadline ?? ''}
                    placeholder="日期或版本"
                    onChange={(event) => onChange({ ...goal, deadline: event.target.value })}
                  />
                </label>
              </>
            ) : (
              <>
                <span>{goal.owner || '负责人待明确'}</span>
                <span>{goal.deadline || '计划完成待明确'}</span>
              </>
            )}
          </div>
          <div className="g3-commitment">
            <div
              className="g3-acceptance"
              {...annotationAttributes({
                kind: 'acceptance',
                goalId,
                label: `${goalNumber} · 验收标准`
              })}
            >
              {editing ? (
                <Field
                  label="验收标准"
                  value={goal.acceptance}
                  rows={3}
                  placeholder="谁做什么操作、看到什么结果；涉及数值时写口径和目标值"
                  onChange={(value) => onChange({ ...goal, acceptance: value })}
                />
              ) : (
                <>
                  <h3>
                    验收标准
                    <AnnotationMarkers
                      numbers={numbersFor({ kinds: ['acceptance'], goalId })}
                      label={`${goalNumber} · 验收标准`}
                      onOpenPanel={onOpenAnnotationPanel}
                    />
                  </h3>
                  <BoardLines text={goal.acceptance} />
                </>
              )}
            </div>
            <PlanGoalMetrics
              goal={goal}
              onChange={onChange}
              metrics={metrics}
              blockProps={annotationAttributes({
                kind: 'metrics',
                goalId,
                label: `${goalNumber} · 指标承诺`
              })}
              headingExtra={
                <AnnotationMarkers
                  numbers={numbersFor({ kinds: ['metrics'], goalId })}
                  label={`${goalNumber} · 指标承诺`}
                  onOpenPanel={onOpenAnnotationPanel}
                />
              }
            />
          </div>
          <div className="g3-task-head">
            <h3>
              关联 Issue <span>{relatedTasks.length}</span>
            </h3>
            {onSendAction(
              `按 ${goalNumber} 验收标准核对已有 Issue，给出拆解与关联建议`,
              '拆解请求',
              <BoardActionButton>
                <BrainCircuit size={14} aria-hidden="true" /> 拆解 Issue
              </BoardActionButton>
            )}
          </div>
          <PlanningGoalTasks
            goal={goal}
            goalNumber={goalNumber}
            relatedTasks={relatedTasks}
            reads={reads}
            version={version}
            onTask={onTask}
            numbersFor={numbersFor}
            onOpenAnnotationPanel={onOpenAnnotationPanel}
          />
        </div>
      )}
    </article>
  )
}
