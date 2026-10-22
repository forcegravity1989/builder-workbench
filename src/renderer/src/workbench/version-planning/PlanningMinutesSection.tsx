import { BrainCircuit, Check, Pencil, Plus, X } from 'lucide-react'
import { useState, type Ref } from 'react'
import type {
  PlanMeetingMinutes,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { BoardIconButton } from '../board-ui'

/**
 * Meeting minutes section: the assistant summarizes online annotations and the
 * optional transcript into two fixed blocks (共识 / 遗留 with per-point closure
 * marks), a human confirms on the card, and confirmation never rides on
 * generation or editing. Closure = the plan was revised per that point — a
 * human-only mark, per the completion iron rule.
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
  onSendAction(prompt: string, label: string): void
  sectionRef: Ref<HTMLElement>
}) {
  const minutes = plan?.minutes
  return (
    <section id="minutes" ref={sectionRef} aria-label="会议纪要">
      <div className="g3-section-title">
        <h2>
          会议纪要
          <small>{minutes ? (minutes.confirmed ? '已人工确认' : '待人工确认') : '未生成'}</small>
        </h2>
        <span className="g3-title-actions">
          <BoardIconButton
            label="让计划助手整理纪要（可提供会议 ID）"
            disabled={!plan}
            onClick={() =>
              onSendAction(
                '把在线批注与会议转写稿整理为会议纪要，按共识 / 遗留两块输出',
                '整理纪要请求'
              )
            }
          >
            <BrainCircuit size={16} aria-hidden="true" />
          </BoardIconButton>
        </span>
      </div>
      {plan && minutes ? (
        <MinutesCard
          plan={plan}
          minutes={minutes}
          disabled={disabled}
          edit={edit}
          onSendAction={onSendAction}
        />
      ) : (
        <p className="g3-empty">
          会后由计划助手基于在线批注与可选转写稿生成；批注从页头「批注模式」进入，
          点击目标句、验收标准或 Issue 行等板面元素记录。
        </p>
      )}
    </section>
  )
}

function MinutesCard({
  plan,
  minutes,
  disabled,
  edit,
  onSendAction
}: {
  plan: PlanningMaterial
  minutes: PlanMeetingMinutes
  disabled: boolean
  edit(next: PlanningMaterial): void
  onSendAction(prompt: string, label: string): void
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
            <BoardIconButton
              label="与计划助手基于纪要调整目标"
              onClick={() =>
                onSendAction('基于已确认的会议纪要，与我逐条调整本版目标与计划', '调整请求')
              }
            >
              <BrainCircuit size={16} aria-hidden="true" />
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
