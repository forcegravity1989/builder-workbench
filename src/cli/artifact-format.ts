import type { ShareListEntry, SharePublishResult } from '../shared/workbench/share'

export function formatSharedLinkList(entries: readonly ShareListEntry[]): string {
  if (entries.length === 0) {
    return 'No shared artifacts.'
  }
  return entries
    .map(
      (entry) =>
        `${entry.sourceKey}\n  id: ${entry.id}\n  updated: ${entry.updatedAt}\n  expires: ${
          entry.expiresAt || 'never'
        }\n  url: ${entry.url}`
    )
    .join('\n\n')
}

export function formatSharedLinkResult(result: SharePublishResult): string {
  return result.url
}
