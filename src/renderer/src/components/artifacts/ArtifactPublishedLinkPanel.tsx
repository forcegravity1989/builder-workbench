import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { copyArtifactLink, openArtifactInBrowser } from './artifact-link-actions'

export function ArtifactPublishedLinkPanel({
  shareUrl,
  publishing,
  removing,
  onUpdate,
  onRemove
}: {
  shareUrl: string
  publishing: boolean
  removing: boolean
  onUpdate: () => void
  onRemove: () => void
}): React.JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedResetTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(false)
  const wasRemovingRef = useRef(false)

  // The confirmation stays open while the removal runs so its spinner is the progress indicator.
  // A success replaces this panel with the share button; a failure keeps it and shows a toast.
  useEffect(() => {
    if (wasRemovingRef.current && !removing) {
      setConfirmingRemove(false)
    }
    wasRemovingRef.current = removing
  }, [removing])

  const clearCopiedResetTimer = useCallback((): void => {
    if (copiedResetTimerRef.current !== null) {
      window.clearTimeout(copiedResetTimerRef.current)
      copiedResetTimerRef.current = null
    }
  }, [])
  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      mountedRef.current = node !== null
      if (!node) {
        clearCopiedResetTimer()
      }
    },
    [clearCopiedResetTimer]
  )

  const copyLink = async (): Promise<void> => {
    if (!(await copyArtifactLink(shareUrl, { showSuccessToast: false }))) {
      return
    }
    if (!mountedRef.current) {
      return
    }
    setCopied(true)
    clearCopiedResetTimer()
    copiedResetTimerRef.current = window.setTimeout(() => {
      copiedResetTimerRef.current = null
      setCopied(false)
    }, 1_500)
  }

  const copyLabel = copied
    ? translate('auto.components.artifacts.copySuccess', 'Artifact link copied')
    : translate('auto.components.artifacts.ArtifactPublishedLinkPanel.copyLink', 'Copy link')

  return (
    <div ref={setPanelRef} className="space-y-3">
      <div className="flex min-w-0 items-center gap-0.5">
        <p
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
          title={shareUrl}
        >
          {shareUrl}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => void copyLink()}
              aria-label={copyLabel}
            >
              {copied ? <Check className="size-3.5" /> : <Copy />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {copyLabel}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => openArtifactInBrowser(shareUrl)}
              aria-label={translate(
                'auto.components.artifacts.ArtifactPublishedLinkPanel.openLink',
                'Open link'
              )}
            >
              <ExternalLink />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {translate(
              'auto.components.artifacts.ArtifactPublishedLinkPanel.openLink',
              'Open link'
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={publishing || removing}
        onClick={onUpdate}
      >
        {publishing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {publishing
          ? translate('auto.components.artifacts.ArtifactPublishedLinkPanel.updating', 'Updating…')
          : translate(
              'auto.components.artifacts.ArtifactPublishedLinkPanel.update',
              'Update shared content'
            )}
      </Button>

      {confirmingRemove ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
          <p className="text-xs leading-5">
            {translate(
              'auto.components.artifacts.ArtifactPublishedLinkPanel.removeConfirm',
              'Remove this link? Anyone holding it will lose access.'
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={removing}
              onClick={onRemove}
            >
              {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {translate(
                'auto.components.artifacts.ArtifactPublishedLinkPanel.remove',
                'Remove link'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={removing}
              onClick={() => setConfirmingRemove(false)}
            >
              {translate(
                'auto.components.artifacts.ArtifactPublishedLinkPanel.cancelRemove',
                'Cancel'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-destructive"
          disabled={publishing || removing}
          onClick={() => setConfirmingRemove(true)}
        >
          <Trash2 />
          {translate('auto.components.artifacts.ArtifactPublishedLinkPanel.remove', 'Remove link')}
        </Button>
      )}
    </div>
  )
}
