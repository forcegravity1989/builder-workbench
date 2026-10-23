import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import { projectLegacyAcceptance } from './acceptance-legacy'

/**
 * Read-only block for material written before v10. The retired fields are real
 * human input — weekly round snapshots, meeting directives, per-goal deliveries
 * and progress — so they are shown rather than dropped, and labelled as what they
 * are. Nothing here is editable and nothing feeds a v10 verdict: the showcase
 * conclusion, the minutes and the carry marks all come from current fields only.
 * Converting the file on disk is a session action with human confirmation, the
 * same path schema2 migration uses; a read never rewrites stored material.
 */
export function AcceptanceLegacyRecords({
  document,
  goalLabel,
  onOpenMaterial
}: {
  document: AcceptanceMaterial
  goalLabel(goalId: string): string
  onOpenMaterial(location: string): void
}) {
  const legacy = projectLegacyAcceptance(document)
  const [open, setOpen] = useState(false)
  if (!legacy) {
    return null
  }
  const summary = [
    legacy.roundCount ? `${legacy.roundCount} 条轮次记录` : '',
    legacy.directiveCount ? `${legacy.directiveCount} 条会议指导` : '',
    legacy.riskCount ? `${legacy.riskCount} 个风险标记` : '',
    legacy.goals.some((goal) => goal.deliveries.length || goal.materials.length)
      ? '目标级交付件与材料链接'
      : '',
    legacy.goals.some((goal) => goal.progress) ? '人填进展' : ''
  ]
    .filter(Boolean)
    .join('、')
  return (
    <div className="acc-legacy">
      <button
        type="button"
        className="acc-legacy-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        <strong>旧格式记录（v10 前）</strong>
        <span className="acc-muted">{summary}</span>
      </button>
      {open && (
        <div className="acc-legacy-body">
          <p className="acc-legacy-note">
            v10 已退役字段，只读呈现，不参与结论、纪要或遗留回显；转换在会话中发起，经你确认后执行。
          </p>
          {legacy.goals.map((goal) => (
            <div className="acc-legacy-goal" key={goal.goalId}>
              <h3>{goalLabel(goal.goalId)}</h3>
              {goal.progress && (
                <p className="acc-legacy-row">
                  <span>进展</span>
                  <span className="acc-legacy-text">{goal.progress}</span>
                </p>
              )}
              {goal.deliveries.length > 0 && (
                <p className="acc-legacy-row">
                  <span>交付件</span>
                  <span className="acc-legacy-links">
                    {goal.deliveries.map((item, index) => (
                      <button
                        key={`${item.location}-${index}`}
                        type="button"
                        className="acc-link"
                        onClick={() => onOpenMaterial(item.location)}
                      >
                        {item.title || item.location}
                      </button>
                    ))}
                  </span>
                </p>
              )}
              {goal.materials.length > 0 && (
                <p className="acc-legacy-row">
                  <span>材料链接</span>
                  <span className="acc-legacy-links">
                    {goal.materials.map((item, index) => (
                      <button
                        key={`${item.url}-${index}`}
                        type="button"
                        className="acc-link"
                        onClick={() => onOpenMaterial(item.url)}
                      >
                        {item.label || item.url}
                      </button>
                    ))}
                  </span>
                </p>
              )}
              {goal.directives.length > 0 && (
                <div className="acc-legacy-row">
                  <span>会议指导</span>
                  <ul className="acc-legacy-list">
                    {goal.directives.map((item) => (
                      <li key={item.id}>
                        <span className="acc-legacy-text">{item.text}</span>
                        <span className="acc-muted">
                          {item.tag} · {item.status} · {item.source}
                          {item.sourceRef ? ` · ${item.sourceRef}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {goal.rounds.length > 0 && (
                <div className="acc-legacy-row">
                  <span>轮次</span>
                  <ul className="acc-legacy-list">
                    {goal.rounds.map((round) => (
                      <li key={round.id}>
                        <span className="acc-legacy-text">
                          {round.week} · {round.kind}
                        </span>
                        <span className="acc-muted">
                          {round.closedAt ? `封存于 ${round.closedAt}` : '未封存'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {goal.riskIssues.length > 0 && (
                <p className="acc-legacy-row">
                  <span>风险标记</span>
                  <span className="acc-muted">
                    {goal.riskIssues.join('、')}（风险能力已整体去掉，标记仅留档）
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
