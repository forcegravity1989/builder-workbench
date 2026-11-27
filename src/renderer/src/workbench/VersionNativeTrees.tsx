import React, { createContext, useContext, useMemo } from 'react'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/repos/use-repository-catalog'
import { useWorktreeMap } from '@/store/slices/worktrees/listing/use-worktree-catalog'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import {
  getSettingsFocusedExecutionHostId,
  getWorktreeExecutionHostId
} from '../../../shared/execution-host/execution-host'
import { getHostContextLabel } from '../../../shared/worktree/row-display/host-context-labels'
import { getHostDisplayLabelOverrides } from '../../../shared/execution-host/host-setting-overrides'
import { buildSidebarHostOptions } from '@/components/sidebar/worktree-list/controls/sidebar-host-options'
import { appendWorktreeRows } from '../../../shared/sidebar-list/sections/row-builders'
import { getPinnedWorktreeDisplayPolicy, type Row } from '../../../shared/sidebar-list/row-types'
import { buildWorktreeOccurrencePlan } from '../../../shared/sidebar-list/lineage/worktree-occurrence-plan'
import {
  getPinnedSectionWorktrees,
  getSidebarLineageChildren
} from '../../../shared/sidebar-list/lineage/pinned-section-worktrees'
import { useLineageRowProjection } from '@/components/sidebar/worktree-list/listing/lineage-row-projection'
import { buildRenderableRows } from '@/components/sidebar/worktree-list/listing/renderable-rows'
import {
  renderWorktreeItemRow,
  type WorktreeItemRowContext
} from '@/components/sidebar/worktree-list/rows/item-row'
import { WORKTREE_ROW_DRAG_INITIAL_STATE } from '@/components/sidebar/worktree-list/drag/row-state'
import { closeProjectPage } from './project-page-state'
import { isVersionHostDisconnected } from './version-worktree-host'

const EMPTY_SET = new Set<string>()
const EMPTY_MAP = new Map<string, never>()
const NOOP = () => {}
export type VersionTreeDisplayInput = {
  visibleWorktrees: readonly Worktree[]
}
const VersionTreeDisplayContext = createContext<
  | (VersionTreeDisplayInput & {
      rank: ReadonlyMap<string, number>
      highlightedRevealRowKey: string | null
    })
  | null
>(null)

export function VersionTreeDisplayProvider({
  value,
  highlightedRevealRowKey = null,
  children
}: {
  value: VersionTreeDisplayInput
  highlightedRevealRowKey?: string | null
  children: React.ReactNode
}): React.JSX.Element {
  const display = useMemo(
    () => ({
      ...value,
      highlightedRevealRowKey,
      rank: new Map(
        value.visibleWorktrees.map((tree, index) => [getWorktreeHostIdentity(tree), index])
      )
    }),
    [value, highlightedRevealRowKey]
  )
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
  const lineage = useAppStore((state) => state.worktreeLineageById)
  const displayedTrees = useMemo(() => {
    const source = nativeDisplay.visibleWorktrees
    const pinned =
      getPinnedWorktreeDisplayPolicy(settings) === 'single-location'
        ? new Set(
            getPinnedSectionWorktrees(source, lineage, worktreeMap).map(getWorktreeHostIdentity)
          )
        : new Set<string>()
    const { rank } = nativeDisplay
    return trees
      .filter((tree) => {
        const identity = getWorktreeHostIdentity(tree)
        return rank.has(identity) && !pinned.has(identity)
      })
      .sort(
        (a, b) =>
          (rank.get(getWorktreeHostIdentity(a)) ?? Infinity) -
          (rank.get(getWorktreeHostIdentity(b)) ?? Infinity)
      )
  }, [nativeDisplay, trees, settings, lineage, worktreeMap])
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
    const plan = buildWorktreeOccurrencePlan({
      rows: displayedTrees,
      childrenByParentIdentity: getSidebarLineageChildren(displayedTrees, lineage, worktreeMap),
      identityOf: getWorktreeHostIdentity,
      isPinned: () => false,
      duplicatePinned: false,
      sectionsOf: ({ natural }) => [{ key: sectionKey, items: natural }]
    })
    appendWorktreeRows(result, (tree) => repoMap.get(tree.repoId), plan, {
      collapsedGroups,
      groupDepth: 0,
      sectionKey,
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
    return buildRenderableRows(result)
  }, [
    displayedTrees,
    repoMap,
    lineage,
    worktreeMap,
    collapsedGroups,
    sectionKey,
    defaultHostId,
    hostLabels
  ])
  const { projection, activeFamilyRoots } = useLineageRowProjection({
    rows,
    groupBy: 'repo',
    newCardStyle: settings?.experimentalNewWorktreeCardStyle === true,
    activeWorktreeId,
    activeWorkspaceExecutionHostId: activeHostId
  })

  const context: WorktreeItemRowContext = {
    settings,
    groupBy: 'repo',
    groupKeyByRowKey: EMPTY_MAP,
    groupIndexByRowKey: EMPTY_MAP,
    agentSendTargetWorktreeId: null,
    worktreeDragState: WORKTREE_ROW_DRAG_INITIAL_STATE,
    nativeLineageDropTargetIdentity: null,
    activeWorktreeId,
    activeWorkspaceExecutionHostId: activeHostId,
    currentWorktreeId: activeWorktreeId,
    highlightedRevealRowKey: nativeDisplay.highlightedRevealRowKey,
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
      {rows.map((row, index) => {
        const frame = projection.frames[index]
        return row.type === 'item'
          ? renderWorktreeItemRow(context, row, frame, activeFamilyRoots.has(frame.root))
          : null
      })}
    </div>
  )
}
