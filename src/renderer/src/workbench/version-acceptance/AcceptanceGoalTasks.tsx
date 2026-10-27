import { ArrowUpRight } from 'lucide-react'
import type {
  VersionGoal,
  VersionTaskReference
} from '../../../../shared/workbench/version-material'
import { annotationAttributes, type AnnotationMatch } from '../annotations/types'
import { BoardIconButton } from '../board-ui'
import type { CycleTaskRead, CycleTaskSnapshot } from '../version-cycle/ports'
import { issueKey, issueReadState } from './acceptance-issue-annotations'
import { AcceptanceAnnotationBadge } from './AcceptanceAnnotationBadge'

/**
 * Bug/Feature badge per the issue-state spec labels: an exact bug/缺陷 label marks
 * Bug, anything else shows Feature. Rows without a ready task read show no badge —
 * unknown labels never impersonate Feature.
 */
function taskKind(labels: string[] | undefined): 'Bug' | 'Feature' {
  return (labels ?? []).some((label) => /^(bug|缺陷)$/i.test(String(label).trim()))
    ? 'Bug'
    : 'Feature'
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
    default:
      return '状态未知'
  }
}

export type AcceptanceIssueRow = {
  note: string
  carry: boolean
}

/**
 * Flat Issue rows under one goal on the acceptance board: verify real state only,
 * never break work down here. A closed Issue keeps its stored note read-only and
 * is not counted as carried over; the carry mark and the note are human fields.
 * Risk marking is retired on both cycle screens.
 */
export function AcceptanceGoalTasks({
  goal,
  goalNumber,
  relatedTasks,
  reads,
  rows,
  disabled,
  onTask,
  onNote,
  onCarry,
  numbersFor,
  onOpenAnnotationPanel
}: {
  goal: VersionGoal
  goalNumber: string
  relatedTasks: VersionTaskReference[]
  reads: Map<string, CycleTaskRead> | null
  rows: Map<string, AcceptanceIssueRow>
  disabled: boolean
  onTask(task: CycleTaskSnapshot): Promise<void>
  onNote(reference: VersionTaskReference, note: string): void
  onCarry(reference: VersionTaskReference, carry: boolean): void
  numbersFor(match: AnnotationMatch): number[]
  onOpenAnnotationPanel(): void
}) {
  if (!relatedTasks.length) {
    return (
      <div className="acc-tasks">
        <p className="acc-empty">该目标暂无关联 Issue。</p>
      </div>
    )
  }
  const stateOrder = { open: 0, unknown: 1, closed: 2 }
  const orderedTasks = [...relatedTasks].sort(
    (left, right) =>
      stateOrder[issueReadState(reads?.get(issueKey(left)))] -
      stateOrder[issueReadState(reads?.get(issueKey(right)))]
  )
  return (
    <div className="acc-tasks">
      {orderedTasks.map((reference) => {
        const key = `${reference.provider}:${reference.repository}:${reference.number}`
        const label = `${goalNumber} · #${reference.number}`
        const markers = (
          <AcceptanceAnnotationBadge
            numbers={numbersFor({
              kinds: ['issue'],
              goalId: goal.goalId,
              issueNumber: reference.number
            })}
            label={label}
            onOpenPanel={onOpenAnnotationPanel}
          />
        )
        const attributes = annotationAttributes({
          kind: 'issue',
          goalId: goal.goalId,
          issueNumber: reference.number,
          label
        })
        const row = rows.get(key)
        const read = reads?.get(key)
        if (read?.kind !== 'ready') {
          // Unknown iron rule: no labels read → no badge, no fake state, no detail
          // entry point — just the honest reference number. Stored human fields
          // remain visible, but unknown state cannot contribute to open counts.
          return (
            <div className="acc-task" key={key} {...attributes}>
              <span className="acc-task-static">
                <span className="acc-id">#{reference.number}</span>
              </span>
              <span
                className="acc-task-state"
                title={read?.kind === 'unavailable' ? read.error : undefined}
              >
                状态未知
              </span>
              {markers}
              {row?.note && (
                <span className="acc-task-note readonly" title="状态读不到 · 已存备注只读">
                  {row.note}
                </span>
              )}
              {row?.carry && (
                <span className="acc-carry on" title="已存遗留标记；状态未知，暂不计入未关闭遗留数">
                  遗留
                </span>
              )}
            </div>
          )
        }
        const task = read.task
        const kind = taskKind(task.labels)
        const state = issueReadState(read)
        const editable = state === 'open'
        return (
          <div className="acc-task" key={key} {...attributes}>
            <button type="button" className="acc-task-link" onClick={() => void onTask(task)}>
              <span className="acc-id">#{task.iid}</span>
              {task.title.replace(/^【.*?】/, '') || '标题未读到'}
            </button>
            <span
              className={`acc-task-kind${kind === 'Bug' ? ' bug' : ''}`}
              title="由 Issue 标签推导"
            >
              {kind}
            </span>
            <span className="acc-task-state">{readableTaskState(task.state)}</span>
            {markers}
            {!editable && row?.note ? (
              <span className="acc-task-note readonly" title="已关闭或状态未知 · 备注只读">
                {row.note}
              </span>
            ) : (
              editable && (
                <input
                  className="acc-task-note"
                  aria-label={`#${task.iid} 备注`}
                  placeholder="备注（遗留原因写这里）"
                  value={row?.note ?? ''}
                  disabled={disabled}
                  onChange={(event) => onNote(reference, event.target.value)}
                />
              )
            )}
            {state === 'unknown' && row?.carry && (
              <span className="acc-carry on" title="已存遗留标记；状态未知，暂不计入未关闭遗留数">
                遗留
              </span>
            )}
            {editable && (
              <button
                type="button"
                className={`acc-carry${row?.carry ? ' on' : ''}`}
                aria-pressed={Boolean(row?.carry)}
                disabled={disabled}
                title="验收后是否遗留；回显到下版计划屏「延期遗留」"
                onClick={() => onCarry(reference, !row?.carry)}
              >
                遗留
              </button>
            )}
            <BoardIconButton
              label={`打开 #${task.iid} 原生任务详情`}
              onClick={() => void onTask(task)}
            >
              <ArrowUpRight size={15} aria-hidden="true" />
            </BoardIconButton>
          </div>
        )
      })}
    </div>
  )
}
