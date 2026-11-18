import { useCallback, useEffect, useState } from 'react'
import type { ShareListEntry } from '../../../../shared/workbench/share'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { reportShareFailure } from '../artifacts/artifact-publish-flow'
import { listShares, removeShare } from '../artifacts/share-server-client'
import { Button } from '../ui/button'

/** SSH shares key records by `["ssh", target, path]` JSON; local shares use a plain file path. */
function sharedFileLabel(sourceKey: string): string {
  try {
    const parsed: unknown = JSON.parse(sourceKey)
    if (Array.isArray(parsed) && parsed[0] === 'ssh' && typeof parsed[2] === 'string') {
      return `${fileBaseName(parsed[2])} · SSH ${String(parsed[1])}`
    }
  } catch {
    // Not JSON: a local file path.
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
export function ArtifactsSharedLinksSection(): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const [entries, setEntries] = useState<ShareListEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [removingKey, setRemovingKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listShares()
      .then((value) => {
        if (!cancelled) {
          setEntries(value)
        }
      })
      .catch((error) => {
        console.error('Failed to load shared files:', error)
        if (!cancelled) {
          setLoadError(
            translate(
              'auto.components.settings.artifacts.sharedLinksLoadFailed',
              'Could not load your shared files.'
            )
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

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
          reportShareFailure(result.error.code, result.error.message)
          return
        }
        setEntries(
          (current) => current?.filter((item) => item.sourceKey !== entry.sourceKey) ?? null
        )
      } catch (error) {
        console.error('Failed to remove shared link:', error)
        reportShareFailure('unknown', error instanceof Error ? error.message : String(error))
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

      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
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
