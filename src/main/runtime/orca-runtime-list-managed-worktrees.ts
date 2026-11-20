// @ts-nocheck -- mechanically split from OrcaRuntimeService; behavior is covered by AST equivalence and characterization tests.
import { OrcaRuntimeWithRestoreStructuredAgentSessionTabsOnce } from './orca-runtime-restore-structured-agent-session-tabs-once'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import { existsSync } from 'node:fs'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import {
  isNonMissSelector,
  isSelectorNotFound,
  recordWorktreeSelectorMiss,
  worktreeIdFromSelector,
  type WorktreeSelectorMissStage
} from './worktree-selector-miss'
import { DEFAULT_WORKTREE_LIST_LIMIT } from './orca-runtime-postlude'
import type { RuntimeWorktreeListResult } from '../../shared/runtime-types'
import type { DetectedWorktreeListResult, Worktree } from '../../shared/worktree/types'
import type { Repo } from '../../shared/repo-types'
import { stopMissingWorktreeTerminals } from './missing-worktree-terminal-reconciliation'
import type { RuntimeCommandSurfaceHost } from './orca-runtime-core'
import type { WorktreeVisibilitySourceMatcher } from '../../shared/worktree/visibility-sources'
import type { RuntimeStore } from './runtime-store-contract'
import type {
  WorkspacePortKillRequest,
  WorkspacePortKillResult,
  WorkspacePortProbe,
  WorkspacePortScanResult
} from '../../shared/workspace-ports'
import {
  filterWorkspacePortProbes,
  killWorkspacePort,
  scanWorkspacePortProbes
} from '../ports/workspace-port-ownership'

export class OrcaRuntimeWithListManagedWorktrees extends OrcaRuntimeWithRestoreStructuredAgentSessionTabsOnce {
  listManagedWorktrees(
    repoSelector?: string,
    limit = DEFAULT_WORKTREE_LIST_LIMIT,
    sourceDefaultsSupported = true
  ): Promise<RuntimeWorktreeListResult> {
    return this.managedWorktreeQueries.list(repoSelector, limit, sourceDefaultsSupported)
  }

  listRetiredWorktreeNames(repoSelector: string) {
    return this.managedWorktreeQueries.listRetiredNames(repoSelector)
  }

  async listDetectedManagedWorktrees(
    repoSelector: string,
    connectionId?: string | null,
    sourceDefaultsSupported = true
  ): Promise<DetectedWorktreeListResult> {
    return this.listDetectedWorktreesForResolvedRepo(
      await this.resolveRepoSelectorForConnection(repoSelector, connectionId),
      sourceDefaultsSupported
    )
  }

  protected listDetectedWorktreesForResolvedRepo(
    repo: Repo,
    sourceDefaultsSupported = true
  ): Promise<DetectedWorktreeListResult> {
    return this.managedWorktreeQueries.listDetected(repo, sourceDefaultsSupported)
  }

  async teardownMissingManagedWorktreeTerminals(
    repoSelector: string,
    knownWorktreeIds: readonly string[],
    connectionId?: string | null
  ): Promise<{ stoppedWorktreeIds: string[] }> {
    const repo = await this.resolveRepoSelectorForConnection(repoSelector, connectionId)
    // Why: killing PTYs must be proven against the host right now — a cached scan
    // (30s TTL) can still list a directory git already dropped, and the renderer
    // purges its state either way, so a stale miss strands those processes for good.
    this.invalidateWorktreeScanCacheForRepo(repo.id)
    // Why: rescanning by `id:` would re-resolve the already-resolved repo, and a
    // duplicate id across hosts makes that second lookup throw selector_ambiguous
    // even though the caller's selector was unique — losing the sweep entirely.
    const detected = await this.listDetectedWorktreesForResolvedRepo(repo)
    if (!detected.authoritative) {
      return { stoppedWorktreeIds: [] }
    }
    return stopMissingWorktreeTerminals(
      repo,
      knownWorktreeIds,
      detected.worktrees.map((worktree) => worktree.id),
      {
        runtime: this as RuntimeCommandSurfaceHost<this>,
        getLocalProvider: () => this.getLocalProvider(),
        getSshProvider: (connectionId) => this.getSshProviderFn?.(connectionId),
        onPtyStopped: this.onPtyStopped ?? undefined
      }
    )
  }

  protected resolveRepoSelectorForConnection(
    repoSelector: string,
    connectionId?: string | null
  ): Promise<Repo> {
    return this.managedWorktreeQueries.resolveRepoForConnection(repoSelector, connectionId)
  }

  protected isRuntimeWorktreeVisible(
    worktree: Worktree,
    worktreeVisibilitySourceMatcher?: WorktreeVisibilitySourceMatcher,
    sourceDefaultsSupported = true,
    providedSettings?: ReturnType<RuntimeStore['getSettings']>
  ): boolean {
    return this.managedWorktreeQueries.isVisible(
      worktree,
      worktreeVisibilitySourceMatcher,
      sourceDefaultsSupported,
      providedSettings
    )
  }

