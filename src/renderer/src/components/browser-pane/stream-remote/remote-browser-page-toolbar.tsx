import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  BrowserChromeToolbar,
  type BrowserChromeElementTools
} from '../assemble-chrome/browser-chrome-toolbar'
import BrowserAddressBar from '../assemble-chrome/BrowserAddressBar'
import type { BrowserAddressBarEditSessionBinding } from '../assemble-chrome/use-browser-address-bar-edit-session'
import type { BrowserPageDocLocation } from '../../../../../shared/browser-workspace-types'
import { RemoteRuntimeEgressIndicator } from '../assemble-chrome/browser-egress-indicator'
import type { MarkupModeController } from '../annotate/useMarkupMode'

export function RemoteBrowserPageToolbar({
  runtimeEnvironmentId,
  addressBarValue,
  onAddressBarChange,
  onSubmitAddressBar,
  onNavigateToUrl,
  onOpenWorkspaceDoc,
  addressBarInputRef,
  addressBarEditSession,
  busy,
  loading,
  markup,
  elementTools,
  frameUrl,
  isActive,
  onBack,
  onForward,
  onReload
}: {
  runtimeEnvironmentId: string
  addressBarValue: string
  onAddressBarChange: (value: string) => void
  onSubmitAddressBar: () => void
  onNavigateToUrl: (url: string) => void
  /** A previewed-document suggestion opens on a fresh grant instead of navigating the remote guest. */
  onOpenWorkspaceDoc: (docLocation: BrowserPageDocLocation) => void
  addressBarInputRef: React.RefObject<HTMLInputElement | null>
  addressBarEditSession: BrowserAddressBarEditSessionBinding
  busy: boolean
  loading: boolean
  markup: MarkupModeController
  elementTools: BrowserChromeElementTools
  frameUrl: string | null
  isActive: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
}): React.JSX.Element {
  return (
    <BrowserChromeToolbar
      controls={{
        // Why: remote pages report no history depth, so the arrows stay live and a
        // dead-end back/forward RPC is simply a no-op on the host.
        canGoBack: true,
        canGoForward: true,
        loading: busy || loading,
        goBack: onBack,
        goForward: onForward,
        reload: onReload,
        navigate: onNavigateToUrl
      }}
      addressSlot={
        <BrowserAddressBar
          value={addressBarValue}
          onChange={onAddressBarChange}
          onSubmit={onSubmitAddressBar}
          onNavigate={onNavigateToUrl}
          onOpenWorkspaceDoc={onOpenWorkspaceDoc}
          inputRef={addressBarInputRef}
          editSession={addressBarEditSession}
          leadingIcon={
            <RemoteRuntimeEgressIndicator
              runtimeEnvironmentId={runtimeEnvironmentId}
              presentation="streamed"
            />
          }
        />
      }
      reloadControl={
        // Why: no ignore-cache RPC exists for remote pages, and this pane binds no reload chord, so there is
        // nothing truthful to put in a menu or a shortcut hint here — tooltip only.
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={translate(
                'auto.components.browser.pane.BrowserPane.0e080d820e',
                'Reload'
              )}
              onClick={onReload}
            >
              {busy || loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {translate('auto.components.browser.pane.BrowserPane.0e080d820e', 'Reload')}
          </TooltipContent>
        </Tooltip>
      }
      elementTools={elementTools}
      markup={{
        active: markup.isActive,
        disabled: !frameUrl || elementTools.activeIntent !== null,
        onToggle: () => (markup.isActive ? markup.cancel() : void markup.start()),
        canShowDiscoveryHint: isActive
      }}
      // Why null: view-source and open-in-default-browser act on a local page; this one lives on the host.
      viewSource={null}
      openExternal={null}
      showTourAnchors
    />
  )
}
