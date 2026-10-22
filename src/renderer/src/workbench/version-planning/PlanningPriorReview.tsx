import { ArrowUpRight } from 'lucide-react'
import type { Ref } from 'react'
import type { PlanningProgressSource } from '../../../../shared/workbench/version-material'
import type { CycleTaskSnapshot } from '../version-cycle/ports'
import { BoardIconButton } from '../board-ui'
import type { PriorReviewState } from './use-prior-carryovers'

/**
 * Prior-version review: exactly two rows echoed from the fixed acceptance
 * source in the same style as the acceptance screen — carryover Issues
 * (number + full title, click opens the native detail) and confirmed
 * next-week meeting directives. Missing records stay honestly empty; the full
 * material lives on the acceptance screen, opened through the fixed source.
 */
export function PlanningPriorReview({
  source,
  state,
  openingSource,
  onOpenAcceptance,
  onOpenTask,
  onRetry,
  sectionRef
}: {
  source: PlanningProgressSource | undefined
  state: PriorReviewState
  openingSource: boolean
  onOpenAcceptance(): void
  onOpenTask(task: CycleTaskSnapshot): Promise<void>
  onRetry(): void
  sectionRef: Ref<HTMLElement>
}) {
  const loading = state.kind === 'loading'
  const carryovers = state.kind === 'ready' ? state.carryovers : null
  return (
    <section id="context" className="g3-context" ref={sectionRef} aria-label="上版回顾">
      <div className="g3-section-title">
        <h2>
          {source ? `${source.version} ` : ''}
          <span>验收回顾</span>
        </h2>
        <BoardIconButton label="打开验收屏" disabled={openingSource} onClick={onOpenAcceptance}>
          <ArrowUpRight size={16} aria-hidden="true" />
        </BoardIconButton>
      </div>
      {state.kind === 'error' ? (
        <div className="g3-error" role="alert">
          验收来源读取失败，结果未知。
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
      ) : (
        <div className="g3-prior-card">
          <div className="g3-carryover-row">
            <span>延期遗留</span>
            <div className="g3-carryover-issues">
              {loading ? (
                <span className="g3-muted" role="status">
                  正在读取…
                </span>
              ) : !source ? (
                <span className="g3-muted">未选定上版验收来源 · 在计划会话中明确后写入</span>
              ) : carryovers && carryovers.issues.length ? (
                carryovers.issues.map((issue) =>
                  issue.task ? (
                    <button
                      key={issue.key}
                      type="button"
                      className="g3-carryover-link"
                      onClick={() => void onOpenTask(issue.task!)}
                    >
                      <span className="g3-id">#{issue.number}</span>
                      {issue.title}
                    </button>
                  ) : (
                    <div key={issue.key}>
                      <span className="g3-id">#{issue.number}</span>
                      <span className="g3-muted">标题未读到</span>
                    </div>
                  )
                )
              ) : (
                <span className="g3-muted">上版无延期 Issue</span>
              )}
            </div>
          </div>
          <div className="g3-carryover-row">
            <span>会议遗留</span>
            <div className="g3-carryover-issues">
              {loading ? (
                <span className="g3-muted" role="status">
                  正在读取…
                </span>
              ) : !source ? (
                <span className="g3-muted">未选定上版验收来源 · 在计划会话中明确后写入</span>
              ) : carryovers && carryovers.directives.length ? (
                carryovers.directives.map((directive) => (
                  <div key={directive.label}>
                    <span className="g3-id">{directive.label}</span>
                    {directive.text}
                  </div>
                ))
              ) : (
                <span className="g3-muted">上版会议未单独记录</span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
