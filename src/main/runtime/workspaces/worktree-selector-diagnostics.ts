import { existsSync } from 'node:fs'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host/execution-host'
import { splitWorktreeIdForFilesystem } from '../../../shared/worktree/id'
import {
  recordWorktreeSelectorMiss,
  worktreeIdFromSelector,
  type WorktreeSelectorMissStage
} from '../worktree-selector-miss'
import { RuntimeProjectLaunchContext } from './startup/runtime-project-launch-context'

export abstract class RuntimeWorktreeSelectorDiagnostics extends RuntimeProjectLaunchContext {
  protected isConfirmedLocalWorktreeGone(
    selector: string,
    requiredHostId: ExecutionHostId
  ): boolean {
    if (!this.store) {
      return false
    }
    const parsedHost = parseExecutionHostId(requiredHostId)
    if (!parsedHost || parsedHost.kind !== 'local' || !selector.startsWith('id:')) {
      return false
    }
    const worktreeId = selector.slice(3)
    const parsed = splitWorktreeIdForFilesystem(worktreeId)
    if (!parsed?.repoId || !parsed.worktreePath) {
      return false
    }
    const owners = this.store
      .getRepos()
      .filter((repo) => repo.id === parsed.repoId && getRepoExecutionHostId(repo) === parsedHost.id)
    if (owners.length !== 1) {
      return false
    }
    const store = this.store as {
      getWorktreeMetaForHost?: (id: string, hostId: ExecutionHostId) => unknown
      getWorktreeMeta?: (id: string) => unknown
    }
    const meta = store.getWorktreeMetaForHost
      ? store.getWorktreeMetaForHost(worktreeId, parsedHost.id)
      : store.getWorktreeMeta?.(worktreeId)
    return meta == null && !existsSync(parsed.worktreePath)
  }

  protected emitWorktreeSelectorMiss(
    selector: string,
    stage: WorktreeSelectorMissStage,
    requiredHostId: string | null,
    cacheFreshAtRequest: boolean,
    cause: unknown,
    caller: string | null = null
  ): void {
    try {
      const worktreeId = worktreeIdFromSelector(selector)
      const parsed = worktreeId ? splitWorktreeIdForFilesystem(worktreeId) : null
      // Why all rows and not `getRepo(id)`: the same repo id can exist on local, SSH and runtime
      // hosts, and an arbitrary row mislabels a remote worktree as local (#11163). The host is
      // resolved through `getRepoExecutionHostId`: a row carrying only `ssh:`/`runtime:` in
      // `executionHostId` has no `connectionId` and would read as local otherwise.
      const repoRows = parsed
        ? (this.store?.getRepos() ?? []).filter((row) => row.id === parsed.repoId)
        : []
      const hostIds = new Set(repoRows.map((row) => getRepoExecutionHostId(row)))
      const [onlyHostId] = hostIds
      const repoHost =
        hostIds.size === 1 ? (onlyHostId === LOCAL_EXECUTION_HOST_ID ? 'local' : 'remote') : null
      const metaHostId = requiredHostId ?? (hostIds.size === 1 ? onlyHostId : null)
      const parsedMetaHostId = metaHostId ? parseExecutionHostId(metaHostId) : null
      const metaStore = this.store as {
        getWorktreeMetaForHost?: (id: string, hostId: ExecutionHostId) => unknown
        getWorktreeMeta?: (id: string) => unknown
        getAllWorktreeMetaForHost?: (hostId: ExecutionHostId) => Record<string, unknown>
        getAllWorktreeMeta?: () => Record<string, unknown>
      }
      const meta =
        worktreeId && parsedMetaHostId
          ? metaStore.getWorktreeMetaForHost
            ? (metaStore.getWorktreeMetaForHost(worktreeId, parsedMetaHostId.id) ?? null)
            : (metaStore.getWorktreeMeta?.(worktreeId) ?? null)
          : null
      const snapshotWorktrees = this.resolvedWorktrees.peek()?.worktrees ?? null
      const repoMetaEntries =
        parsed && parsedMetaHostId
          ? metaStore.getAllWorktreeMetaForHost
            ? metaStore.getAllWorktreeMetaForHost(parsedMetaHostId.id)
            : (metaStore.getAllWorktreeMeta?.() ?? null)
          : null
      let repoMetaCount: number | null = null
      if (parsed && repoMetaEntries) {
        repoMetaCount = Object.keys(repoMetaEntries).filter((id) => {
          const candidate = splitWorktreeIdForFilesystem(id)
          return candidate?.repoId === parsed.repoId
        }).length
      }
      recordWorktreeSelectorMiss(
        {
          stage,
          caller,
          selector,
          requiredHostId,
          worktreeId,
          repoKnown: parsed ? repoRows.length > 0 : null,
          repoHost,
          metaPresent: worktreeId ? meta !== null : null,
          // Why only local: `existsSync` answers for this process's filesystem; a remote/WSL
          // path would read as "deleted" when the owning host still has it.
          pathExistsLocal:
            parsed?.worktreePath && repoHost === 'local' ? existsSync(parsed.worktreePath) : null,
          cacheFreshAtRequest,
          resolvedWorktreeCount: snapshotWorktrees?.length ?? null,
          repoResolvedWorktreeCount:
            parsed && snapshotWorktrees
              ? snapshotWorktrees.filter((row) => row.repoId === parsed.repoId).length
              : null,
          repoMetaCount
        },
        cause
      )
    } catch {
      // Diagnostics must never mask the resolution error the caller is about to see.
    }
  }
}
