import type { AcceptanceHistoryChoice } from './use-acceptance-history'

export function AcceptanceRoundPicker({
  value,
  currentWeek,
  choices,
  onChange
}: {
  value: string
  currentWeek?: string
  choices: AcceptanceHistoryChoice[]
  onChange(value: string): void
}) {
  return (
    <section className="va-round-block" aria-label="验收轮次">
      <div className="va-round-picker">
        <strong>验收轮次</strong>
        <select
          aria-label="验收周次"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="current">当前{currentWeek ? ` · ${currentWeek}` : '材料'}</option>
          {choices.map((choice) => (
            <option key={choice.key} value={choice.key}>
              历史 · {choice.label}
            </option>
          ))}
        </select>
        <span className="va-muted">{value === 'current' ? '当前轮' : '历史整页只读'}</span>
      </div>
    </section>
  )
}
