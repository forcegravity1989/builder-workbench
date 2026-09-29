import { ChevronRight, ListTodo } from 'lucide-react'

/**
 * Derived counts row: goal total, the real Issue snapshot distribution (never a
 * fabricated done-fraction — A05), and pending human decisions. Clicking the
 * Issue chip locates the snapshot section; it does not judge goal attainment.
 */
export function AcceptanceSummary({
  goals,
  pending,
  notMet,
  issueSummary,
  onIssues
}: {
  goals: number
  pending: number
  notMet: number
  issueSummary: string | null
  onIssues(): void
}) {
  return (
    <div className="va-summary">
      <span>
        <strong>{goals}</strong> 项目标
      </span>
      {issueSummary && (
        <button className="va-summary-issues" onClick={onIssues}>
          <ListTodo size={14} aria-hidden="true" />
          {issueSummary}
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}
      <span className="va-pending-count">
        {pending} 项待核对{notMet > 0 ? ` · ${notMet} 项未达` : ''}
      </span>
    </div>
  )
}
