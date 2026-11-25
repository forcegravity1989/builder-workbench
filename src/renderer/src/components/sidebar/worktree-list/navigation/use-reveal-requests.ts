import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { Crosshair } from 'lucide-react'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT,
  type ScrollToCurrentWorkspaceRevealRequestDetail
} from '@/lib/scroll-to-current-workspace-status'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../../../shared/workbench/version-binding'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { isPinnedSectionWorktree } from '../../pinned-section-worktrees'
import {
  getVersionSidebarProjection,
  requestVersionTreeWorktreeReveal
} from '@/workbench/version-sidebar-state'
import type { WorktreeGroupBy } from '../grouping/row-types'
import { getKnownSidebarWorktreeById } from './folder-reveal'
import { resolveSidebarRevealRoute } from './version-tree-reveal-route'

function workspacePassesFilters(
  worktree: Worktree,
  worktrees: readonly Worktree[],
  folderWorkspaces: readonly FolderWorkspace[]
): boolean {
  const identity = getWorktreeHostIdentity(worktree)
  return (
    worktrees.some((candidate) => getWorktreeHostIdentity(candidate) === identity) ||
    folderWorkspaces.some((workspace) => folderWorkspaceKey(workspace.id) === worktree.id)
  )
}

// Turns a "show me the current workspace" request into whatever the sidebar must change
// first — grouping mode, active filters — before the viewport can scroll to it.
export type SidebarRevealRequestArgs = {
  groupBy: WorktreeGroupBy
  renderedSidebarRowKeys: ReadonlySet<string>
  visibleWorktrees: readonly Worktree[]
  visibleFolderWorkspaces: readonly FolderWorkspace[]
  currentSidebarWorktreeId: string | null
  currentSidebarExecutionHostId: ExecutionHostId | null
  worktreeMap: Map<string, Worktree>
  worktrees: readonly Worktree[]
  folderWorkspaces: readonly FolderWorkspace[]
  hasFilters: boolean
  clearFilters: () => void
  /** Pre-version-scoping filter results: the version tree shares these filters (#762). */
  filteredWorktrees: readonly Worktree[]
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
}

