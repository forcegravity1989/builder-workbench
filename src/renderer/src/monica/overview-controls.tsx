import { RefreshCw } from 'lucide-react'

export function OverviewRefresh({
  label,
  busy,
  onClick,
  tourTarget
}: {
  label: string
  busy: boolean
  onClick(): void
  tourTarget?: string
}) {
  return (
    <button
      type="button"
      className="monica-btn monica-btn-secondary monica-btn-sm monica-ov-icon"
      aria-label={label}
      title={label}
      disabled={busy}
      data-contextual-tour-target={tourTarget}
      onClick={onClick}
    >
      <RefreshCw size={14} className={busy ? 'monica-ov-refresh-spin' : undefined} />
    </button>
  )
}
