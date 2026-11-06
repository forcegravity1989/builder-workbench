import React, { useMemo } from 'react'
import { Pin } from 'lucide-react'
import { useAppStore } from '@/store'
import { useAllWorktrees, useWorktreeMap } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { getPinnedSectionWorktrees } from '@/components/sidebar/pinned-section-worktrees'
import { PINNED_GROUP_KEY } from '@/components/sidebar/worktree-list/grouping/group-keys'
import { useVersionSidebarProjection } from './version-sidebar-state'
import { VersionNativeTrees } from './VersionNativeTrees'

/**
 * #475 A 定稿：Orca 原生「已固定」栏目上移到第二列最上方。
 * 语义完全复用原生 isPinned（含固定祖先带入）；版本块内的树同样可固定进这里。
 * 固定只是多显示一份，原件仍留在原目标/工作区；取消固定只从栏目撤下。
 */
export function WorkbenchPinnedSection(): React.JSX.Element | null {
  const allWorktrees = useAllWorktrees()
  const worktreeMap = useWorktreeMap()
  const lineage = useAppStore((s) => s.worktreeLineageById)
  const activeRepoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const projection = useVersionSidebarProjection()
  const collapsedGroups = useAppStore((s) => s.collapsedGroups)
  const toggleGroup = useAppStore((s) => s.toggleCollapsedGroup)

  const projectTrees = useMemo(() => {
    if (!activeRepoId) {
      return []
    }
    const repoIds =
      projection.repoId === activeRepoId && projection.repoIds.length > 0
        ? new Set(projection.repoIds)
        : new Set([activeRepoId])
    return allWorktrees.filter((tree) => repoIds.has(tree.repoId))
  }, [allWorktrees, activeRepoId, projection])

  const pinned = useMemo(
    () => getPinnedSectionWorktrees(projectTrees, lineage, worktreeMap),
    [projectTrees, lineage, worktreeMap]
  )

  if (pinned.length === 0) {
    return null
  }

  const collapsed = collapsedGroups.has(PINNED_GROUP_KEY)

  return (
    <div className="wb-pinned flex shrink-0 flex-col" data-workbench-pinned>
      <button
        type="button"
        onClick={() => toggleGroup(PINNED_GROUP_KEY)}
        aria-expanded={!collapsed}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-semibold tracking-tight text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8"
      >
        <Pin className="size-3 shrink-0" />
        <span>已固定</span>
        <span className="text-[10px] font-normal text-worktree-sidebar-foreground/40">
          {pinned.length}
        </span>
      </button>
      {collapsed ? null : (
        <div className={cn('min-w-0')}>
          <VersionNativeTrees trees={pinned} sectionKey={PINNED_GROUP_KEY} />
        </div>
      )}
    </div>
  )
}
