import { ipcMain } from 'electron'
import type { WorktreeMeta } from '../../../../shared/worktree/meta-types'
import { displayNameUpdatePinsLabel } from '../../../../shared/worktree/display-name-provenance'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { stripOrcaProvenanceMetaUpdates } from '../../../worktree-removal-safety'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import type {
  ListDesktopLineageForHostArgs,
  HostLineageSnapshot
} from '../../../../shared/host-lineage-contract'
import { notifyWorktreesChanged } from '../../worktree-remote'
import { parseWorktreeId } from '../../worktree-logic'
import { planWorktreeSortOrderUpdates } from '../../../../shared/worktree/sort-order-update'
import { readBranchRenameFailureOutputForDisplay } from '../../../agent-hooks/branch-rename-failure-output'
import {
  normalizeLinkedWorkItemFields,
  normalizeWorkbenchVersionBindingField
} from '../ipc-context-schemas'
import { listDesktopLineageForHost } from './host-lineage-listing'
import type { WorktreeIpcContext } from '../worktree-ipc-context'

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
      const meta = executionHostId
        ? store.setWorktreeMetaForHost(args.worktreeId, executionHostId, sanitizedUpdates)
        : store.setWorktreeMeta(args.worktreeId, sanitizedUpdates)
      // Do NOT notify here: renderer already applied this optimistically; a notification would re-sort the sidebar (bug PR #209).
      if (args.updates.displayName !== undefined) {
        // Why: remote clients have no optimistic rename and stopped polling titles, so push a remote-only invalidation; gate on displayName so per-click isUnread updates stay event-free.
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
    'worktrees:listLineageForHost',
    (_event, args: ListDesktopLineageForHostArgs): Promise<HostLineageSnapshot> =>
      listDesktopLineageForHost(store, runtime, args)
  )

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

  ipcMain.handle('worktrees:persistSortOrder', (_event, args: { orderedIds: string[] }) => {
    if (!Array.isArray(args?.orderedIds) || args.orderedIds.length === 0) {
      return
    }
    const updates = planWorktreeSortOrderUpdates(
      args.orderedIds,
      (worktreeId) => store.getWorktreeMeta(worktreeId),
      Date.now()
    )
    for (const update of updates) {
      store.setWorktreeMeta(update.worktreeId, { sortOrder: update.sortOrder })
    }
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
