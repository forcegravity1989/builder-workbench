import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  VersionGoal,
  VersionTaskReference
} from '../../../../shared/workbench/version-material'
import { annotationAttributes, type AnnotationMatch } from '../annotations/types'
import { BoardLines } from '../board-ui'
import { readGoalCardExpanded, writeGoalCardExpanded } from '../cycle-view-state'
import type { CycleTaskRead, CycleTaskSnapshot } from '../version-cycle/ports'
import { recordHumanDecision } from './acceptance-decision'
import { emptyGoalResult, upsertGoalResult, type GoalResult } from './acceptance-model'
import {
  isClosedIssueState,
  issueKey,
  issueMarkFor,
  issueNoteFor,
  updateIssueCarry,
  updateIssueNote
} from './acceptance-issue-annotations'
import { AcceptanceAnnotationBadge } from './AcceptanceAnnotationBadge'
import { AcceptanceGoalTasks, type AcceptanceIssueRow } from './AcceptanceGoalTasks'

/** The decision records who judged, not which person typed — same fixed source as v9.5. */
const DECISION_SOURCE = '验收界面人工确认'

export function AcceptanceGoalRow({
  goal,
  index,
  plan,
  document,
  disabled,
  relatedTasks,
  reads,
  onTask,
  onGoalChange,
  numbersFor,
  onOpenAnnotationPanel,
  expanded,
  expandedSignal,
  viewStateKey
}: {
  goal: VersionGoal
  index: number
  plan: PlanningMaterial
  document: AcceptanceMaterial
  disabled: boolean
  relatedTasks: VersionTaskReference[]
  reads: Map<string, CycleTaskRead> | null
  onTask(task: CycleTaskSnapshot): Promise<void>
  onGoalChange(next: AcceptanceMaterial, goalId: string): void
  numbersFor(match: AnnotationMatch): number[]
  onOpenAnnotationPanel(): void
  expanded: boolean
  expandedSignal: number
  viewStateKey: string | undefined
}) {
  const goalNumber = `G${index + 1}`
  const goalId = goal.goalId
  const [open, setOpen] = useState(() => readGoalCardExpanded(viewStateKey, expanded))
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previousStateKey = useRef(viewStateKey)
  const previousExpanded = useRef(expanded)
  const previousExpandedSignal = useRef(expandedSignal)
  // The document the async decision was computed against; a poll or another
  // window editing mid-flight must not let a stale verdict overwrite it.
  const latest = useRef(document)
  latest.current = document

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

  const result = document.results.find((item) => item.goalId === goalId)
  const outcome = result?.decision?.outcome
  const rows = new Map<string, AcceptanceIssueRow>()
  for (const reference of relatedTasks) {
    const read = reads?.get(issueKey(reference))
    rows.set(issueKey(reference), {
      reference,
      note: (result && issueNoteFor(result, reference, relatedTasks)) || '',
      carry: Boolean(result && issueMarkFor(result, reference, relatedTasks)?.carry),
      closed: read?.kind === 'ready' && isClosedIssueState(read.task.state)
    })
  }

  const patchResult = (next: GoalResult) =>
    onGoalChange({ ...document, results: upsertGoalResult(document.results, next) }, goalId)

  async function decide(next: 'met' | 'not-met') {
    if (deciding) {
      return
    }
    setDeciding(true)
    try {
      // Clicking the active verdict again clears it back to unmarked; an
      // unmarked goal stays blank instead of being inferred from anything.
      if (outcome === next) {
        const cleared = (result ?? emptyGoalResult(goalId)).decision
          ? { ...(result ?? emptyGoalResult(goalId)), decision: undefined }
          : (result ?? emptyGoalResult(goalId))
        patchResult(cleared)
        setError(null)
        return
      }
      const source = document
      const updated = await recordHumanDecision({
        document: source,
        plan,
        goalId,
        outcome: next,
        source: DECISION_SOURCE,
        reason: source.results.find((item) => item.goalId === goalId)?.note ?? '',
        recordedAt: new Date().toISOString()
      })
      if (latest.current !== source) {
        throw new Error('记录结论期间材料已变化，请核对后重新确认。')
      }
      onGoalChange(updated, goalId)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDeciding(false)
    }
  }

  const headNumbers = numbersFor({ kinds: ['goal'], goalId })
  return (
    <article
      className={`acc-goal${open ? ' open' : ''}${outcome === 'not-met' ? ' unmet' : ''}`}
      id={`goal-${goalId}`}
      data-goal-id={goalId}
    >
      {/* 批注捕获挂在目标整头与验收标准块两处（验收标准自 #426 验收会决议参与
          批注，与计划屏对齐）；整卡不挂——「下一步」textarea 是人工输入件，
          不是评审对象，spec 维持排除。 */}
      <div
        className="acc-goal-head"
        {...annotationAttributes({ kind: 'goal', goalId, label: `${goalNumber} 目标` })}
      >
        <button
          type="button"
          className="acc-goal-toggle"
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'} ${goalNumber}`}
          onClick={() => {
            const next = !open
            setOpen(next)
            writeGoalCardExpanded(viewStateKey, next)
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="acc-goal-id">{goalNumber}</span>
          <strong>{goal.title || '待明确目标'}</strong>
        </button>
        <AcceptanceAnnotationBadge
          numbers={headNumbers}
          label={`${goalNumber} 目标`}
          onOpenPanel={onOpenAnnotationPanel}
        />
        <span className="acc-goal-count">{relatedTasks.length} Issue</span>
        <span className="acc-verdict">
          <button
            type="button"
            className={outcome === 'met' ? 'on' : undefined}
            aria-pressed={outcome === 'met'}
            disabled={disabled || deciding}
            title="人对着实物核对后标记：达成"
            onClick={() => void decide('met')}
          >
            达成
          </button>
          <button
            type="button"
            className={outcome === 'not-met' ? 'on unmet' : undefined}
            aria-pressed={outcome === 'not-met'}
            disabled={disabled || deciding}
            title="人对着实物核对后标记：不达成（原因写纪要，安排写下一步）"
            onClick={() => void decide('not-met')}
          >
            不达成
          </button>
        </span>
      </div>
      {error && (
        <p className="acc-error" role="alert">
          {error}
        </p>
      )}
      {!open && (
        <div className="acc-goal-meta">
          <span>{goal.owner || '负责人待明确'}</span>
        </div>
      )}
      {open && (
        <div className="acc-goal-body">
          <div className="acc-goal-meta">
            <span>{goal.owner || '负责人待明确'}</span>
          </div>
          <div
            className="acc-acceptance"
            {...annotationAttributes({
              kind: 'acceptance',
              goalId,
              label: `${goalNumber} · 验收标准`
            })}
          >
            <h3>
              验收标准 <small>只读自计划</small>
              <AcceptanceAnnotationBadge
                numbers={numbersFor({ kinds: ['acceptance'], goalId })}
                label={`${goalNumber} · 验收标准`}
                onOpenPanel={onOpenAnnotationPanel}
              />
            </h3>
            <BoardLines text={goal.acceptance} />
          </div>
          {/* 报告入口只在「验收准备」的证据报告行（报告一份/版本）；目标行不再
              重复设入口——2026-10-23 高保真反馈。 */}
          <div className="acc-task-head">
            <h3>
              关联 Issue <span>{relatedTasks.length}</span>
            </h3>
          </div>
          <AcceptanceGoalTasks
            goal={goal}
            goalNumber={goalNumber}
            relatedTasks={relatedTasks}
            reads={reads}
            rows={rows}
            disabled={disabled}
            onTask={onTask}
            onNote={(reference, note) => {
              const base = result ?? emptyGoalResult(goalId)
              patchResult({
                ...base,
                issueNotes: updateIssueNote(base, reference, relatedTasks, note)
              })
            }}
            onCarry={(reference, carry) => {
              const base = result ?? emptyGoalResult(goalId)
              patchResult({
                ...base,
                issueMarks: updateIssueCarry(base, reference, relatedTasks, carry)
              })
            }}
            numbersFor={numbersFor}
            onOpenAnnotationPanel={onOpenAnnotationPanel}
          />
          {outcome === 'not-met' && (
            <label className="acc-field">
              <span>{goalNumber} 下一步</span>
              <textarea
                rows={2}
                aria-label={`${goalNumber} 下一步`}
                placeholder="本版补齐、带入下版或停止，并说明安排"
                value={result?.nextStep ?? ''}
                disabled={disabled}
                onChange={(event) => {
                  const base = result ?? emptyGoalResult(goalId)
                  patchResult({ ...base, nextStep: event.target.value })
                }}
              />
            </label>
          )}
        </div>
      )}
    </article>
  )
}
