import { useEffect, useId, useState, type ReactNode, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP } from '@/components/sidebar/worktree-list/viewport/virtual-rows'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'

const PREVIEW_LIMIT = 3
const rowSpacing = { rowGap: WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP }

export function VersionSidebarPreview({
  repoId,
  entries,
  activeVersion,
  activeContextKey,
  versionElements,
  renderRow,
  forceReveal = null
}: {
  repoId: string
  entries: readonly VersionCatalogEntry[]
  activeVersion: string | null
  activeContextKey: string
  versionElements: RefObject<Map<string, HTMLDivElement>>
  renderRow: (entry: VersionCatalogEntry) => ReactNode
  /** #762: a reveal request targeting an overflow version force-expands 更多版本. */
  forceReveal?: { version: string; sequence: number } | null
}): React.JSX.Element {
  const moreVersionsId = useId()
  const activeOlderVersion =
    entries.findIndex((entry) => entry.version === activeVersion) >= PREVIEW_LIMIT
      ? activeVersion
      : null
  const forcedOlderVersion =
    forceReveal &&
    entries.findIndex((entry) => entry.version === forceReveal.version) >= PREVIEW_LIMIT
      ? forceReveal
      : null
  // A fresh reveal request wins over the active-version auto-expand so an explicitly
  // collapsed 更多版本 reopens even when the active version is itself an overflow version.
  const revealKey = forcedOlderVersion
    ? `request:${forcedOlderVersion.version}:${forcedOlderVersion.sequence}`
    : activeOlderVersion
      ? `${activeOlderVersion}:${activeContextKey}`
      : null
  const [overflow, setOverflow] = useState({
    repoId,
    revealKey,
    expanded: revealKey !== null
  })
  if (overflow.repoId !== repoId || overflow.revealKey !== revealKey) {
    // Reveal a newly selected older version without reopening after an explicit collapse.
    setOverflow({
      repoId,
      revealKey,
      expanded: revealKey !== null || (overflow.repoId === repoId && overflow.expanded)
    })
  }

  const scrollTargetVersion = forcedOlderVersion?.version ?? activeOlderVersion ?? null
  useEffect(() => {
    if (!scrollTargetVersion) {
      return
    }
    const frame = requestAnimationFrame(() => {
      versionElements.current
        .get(scrollTargetVersion)
        ?.querySelector('button')
        ?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [scrollTargetVersion, revealKey, repoId, versionElements])

  const showMore = overflow.expanded
  const moreVersionCount = entries.length - PREVIEW_LIMIT
  return (
    <div className="flex min-w-0 flex-col" style={rowSpacing}>
      {entries.slice(0, PREVIEW_LIMIT).map(renderRow)}
      {moreVersionCount > 0 ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-expanded={showMore}
            aria-controls={moreVersionsId}
            className="ml-2 h-6 justify-start self-start px-1.5 text-[11px] font-normal text-muted-foreground hover:text-worktree-sidebar-accent-foreground"
            onClick={() => setOverflow({ ...overflow, expanded: !showMore })}
          >
            {showMore ? '收起更多版本' : `显示另外 ${moreVersionCount} 个版本`}
          </Button>
          <div
            id={moreVersionsId}
            hidden={!showMore}
            className={showMore ? 'flex min-w-0 flex-col' : undefined}
            style={rowSpacing}
          >
            {showMore ? entries.slice(PREVIEW_LIMIT).map(renderRow) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
