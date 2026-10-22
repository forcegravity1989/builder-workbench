import { BrainCircuit, Check, Pencil, Plus, X } from 'lucide-react'
import { useState, type Ref, type ReactElement } from 'react'
import type {
  PlanMeetingMinutes,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { BoardActionButton, BoardIconButton } from '../board-ui'
import type { SendActionWrap } from '../plan-send-menu'

/**
 * 注入提示词设计正本（原型 g3-model.js minutesRequestPrompt，2026-10-22 第九轮瘦身）：
 * 按钮 prompt 只承载触发意图；落点 minutes 节、人工确认、闭环由人等 SOP 规则归
 * week-planning Skill 与系统提示词，按钮 prompt 不复述。
 */
const minutesRequestPrompt =
  '整理本次评审会的会议纪要：把会话中已发送的板面批注汇总为共识 / 遗留两块。需要语音转写稿就问我要一次会议 ID。'

/** 计划未建时「整理纪要」的禁用原因：title 与骨架卡脚部同一句，不留死按钮。 */
const PLAN_MISSING_REASON = '计划未建立 · 先在上方「与计划助手新建计划」'

/**
 * Meeting minutes section: the assistant summarizes online annotations and the
 * optional transcript into two fixed blocks (共识 / 遗留 with per-point closure
 * marks), a human confirms on the card, and confirmation never rides on
 * generation or editing. Closure = the plan was revised per that point — a
 * human-only mark, per the completion iron rule. With no minutes yet the area
 * shows the same-structure skeleton card (2026-10-22 真机反馈轮): stable,
 * predictable layout with the organize action on the card. No standalone
 *「adjust goals」action — after minutes the assistant's Skill SOP guides goal
 * adjustment with human confirmation (user decision 2026-10-22).
 */
export function PlanningMinutesSection({
  plan,
  disabled,
  edit,
  onSendAction,
  sectionRef
}: {
  plan?: PlanningMaterial
  disabled: boolean
  edit(next: PlanningMaterial): void
  onSendAction: SendActionWrap
  sectionRef: Ref<HTMLElement>
}) {
  const minutes = plan?.minutes
  const organizeButton = (
    <BoardActionButton disabled={!plan} title={plan ? undefined : PLAN_MISSING_REASON}>
      <BrainCircuit size={14} aria-hidden="true" /> 整理纪要
    </BoardActionButton>
  )
  return (
    <section id="minutes" ref={sectionRef} aria-label="会议纪要">
      <div className="g3-section-title">
        <h2>
          会议纪要
          <small>{minutes ? (minutes.confirmed ? '已人工确认' : '待人工确认') : '未生成'}</small>
        </h2>
        {plan && minutes ? (
          <span className="g3-title-actions">
            {onSendAction(minutesRequestPrompt, '整理纪要请求', organizeButton)}
          </span>
        ) : null}
      </div>
      {plan && minutes ? (
        <MinutesCard plan={plan} minutes={minutes} disabled={disabled} edit={edit} />
      ) : (
        <MinutesSkeleton
          planMissing={!plan}
          action={onSendAction(minutesRequestPrompt, '整理纪要请求', organizeButton)}
        />
      )}
    </section>
  )
}

/**
 * Empty-state skeleton: same two blocks as the generated card, dashed border.
 * 2026-10-22 第九轮减注释密度：占位条压细去边框、每块一条，说明只留脚部一句；
 * 计划未建时脚部与按钮 title 同为禁用原因。
 */
function MinutesSkeleton({ action, planMissing }: { action: ReactElement; planMissing: boolean }) {
  return (
    <article className="g3-minutes skeleton" aria-label="会议纪要（未生成）">
      <div className="g3-minutes-head">
        <span className="g3-status">未生成</span>
        <span className="g3-minutes-actions">{action}</span>
      </div>
      <div className="g3-minutes-section">
        <strong>共识</strong>
        <p className="g3-skeleton-line" aria-hidden="true" />
      </div>
      <div className="g3-minutes-section">
        <strong>遗留</strong>
        <p className="g3-skeleton-line" aria-hidden="true" />
      </div>
      <div className="g3-minutes-foot">
        <span className="g3-muted">
          {planMissing ? PLAN_MISSING_REASON : '由计划助手汇总评审会批注生成，经人工确认后生效。'}
        </span>
      </div>
    </article>
  )
}

function MinutesCard({
  plan,
  minutes,
  disabled,
  edit
}: {
  plan: PlanningMaterial
  minutes: PlanMeetingMinutes
  disabled: boolean
  edit(next: PlanningMaterial): void
}) {
  const [editing, setEditing] = useState(false)
  const patchMinutes = (next: PlanMeetingMinutes) => edit({ ...plan, minutes: next })
  const patchBody = (patch: Partial<PlanMeetingMinutes>) =>
    patchMinutes({ ...minutes, ...patch, updatedAt: new Date().toISOString() })

  const setConsensusPoint = (index: number, text: string) =>
    patchBody({ consensus: minutes.consensus.map((point, i) => (i === index ? text : point)) })
  const removeConsensusPoint = (index: number) =>
    patchBody({ consensus: minutes.consensus.filter((_, i) => i !== index) })
  const setFollowupText = (id: string, text: string) =>
    patchBody({
      followups: minutes.followups.map((point) => (point.id === id ? { ...point, text } : point))
    })
  const toggleFollowupClosed = (id: string) =>
    patchMinutes({
      ...minutes,
      followups: minutes.followups.map((point) =>
        point.id === id ? { ...point, closed: !point.closed } : point
      )
    })
  const removeFollowup = (id: string) =>
    patchBody({ followups: minutes.followups.filter((point) => point.id !== id) })

  return (
    <fieldset disabled={disabled} className="g3-minutes-fieldset">
      <article className="g3-minutes">
        <div className="g3-minutes-head">
          <span className={`g3-status${minutes.confirmed ? ' confirmed' : ''}`}>
            {minutes.confirmed ? '已人工确认' : '待人工确认'}
          </span>
          {minutes.sources && <span className="g3-muted">{minutes.sources}</span>}
          <span className="g3-minutes-actions">
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
        <div className="g3-minutes-section">
          <strong>共识</strong>
          {editing ? (
            <div className="g3-point-editor">
              {minutes.consensus.map((point, index) => (
                <div className="g3-point-edit-row" key={index}>
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
                className="g3-add-point"
                onClick={() => patchBody({ consensus: [...minutes.consensus, ''] })}
              >
                <Plus size={13} aria-hidden="true" /> 添加一点
              </button>
            </div>
          ) : (
            <ul className="g3-points">
              {minutes.consensus.length ? (
                minutes.consensus.map((point, index) => <li key={index}>{point || '待填写'}</li>)
              ) : (
                <li className="g3-muted">无</li>
              )}
            </ul>
          )}
        </div>
        <div className="g3-minutes-section">
          <strong>
            遗留 <small>闭环 = 版本计划已按该条修改，由人标记</small>
          </strong>
          {editing ? (
            <div className="g3-point-editor">
              {minutes.followups.map((point, index) => (
                <div className="g3-point-edit-row" key={point.id}>
                  <textarea
                    rows={2}
                    aria-label={`遗留第 ${index + 1} 点`}
                    value={point.text}
                    onChange={(event) => setFollowupText(point.id, event.target.value)}
                  />
                  <button
                    type="button"
                    className={`g3-followup-status${point.closed ? ' closed' : ''}`}
                    title="闭环 = 版本计划已按该条修改；由人标记"
                    onClick={() => toggleFollowupClosed(point.id)}
                  >
                    {point.closed ? '已闭环' : '未闭环'}
                  </button>
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
                className="g3-add-point"
                onClick={() =>
                  patchBody({
                    followups: [
                      ...minutes.followups,
                      { id: crypto.randomUUID(), text: '', closed: false }
                    ]
                  })
                }
              >
                <Plus size={13} aria-hidden="true" /> 添加一点
              </button>
            </div>
          ) : (
            <ul className="g3-points">
              {minutes.followups.length ? (
                minutes.followups.map((point) => (
                  <li key={point.id}>
                    <button
                      type="button"
                      className={`g3-followup-status${point.closed ? ' closed' : ''}`}
                      title="闭环 = 版本计划已按该条修改；由人标记"
                      onClick={() => toggleFollowupClosed(point.id)}
                    >
                      {point.closed ? '已闭环' : '未闭环'}
                    </button>
                    <span>{point.text || '待填写'}</span>
                  </li>
                ))
              ) : (
                <li className="g3-muted">无</li>
              )}
            </ul>
          )}
        </div>
        <div className="g3-minutes-foot">
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
          <span className="g3-muted">纪要独立保存，认可随归档 PR 评审表达。</span>
        </div>
      </article>
    </fieldset>
  )
}
