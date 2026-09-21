import React from 'react'
import { PlanText } from './PlanText'
import { newGoal, type PlanningDocument } from './plan-week-document'
import { minutesStatusLabel } from './plan-week-view'
import { PlanGoalList } from './PlanGoalList'

export function PlanReviewBoard({
  data,
  onChange
}: {
  data: PlanningDocument
  onChange: (updater: (current: PlanningDocument) => PlanningDocument) => void
}): React.JSX.Element {
  return (
    <div className="plan-step plan-step-2">
      <section className="sec">
        <div className="block-title">
          <h2>总结三段</h2>
        </div>
        <div className="agenda">
          <div className="wb-card agenda-card">
            <div className="block-title">
              <h2 style={{ fontSize: 13 }}>① 风险上报</h2>
            </div>
            <PlanText
              multiline
              value={data.summary.risks}
              placeholder="哪些风险需要 Leader 关注？影响什么目标、需要什么决策或支持？"
              ariaLabel="风险上报"
              onChange={(risks) =>
                onChange((current) => ({
                  ...current,
                  summary: { ...current.summary, risks }
                }))
              }
            />
          </div>
          <div className="wb-card agenda-card">
            <div className="block-title">
              <h2 style={{ fontSize: 13 }}>② 版本进展 · 上周总结</h2>
            </div>
            <PlanText
              multiline
              value={data.summary.progress}
              placeholder="汇总第一屏：目标结果、任务交付、Bug 处理和遗留事项，让评审无需来回切屏。"
              ariaLabel="版本进展"
              onChange={(progress) =>
                onChange((current) => ({
                  ...current,
                  summary: { ...current.summary, progress }
                }))
              }
            />
          </div>
          <div className="wb-card agenda-card" style={{ borderColor: 'var(--color-accent-300)' }}>
            <div className="block-title">
              <h2 style={{ fontSize: 13 }}>③ 当前版本目标</h2>
            </div>
            <PlanGoalList
              goals={data.plan.goals}
              placeholder="一句 SMART 目标"
              emptyText="还没有当前版本目标，点击下方添加。"
              onChange={(goals) =>
                onChange((current) => ({
                  ...current,
                  plan: { ...current.plan, goals }
                }))
              }
            />
            <button
              type="button"
              className="wb-btn wb-btn-ghost wb-btn-sm"
              onClick={() =>
                onChange((current) => ({
                  ...current,
                  plan: {
                    ...current.plan,
                    goals: [...current.plan.goals, newGoal(current.plan.goals)]
                  }
                }))
              }
            >
              ＋ 添加目标
            </button>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="block-title">
          <h2>会议评审记录</h2>
          <span className="wb-tag wb-tag-outline">
            {minutesStatusLabel(data.review.minutes.state, data.review.minutes.markdown)}
          </span>
        </div>
        <div className="wb-card minutes">
          <div className="minutes-filled">
            <div className="minutes-file-row">
              <div className="minutes-file-icon">记</div>
              <div>
                <strong>现场核心记录</strong>
                <div className="muted">记录当场对齐的决定与待办</div>
              </div>
            </div>
            <PlanText
              multiline
              value={data.review.live_notes}
              placeholder="决定了什么、原因是什么、谁来做；还有哪些分歧需要确认？"
              ariaLabel="现场核心记录"
              onChange={(live_notes) =>
                onChange((current) => ({
                  ...current,
                  review: { ...current.review, live_notes }
                }))
              }
            />
          </div>
        </div>
        <div className="wb-card minutes">
          <div className="minutes-filled">
            <div className="minutes-file-row">
              <div className="minutes-file-icon">纪</div>
              <div>
                <strong>会后会议纪要</strong>
                <div className="muted">可以直接填写，也可以在会话中请助手整理</div>
              </div>
            </div>
            <PlanText
              multiline
              value={data.review.minutes.markdown}
              placeholder="填写或粘贴整理后的纪要"
              ariaLabel="会议纪要"
              onChange={(markdown) =>
                onChange((current) => ({
                  ...current,
                  review: {
                    ...current.review,
                    minutes: {
                      ...current.review.minutes,
                      markdown,
                      state: markdown.trim() ? 'manual' : 'missing'
                    }
                  }
                }))
              }
            />
          </div>
        </div>
      </section>
    </div>
  )
}
