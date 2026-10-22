import { BrainCircuit, Check, Pencil, Plus, X } from 'lucide-react'
import { useState, type Ref } from 'react'
import type { AcceptanceMeetingMinutes, AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import { BoardIconButton } from '../board-ui'

/**
 * Acceptance meeting minutes: the assistant summarizes board annotations and the
 * optional transcript into two fixed blocks (共识 / 遗留), a human confirms on the
 * card, and confirmation never rides on generation or editing. Unlike the plan
 * side there is no per-point closure mark — acceptance has no closure consumer,
 * its followups flow verbatim into the next plan's 会议遗留 row, so the section
 * carries no always-false field. Confirmation is revocable in the UI; while
 * confirmed the whole section is frozen against the model channel.
 */
export function AcceptanceMinutesSection({
  document,
  disabled,
  edit,
  onSendAction,
  sectionRef
}: {
  document?: AcceptanceMaterial
  disabled: boolean
  edit(next: AcceptanceMaterial): void
  onSendAction(prompt: string, label: string): void
  sectionRef: Ref<HTMLElement>
}) {
  const minutes = document?.minutes
  return (
    <section id="minutes" ref={sectionRef} aria-label="会议纪要">
      <div className="acc-section-title">
        <h2>
          会议纪要
          <small>
            {minutes ? (minutes.confirmed ? '已人工确认' : '待人工确认') : '未生成'} · 常驻可编辑
          </small>
        </h2>
        <span className="acc-title-actions">
          <BoardIconButton
            label="让验收助手整理纪要（可提供会议 ID）"
            disabled={!document}
            onClick={() =>
              onSendAction(
                '把板面批注与会议转写稿整理为会议纪要，按共识 / 遗留两块输出',
                '整理纪要请求'
              )
            }
          >
            <BrainCircuit size={16} aria-hidden="true" />
          </BoardIconButton>
        </span>
      </div>
      {document && minutes ? (
        <MinutesCard
          document={document}
          minutes={minutes}
          disabled={disabled}
          edit={edit}
        />
      ) : (
        <p className="acc-empty">
          尚未整理 · 可直接编辑或粘贴会议结论。批注从页头「批注模式」进入，点击目标或 Issue
          行记录；需要模型整理时用标题行的助手入口，或在会话中直说。
        </p>
      )}
    </section>
  )
}

function MinutesCard({
  document,
  minutes,
  disabled,
  edit
}: {
  document: AcceptanceMaterial
  minutes: AcceptanceMeetingMinutes
  disabled: boolean
  edit(next: AcceptanceMaterial): void
}) {
  const [editing, setEditing] = useState(false)
  const patchMinutes = (next: AcceptanceMeetingMinutes) => edit({ ...document, minutes: next })
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
          {minutes.sources && <span className="acc-muted">{minutes.sources}</span>}
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
        <div className="acc-minutes-section">
          <strong>共识</strong>
          {editing ? (
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
          ) : (
            <ul className="acc-points">
              {minutes.consensus.length ? (
                minutes.consensus.map((point, index) => <li key={index}>{point || '待填写'}</li>)
              ) : (
                <li className="acc-muted">无</li>
              )}
            </ul>
          )}
        </div>
        <div className="acc-minutes-section">
          <strong>
            遗留 <small>原样流入下版计划屏「会议遗留」，不设闭环状态</small>
          </strong>
          {editing ? (
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
          ) : (
            <ol className="acc-points">
              {minutes.followups.length ? (
                minutes.followups.map((point, index) => (
                  <li key={point.id}>
                    <span className="acc-id">M{index + 1}</span>
                    <span>{point.text || '待填写'}</span>
                  </li>
                ))
              ) : (
                <li className="acc-muted">无</li>
              )}
            </ol>
          )}
        </div>
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
          <span className="acc-muted">纪要经人工确认生效，生成或填写不自动等于确认；模型不代确认。</span>
        </div>
      </article>
    </fieldset>
  )
}
