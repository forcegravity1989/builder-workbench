import { ipcMain } from 'electron'
import type { WorktreeMeta } from '../../../../shared/worktree/meta-types'
import { displayNameUpdatePinsLabel } from '../../../../shared/worktree/display-name-provenance'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { stripOrcaProvenanceMetaUpdates } from '../../../worktree-removal-safety'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { notifyWorktreesChanged } from '../../worktree-remote'
import { parseWorktreeId } from '../../worktree-logic'
import {
  writeWorktreeSortOrder,
  type WorktreeSortOrderRequest
} from '../../../persistence/worktree-sort-order-write'
import { readBranchRenameFailureOutputForDisplay } from '../../../agent-hooks/branch-rename-failure-output'
import {
  normalizeLinkedWorkItemFields,
  normalizeWorkbenchVersionBindingField
} from '../ipc-context-schemas'
import { isRemovedFolderWorkspaceInstance } from '../../../folder-workspace-meta-presence'
import { resolveWorktreeMetaOwner } from '../../../persistence/host-qualified-worktree-meta'
import { hostWorktreeTarget } from '../../../../shared/worktree/host-qualified-identity'
import type { WorktreeIpcContext } from '../worktree-ipc-context'
import {
  isWslMoveSourceHost,
  isWslMoveWorkspaceBlocked,
  shouldDropWslMoveProjectUpdate,
  wslMoveProjectRefForWorkspace
} from '../../../persistence/moving-wsl-projects/wsl-move-scope-guard'

export function registerWorktreeMetadataHandlers(context: WorktreeIpcContext): void {
  const { mainWindow, store, runtime } = context
  ipcMain.handle(
    'worktrees:updateMeta',
    (
      _event,
      args: {
        worktreeId: string
        executionHostId?: string
        updates: Partial<WorktreeMeta>
      }
    ) => {
      const executionHostId =
        args.executionHostId === undefined
          ? undefined
          : parseExecutionHostId(args.executionHostId)?.id
      if (args.executionHostId !== undefined && !executionHostId) {
        throw new Error('Invalid execution host identity.')
      }
      if (
        isWslMoveSourceHost(executionHostId) &&
        shouldDropWslMoveProjectUpdate(
          store,
          wslMoveProjectRefForWorkspace(args.worktreeId),
          args.updates
        )
      ) {
        return null
      }
      const validatedUpdates = normalizeWorkbenchVersionBindingField(
        normalizeLinkedWorkItemFields(args.updates)
      )
      // G2 P3a 收口（P1 延后项，最终检视 H-1 收窄）：仅绑定字段按「显式 undefined=
      // 保留旧值」剥除（其契约由 normalizeWorkbenchVersionBindingField 承担）；其余键
      // 保持原生本地 IPC 线约——present-but-undefined 在 spread 中清除字段
      // （baseRef/pushTarget 两条原生清除链依赖该信号，见 worktree-meta-update-application
      // 头注；全局剥除会使清除静默失效、重开后旧值复活，违反重开前后一致铁律）。
      const definedUpdates: Partial<WorktreeMeta> = { ...validatedUpdates }
      if (
        'workbenchVersionBinding' in definedUpdates &&
        definedUpdates.workbenchVersionBinding === undefined
      ) {
        delete definedUpdates.workbenchVersionBinding
      }
      const updates =
        definedUpdates.displayName !== undefined
          ? {
              ...definedUpdates,
              // The host persists provenance; do not rely on renderer-authored metadata.
              displayNameIsPinned: displayNameUpdatePinsLabel(definedUpdates.displayName),
              pendingFirstAgentMessageRename: false,
              firstAgentMessageRenameError: null
            }
          : definedUpdates
      const sanitizedUpdates = stripOrcaProvenanceMetaUpdates(updates)
      // Late terminal activity must not resurrect a removed folder instance (#22712).
      if (isRemovedFolderWorkspaceInstance(store, args.worktreeId, executionHostId)) {
        return null
      }
      const target = executionHostId
        ? hostWorktreeTarget({ id: args.worktreeId, hostId: executionHostId })
        : resolveWorktreeMetaOwner(store, args.worktreeId)
      if (!target) {
        return null
      }
      const meta = store.setWorktreeMeta(target, sanitizedUpdates)
      // Local optimistic state is current; notifying it would re-sort the sidebar (#209).
      if (args.updates.displayName !== undefined) {
        // Remote clients need rename pushes; per-click unread changes must remain event-free.
        runtime.notifyWorktreesChangedForRemoteClients(getRepoIdFromWorktreeId(args.worktreeId))
      }
      return meta
    }
  )

  ipcMain.handle('worktrees:listLineage', async () => {
    await runtime.hydrateInferredWorktreeLineage()
    return {
      lineage: store.getAllWorktreeLineage(),
      workspaceLineage: store.getAllWorkspaceLineage()
    }
  })

  ipcMain.handle(
    'worktrees:updateLineage',
    async (_event, args: { worktreeId: string; parentWorktreeId?: string; noParent?: boolean }) => {
      await runtime.updateManagedWorktreeMeta(args.worktreeId, {
        lineage:
          args.noParent === true
            ? { noParent: true }
            : args.parentWorktreeId
              ? { parentWorktree: `id:${args.parentWorktreeId}` }
              : undefined
      })
      notifyWorktreesChanged(mainWindow, parseWorktreeId(args.worktreeId).repoId)
      return store.getWorktreeLineage(args.worktreeId) ?? null
    }
  )

  ipcMain.handle('worktrees:persistSortOrder', (_event, args: WorktreeSortOrderRequest) => {
    if (!Array.isArray(args?.orderedIds) || args.orderedIds.length === 0) {
      return
    }
    writeWorktreeSortOrder(
      store,
      args,
      (worktreeId) => isWslMoveWorkspaceBlocked(store, worktreeId),
      Date.now()
    )
  })

  ipcMain.handle(
    'worktrees:getBranchRenameFailureOutput',
    (_event, args: { worktreeId: string }) => {
      if (typeof args?.worktreeId !== 'string' || args.worktreeId.length === 0) {
        return null
      }
      return readBranchRenameFailureOutputForDisplay(args.worktreeId)
    }
  )
}
