import React, { createContext, useContext, useMemo } from 'react'
import { useAppStore } from '@/store'
import { useRepoMap, useWorktreeMap } from '@/store/selectors'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import {
  getSettingsFocusedExecutionHostId,
  getWorktreeExecutionHostId
} from '../../../shared/execution-host'
import { getHostContextLabel } from '../../../shared/worktree/host-context-labels'
import { getHostDisplayLabelOverrides } from '../../../shared/host-setting-overrides'
import { getCyclicProjectedWorktreeLineageIds } from '@/components/sidebar/worktree-lineage-projection'
import { buildSidebarHostOptions } from '@/components/sidebar/sidebar-host-options'
import { appendWorktreeRows } from '@/components/sidebar/worktree-list/grouping/row-builders'
import type { Row } from '@/components/sidebar/worktree-list/grouping/row-types'
import { buildRenderableRows } from '@/components/sidebar/worktree-list/listing/renderable-rows'
import {
  renderWorktreeItemRow,
  renderWorktreeLineageDescendants,
  type WorktreeItemRowContext
} from '@/components/sidebar/worktree-list/rows/item-row'
import { WORKTREE_ROW_DRAG_INITIAL_STATE } from '@/components/sidebar/worktree-list/drag/row-state'
import { closeProjectPage } from './project-page-state'
import { isVersionHostDisconnected } from './version-worktree-host'
import { buildWorktreeComparator, sortWorktreesSmart } from '@/components/sidebar/smart-sort'
import { getPinnedSectionWorktrees } from '@/components/sidebar/pinned-section-worktrees'
import { getPinnedWorktreeDisplayPolicy } from '@/components/sidebar/worktree-list/grouping/row-types'
import {
  computeVisibleWorktrees,
  type VisibleWorktreeOptions
} from '@/components/sidebar/visible-worktrees'

const EMPTY_SET = new Set<string>()
const EMPTY_MAP = new Map<string, never>()
const NOOP = () => {}
export type VersionTreeDisplayInput = {
  visibleWorktrees: readonly Worktree[]
  filterOptions: VisibleWorktreeOptions
  sortedIds: readonly string[]
  sortNow: number
}
const VersionTreeDisplayContext = createContext<
  (VersionTreeDisplayInput & { visibleIdentities: ReadonlySet<string> }) | null
>(null)

export function VersionTreeDisplayProvider({
  value,
  trees,
  children
}: {
  value: VersionTreeDisplayInput
  trees: readonly Worktree[]
  children: React.ReactNode
}): React.JSX.Element {
  const display = useMemo(() => {
    const worktreesByRepo: Record<string, Worktree[]> = {}
    for (const tree of trees) {
      const repoTrees = (worktreesByRepo[tree.repoId] ??= [])
      repoTrees.push(tree)
    }
    // Filter the whole catalog so an active child can retain its ancestor across directories.
    const visibleTrees = computeVisibleWorktrees(
      worktreesByRepo,
      value.sortedIds,
      value.filterOptions
    )
    return { ...value, visibleIdentities: new Set(visibleTrees.map(getWorktreeHostIdentity)) }
  }, [value, trees])
  return (
    <VersionTreeDisplayContext.Provider value={display}>
      {children}
    </VersionTreeDisplayContext.Provider>
  )
}

