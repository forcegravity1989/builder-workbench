import { useFloatingTriggerPosition } from './use-floating-trigger-position'
import { PanelsTopLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FloatingTerminalIconContextMenu } from './FloatingTerminalIconContextMenu'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { useAppStore } from '@/store'
import { selectFloatingWorkspaceHasUnread } from '@/store/selectors'
import { translate } from '@/i18n/i18n'

export function FloatingTerminalToggleButton({
  open,
  onToggle
}: {
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  const shortcutLabel = useShortcutLabel('floatingTerminal.toggle')
  // Why: show an attention dot while minimized (closed) when any floating-
  // workspace tab still has an unacknowledged bell or agent completion. Derived
  // from the shared unread maps, so it clears when the user engages with — or
  // closes — the offending tab (see selectFloatingWorkspaceHasUnread).
  const hasFloatingUnread = useAppStore(selectFloatingWorkspaceHasUnread)
  const showAttentionDot = !open && hasFloatingUnread
  const { position, dragHandlers } = useFloatingTriggerPosition()

  return (
    <FloatingTerminalIconContextMenu
      currentLocation="floating-button"
      // Why: keep the toggle/minimize control above the z-[45] panel so it stays
      // clickable where the two overlap.
      className="fixed z-[46]"
      style={{ left: position.left, top: position.top }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            // Why: a parked launcher needs contrast against the page. On light
            // pages a soft drop shadow lifts it; on near-black dark surfaces a
            // drop shadow vanishes, so use a distinctly lighter fill plus a
            // bright hairline ring to define the edge.
            className="relative cursor-grab rounded-lg border-transparent text-foreground bg-card shadow-[0_4px_12px_rgb(0_0_0_/_0.22),0_0_0_1px_color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:-translate-y-0.5 hover:bg-accent active:translate-y-0 active:cursor-grabbing dark:bg-accent dark:shadow-[0_6px_16px_rgb(0_0_0_/_0.55),0_0_0_1px_rgb(255_255_255_/_0.22)] dark:hover:bg-[color-mix(in_srgb,var(--accent)_82%,white)]"
            data-floating-terminal-toggle
            aria-label={
              open
                ? translate(
                    'auto.components.floating.terminal.FloatingTerminalToggleButton.5785dd9148',
                    'Minimize floating workspace'
                  )
                : showAttentionDot
                  ? // Why: announce pending activity to assistive tech; the dot
                    // itself is aria-hidden decoration.
                    translate(
                      'auto.components.floating.terminal.FloatingTerminalToggleButton.4cb418b991',
                      'Show floating workspace, new activity'
                    )
                  : translate(
                      'auto.components.floating.terminal.FloatingTerminalToggleButton.3b04b065b5',
                      'Show floating workspace'
                    )
            }
            aria-pressed={open}
            {...dragHandlers}
            onClick={onToggle}
          >
            <PanelsTopLeft className="size-4" />
            {showAttentionDot ? (
              // Why: amber matches Orca's "needs attention / unread" convention
              // (the tab-unread bell); the ring matches the button fill so the
              // dot reads on both light (bg-card) and dark (dark:bg-accent).
              <span
                aria-hidden
                data-floating-terminal-attention
                className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-amber-500 ring-2 ring-card dark:ring-accent"
              />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={6}>
          {translate(
            'auto.components.floating.terminal.FloatingTerminalToggleButton.bfe7809a70',
            '{{value0}} floating workspace ({{value1}})',
            { value0: open ? 'Minimize' : 'Show', value1: shortcutLabel }
          )}
        </TooltipContent>
      </Tooltip>
    </FloatingTerminalIconContextMenu>
  )
}
