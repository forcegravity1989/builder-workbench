import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Loader2, Share2 } from 'lucide-react'
import type { ArtifactWriteRequest } from '../../../../shared/artifacts'
import type { ShareConfigView } from '../../../../shared/workbench/share'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ArtifactPublishedLinkPanel } from './ArtifactPublishedLinkPanel'
import { getPublishedArtifactLink } from './artifact-published-link-client'
import { publishArtifactFromSurface } from './artifact-publish-flow'
import { getShareConfig } from './share-server-client'

type PublishedLinkLookup = {
  key: string
  status: 'loading' | 'loaded' | 'error'
  shareUrl: string | null
}

export function ArtifactPublishButton({
  sourceKey,
  createRequest,
  className,
  disabled
}: {
  sourceKey: string
  createRequest: () => Promise<ArtifactWriteRequest>
  className?: string
  disabled?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [lookupRevision, setLookupRevision] = useState(0)
  const [linkLookup, setLinkLookup] = useState<PublishedLinkLookup | null>(null)
  const [config, setConfig] = useState<ShareConfigView | null>(null)
  const [configError, setConfigError] = useState(false)
  const lookupSequence = useRef(0)
  const popoverContentRef = useRef<HTMLDivElement>(null)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const configured = config?.configured === true

  useEffect(() => {
    // Why: the settings pane stays mounted while the popover closes, so the config must be
    // re-read on every open or a freshly saved server would still read as "not configured".
    if (!open) {
      return
    }
    setConfigError(false)
    let cancelled = false
    void getShareConfig()
      .then((value) => {
        if (!cancelled) {
          setConfig(value)
          setConfigError(false)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to read share service settings:', error)
        if (!cancelled) {
          setConfigError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [lookupRevision, open])

  useEffect(() => {
    const sequence = ++lookupSequence.current
    if (!open || !configured) {
      setLinkLookup(null)
      return
    }
    setLinkLookup({ key: sourceKey, status: 'loading', shareUrl: null })
    void getPublishedArtifactLink(sourceKey)
      .then((shareUrl) => {
        if (lookupSequence.current === sequence) {
          setLinkLookup({ key: sourceKey, status: 'loaded', shareUrl })
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to check published artifact link:', error)
        if (lookupSequence.current === sequence) {
          setLinkLookup({ key: sourceKey, status: 'error', shareUrl: null })
        }
      })
    return () => {
      lookupSequence.current += 1
    }
  }, [configured, lookupRevision, open, sourceKey])

  const publish = async (): Promise<void> => {
    if (publishing || !configured) {
      return
    }
    setPublishing(true)
    try {
      const result = await publishArtifactFromSurface(createRequest)
      if (result) {
        setLinkLookup({ key: sourceKey, status: 'loaded', shareUrl: result.url })
      }
    } finally {
      setPublishing(false)
    }
  }

  const openShareSettings = (): void => {
    setOpen(false)
    openSettingsTarget({ pane: 'artifacts', repoId: null })
    openSettingsPage()
  }

  const label = translate(
    'auto.components.artifacts.ArtifactPublishButton.a4a49da6af',
    'Share as artifact'
  )
  const currentLookup = linkLookup?.key === sourceKey ? linkLookup : null
  const checkingLink =
    configured && currentLookup?.status !== 'loaded' && currentLookup?.status !== 'error'
  const publishedLink = currentLookup?.status === 'loaded' ? currentLookup.shareUrl : null
  const busy = publishing

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !busy && setOpen(nextOpen)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn('shrink-0', className)}
              disabled={disabled || busy}
              aria-label={label}
            >
              {publishing ? <Loader2 className="animate-spin" /> : <Share2 />}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        ref={popoverContentRef}
        tabIndex={-1}
        align="end"
        sideOffset={6}
        className="w-80 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          popoverContentRef.current?.focus({ preventScroll: true })
        }}
      >
        <div className="space-y-1 border-b border-border/60 px-4 py-3.5">
          <h3 className="text-sm font-semibold">
            {translate(
              'auto.components.artifacts.ArtifactPublishButton.confirmTitle',
              'Share as artifact'
            )}
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">
            {publishedLink
              ? translate(
                  'auto.components.artifacts.ArtifactPublishButton.publishedDescription',
                  'Anyone with this link can view the shared file.'
                )
              : translate(
                  'auto.components.artifacts.ArtifactPublishButton.confirmDescription',
                  'This publishes the current file at a link anyone with the URL can view.'
                )}
          </p>
        </div>

        <div className="space-y-3 p-4">
          {configError ? (
            <div className="space-y-2">
              <p className="text-xs leading-5 text-muted-foreground">
                {translate(
                  'auto.components.artifacts.ArtifactPublishButton.configReadFailed',
                  'Could not read the share server settings.'
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setLookupRevision((current) => current + 1)}
              >
                {translate('auto.components.artifacts.ArtifactPublishButton.tryAgain', 'Try again')}
              </Button>
            </div>
          ) : !config ? (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {translate(
                'auto.components.artifacts.ArtifactPublishButton.loadingConfig',
                'Loading…'
              )}
            </div>
          ) : !configured ? (
            <div className="space-y-2">
              <div className="space-y-0.5">
                <p className="text-xs font-medium">
                  {translate(
                    'auto.components.artifacts.ArtifactPublishButton.serverNotConfiguredTitle',
                    'Share server is not configured'
                  )}
                </p>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {translate(
                    'auto.components.artifacts.ArtifactPublishButton.serverNotConfiguredDescription',
                    'Set the server address and upload token in Settings to create links.'
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={openShareSettings}
              >
                {translate(
                  'auto.components.artifacts.ArtifactPublishButton.openShareSettings',
                  'Open share settings'
                )}
                <ArrowRight />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setLookupRevision((current) => current + 1)}
              >
                {translate('auto.components.artifacts.ArtifactPublishButton.tryAgain', 'Try again')}
              </Button>
            </div>
          ) : checkingLink ? (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {translate(
                'auto.components.artifacts.ArtifactPublishButton.checkingLink',
                'Checking for an existing link…'
              )}
            </div>
          ) : currentLookup?.status === 'error' ? (
            <div className="space-y-2">
              <p className="text-xs leading-5 text-muted-foreground">
                {translate(
                  'auto.components.artifacts.ArtifactPublishButton.checkFailed',
                  'Could not check for an existing link.'
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setLookupRevision((current) => current + 1)}
              >
                {translate('auto.components.artifacts.ArtifactPublishButton.tryAgain', 'Try again')}
              </Button>
            </div>
          ) : publishedLink ? (
            <ArtifactPublishedLinkPanel
              key={publishedLink}
              shareUrl={publishedLink}
              publishing={publishing}
              sharingEnabled
              onUpdate={() => void publish()}
            />
          ) : (
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => void publish()}
            >
              {publishing ? <Loader2 className="animate-spin" /> : <Share2 />}
              {publishing
                ? translate('auto.components.artifacts.ArtifactPublishButton.sharing', 'Sharing…')
                : translate(
                    'auto.components.artifacts.ArtifactPublishButton.sharePublicLink',
                    'Generate link'
                  )}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