/** Business directories only select members; native rows own cards, hosts and sessions. */
export function VersionNativeTrees({
  trees,
  sectionKey
}: {
  trees: readonly Worktree[]
  sectionKey: string
}): React.JSX.Element {
  const repoMap = useRepoMap()
  const worktreeMap = useWorktreeMap()
  const repos = useAppStore((state) => state.repos)
  const settings = useAppStore((state) => state.settings)
  const nativeDisplay = useContext(VersionTreeDisplayContext)
  if (!nativeDisplay) {
    throw new Error('VersionNativeTrees requires the native sidebar display context')
  }
  const sortBy = useAppStore((state) => state.sortBy)
  const lineage = useAppStore((state) => state.worktreeLineageById)
  const displayedTrees = useMemo(() => {
    const filteredTrees = trees.filter((tree) =>
      nativeDisplay.visibleIdentities.has(getWorktreeHostIdentity(tree))
    )
    const source = nativeDisplay.visibleWorktrees
    const pinned =
      getPinnedWorktreeDisplayPolicy(settings) === 'single-location'
        ? new Set(
            getPinnedSectionWorktrees(source, lineage, worktreeMap).map(getWorktreeHostIdentity)
          )
        : new Set<string>()
    const rank = new Map(nativeDisplay.sortedIds.map((id, index) => [id, index]))
    const state = useAppStore.getState()
    const ordered =
      sortBy === 'smart'
        ? sortWorktreesSmart(
            filteredTrees,
            state.tabsByWorktree,
            repoMap,
            state.agentStatusByPaneKey,
            state.runtimePaneTitlesByTabId,
            state.ptyIdsByTabId,
            state.migrationUnsupportedByPtyId,
            state.terminalLayoutsByTabId
          )
        : filteredTrees.sort(
            buildWorktreeComparator(sortBy, repoMap, nativeDisplay.sortNow, new Map())
          )
    return ordered
      .filter((tree) => !pinned.has(getWorktreeHostIdentity(tree)))
      .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || 0)
  }, [nativeDisplay, trees, settings, lineage, worktreeMap, sortBy, repoMap])
  const collapsedGroups = useAppStore((state) => state.collapsedGroups)
  const toggleGroup = useAppStore((state) => state.toggleCollapsedGroup)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const sshTargetLabels = useAppStore((state) => state.sshTargetLabels)
  const sshConnectionStates = useAppStore((state) => state.sshConnectionStates)
  const runtimeEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((state) => state.runtimeStatusByEnvironmentId)
  const defaultHostId = getSettingsFocusedExecutionHostId(settings)
  const hostLabels = useMemo(
    () =>
      new Map(
        buildSidebarHostOptions({
          repos,
          settings,
          sshTargetLabels,
          sshConnectionStates,
          runtimeEnvironments,
          runtimeStatusByEnvironmentId,
          hostLabelOverrides: getHostDisplayLabelOverrides(settings)
        }).map((host) => [host.id, host.label])
      ),
    [
      repos,
      settings,
      sshTargetLabels,
      sshConnectionStates,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId
    ]
  )
  const rows = useMemo(() => {
    const result: Row[] = []
    appendWorktreeRows(result, [...displayedTrees], repoMap, lineage, worktreeMap, {
      nestLineage: true,
      collapsedGroups,
      groupDepth: 0,
      sectionKey,
      cyclicLineageIds: getCyclicProjectedWorktreeLineageIds(lineage, worktreeMap),
      hostContextLabelByWorktreeIdentity: new Map(
        displayedTrees.map((tree) => [
          getWorktreeHostIdentity(tree),
          getHostContextLabel(
            getWorktreeExecutionHostId(tree, repoMap.get(tree.repoId), defaultHostId),
            { hostLabelById: hostLabels }
          )
        ])
      )
    })
    return settings?.experimentalNewWorktreeCardStyle ? buildRenderableRows(result) : result
  }, [
    displayedTrees,
    repoMap,
    lineage,
    worktreeMap,
    collapsedGroups,
    sectionKey,
    defaultHostId,
    hostLabels,
    settings?.experimentalNewWorktreeCardStyle
  ])

  const context: WorktreeItemRowContext = {
    settings,
    groupBy: 'repo',
    folderBackedProjectGroupIds: EMPTY_SET,
    groupKeyByRowKey: EMPTY_MAP,
    groupIndexByRowKey: EMPTY_MAP,
    agentSendTargetWorktreeId: null,
    worktreeDragState: WORKTREE_ROW_DRAG_INITIAL_STATE,
    nativeLineageDropTargetId: null,
    activeWorktreeId,
    activeWorkspaceExecutionHostId: activeHostId,
    currentWorktreeId: activeWorktreeId,
    highlightedRevealRowKey: null,
    selectedWorktreeIds: EMPTY_SET,
    selectedWorktrees: [],
    getActiveSurfaceVariant: () => 'primary',
    getLineageToggleHandler: (key) => (event) => {
      event.stopPropagation()
      toggleGroup(key)
    },
    onSelectionGesture: (_event, tree) => {
      if (isVersionHostDisconnected(tree)) {
        return true
      }
      closeProjectPage()
      return false
    },
    onContextMenuSelect: (_event, tree) => [tree],
    onImmediateActivate: NOOP,
    onRowClickCapture: NOOP,
    onRowPointerDown: NOOP,
    onCardDragStart: NOOP,
    onCardDragEnd: NOOP
  }
  return (
    <div className="min-w-0" role="listbox" aria-label="版本工作区">
      {rows.map((row) => {
        if (row.type === 'lineage-group') {
          const parent = row.rows[0]
          if (!parent) {
            return null
          }
          const childIsActive = row.rows
            .slice(1)
            .some(
              (child) =>
                child.worktree.id === activeWorktreeId &&
                (!activeHostId ||
                  getWorktreeExecutionHostId(child.worktree, child.repo, defaultHostId) ===
                    activeHostId)
            )
          return renderWorktreeItemRow(
            context,
            parent,
            false,
            renderWorktreeLineageDescendants(context, parent, row.rows.slice(1)),
            childIsActive
          )
        }
        return row.type === 'item' ? renderWorktreeItemRow(context, row, false) : null
      })}
    </div>
  )
}
