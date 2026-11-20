import { MessageSquarePlus } from 'lucide-react'

/**
 * Acceptance-side annotation badge: one merged entry per object rather than the
 * plan screen's per-number dots. Both screens share the annotation components and
 * the capture contract; the badge form is a per-screen choice (spec: 角标合并呈现
 * 为一个入口), and a meeting row with several annotations must not push the
 * row-end verdict buttons off the line.
 */
export function AcceptanceAnnotationBadge({
  numbers,
  label,
  onOpenPanel
}: {
  numbers: number[]
  label: string
  onOpenPanel(): void
}) {
  if (!numbers.length) {
    return null
  }
  return (
    <button
      type="button"
      className="acc-annot-badge"
      title="打开板面批注窗"
      aria-label={`${label} 的批注 ${numbers.length} 条`}
      onClick={onOpenPanel}
    >
      <MessageSquarePlus size={12} aria-hidden="true" />
      {numbers.join(',')}
    </button>
  )
}