  protected buildRuntimeVisibilitySourceMatchersByRepoId(
    worktrees: readonly Worktree[],
    sourceDefaultsSupported = true,
    providedSettings?: ReturnType<RuntimeStore['getSettings']>
  ): Map<string, WorktreeVisibilitySourceMatcher> {
    return this.managedWorktreeQueries.buildVisibilityMatchers(
      worktrees,
      sourceDefaultsSupported,
      providedSettings
    )
  }

  async showManagedWorktree(worktreeSelector: string, requiredHostId?: ExecutionHostId) {
    if (requiredHostId === undefined) {
      // Fleet misses are recorded at the resolver choke point; wrapping here too would double-record.
      return await this.resolveWorktreeSelector(worktreeSelector, 'showManagedWorktree')
    }
    // Why sampled before resolving: resolution itself repopulates the snapshot, so reading
    // freshness afterwards would report a fresh cache for every miss and answer nothing.
    const cacheFreshAtRequest = this.hasFreshResolvedWorktreeCache()
    try {
      if (!worktreeSelector.startsWith('id:') || !parseExecutionHostId(requiredHostId)) {
        throw new Error('selector_not_found')
      }
      const worktree = await this.resolveExplicitWorktreeIdScoped(
        worktreeSelector.slice(3),
        requiredHostId
      )
      if (!worktree) {
        throw new Error('selector_not_found')
      }
      return worktree
    } catch (error) {
      // The host-scoped short-circuit never reaches the resolver, so it records here.
      if (isSelectorNotFound(error) && !isNonMissSelector(worktreeSelector)) {
        this.emitWorktreeSelectorMiss(
          worktreeSelector,
          'host-scoped',
          requiredHostId ?? null,
          cacheFreshAtRequest,
          error,
          'showManagedWorktree'
        )
        if (requiredHostId && this.isConfirmedLocalWorktreeGone(worktreeSelector, requiredHostId)) {
          // Keep Orca's native RPC contract (`selector_not_found`) unchanged. The BW workspace
          // resolver receives this in-process evidence marker and translates it at its own boundary.
          throw Object.assign(new Error('selector_not_found'), { worktreeGoneEvidence: true })
        }
      }
      throw error
    }
  }

  /**
   * A generic selector miss is normally UNKNOWN: a Git/provider scan may have failed or lagged.
   * Only the local, host-qualified path can be proved here without asking another runtime: the
   * repo owner is unique, its host metadata is gone, and the filesystem path is absent.
   */
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

  async showManagedTerminalWorkspace(worktreeSelector: string) {
    // Misses are recorded at the resolver choke point. The only `!managedWorktree` case is the
    // floating-terminal sentinel, a contract non-miss that must not dilute the signal.
    // Folder-workspace misses resolve outside the resolver and stay unrecorded by design: they
    // carry no repo/worktree facts for the span to report.
    const target = await this.resolveTerminalWorkspaceLaunchTarget(
      worktreeSelector,
      'showManagedTerminalWorkspace'
    )
    if (!target.managedWorktree) {
      throw new Error('selector_not_found')
    }
    return target.managedWorktree
  }

  /**
   * Why only on misses: a hit path must stay allocation-free, and the miss path is already
   * exceptional. Reads the warm cache with `peek()` on purpose — re-scanning here would add a
   * second multi-second git pass to a request that just failed.
   */
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
            ? (metaStore.getWorktreeMetaForHost(worktreeId, parsedMetaHostId) ?? null)
            : (metaStore.getWorktreeMeta?.(worktreeId) ?? null)
          : null
      const snapshotWorktrees = this.resolvedWorktrees.peek()?.worktrees ?? null
      const repoMetaEntries =
        parsed && parsedMetaHostId
          ? metaStore.getAllWorktreeMetaForHost
            ? metaStore.getAllWorktreeMetaForHost(parsedMetaHostId)
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

  async scanWorkspacePorts(repoId?: string): Promise<WorkspacePortScanResult> {
    return scanWorkspacePortProbes(await this.getWorkspacePortProbes(repoId))
  }

  async killWorkspacePort(args: WorkspacePortKillRequest): Promise<WorkspacePortKillResult> {
    return killWorkspacePort(await this.getWorkspacePortProbes(args.repoId), args)
  }

  // Why: remote clients may invoke this over RPC, so the runtime derives
  // allowed worktree paths from its own store instead of trusting client paths.
  protected async getWorkspacePortProbes(repoId?: string): Promise<WorkspacePortProbe[]> {
    const reposById = new Map(
      this.requireStore()
        .getRepos()
        .map((repo) => [repo.id, repo])
    )
    return filterWorkspacePortProbes(
      (await this.listResolvedWorktrees()).map((worktree) => ({
        id: worktree.id,
        repoId: worktree.repoId,
        displayName: worktree.displayName,
        path: worktree.git.path,
        connectionId: reposById.get(worktree.repoId)?.connectionId ?? null
      })),
      repoId
    )
  }

  async sleepManagedWorktree(worktreeSelector: string): Promise<{ worktreeId: string }> {
    const worktree = await this.resolveWorktreeSelector(worktreeSelector, 'sleepManagedWorktree')
    // Why: sleep is renderer-initiated on desktop (it tears down tab state
    // before killing PTYs). The notifier tells the renderer to run its own
    // sleep flow so all cleanup happens in the correct order.
    this.notifier?.sleepWorktree(worktree.id)
    return { worktreeId: worktree.id }
  }
}
