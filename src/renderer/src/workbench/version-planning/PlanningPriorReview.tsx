import { ArrowUpRight, RefreshCw } from 'lucide-react'
import type { Ref } from 'react'
import type { PlanningProgressSource } from '../../../../shared/workbench/version-material'
import type { CycleTaskSnapshot } from '../version-cycle/ports'
import { BoardIconButton } from '../board-ui'
import type { PriorReviewState } from './use-prior-carryovers'
import type { PriorLiveOpenState } from './use-prior-live-open'

/**
 * Prior-version review: exactly two rows echoed from the fixed acceptance
 * source in the same style as the acceptance screen — carryover Issues
 * (number + full title, click opens the native detail) and meeting
 * carryovers, which come from the human-confirmed acceptance minutes'
 * followups; material written before v10 has no minutes section and falls
 * back to its confirmed 「纳入下周计划」 directives (see use-prior-carryovers).
 * The carryover row distinguishes three data
 * states (2026-10-22 真机反馈轮): marks recorded without carry → "no
 * carryover"; no marks recorded at all → Unknown wording plus a live
 * open-state readback reference row (facts only, never a confirmed
 * carryover conclusion); missing source stays honestly empty. The full
 * material lives on the acceptance screen, opened through the fixed source.
 */
export function PlanningPriorReview({
  source,
  state,
  live,
  openingSource,
  onOpenAcceptance,
  onOpenTask,
  onRetryLive,
  sectionRef
}: {
  source: PlanningProgressSource | undefined
  state: PriorReviewState
  live: PriorLiveOpenState
  openingSource: boolean
  onOpenAcceptance(): void
  onOpenTask(task: CycleTaskSnapshot): Promise<void>
  onRetryLive(): void
  sectionRef: Ref<HTMLElement>
}) {
  const loading = state.kind === 'loading'
  const carryovers = state.kind === 'ready' ? state.carryovers : null
  const unrecorded = carryovers ? !carryovers.issueMarksRecorded : false
  const previousVersion = source?.version ?? (state.kind === 'missing' ? state.version : null)
  return (
    <section id="context" className="g3-context" ref={sectionRef} aria-label="上版回顾">
      <div className="g3-section-title">
        <h2>
          {previousVersion ? `${previousVersion} ` : ''}
          <span>验收回顾</span>
        </h2>
        <BoardIconButton
          label="打开验收屏"
          disabled={openingSource || !source}
          onClick={onOpenAcceptance}
        >
          <ArrowUpRight size={16} aria-hidden="true" />
        </BoardIconButton>
      </div>
      {state.kind === 'none' && <p className="g3-muted">暂无上版</p>}
      {state.kind === 'missing' && (
        <p className="g3-muted" role="status">
          上版 {state.version} 尚未完成验收，回顾暂为空
        </p>
      )}
      <div className="g3-prior-card">
        <div className="g3-carryover-row">
          <span>延期遗留</span>
          <div className="g3-carryover-issues">
            {loading ? (
              <span className="g3-muted" role="status">
                正在读取…
              </span>
            ) : !carryovers ? (
              <span className="g3-muted">—</span>
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
                  <div key={issue.key} title="已存遗留标记；固定快照状态未知">
                    <span className="g3-id">#{issue.number}</span>
                  </div>
                )
              )
            ) : unrecorded ? (
              <>
                <span className="g3-muted">上版验收未记录延期标记</span>
                <div className="g3-carryover-live">
                  <span className="g3-live-tag">
                    <RefreshCw size={11} aria-hidden="true" /> 实时读回
                  </span>
                  {live.kind === 'loading' ? (
                    <span className="g3-muted" role="status">
                      正在读回上版 Issue 状态…
                    </span>
                  ) : live.kind === 'error' ? (
                    <>
                      <span className="g3-muted">读回失败，状态未知</span>
                      <button type="button" onClick={onRetryLive}>
                        重试
                      </button>
                    </>
                  ) : live.kind === 'ready' ? (
                    <>
                      {live.open.length ? (
                        <>
                          <span>
                            上版 <strong>{live.open.length}</strong> 个 Issue 未关闭
                          </span>
                          {live.open.map((task) => (
                            <button
                              key={`${task.reference.repository}:${task.iid}`}
                              type="button"
                              className="g3-carryover-link"
                              title={task.title ?? undefined}
                              onClick={() => void onOpenTask(task)}
                            >
                              <span className="g3-id">#{task.iid}</span>
                            </button>
                          ))}
                        </>
                      ) : live.readCount === 0 ? (
                        <span className="g3-muted">上版快照无 Issue 引用可读回</span>
                      ) : (
                        <span className="g3-muted">
                          已读到状态的 {live.readCount - live.failedCount} 个 Issue 当前均已关闭
                        </span>
                      )}
                      {live.failedCount > 0 && (
                        <span className="g3-muted">· {live.failedCount} 条状态未知</span>
                      )}
                    </>
                  ) : null}
                </div>
              </>
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
            ) : !carryovers ? (
              <span className="g3-muted">—</span>
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
    </section>
  )
}
