import { BrainCircuit, Check, Pencil, Plus, X } from 'lucide-react'
import { useState, type Ref } from 'react'
import type {
  AcceptanceMeetingMinutes,
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { BoardActionButton, BoardIconButton } from '../board-ui'
import type { SendActionWrap } from '../plan-send-menu'

/**
 * Acceptance meeting minutes: the assistant summarizes board annotations and the
 * optional transcript into two fixed blocks (共识 / 遗留), a human confirms on the
 * card, and confirmation never rides on generation or editing. Followups name
 * their resolution or tracking Issue; confirmed text is a source for the next
 * plan, never an automatic task or commitment. Confirmation is revocable; while
 * confirmed the whole section is frozen against the model channel.
 *
 * #471: the read view groups entries under per-goal sections keyed by the
 * 「G<n> ·」 prefix — presentation only, the protocol stays a flat list and the
 * editor stays flat; followups keep their global M ids so next-plan citations
 * survive grouping. The foot's sync button pushes this page into the booked
 * meeting's minutes through the session; it needs a booked meeting first.
 */
/**
 * 注入提示词设计正本（对齐计划屏第九轮瘦身）：按钮 prompt 只承载触发意图；
 * 落点 minutes 节、人工确认、遗留无闭环位等 SOP 规则归 version-acceptance
 * Skill 与系统提示词，按钮 prompt 不复述。
 */
const minutesRequestPrompt =
  '整理本次验收会的会议纪要：把会话中已发送的板面批注提炼为共识 / 遗留两块。需要语音转写稿就问我要一次会议 ID。'
// 「同步会议纪要」（#471 评审新增，会议生命周期首片）：把本页共识/遗留按固定
// 样式写进已预订会议的纪要；固定样式与会议工具归 Skill，prompt 只承载触发意图。
const syncMinutesRequestPrompt =
  '把本页会议纪要的共识与遗留按固定样式同步到已预订的验收会议纪要中。'

/**
 * The always-present empty card. A human must be able to start the minutes
 * without the model writing a section first — otherwise the confirm action only
 * exists once the model channel has run, which inverts 完成由人确认.
 */
const EMPTY_MINUTES: AcceptanceMeetingMinutes = {
  consensus: [],
  followups: [],
  confirmed: false
}

// #471 批注5：读视图按目标分组。协议不动——共识/遗留仍是平铺清单，编辑态保持
// 平铺；条目带「G<n> ·」前缀（n 为目标序号，非协议里的真实 goalId）归入对应
// 节，读视图剥前缀；无前缀条目原样平铺在目标节之后，兜底不丢弃。
const GOAL_PREFIX = /^(G\d+)\s*·\s*(.+)$/

type MinutesGoalSection = {
  goalId: string | null
  title: string | null
  consensus: string[]
  followups: { mark: string; text: string }[]
}

function groupMinutesByGoal(
  minutes: AcceptanceMeetingMinutes,
  goals: PlanningMaterial['goals']
): MinutesGoalSection[] {
  // 骨架随固定计划先建：每个目标占一节，不依赖条目填入才出现；前缀指向未知
  // 目标时追加一节（title 空 → 显示「目标句待明确」），不丢条目。
  const sections: MinutesGoalSection[] = goals.map((goal, index) => ({
    goalId: `G${index + 1}`,
    title: goal.title,
    consensus: [],
    followups: []
  }))
  const loose: MinutesGoalSection = { goalId: null, title: null, consensus: [], followups: [] }
  const sectionFor = (goalId: string) => {
    let section = sections.find((item) => item.goalId === goalId)
    if (!section) {
      section = { goalId, title: null, consensus: [], followups: [] }
      sections.push(section)
    }
    return section
  }
  minutes.consensus.forEach((text) => {
    const match = GOAL_PREFIX.exec(text || '')
    if (match) {
      sectionFor(match[1]).consensus.push(match[2])
    } else {
      loose.consensus.push(text)
    }
  })
  // 遗留保留全局 M 编号：下一版计划屏按 M 编号引用条目，分组呈现不能改号。
  minutes.followups.forEach((point, index) => {
    const match = GOAL_PREFIX.exec(point.text || '')
    if (match) {
      sectionFor(match[1]).followups.push({ mark: `M${index + 1}`, text: match[2] })
    } else {
      loose.followups.push({ mark: `M${index + 1}`, text: point.text })
    }
  })
  // 无前缀条目并入无小标题的平铺节；无目标可读且两块全空（尚未整理）也保留
  // 一节显示「无」。
  if (loose.consensus.length || loose.followups.length || sections.length === 0) {
    sections.push(loose)
  }
  return sections
}

export function AcceptanceMinutesSection({
  document,
  goals,
  disabled,
  edit,
  onSendAction,
  sectionRef
}: {
  document?: AcceptanceMaterial
  goals: PlanningMaterial['goals']
  disabled: boolean
  edit(next: AcceptanceMaterial): void
  onSendAction: SendActionWrap
  sectionRef: Ref<HTMLElement>
}) {
  const minutes = document?.minutes
  return (
    <section id="minutes" ref={sectionRef} aria-label="会议纪要">
      <div className="acc-section-title">
        <h2>
          会议纪要
          <small>{minutes ? (minutes.confirmed ? '已人工确认' : '待人工确认') : '未生成'}</small>
        </h2>
        <span className="acc-title-actions">
          {/* 发送弹窗的触发件用纯 button（BoardActionButton），不用 BoardIconButton：
              后者内部已是 Radix TooltipTrigger，再套 DropdownMenuTrigger asChild 会让
              tooltip 与 dropdown 的 data-state / aria 属性互相覆盖。与计划屏同一做法。 */}
          {onSendAction(
            minutesRequestPrompt,
            '整理纪要请求',
            <BoardActionButton>
              <BrainCircuit size={14} aria-hidden="true" /> 整理纪要
            </BoardActionButton>
          )}
        </span>
      </div>
      <MinutesCard
        document={document}
        goals={goals}
        minutes={minutes ?? EMPTY_MINUTES}
        initialized={Boolean(minutes)}
        disabled={disabled || !document}
        edit={edit}
        onSendAction={onSendAction}
      />
    </section>
  )
}

function MinutesCard({
  document,
  goals,
  minutes,
  initialized,
  disabled,
  edit,
  onSendAction
}: {
  document?: AcceptanceMaterial
  goals: PlanningMaterial['goals']
  minutes: AcceptanceMeetingMinutes
  /** False while the section only exists as the empty placeholder. */
  initialized: boolean
  disabled: boolean
  edit(next: AcceptanceMaterial): void
  onSendAction: SendActionWrap
}) {
  const [editing, setEditing] = useState(false)
  const meeting = document?.meeting
  const patchMinutes = (next: AcceptanceMeetingMinutes) => {
    if (document) {
      edit({ ...document, minutes: next })
    }
  }
  const patchBody = (patch: Partial<AcceptanceMeetingMinutes>) =>
    patchMinutes({ ...minutes, ...patch, updatedAt: new Date().toISOString() })

  const setConsensusPoint = (index: number, text: string) =>
    patchBody({ consensus: minutes.consensus.map((point, i) => (i === index ? text : point)) })
  const removeConsensusPoint = (index: number) =>
    patchBody({ consensus: minutes.consensus.filter((_, i) => i !== index) })
  const setFollowupText = (id: string, text: string) =>
    patchBody({
      followups: minutes.followups.map((point) => (point.id === id ? { ...point, text } : point))
    })
  const removeFollowup = (id: string) =>
    patchBody({ followups: minutes.followups.filter((point) => point.id !== id) })

  return (
    <fieldset disabled={disabled} className="acc-minutes-fieldset">
      <article className="acc-minutes">
        <div className="acc-minutes-head">
          <span className={`acc-status${minutes.confirmed ? ' confirmed' : ''}`}>
            {minutes.confirmed ? '已人工确认' : '待人工确认'}
          </span>
          {minutes.sources ? (
            <span className="acc-muted">{minutes.sources}</span>
          ) : !initialized ? (
            // A UI hint, not material: it is never written into `sources`.
            <span className="acc-muted">尚未整理 · 可直接编辑或粘贴</span>
          ) : null}
          <span className="acc-minutes-actions">
            <BoardIconButton
              label={editing ? '结束编辑纪要' : '编辑纪要'}
              onClick={() => setEditing(!editing)}
            >
              {editing ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Pencil size={15} aria-hidden="true" />
              )}
            </BoardIconButton>
          </span>
        </div>
        {editing ? (
          <>
            <div className="acc-minutes-section">
              <strong>共识</strong>
              <div className="acc-point-editor">
                {minutes.consensus.map((point, index) => (
                  <div className="acc-point-edit-row" key={index}>
                    <textarea
                      rows={2}
                      aria-label={`共识第 ${index + 1} 点`}
                      value={point}
                      onChange={(event) => setConsensusPoint(index, event.target.value)}
                    />
                    <BoardIconButton
                      label={`删除共识第 ${index + 1} 点`}
                      onClick={() => removeConsensusPoint(index)}
                    >
                      <X size={15} aria-hidden="true" />
                    </BoardIconButton>
                  </div>
                ))}
                <button
                  type="button"
                  className="acc-add-point"
                  onClick={() => patchBody({ consensus: [...minutes.consensus, ''] })}
                >
                  <Plus size={13} aria-hidden="true" /> 添加一点
                </button>
              </div>
            </div>
            <div className="acc-minutes-section">
              <strong>遗留</strong>
              <div className="acc-point-editor">
                {minutes.followups.map((point, index) => (
                  <div className="acc-point-edit-row" key={point.id}>
                    <textarea
                      rows={2}
                      aria-label={`遗留第 ${index + 1} 点`}
                      value={point.text}
                      onChange={(event) => setFollowupText(point.id, event.target.value)}
                    />
                    <BoardIconButton
                      label={`删除遗留第 ${index + 1} 点`}
                      onClick={() => removeFollowup(point.id)}
                    >
                      <X size={15} aria-hidden="true" />
                    </BoardIconButton>
                  </div>
                ))}
                <button
                  type="button"
                  className="acc-add-point"
                  onClick={() =>
                    patchBody({
                      followups: [...minutes.followups, { id: crypto.randomUUID(), text: '' }]
                    })
                  }
                >
                  <Plus size={13} aria-hidden="true" /> 添加一点
                </button>
              </div>
            </div>
          </>
        ) : (
          groupMinutesByGoal(minutes, goals).map((section) => (
            <section className="acc-minutes-goal" key={section.goalId || 'plain'}>
              {section.goalId ? (
                <h4>
                  <span className="acc-minutes-goal-id">{section.goalId}</span>
                  {section.title || '目标句待明确'}
                </h4>
              ) : null}
              <div className="acc-minutes-sub">
                <strong>共识</strong>
                <ul className="acc-points">
                  {section.consensus.length ? (
                    section.consensus.map((text, index) => <li key={index}>{text || '待填写'}</li>)
                  ) : (
                    <li className="acc-muted">无</li>
                  )}
                </ul>
              </div>
              <div className="acc-minutes-sub">
                <strong>遗留</strong>
                <ul className="acc-points">
                  {section.followups.length ? (
                    section.followups.map((item) => (
                      <li key={item.mark}>
                        <span className="acc-id">{item.mark}</span>
                        <span>{item.text || '待填写'}</span>
                      </li>
                    ))
                  ) : (
                    <li className="acc-muted">无</li>
                  )}
                </ul>
              </div>
            </section>
          ))
        )}
        <div className="acc-minutes-foot">
          <button
            type="button"
            onClick={() =>
              patchMinutes(
                minutes.confirmed
                  ? { ...minutes, confirmed: false, confirmedAt: undefined }
                  : { ...minutes, confirmed: true, confirmedAt: new Date().toISOString() }
              )
            }
          >
            {minutes.confirmed ? '已人工确认 · 撤销' : '标记人工确认'}
          </button>
          {/* 同步会议纪要（#471 评审新增，会议生命周期首片）：把本页共识/遗留按
              固定样式写进已预订会议的纪要；未预订不可同步。固定样式与会议工具
              归 Skill。 */}
          {onSendAction(
            syncMinutesRequestPrompt,
            '同步纪要请求',
            <BoardActionButton
              disabled={!meeting}
              title={
                meeting
                  ? `把本页纪要按固定样式同步到「${meeting.title}」的会议纪要`
                  : '先在验收准备区预订会议'
              }
            >
              <BrainCircuit size={14} aria-hidden="true" /> 同步会议纪要
            </BoardActionButton>
          )}
          <span className="acc-muted">
            归档前逐条写明落实结果或跟进 Issue，由助手核对、人在 PR 中确认。
          </span>
        </div>
      </article>
    </fieldset>
  )
}
