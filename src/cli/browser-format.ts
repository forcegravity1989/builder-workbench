import { formatBase64PayloadByteCount } from './base64-payload-byte-count'
import type {
  BrowserProfileListResult,
  BrowserScreenshotResult,
  BrowserSnapshotResult,
  BrowserTabCurrentResult,
  BrowserTabListResult,
  BrowserTabProfileCloneResult,
  BrowserTabProfileShowResult,
  BrowserTabShowResult
} from '../shared/runtime-types'

export function formatSnapshot(result: BrowserSnapshotResult): string {
  // Older runtimes leave url and title unset.
  const location = [result.title, result.url].filter(Boolean).join(' — ')
  const header = [`page: ${result.browserPageId}`, ...(location ? [location] : [])].join('\n')
  return `${header}\n${formatSnapshotBody(result.snapshot)}`
}

function formatSnapshotBody(snapshot: BrowserSnapshotResult['snapshot']): string {
  if (typeof snapshot === 'string') {
    return snapshot
  }
  if (snapshot.kind === 'full') {
    return `revision ${snapshot.revision} (whole tree)\n${snapshot.tree}`
  }
  if (snapshot.kind === 'unchanged') {
    return `revision ${snapshot.revision}: no change since revision ${snapshot.baseRevision}`
  }
  const change = snapshot.treeChange
  const summary = `revision ${snapshot.revision}: changes to revision ${snapshot.baseRevision}`
  if (!change) {
    return `${summary}; the tree lines are the same`
  }
  // 1-based so agents can count lines in the tree they already have.
  const first = change.startLine + 1
  const range =
    change.deleteCount === 1 ? `line ${first}` : `lines ${first}-${first + change.deleteCount - 1}`
  if (change.deleteCount === 0) {
    return [`${summary}; insert before line ${first}:`, ...change.lines].join('\n')
  }
  if (change.lines.length === 0) {
    return `${summary}; delete ${range}`
  }
  return [`${summary}; replace ${range} with:`, ...change.lines].join('\n')
}

export function formatScreenshot(result: BrowserScreenshotResult): string {
  return `Screenshot captured (${result.format}, ${formatBase64PayloadByteCount(result.data)})`
}

export function formatTabList(result: BrowserTabListResult): string {
  return formatTabListWithProfiles(result, false)
}

export function formatTabListWithProfiles(
  result: BrowserTabListResult,
  showProfile: boolean
): string {
  if (result.tabs.length === 0) {
    return 'No browser tabs open.'
  }
  return result.tabs
    .map((t) => {
      const marker = t.active ? '* ' : '  '
      const profile = showProfile ? `  [${t.profileLabel ?? t.profileId ?? 'Unknown'}]` : ''
      return `${marker}[${t.index}] ${t.browserPageId}  ${t.title} — ${t.url}${profile}`
    })
    .join('\n')
}

export function formatBrowserProfileList(result: BrowserProfileListResult): string {
  if (result.profiles.length === 0) {
    return 'No browser profiles found.'
  }
  return result.profiles
    .map((profile) => {
      const marker = profile.scope === 'default' ? '* ' : '  '
      const source = profile.source?.browserFamily ?? 'none'
      return `${marker}${profile.id}  ${profile.label}  ${profile.scope}  source:${source}`
    })
    .join('\n')
}

export function formatTabShow(result: BrowserTabShowResult | BrowserTabCurrentResult): string {
  const tab = result.tab
  return [
    `page: ${tab.browserPageId}`,
    `title: ${tab.title}`,
    `url: ${tab.url}`,
    `active: ${tab.active}`,
    `worktree: ${tab.worktreeId ?? 'unknown'}`,
    `profile: ${tab.profileLabel ?? tab.profileId ?? 'unknown'}`
  ].join('\n')
}

export function formatTabProfileShow(result: BrowserTabProfileShowResult): string {
  return [
    `page: ${result.browserPageId}`,
    `worktree: ${result.worktreeId ?? 'unknown'}`,
    `profileId: ${result.profileId ?? 'default'}`,
    `profile: ${result.profileLabel ?? result.profileId ?? 'default'}`
  ].join('\n')
}

export function formatTabProfileClone(result: BrowserTabProfileCloneResult): string {
  return `Cloned ${result.sourceBrowserPageId} to ${result.browserPageId} (${result.profileLabel ?? result.profileId ?? 'default'})`
}
