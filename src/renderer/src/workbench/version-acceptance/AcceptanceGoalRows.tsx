import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useEffect, useRef, useState, type Ref } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  VersionGoal,
  VersionTaskReference
} from '../../../../shared/workbench/version-material'
import { annotationAttributes, type AnnotationMatch } from '../annotations/types'
import { AnnotationMarkers } from '../annotations/annotation-markers'
import { BoardIconButton, BoardLines } from '../board-ui'
import { goalCardViewKey, readGoalCardExpanded, writeGoalCardExpanded } from '../cycle-view-state'
import type { CycleScope, CycleTaskRead, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
import { recordHumanDecision } from './acceptance-decision'
import { emptyGoalResult, type GoalResult } from './acceptance-model'
import {
  isClosedIssueState,
  issueKey,
  issueMarkFor,
  issueNoteFor,
  updateIssueCarry,
  updateIssueNote
} from './acceptance-issue-annotations'
import { AcceptanceGoalTasks, type AcceptanceIssueRow } from './AcceptanceGoalTasks'

/** The decision records who judged, not which person typed — same fixed source as v9.5. */
const DECISION_SOURCE = '验收界面人工确认'

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
  hasReport,
  onOpenReport,
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
  hasReport: boolean
  onOpenReport(goalNumber: string): void
  sectionRef: Ref<HTMLElement>
}) {
  const [reads, setReads] = useState<CycleTaskRead[] | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [expandedSignal, setExpandedSignal] = useState(0)
  const referenceKey = JSON.stringify(plan.tasks ?? [])
  const referenceKeyRef = useRef(referenceKey)
  referenceKeyRef.current = referenceKey
  // Held in a ref and called from the fetch handler rather than an effect: a
  // snapshot save changes the document, which must not retrigger the capture.
  const snapshot = useRef(onSnapshot)
  snapshot.current = onSnapshot

  useEffect(() => {
    if (!plan.tasks.length) {
      setReads([])
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
          snapshot.current(items)
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
  }, [plan.tasks, referenceKey, scope, taskPort])

  const readsByReference = reads
    ? new Map(
        reads.map((item) => [
          `${item.reference.provider}:${item.reference.repository}:${item.reference.number}`,
          item
        ])
      )
    : null

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
              hasReport={hasReport}
              onOpenReport={onOpenReport}
              expanded={expanded}
              expandedSignal={expandedSignal}
              viewStateKey={goalCardViewKey(scope, plan.version, goal.goalId)}
            />
          ))}
        </div>
      </fieldset>
      <p className="acc-footnote">
        勾的含义只有「达成/不达成」，演示过与否不进材料；指标证据不回显板面，在验收证据报告里。
        目标只读自计划，本屏不编辑目标。
      </p>
    </section>
  )
}

function AcceptanceGoalRow({
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
  hasReport,
  onOpenReport,
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
  hasReport: boolean
  onOpenReport(goalNumber: string): void
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

  const patchResult = (next: GoalResult) => onGoalChange({ ...document, results: upsert(document, next) }, goalId)

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
      {...annotationAttributes({ kind: 'goal', goalId, label: `${goalNumber} 目标` })}
    >
      <div className="acc-goal-head">
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
        <AnnotationMarkers
          numbers={headNumbers}
          label={`${goalNumber} 目标`}
          onOpenPanel={onOpenAnnotationPanel}
        />
        <span className="acc-goal-meta">
          <span>{goal.owner || '负责人待明确'}</span>
          <span>{relatedTasks.length} Issue</span>
        </span>
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
      {open && (
        <div className="acc-goal-body">
          <div className="acc-acceptance">
            <h3>
              验收标准 <small>只读自计划</small>
            </h3>
            <BoardLines text={goal.acceptance} />
          </div>
          <div className="acc-task-head">
            <h3>
              关联 Issue <span>{relatedTasks.length}</span>
            </h3>
            <BoardIconButton
              label={
                hasReport
                  ? `在验收证据报告中打开 ${goalNumber} 对应验收点`
                  : '报告未生成；先在会话中让验收助手生成'
              }
              disabled={!hasReport}
              onClick={() => onOpenReport(goalNumber)}
            >
              <FileText size={15} aria-hidden="true" />
            </BoardIconButton>
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

function upsert(document: AcceptanceMaterial, result: GoalResult): GoalResult[] {
  return document.results.some((item) => item.goalId === result.goalId)
    ? document.results.map((item) => (item.goalId === result.goalId ? result : item))
    : [...document.results, result]
}
