import { CalendarClock } from 'lucide-react'

/**
 * Page-header entry for the one-off automation configuration, shared by both
 * cycle boards. Deliberately not on the collaboration card: configuring the
 * weekly automation is not part of the weekly launch action. The plan board
 * passes its G3 text-button skin; acceptance keeps the default button look.
 */
export function AutomationConfigureButton({
  onConfigure,
  className = 'wb-btn wb-btn-ghost wb-btn-sm'
}: {
  onConfigure(): void
  className?: string
}) {
  return (
    <button type="button" className={className} title="打开原生自动化编辑器" onClick={onConfigure}>
      <CalendarClock size={13} aria-hidden="true" />
      配置自动化
    </button>
  )
}
