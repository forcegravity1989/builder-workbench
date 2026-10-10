import { Settings } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SettingsSwitch } from '../settings/SettingsFormControls'
import { translate } from '@/i18n/i18n'

type AgentDashboardSettingsMenuProps = {
  /** Lets the host keep the companion board open while this menu owns the
   *  next outside click, matching the workspace board's menu handling. */
  onOpenChange: (open: boolean) => void
}

/** Board-header settings for the in-window Agent Dashboard, mirroring the
 *  workspace board's settings menu. */
export function AgentDashboardSettingsMenu({
  onOpenChange
}: AgentDashboardSettingsMenuProps): React.JSX.Element {
  const showIdle = useAppStore((s) => s.settings?.experimentalAgentDashboardShowIdle === true)
  const updateSettings = useAppStore((s) => s.updateSettings)

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('dashboardPopout.settingsLabel', 'Agent Dashboard settings')}
              className="text-muted-foreground"
            >
              <Settings className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {translate('dashboardPopout.settingsTooltip', 'Board settings')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={8} collisionPadding={8} className="w-72 p-2">
        <div className="flex items-start justify-between gap-3 rounded-md px-1.5 py-1.5">
          <span className="min-w-0 space-y-0.5">
            <span className="block text-[12px] font-medium leading-4 text-foreground">
              {translate('dashboardPopout.settings.showIdle', 'Show idle agents')}
            </span>
            <span className="block text-[11px] leading-4 text-muted-foreground">
              {translate(
                'dashboardPopout.settings.showIdleCopy',
                'Include agents that have gone quiet for 30 minutes without reporting completion. Hidden by default.'
              )}
            </span>
          </span>
          <SettingsSwitch
            checked={showIdle}
            onChange={() => {
              void updateSettings({ experimentalAgentDashboardShowIdle: !showIdle })
            }}
            ariaLabel={translate('dashboardPopout.settings.showIdle', 'Show idle agents')}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
