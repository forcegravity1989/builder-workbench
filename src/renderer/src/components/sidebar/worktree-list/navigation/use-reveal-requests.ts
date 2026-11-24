import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useConfirmationDialog } from '@/components/dismiss/confirmation/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import {
  SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT,
  type ScrollToCurrentWorkspaceRevealRequestDetail
} from '@/lib/workspace/navigation/scroll-to-current-workspace-status'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspaces/folder-workspace-types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { ExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { folderWorkspaceKey } from '../../../../../../shared/workspace/identity/workspace-scope'
import type { WorktreeGroupBy } from '../../../../../../shared/sidebar-list/row-types'
import { getKnownSidebarWorktreeById } from './folder-reveal'
import { readSidebarRevealTarget } from '../../sidebar-reveal-target-state'
import { requestVersionTreeWorktreeReveal } from '@/workbench/version-sidebar-state'
import { getVersionTreeRevealTarget } from './version-tree-reveal-target'

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

// Adjust grouping and filters before scheduling the requested workspace’s viewport reveal.
export function useSidebarRevealRequests(args: {
  groupBy: WorktreeGroupBy
  renderedSidebarRowKeys: ReadonlySet<string>
  visibleWorktrees: readonly Worktree[]
  filteredWorktrees: readonly Worktree[]
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
  visibleFolderWorkspaces: readonly FolderWorkspace[]
  currentSidebarWorktreeId: string | null
  currentSidebarExecutionHostId: ExecutionHostId | null
  worktreeMap: Map<string, Worktree>
  worktrees: readonly Worktree[]
  folderWorkspaces: readonly FolderWorkspace[]
  hasFilters: boolean
  revealWorkspaceFilters: (worktree: Worktree) => void
}): void {
  const {
    groupBy,
    renderedSidebarRowKeys,
    visibleWorktrees,
    filteredWorktrees,
    worktreeLineageById,
    visibleFolderWorkspaces,
    currentSidebarWorktreeId,
    currentSidebarExecutionHostId,
    worktreeMap,
    worktrees,
    folderWorkspaces,
    hasFilters,
    revealWorkspaceFilters
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
    if (
      !pendingRevealSidebarRow ||
      useAppStore.getState().pendingRevealSidebarRow !== pendingRevealSidebarRow
    ) {
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
      const target = getKnownSidebarWorktreeById(
        rowKey,
        worktreeMap,
        folderWorkspaces,
        worktrees,
        currentSidebarExecutionHostId
      )
      if (target) {
        revealWorkspaceFilters(target)
      }
    }
  }, [
    groupBy,
    hasFilters,
    currentSidebarExecutionHostId,
    folderWorkspaces,
    pendingRevealSidebarRow,
    renderedSidebarRowKeys,
    setGroupBy,
    worktreeMap,
    worktrees,
    revealWorkspaceFilters
  ])

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
      // Bots rows, and what no section lists, are not this list's to reveal: no filter
      // dialog, no filter or group change, no pending reveal that could never land.
      if (readSidebarRevealTarget().section !== 'projects') {
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
      const beginRename = detail && 'beginRename' in detail && detail.beginRename === true
      const versionTarget = beginRename
        ? null
        : getVersionTreeRevealTarget(activeWorktree, worktrees, worktreeLineageById, worktreeMap)
      const initialVisible = versionTarget ? filteredWorktrees : visibleWorktrees
      // Collapsed groups hide rows without excluding their workspaces from the filter results.
      if (
        hasFilters &&
        !workspacePassesFilters(activeWorktree, initialVisible, visibleFolderWorkspaces)
      ) {
        if (confirmationPending.current) {
          return
        }
        confirmationPending.current = true
        let confirmed: boolean
        try {
          confirmed = await confirm({
            initialFocus: 'confirm',
            title: translate('sidebar.revealFiltered.title', 'Reveal hidden workspace?'),
            description: translate(
              'sidebar.revealFiltered.description',
              'The active workspace is hidden in the sidebar. Revealing it will adjust only the filters hiding it.'
            ),
            confirmLabel: translate('sidebar.revealFiltered.confirm', 'Adjust & reveal'),
            cancelLabel: translate('sidebar.revealFiltered.cancel', 'Keep filters')
          })
        } finally {
          confirmationPending.current = false
        }
        const latest = latestArgs.current
        // A workspace switch while the dialog is open must not clear filters for a stale target.
        if (
          !confirmed ||
          latest.currentSidebarWorktreeId !== currentSidebarWorktreeId ||
          latest.currentSidebarExecutionHostId !== currentSidebarExecutionHostId ||
          readSidebarRevealTarget().section !== 'projects'
        ) {
          return
        }
        if (
          latest.hasFilters &&
          !workspacePassesFilters(
            activeWorktree,
            versionTarget ? latest.filteredWorktrees : latest.visibleWorktrees,
            latest.visibleFolderWorkspaces
          )
        ) {
          revealWorkspaceFilters(activeWorktree)
        }
      }
      if (versionTarget) {
        setSidebarBody('workspaces')
        requestVersionTreeWorktreeReveal({
          ...versionTarget,
          highlight: detail?.highlight !== false
        })
        return
      }
      revealWorktreeInSidebar(currentSidebarWorktreeId, {
        behavior: 'smooth',
        highlight: detail?.highlight !== false,
        beginRename: beginRename === true,
        executionHostId: currentSidebarExecutionHostId ?? undefined
      })
    },
    [
      confirm,
      hasFilters,
      currentSidebarWorktreeId,
      currentSidebarExecutionHostId,
      folderWorkspaces,
      revealSidebarRow,
      visibleWorktrees,
      visibleFolderWorkspaces,
      revealWorktreeInSidebar,
      worktreeMap,
      worktrees,
      filteredWorktrees,
      worktreeLineageById,
      setSidebarBody,
      revealWorkspaceFilters
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
