import { ArrowUpRight } from 'lucide-react'
import type {
  VersionGoal,
  VersionTaskReference
} from '../../../../shared/workbench/version-material'
import { annotationAttributes, type AnnotationMatch } from '../annotations/types'
import { AnnotationMarkers } from '../annotations/annotation-markers'
import { BoardIconButton } from '../board-ui'
import type { CycleTaskRead, CycleTaskSnapshot } from '../version-cycle/ports'

/**
 * Bug/Feature badge derivation per the issue-state spec labels: an exact
 * bug/缺陷 label marks Bug; anything else (including no classification label)
 * shows Feature (2026-10-21 user decision, replacing the plan screen's former
 * "no label = unclassified" grouping). Rows without a ready task read show no
 * badge at all — unknown labels never impersonate Feature.
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

/** Flat Issue rows under one goal: title → native detail, kind badge, state, annotation markers, and the start arrow (interim: opens the native detail). */
export function PlanningGoalTasks({
  goal,
  goalNumber,
  relatedTasks,
  reads,
  onTask,
  numbersFor,
  onOpenAnnotationPanel
}: {
  goal: VersionGoal
  goalNumber: string
  relatedTasks: VersionTaskReference[]
  reads: Map<string, CycleTaskRead> | null
  onTask(task: CycleTaskSnapshot): Promise<void>
  numbersFor(match: AnnotationMatch): number[]
  onOpenAnnotationPanel(): void
}) {
  if (!relatedTasks.length) {
    return (
      <div className="g3-tasks">
        <p className="g3-empty">与计划助手核对已有 Issue，再按验收标准拆解。</p>
      </div>
    )
  }
  return (
    <div className="g3-tasks">
      {relatedTasks.map((reference) => {
        const key = `${reference.provider}:${reference.repository}:${reference.number}`
        const label = `${goalNumber} · #${reference.number}`
        const markers = (
          <AnnotationMarkers
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
        const read = reads?.get(key)
        if (read?.kind !== 'ready') {
          // Unknown iron rule: no labels read → no badge, no fake state, no
          // detail entry point — just the honest reference number.
          return (
            <div className="g3-task" key={key} {...attributes}>
              <span className="g3-task-static">
                <span className="g3-id">#{reference.number}</span>
              </span>
              <span
                className="g3-task-state"
                title={read?.kind === 'unavailable' ? read.error : undefined}
              >
                状态未知
              </span>
              {markers}
            </div>
          )
        }
        const task = read.task
        const kind = taskKind(task.labels)
        return (
          <div className="g3-task" key={key} {...attributes}>
            <button type="button" className="g3-task-link" onClick={() => void onTask(task)}>
              <span className="g3-id">#{task.iid}</span>
              {task.title.replace(/^【.*?】/, '') || '标题未读到'}
            </button>
            <span
              className={`g3-task-kind${kind === 'Bug' ? ' bug' : ''}`}
              title="按 issue-state 规范标签推导；无 Bug/缺陷 标签默认按 Feature 显示"
            >
              {kind}
            </span>
            <span className="g3-task-state">{readableTaskState(task.state)}</span>
            {markers}
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
