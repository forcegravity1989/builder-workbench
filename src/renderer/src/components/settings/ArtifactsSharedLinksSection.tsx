import { useCallback, useEffect, useState } from 'react'
import type { ShareListEntry } from '../../../../shared/workbench/share'
import { useConfirmationDialog } from '@/components/dismiss/confirmation/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { reportShareFailure, shareErrorDescription } from '../artifacts/workbench-artifact-publish'
import { listShares, removeShare, ShareLinkError } from '../artifacts/share-server-client'
import { Button } from '../ui/button'

/**
 * Records are keyed by where the share came from: a plain path for a local file, or a JSON tuple
 * naming the remote surface — `["ssh", target, path]` from an SSH host, `["editor", environment,
 * host, path]` from a remote runtime editor (see `markdownArtifactSourceKey`).
 */
function sharedFileLabel(sourceKey: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(sourceKey)
  } catch {
    return fileBaseName(sourceKey)
  }
  if (!Array.isArray(parsed)) {
    return fileBaseName(sourceKey)
  }
  const [kind, ...rest] = parsed
  if (kind === 'ssh' && typeof rest[1] === 'string') {
    return `${fileBaseName(rest[1])} · SSH ${String(rest[0])}`
  }
  if (kind === 'editor' && typeof rest[2] === 'string') {
    const host = String(rest[1] ?? '')
    const environment = typeof rest[0] === 'string' ? rest[0] : null
    return `${fileBaseName(rest[2])} · ${environment ? `${host} · ${environment}` : host}`
  }
  // An unrecognized tuple still gets a readable name rather than a slice of raw JSON; the exact
  // key stays in the row's title attribute.
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    const part = parsed[index]
    if (typeof part === 'string') {
      return fileBaseName(part)
    }
  }
  return fileBaseName(sourceKey)
}

function fileBaseName(path: string): string {
  return path.split(/[\\/]/).at(-1) || path
}

/**
 * Files this computer published, with link removal. The host keeps the list, so this section
 * only renders on the host device; web clients see the pointer in ArtifactsSettingsPane.
 */
function deleteFailedTitle(): string {
  return translate(
    'auto.components.settings.artifacts.sharedLinksDeleteFailed',
    'Could not delete this shared link.'
  )
}

export function ArtifactsSharedLinksSection(): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const [entries, setEntries] = useState<ShareListEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    listShares()
      .then((value) => {
        if (!cancelled) {
          setEntries(value)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load shared files:', error)
        if (!cancelled) {
          // An unreadable record index has its own code, so the user learns the list may be
          // incomplete rather than seeing a generic failure — or a raw host message.
          setLoadError(
            error instanceof ShareLinkError
              ? shareErrorDescription(error.code, error.message)
              : translate(
                  'auto.components.settings.artifacts.sharedLinksLoadFailed',
                  'Could not load your shared files.'
                )
          )
          setEntries(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const remove = useCallback(
    async (entry: ShareListEntry): Promise<void> => {
      const confirmed = await confirm({
        title: translate(
          'auto.components.settings.artifacts.sharedLinksDeleteTitle',
          'Delete this shared link?'
        ),
        description: translate(
          'auto.components.settings.artifacts.sharedLinksDeleteDescription',
          'The link stops working for everyone immediately. Share the file again to create a new one.'
        ),
        confirmLabel: translate(
          'auto.components.settings.artifacts.sharedLinksDeleteConfirm',
          'Delete'
        ),
        confirmVariant: 'destructive'
      })
      if (!confirmed) {
        return
      }
      setRemovingKey(entry.sourceKey)
      try {
        const result = await removeShare(entry.sourceKey)
        if (!result.ok) {
          reportShareFailure(result.error.code, result.error.message, deleteFailedTitle())
          // A refused edit token drops the local record, so the row is gone even though the call
          // failed; reload instead of leaving a row that no longer matches the host.
          setReloadToken((token) => token + 1)
          return
        }
        setEntries(
          (current) => current?.filter((item) => item.sourceKey !== entry.sourceKey) ?? null
        )
      } catch (error) {
        console.error('Failed to remove shared link:', error)
        reportShareFailure(
          'unknown',
          error instanceof Error ? error.message : String(error),
          deleteFailedTitle()
        )
      } finally {
        setRemovingKey(null)
      }
    },
    [confirm]
  )

  return (
    <section className="space-y-3 py-5">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">
          {translate('auto.components.settings.artifacts.sharedLinksTitle', "Files you've shared")}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {translate(
            'auto.components.settings.artifacts.sharedLinksDescription',
            'Links this computer created. Deleting a link makes it stop working immediately.'
          )}
        </p>
      </div>

      {loadError ? (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{loadError}</p>
          <Button variant="outline" size="xs" onClick={() => setReloadToken((token) => token + 1)}>
            {translate('auto.components.settings.artifacts.sharedLinksRetry', 'Try again')}
          </Button>
        </div>
      ) : null}
      {!loadError && entries === null ? (
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.settings.artifacts.sharedLinksLoading', 'Loading…')}
        </p>
      ) : null}
      {entries?.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.artifacts.sharedLinksEmpty',
            'No shared files yet. Open an HTML or Markdown file and choose Share as artifact.'
          )}
        </p>
      ) : null}

      {entries && entries.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {entries.map((entry) => (
            <li key={entry.sourceKey} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={entry.sourceKey}>
                  {sharedFileLabel(entry.sourceKey)}
                </p>
                <a
                  className="block truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {entry.url}
                </a>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-destructive hover:text-destructive"
                disabled={removingKey !== null}
                onClick={() => void remove(entry)}
              >
                {removingKey === entry.sourceKey
                  ? translate('auto.components.settings.artifacts.sharedLinksDeleting', 'Deleting…')
                  : translate('auto.components.settings.artifacts.sharedLinksDelete', 'Delete')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
