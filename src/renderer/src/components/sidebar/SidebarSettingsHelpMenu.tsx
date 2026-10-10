import React, { useState } from 'react'
import { CircleHelp, Keyboard, Loader2, RefreshCw, RotateCw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useShortcutKeyDetails } from '@/hooks/useShortcutLabel'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { getUpdateCheckClickOptions, getUpdateCheckHint } from '@/lib/update-check-click-options'

const NO_UPDATE_CHECK_MODIFIERS = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
}

export function SidebarSettingsHelpMenu(): React.JSX.Element {
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const updateStatus = useAppStore((s) => s.updateStatus)

  const settingsShortcut = useShortcutKeyDetails('app.settings')
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const updateCheckModifiersRef = React.useRef(NO_UPDATE_CHECK_MODIFIERS)
  const mountedRef = useMountedRef()
  const updateCheckHint = getUpdateCheckHint()

  const handleMenuOpenChange = (open: boolean): void => {
    setMenuOpen(open)
    updateCheckModifiersRef.current = NO_UPDATE_CHECK_MODIFIERS
  }

  const handleRestartApp = (): void => {
    if (isRestarting) {
      return
    }
    setIsRestarting(true)
    toast.info(
      translate('auto.components.sidebar.SidebarSettingsHelpMenu.restartingApp', 'Restarting app…')
    )
    void window.api.app.restart().catch((error) => {
      if (mountedRef.current) {
        setIsRestarting(false)
        toast.error(
          translate(
            'auto.components.sidebar.SidebarSettingsHelpMenu.restartAppFailed',
            "Couldn't restart the app."
          ),
          {
            description: error instanceof Error ? error.message : undefined
          }
        )
      }
    })
  }

  const openShortcutsSettings = (): void => {
    openSettingsTarget({ pane: 'shortcuts', repoId: null })
    openSettingsPage()
  }

  const handleCheckForUpdatesPointerDown = (event: React.PointerEvent): void => {
    updateCheckModifiersRef.current = {
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    }
  }

  const handleCheckForUpdates = (): void => {
    const modifiers = updateCheckModifiersRef.current
    updateCheckModifiersRef.current = NO_UPDATE_CHECK_MODIFIERS
    void window.api.updater.check(getUpdateCheckClickOptions(modifiers))
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label={translate(
              'auto.components.sidebar.SidebarSettingsHelpMenu.a428c25998',
              'Settings'
            )}
            className="text-muted-foreground"
            onClick={openSettingsPage}
          >
            <Settings className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="flex items-center gap-1.5">
          {translate('auto.components.sidebar.SidebarSettingsHelpMenu.a428c25998', 'Settings')}
          {settingsShortcut.keys.length > 0 ? (
            <ShortcutKeyCombo
              keys={settingsShortcut.keys}
              doubleTap={settingsShortcut.doubleTap}
              className="gap-0.5"
              keyCapClassName="min-w-0 border-background/20 bg-background/10 px-1 py-0 text-[10px] text-background shadow-none"
              separatorClassName="text-[10px] text-background/70"
            />
          ) : null}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                aria-label={translate(
                  'auto.components.sidebar.SidebarSettingsHelpMenu.2991a0106c',
                  'Help'
                )}
                className="text-muted-foreground"
              >
                <CircleHelp className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {translate('auto.components.sidebar.SidebarSettingsHelpMenu.2991a0106c', 'Help')}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52">
          <DropdownMenuItem onSelect={openShortcutsSettings}>
            <Keyboard className="size-3.5" />
            {translate(
              'auto.components.sidebar.SidebarSettingsHelpMenu.e565171a7c',
              'Keyboard Shortcuts'
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
            onPointerDown={handleCheckForUpdatesPointerDown}
            onSelect={handleCheckForUpdates}
            title={updateCheckHint}
          >
            {updateStatus.state === 'checking' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {translate(
              'auto.components.sidebar.SidebarSettingsHelpMenu.29c56f30ee',
              'Check for Updates'
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleRestartApp} disabled={isRestarting}>
            <RotateCw className="size-3.5" />
            {translate('auto.components.sidebar.SidebarSettingsHelpMenu.restartApp', 'Restart App')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
