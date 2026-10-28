import { RefreshCw } from 'lucide-react'

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
