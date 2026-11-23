import { useEffect, useRef, useState } from 'react'
import { Loader2, Share2 } from 'lucide-react'
import type { ArtifactWriteRequest } from '../../../../shared/artifacts'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import { cn } from '@/lib/utils'
import { ArtifactPublishedLinkPanel } from './ArtifactPublishedLinkPanel'
import { getPublishedArtifactLink } from './artifact-published-link-client'
import { publishArtifactFromSurface, reportShareFailure } from './artifact-publish-flow'
import { removeShare } from './share-server-client'

type PublishedLinkLookup = {
  key: string
  status: 'loading' | 'loaded' | 'error'
  shareUrl: string | null
}

function removeFailedTitle(): string {
  return translate(
    'auto.components.artifacts.ArtifactPublishButton.removeFailed',
    'Could not remove the link.'
  )
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
  const [removing, setRemoving] = useState(false)
  const [lookupRevision, setLookupRevision] = useState(0)
  const [linkLookup, setLinkLookup] = useState<PublishedLinkLookup | null>(null)
  const lookupSequence = useRef(0)
  const popoverContentRef = useRef<HTMLDivElement>(null)
  // Links live on the host, so a browser client gets the pointer instead of a doomed lookup and a
  // "Try again" that can never succeed.
  const webOnly = isWebClientLocation()

  useEffect(() => {
    const sequence = ++lookupSequence.current
    if (!open || webOnly) {
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
  }, [lookupRevision, open, sourceKey, webOnly])

  const publish = async (): Promise<void> => {
    if (publishing) {
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

  const remove = async (): Promise<void> => {
    if (removing) {
      return
    }
    setRemoving(true)
    try {
      const result = await removeShare(sourceKey)
      if (!result.ok) {
        reportShareFailure(result.error.code, result.error.message, removeFailedTitle())
        // stale-record means the host already dropped the local record, so the panel must stop
        // showing a link this machine can no longer manage; sharing again creates a fresh one.
        if (result.error.code === 'stale-record') {
          setLinkLookup({ key: sourceKey, status: 'loaded', shareUrl: null })
        }
        return
      }
      setLinkLookup({ key: sourceKey, status: 'loaded', shareUrl: null })
    } catch (error) {
      // Why: the runtime bridge can fail before the host answers; without this the panel just
      // stops spinning and the rejection goes unhandled. The transport detail goes to the console —
      // a notification carries the outcome and the next step, not an internal exception message.
      console.error('Failed to remove shared artifact link:', error)
      reportShareFailure(
        'unknown',
        error instanceof Error ? error.message : String(error),
        removeFailedTitle()
      )
    } finally {
      setRemoving(false)
    }
  }

  const label = translate(
    'auto.components.artifacts.ArtifactPublishButton.a4a49da6af',
    'Share as artifact'
  )
  const currentLookup = linkLookup?.key === sourceKey ? linkLookup : null
  const checkingLink = currentLookup?.status !== 'loaded' && currentLookup?.status !== 'error'
  const publishedLink = currentLookup?.status === 'loaded' ? currentLookup.shareUrl : null
  const busy = publishing || removing

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
            {webOnly
              ? translate(
                  'auto.components.artifacts.ArtifactPublishButton.webOnly',
                  'Desktop only. Open this file on the host device to share it.'
                )
              : publishedLink
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

        {webOnly ? null : (
          <div className="space-y-3 p-4">
            {checkingLink ? (
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
                  {translate(
                    'auto.components.artifacts.ArtifactPublishButton.tryAgain',
                    'Try again'
                  )}
                </Button>
              </div>
            ) : publishedLink ? (
              <ArtifactPublishedLinkPanel
                key={publishedLink}
                shareUrl={publishedLink}
                publishing={publishing}
                removing={removing}
                onUpdate={() => void publish()}
                onRemove={() => void remove()}
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
        )}
      </PopoverContent>
    </Popover>
  )
}
