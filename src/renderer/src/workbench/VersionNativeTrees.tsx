import React, { useMemo } from 'react'
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
import { createHostScopedRepoOf } from '../../../shared/sidebar-list/sidebar-feed-index'
import { buildWorktreeOccurrencePlan } from '../../../shared/worktree-occurrence-plan'
import { getSidebarLineageChildren } from '../../../shared/sidebar-list/pinned-section-worktrees'
import { buildSidebarHostOptions } from '@/components/sidebar/sidebar-host-options'
import { appendWorktreeRows } from '../../../shared/sidebar-list/row-builders'
import type { Row } from '../../../shared/sidebar-list/row-types'
import { buildRenderableRows } from '@/components/sidebar/worktree-list/listing/renderable-rows'
import {
  renderWorktreeItemRow,
  renderWorktreeLineageDescendants,
  type WorktreeItemRowContext
} from '@/components/sidebar/worktree-list/rows/item-row'
import { WORKTREE_ROW_DRAG_INITIAL_STATE } from '@/components/sidebar/worktree-list/drag/row-state'
import { closeProjectPage } from './project-page-state'
import { isVersionHostDisconnected } from './version-worktree-host'

const EMPTY_SET = new Set<string>()
const EMPTY_MAP = new Map<string, never>()
const NOOP = () => {}

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
  const lineage = useAppStore((state) => state.worktreeLineageById)
  const collapsedGroups = useAppStore((state) => state.collapsedGroups)
  const toggleGroup = useAppStore((state) => state.toggleCollapsedGroup)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const sshTargetLabels = useAppStore((state) => state.sshTargetLabels)
  const sshConnectionStates = useAppStore((state) => state.sshConnectionStates)
  const runtimeEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((state) => state.runtimeStatusByEnvironmentId)
  const defaultHostId = getSettingsFocusedExecutionHostId(settings)
  const repoOf = useMemo(() => createHostScopedRepoOf(repos, repoMap), [repos, repoMap])
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
      rows: trees,
      identityOf: getWorktreeHostIdentity,
      childrenByParentIdentity: getSidebarLineageChildren(trees, lineage, worktreeMap),
      isPinned: () => false,
      duplicatePinned: false,
      sectionsOf: () => [{ key: sectionKey, items: trees }],
      projectIdOf: (tree) => tree.repoId
    })
    appendWorktreeRows(result, repoOf, plan, {
      collapsedGroups,
      groupDepth: 0,
      sectionKey,
      hostContextLabelByWorktreeIdentity: new Map(
        trees.map((tree) => [
          getWorktreeHostIdentity(tree),
          getHostContextLabel(getWorktreeExecutionHostId(tree, repoOf(tree), defaultHostId), {
            hostLabelById: hostLabels
          })
        ])
      )
    })
    return settings?.experimentalNewWorktreeCardStyle ? buildRenderableRows(result) : result
  }, [
    trees,
    repoMap,
    repoOf,
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
