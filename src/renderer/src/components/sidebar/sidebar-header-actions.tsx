import React from 'react'
import { FolderPlus, Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatOptionalPrimaryShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import SidebarWorkspaceOptionsMenu from './SidebarWorkspaceOptionsMenu'

function AddProjectButton({
  preserveWorkspaceBoardOpen
}: {
  preserveWorkspaceBoardOpen: boolean
}): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const label = translate('auto.components.sidebar.SidebarHeader.addProject', 'Add project')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          className="text-muted-foreground"
          aria-label={label}
          data-workspace-board-preserve-open={preserveWorkspaceBoardOpen ? '' : undefined}
          onClick={() => openModal('add-repo')}
        >
          <FolderPlus className="size-3.5" strokeWidth={2.25} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function NewWorkspaceButton({
  preserveWorkspaceBoardOpen
}: {
  preserveWorkspaceBoardOpen: boolean
}): React.JSX.Element {
  const keybindings = useAppStore((s) => s.keybindings)
  const openModal = useAppStore((s) => s.openModal)
  // Why primary: workspace.create binds both Mod+N and Mod+Shift+N, and listing
  // every alias in a one-line tooltip reads as noise rather than help.
  const shortcutLabel = formatOptionalPrimaryShortcutLabel('workspace.create', keybindings)
  const label = translate('auto.components.sidebar.SidebarHeader.92154beb7e', 'New workspace')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          className="text-muted-foreground"
          aria-label={label}
          data-workspace-board-preserve-open={preserveWorkspaceBoardOpen ? '' : undefined}
          onClick={() => openModal('new-workspace-composer', { telemetrySource: 'sidebar' })}
        >
          <Plus className="size-3.5" strokeWidth={2.25} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
        {shortcutLabel ? <span className="ml-1.5 text-background/60">{shortcutLabel}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}

export function SidebarHeaderActions({
  onWorkspaceBoardMenuOpenChange,
  agentsViewActive = false
}: {
  onWorkspaceBoardMenuOpenChange: (open: boolean) => void
  agentsViewActive?: boolean
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-1" data-sidebar-header-actions="">
      {/* Why both hidden in the agents view: it lists activity, not projects. */}
      {agentsViewActive ? null : (
        <>
          <SidebarWorkspaceOptionsMenu
            preserveWorkspaceBoardOpen
            onMenuOpenChange={onWorkspaceBoardMenuOpenChange}
          />
          <AddProjectButton preserveWorkspaceBoardOpen />
        </>
      )}
      <NewWorkspaceButton preserveWorkspaceBoardOpen />
    </div>
  )
}
