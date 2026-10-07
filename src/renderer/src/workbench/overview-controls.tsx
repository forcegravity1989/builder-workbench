import { RefreshCw } from 'lucide-react'

export function OverviewGrain({
  label,
  value,
  onChange
}: {
  label: string
  value: 'day' | 'week'
  onChange(value: 'day' | 'week'): void
}) {
  return (
    <div className="wb-mz-seg" role="group" aria-label={label}>
      {(['week', 'day'] as const).map((grain) => (
        <button
          key={grain}
          type="button"
          aria-pressed={grain === value}
          onClick={() => onChange(grain)}
        >
          {grain === 'week' ? '周' : '天'}
        </button>
      ))}
    </div>
  )
}
export function OverviewRefresh({
  label,
  busy,
  onClick
}: {
  label: string
  busy: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      className="wb-btn wb-btn-secondary wb-btn-sm wb-ov-icon"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={onClick}
    >
      <RefreshCw size={14} className={busy ? 'wb-ov-refresh-spin' : undefined} />
    </button>
  )
}