export function useSidebarRevealRequests(args: SidebarRevealRequestArgs): void {
  const {
    groupBy,
    renderedSidebarRowKeys,
    currentSidebarWorktreeId,
    currentSidebarExecutionHostId,
    worktreeMap,
    worktrees,
    folderWorkspaces,
    hasFilters,
    clearFilters,
    worktreeLineageById
  } = args
  const setGroupBy = useAppStore((s) => s.setGroupBy)
  const setSidebarBody = useAppStore((s) => s.setSidebarBody)
  const pendingRevealSidebarRow = useAppStore((s) => s.pendingRevealSidebarRow)
  const revealSidebarRow = useAppStore((s) => s.revealSidebarRow)
  const revealWorktreeInSidebar = useAppStore((s) => s.revealWorktreeInSidebar)
  const confirm = useConfirmationDialog()
  const confirmationPending = useRef(false)
  const latestArgs = useRef(args)
  useLayoutEffect(() => {
    latestArgs.current = args
  })

  useEffect(() => {
    if (!pendingRevealSidebarRow) {
      return
    }
    const rowKey = pendingRevealSidebarRow.rowKey
    const isProjectHeaderTarget =
      rowKey.startsWith('project-group:') ||
      rowKey.startsWith('project:') ||
      rowKey.startsWith('repo:')
    if (isProjectHeaderTarget && groupBy !== 'repo') {
      setGroupBy('repo')
      return
    }
    if (!renderedSidebarRowKeys.has(rowKey) && hasFilters) {
      clearFilters()
    }
  }, [
    clearFilters,
    groupBy,
    hasFilters,
    pendingRevealSidebarRow,
    renderedSidebarRowKeys,
    setGroupBy
  ])

  // Shared filter-confirmation gate for both reveal routes; reads the latest args after the
  // dialog closes so a workspace switch mid-dialog cannot clear filters for a stale target.
  const confirmFilterClearForReveal = useCallback(
    async (passesFilters: (latest: SidebarRevealRequestArgs) => boolean): Promise<boolean> => {
      if (!hasFilters || passesFilters(latestArgs.current)) {
        return true
      }
      if (confirmationPending.current) {
        return false
      }
      confirmationPending.current = true
      let confirmed: boolean
      try {
        confirmed = await confirm({
          icon: Crosshair,
          initialFocus: 'confirm',
          cancelVariant: 'ghost',
          title: translate('sidebar.revealFiltered.title', 'Reveal hidden workspace?'),
          description: translate(
            'sidebar.revealFiltered.description',
            'The active workspace is hidden in the sidebar. Revealing it will clear your sidebar filters.'
          ),
          confirmLabel: translate('sidebar.revealFiltered.confirm', 'Clear filters and reveal'),
          cancelLabel: translate('sidebar.revealFiltered.cancel', 'Keep filters')
        })
      } finally {
        confirmationPending.current = false
      }
      const latest = latestArgs.current
      if (
        !confirmed ||
        latest.currentSidebarWorktreeId !== currentSidebarWorktreeId ||
        latest.currentSidebarExecutionHostId !== currentSidebarExecutionHostId
      ) {
        return false
      }
      if (latest.hasFilters && !passesFilters(latest)) {
        latest.clearFilters()
      }
      return true
    },
    [confirm, hasFilters, currentSidebarWorktreeId, currentSidebarExecutionHostId]
  )

  const handleRevealCurrentWorkspaceRequest = useCallback(
    async (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as ScrollToCurrentWorkspaceRevealRequestDetail | undefined)
          : undefined
      if (detail?.target?.type === 'sidebar-row') {
        const sidebarDetail = detail as Extract<
          ScrollToCurrentWorkspaceRevealRequestDetail,
          { target: { type: 'sidebar-row' } }
        >
        revealSidebarRow(detail.target.rowKey, {
          behavior: 'smooth',
          highlight: sidebarDetail.highlight !== false
        })
        return
      }
      if (!currentSidebarWorktreeId) {
        return
      }
      const activeWorktree = getKnownSidebarWorktreeById(
        currentSidebarWorktreeId,
        worktreeMap,
        folderWorkspaces,
        worktrees,
        currentSidebarExecutionHostId
      )
      if (!activeWorktree || activeWorktree.isArchived) {
        return
      }
      // Version-bound unpinned trees live in the version tree (#500), so the native
      // renderRows can never contain them; route before the native filter confirmation.
      const versionProjection = getVersionSidebarProjection()
      const worktreeIdentity = getWorktreeHostIdentity(activeWorktree)
      // Why: read pin placement from the unfiltered catalog, not the filter-scoped Pinned
      // set, so a filter hiding a pinned version tree keeps it on its native Pinned path.
      const isPinnedVersionBound = isPinnedSectionWorktree(
        activeWorktree,
        worktrees,
        worktreeLineageById,
        worktreeMap
      )
      if (
        resolveSidebarRevealRoute({
          worktreeIdentity,
          versionTreeIdentities: versionProjection.worktreeIdentities,
          isPinnedVersionBound
        }) === 'version-tree'
      ) {
        const confirmed = await confirmFilterClearForReveal((latest) =>
          workspacePassesFilters(
            activeWorktree,
            latest.filteredWorktrees,
            latest.visibleFolderWorkspaces
          )
        )
        if (!confirmed) {
          return
        }
        const binding = normalizeStoredWorkbenchVersionBinding(
          activeWorktree.workbenchVersionBinding
        )
        if (!binding || !versionProjection.repoId) {
          return
        }
        // Why: the version tree lives in the workspaces body; under the Agents body it is
        // unmounted, so switch bodies first (same redirect the native reveal action does).
        setSidebarBody('workspaces')
        requestVersionTreeWorktreeReveal({
          repoId: versionProjection.repoId,
          version: binding.version,
          worktreeIdentity
        })
        return
      }
      // Collapsed groups hide rows without excluding their workspaces from the filter results.
      const confirmed = await confirmFilterClearForReveal((latest) =>
        workspacePassesFilters(
          activeWorktree,
          latest.visibleWorktrees,
          latest.visibleFolderWorkspaces
        )
      )
      if (!confirmed) {
        return
      }
      revealWorktreeInSidebar(currentSidebarWorktreeId, {
        behavior: 'smooth',
        highlight: true,
        beginRename: (detail as { beginRename?: boolean } | undefined)?.beginRename === true,
        executionHostId: currentSidebarExecutionHostId ?? undefined
      })
    },
    [
      confirmFilterClearForReveal,
      currentSidebarWorktreeId,
      currentSidebarExecutionHostId,
      folderWorkspaces,
      revealSidebarRow,
      worktreeLineageById,
      setSidebarBody,
      revealWorktreeInSidebar,
      worktreeMap,
      worktrees
    ]
  )

  useEffect(() => {
    window.addEventListener(
      SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT,
      handleRevealCurrentWorkspaceRequest
    )
    return () => {
      window.removeEventListener(
        SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT,
        handleRevealCurrentWorkspaceRequest
      )
    }
  }, [handleRevealCurrentWorkspaceRequest])
}
