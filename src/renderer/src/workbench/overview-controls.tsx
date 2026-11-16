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
      className="wb-btn wb-btn-secondary wb-btn-sm wb-ov-icon"
      aria-label={label}
      title={label}
      disabled={busy}
      data-contextual-tour-target={tourTarget}
      onClick={onClick}
    >
      <RefreshCw size={14} className={busy ? 'wb-ov-refresh-spin' : undefined} />
    </button>
  )
}
