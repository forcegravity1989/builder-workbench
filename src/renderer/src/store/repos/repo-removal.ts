import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import type { AppState } from '../types'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { getWorktreeIdFromVisitKey, getWorktreeVisitKey } from '@/lib/worktree-visit-recency'
import { omitSparsePresetsForRepos } from '../slices/sparse-presets'
import { findRepoForHost, repoMatchesHostIdentity } from '../slices/repo-host-identity'
import {
  callRuntimeRpc,
  getActiveRuntimeTarget,
  hasRuntimeRpcErrorCode
} from '../../runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '../../runtime/runtime-worktree-selector'
import { runtimeTargetForExecutionHostId } from '../../runtime/runtime-client-target'
import { translate } from '@/i18n/i18n'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import {
  getRepoExecutionHostId,
  getSshTargetIdForExecutionHost,
  parseExecutionHostId,
  isRuntimeOwnedSshTargetId,
  LOCAL_EXECUTION_HOST_ID
} from '../../../../shared/execution-host'
import { cleanupEphemeralVmRuntimesForDeleted } from '@/lib/ephemeral-vm-runtime-cleanup'
import type { RepoSlice } from './repo-state'
import { ERROR_TOAST_DURATION } from './repo-state'
import { mergeProjectCompatibilityForHostRepoChange } from './repo-catalog-identity'
import { settingsForRepoOwner } from './owner-routing'
import {
  worktreeHostMatchOptions,
  worktreeMatchesHost
} from '../slices/worktrees/listing/worktree-host-ownership'
import type { Worktree } from '../../../../shared/worktree/types'
import { getRuntimeEnvironmentRevision } from '../../runtime/runtime-environment-revision'
import { repoMatchesRemovalRegistration } from './repo-removal-registration'

function getKnownRepoWorktrees(state: AppState, projectId: string): Worktree[] {
  return [
    ...(state.worktreesByRepo[projectId] ?? []),
    ...(state.detectedWorktreesByRepo[projectId]?.worktrees ?? [])
  ]
}

export function createRepoRemovalActions(
  set: Parameters<StateCreator<AppState>>[0],
  get: Parameters<StateCreator<AppState>>[1]
): Pick<RepoSlice, 'removeProject'> {
  return {
    removeProject: async (projectId, options) => {
      try {
        // Why: pass an explicit hostId so a duplicate id across hosts resolves to the intended row, not the focused-host fallback.
        const ownerRepo = findRepoForHost(get().repos, projectId, {
          settings: get().settings,
          hostId: options?.hostId
        })
        if (!ownerRepo) {
          return
        }
        const ownerHostId = getRepoExecutionHostId(ownerRepo)
        const workbench = isWorkbenchShell()
        const ownerHost = parseExecutionHostId(ownerHostId)
        const paired =
          workbench && ownerHost?.kind === 'runtime' ? ownerRepo.pairedRegistration : null
        const expected = options?.expectedRegistration ?? ownerRepo
        if (
          workbench &&
          (!repoMatchesRemovalRegistration(ownerRepo, expected) ||
            (ownerHost?.kind === 'runtime' &&
              (paired?.pairingRevision === undefined ||
                getRuntimeEnvironmentRevision(ownerHost.environmentId) !== paired.pairingRevision)))
        ) {
          throw new Error(
            translate(
              'auto.components.sidebar.RemoveFolderDialog.registrationUnavailable',
              'This project registration is no longer available. Check the project list.'
            )
          )
        }
        const hostMatch = worktreeHostMatchOptions(get(), projectId, ownerHostId)
        const belongsToOwner = (tree: Worktree): boolean => {
          if (!workbench) {
            return (tree.hostId ?? LOCAL_EXECUTION_HOST_ID) === ownerHostId
          }
          if (!worktreeMatchesHost(tree, ownerHostId, hostMatch)) {
            return false
          }
          if (!paired) {
            return true
          }
          return paired.hostId === LOCAL_EXECUTION_HOST_ID
            ? tree.hostId === ownerHostId || tree.hostId === LOCAL_EXECUTION_HOST_ID
            : tree.hostId === paired.hostId
        }
        const knownBefore = getKnownRepoWorktrees(get(), projectId)
        const ownedIdsBefore = knownBefore.filter(belongsToOwner).map((tree) => tree.id)
        const runtimeSshTargetId = getSshTargetIdForExecutionHost(ownerHostId)
        // Why: an SSH per-workspace-env's workspace is the repo's main worktree, so removal routes here; tear down its ephemeral runtime first so it doesn't leak.
        if (runtimeSshTargetId && isRuntimeOwnedSshTargetId(runtimeSshTargetId)) {
          const cleanup = await cleanupEphemeralVmRuntimesForDeleted({
            hostScopedWorkspaces: ownedIdsBefore.map((workspaceId) => ({
              workspaceId,
              executionHostId: ownerHostId
            })),
            runtimeOwnedSshTargetIds: [runtimeSshTargetId]
          })
          if (cleanup.retainedSshTargetIds.includes(runtimeSshTargetId)) {
            throw new Error(
              'The cloud VM could not be destroyed. Retry cleanup before removing it.'
            )
          }
        }
        // Direct SSH project registrations live in the desktop catalog.
        const target =
          workbench || options?.hostId
            ? (runtimeTargetForExecutionHostId(ownerHostId) ?? { kind: 'local' as const })
            : getActiveRuntimeTarget(settingsForRepoOwner(get(), projectId))
        // Why: repos:remove is id-only and would delete every host's row; scope local removal to the owning host so cross-host duplicates keep other rows.
        const idExistsOnOtherHost = get().repos.some(
          (repo) => repo.id === projectId && getRepoExecutionHostId(repo) !== ownerHostId
        )
        try {
          if (target.kind === 'local') {
            await (workbench || options?.hostId || idExistsOnOtherHost
              ? window.api.repos.removeForHost({
                  repoId: projectId,
                  hostId: ownerHostId,
                  ...(workbench
                    ? { expected: { path: expected.path, addedAt: expected.addedAt } }
                    : {})
                })
              : window.api.repos.remove({ repoId: projectId }))
          } else if (paired) {
            const result = await callRuntimeRpc<{ removed: boolean }>(
              target,
              'workbench.repo.removeRegistration',
              {
                repoId: projectId,
                hostId: paired.hostId,
                path: expected.path,
                addedAt: expected.addedAt
              },
              {
                timeoutMs: 15_000,
                expectedEnvironmentPairingRevision: paired.pairingRevision,
                expectedEnvironmentRuntimeId: options?.expectedEnvironmentRuntimeId
              }
            )
            if (!result.removed) {
              throw new Error(
                translate(
                  'auto.components.sidebar.RemoveFolderDialog.registrationUnavailable',
                  'This project registration is no longer available. Check the project list.'
                )
              )
            }
          } else {
            await callRuntimeRpc(target, 'repo.rm', { repo: projectId }, { timeoutMs: 15_000 })
          }
        } catch (err) {
          // Why: the owner already dropped this project, so purge the local ghost row instead of aborting (#11994).
          if (workbench || !hasRuntimeRpcErrorCode(err, 'repo_not_found')) {
            if (paired && hasRuntimeRpcErrorCode(err, 'method_not_found')) {
              throw new Error(
                translate(
                  'auto.components.sidebar.RemoveFolderDialog.updatePairedHost',
                  'Update Workbench on the paired host before removing a project registration.'
                )
              )
            }
            throw err
          }
        }

        const { clearRepoSlugCacheEntry } = await import('../../lib/repo-slug-index')
        if (
          workbench &&
          get().repos.some(
            (repo) =>
              repoMatchesHostIdentity(repo, projectId, ownerHostId) &&
              !repoMatchesRemovalRegistration(repo, expected)
          )
        ) {
          return
        }
        if (!workbench || !idExistsOnOtherHost) {
          get().clearOrcaHookTrustForRepo(projectId)
        }
        const repoPath = get().repos.find((repo) =>
          repoMatchesHostIdentity(repo, projectId, ownerHostId)
        )?.path
        get().evictGitHubRepoCaches(projectId, repoPath)
        clearRepoSlugCacheEntry(projectId)

        // Kill PTYs for all worktrees belonging to this repo
        const knownRepoWorktrees = getKnownRepoWorktrees(get(), projectId)
        const worktreeIds = [
          ...new Set([
            ...ownedIdsBefore,
            ...knownRepoWorktrees.filter(belongsToOwner).map((tree) => tree.id)
          ])
        ]
        // A raw id can be published by two hosts. Keep the sibling's session and recency.
        const exactSiblingIds = new Set(
          knownRepoWorktrees
            .filter((worktree) => !belongsToOwner(worktree))
            .map((worktree) => worktree.id)
        )
        // Shared tab and editor keys cannot distinguish the surviving copy.
        const disposableWorktreeIds = workbench
          ? worktreeIds.filter((id) => !exactSiblingIds.has(id))
          : worktreeIds
        const purgeTargets = disposableWorktreeIds.map((id) =>
          exactSiblingIds.has(id) ? { id, hostId: ownerHostId } : id
        )
        const localAgentContextProjectIds =
          ownerHostId === LOCAL_EXECUTION_HOST_ID
            ? [
                projectId,
                ...(get().worktreesByRepo[projectId] ?? [])
                  .filter(belongsToOwner)
                  .flatMap((worktree) => (worktree.projectId ? [worktree.projectId] : []))
              ]
            : []
        const killedTabIds = new Set<string>()
        if (target.kind === 'environment' && !workbench) {
          await Promise.allSettled(
            worktreeIds.map((worktreeId) =>
              callRuntimeRpc(
                target,
                'terminal.stop',
                { worktree: toRuntimeWorktreeSelector(worktreeId) },
                { timeoutMs: 15_000 }
              )
            )
          )
        }
        for (const wId of disposableWorktreeIds) {
          const tabs = get().tabsByWorktree[wId] ?? []
          for (const tab of tabs) {
            killedTabIds.add(tab.id)
            for (const ptyId of get().ptyIdsByTabId[tab.id] ?? []) {
              if (!ptyId.startsWith('remote:')) {
                window.api.pty.kill(ptyId)
              }
            }
          }
        }

        // Why: use the canonical per-worktree purge to evict all worktree-scoped maps (hand-deletion leaked most); runs before the set() below so it still sees tabsByWorktree.
        if (purgeTargets.length > 0) {
          get().purgeWorktreeTerminalState(purgeTargets)
        }
        get().clearLocalDetectedAgentContextsForProjects(localAgentContextProjectIds)

        set((s) => {
          const nextWorktrees = { ...s.worktreesByRepo }
          const remainingWorktrees = (nextWorktrees[projectId] ?? []).filter(
            (worktree) => !belongsToOwner(worktree)
          )
          if (remainingWorktrees.length > 0) {
            nextWorktrees[projectId] = remainingWorktrees
          } else {
            delete nextWorktrees[projectId]
          }
          const nextDetectedWorktrees = { ...s.detectedWorktreesByRepo }
          const detected = nextDetectedWorktrees[projectId]
          if (detected) {
            const remainingDetected = detected.worktrees.filter(
              (worktree) => !belongsToOwner(worktree)
            )
            if (remainingDetected.length > 0) {
              nextDetectedWorktrees[projectId] = { ...detected, worktrees: remainingDetected }
            } else {
              delete nextDetectedWorktrees[projectId]
            }
          }
          const nextTabs = { ...s.tabsByWorktree }
          const nextLayouts = { ...s.terminalLayoutsByTabId }
          const nextPtyIdsByTabId = { ...s.ptyIdsByTabId }
          const nextRuntimePaneTitlesByTabId = { ...s.runtimePaneTitlesByTabId }
          for (const wId of disposableWorktreeIds) {
            delete nextTabs[wId]
          }
          for (const tabId of killedTabIds) {
            delete nextLayouts[tabId]
            delete nextPtyIdsByTabId[tabId]
            delete nextRuntimePaneTitlesByTabId[tabId]
          }
          // Why: editor state is worktree-scoped; clear the repo's open files + active-file tracking so orphans don't linger in the session save.
          const worktreeIdSet = new Set(disposableWorktreeIds)
          const removedVisitKeys = new Set(
            worktreeIds.map((worktreeId) => getWorktreeVisitKey(worktreeId, ownerHostId))
          )
          const nextOpenFiles = s.openFiles.filter((f) => !worktreeIdSet.has(f.worktreeId))
          const nextActiveFileIdByWorktree = { ...s.activeFileIdByWorktree }
          const nextActiveTabTypeByWorktree = { ...s.activeTabTypeByWorktree }
          for (const wId of disposableWorktreeIds) {
            delete nextActiveFileIdByWorktree[wId]
            delete nextActiveTabTypeByWorktree[wId]
          }
          const activeFileCleared = s.activeFileId
            ? s.openFiles.some((f) => f.id === s.activeFileId && worktreeIdSet.has(f.worktreeId))
            : false
          const nextRepos = s.repos.filter(
            (repo) =>
              !repoMatchesHostIdentity(repo, projectId, ownerHostId) ||
              (workbench && !repoMatchesRemovalRegistration(repo, expected))
          )
          // Why: when no sibling host owns this id, drop every worktree timestamp (unhydrated SSH ones would otherwise never prune); else stay host-scoped.
          const repoIdFullyRemoved = !nextRepos.some((r) => r.id === projectId)
          const activeHost = s.activeWorkspaceExecutionHostId ?? LOCAL_EXECUTION_HOST_ID
          const activeProjectRemoved =
            s.activeRepoId === projectId &&
            (!workbench || repoIdFullyRemoved || activeHost === ownerHostId)
          const activeSharedTreeRemoved =
            workbench &&
            activeProjectRemoved &&
            s.activeWorktreeId !== null &&
            exactSiblingIds.has(s.activeWorktreeId) &&
            worktreeIds.includes(s.activeWorktreeId)
          let nextLastVisitedAtByWorktreeId = s.lastVisitedAtByWorktreeId
          for (const id of Object.keys(s.lastVisitedAtByWorktreeId)) {
            const rawId = getWorktreeIdFromVisitKey(id)
            if (
              (ownerHostId && removedVisitKeys.has(id)) ||
              (!ownerHostId && worktreeIdSet.has(rawId)) ||
              (repoIdFullyRemoved && getRepoIdFromWorktreeId(rawId) === projectId)
            ) {
              if (nextLastVisitedAtByWorktreeId === s.lastVisitedAtByWorktreeId) {
                nextLastVisitedAtByWorktreeId = { ...s.lastVisitedAtByWorktreeId }
              }
              delete nextLastVisitedAtByWorktreeId[id]
            }
          }
          const survivingRepoIds = new Set(nextRepos.map((r) => r.id))
          const removedRepoIds = s.repos.filter((r) => !survivingRepoIds.has(r.id)).map((r) => r.id)
          return {
            repos: nextRepos,
            // Why: drop removed repos' sparse-preset maps so they don't outlive the repo for the whole session.
            ...omitSparsePresetsForRepos(s, removedRepoIds),
            ...mergeProjectCompatibilityForHostRepoChange({
              previous: { projects: s.projects, projectHostSetups: s.projectHostSetups },
              nextRepos,
              hostId: ownerHostId
            }),
            activeRepoId: activeProjectRemoved ? null : s.activeRepoId,
            filterRepoIds:
              workbench && !repoIdFullyRemoved
                ? s.filterRepoIds
                : s.filterRepoIds.filter((id) => id !== projectId),
            ...(activeSharedTreeRemoved
              ? {
                  activeWorktreeId: null,
                  activeWorkspaceKey: null,
                  activeWorkspaceExecutionHostId: null
                }
              : {}),
            worktreesByRepo: nextWorktrees,
            detectedWorktreesByRepo: nextDetectedWorktrees,
            tabsByWorktree: nextTabs,
            ptyIdsByTabId: nextPtyIdsByTabId,
            runtimePaneTitlesByTabId: nextRuntimePaneTitlesByTabId,
            terminalLayoutsByTabId: nextLayouts,
            activeTabId:
              activeSharedTreeRemoved || (s.activeTabId && killedTabIds.has(s.activeTabId))
                ? null
                : s.activeTabId,
            activeBrowserTabId: activeSharedTreeRemoved ? null : s.activeBrowserTabId,
            openFiles: nextOpenFiles,
            activeFileIdByWorktree: nextActiveFileIdByWorktree,
            activeTabTypeByWorktree: nextActiveTabTypeByWorktree,
            activeFileId: activeSharedTreeRemoved || activeFileCleared ? null : s.activeFileId,
            activeTabType:
              activeSharedTreeRemoved || activeFileCleared ? 'terminal' : s.activeTabType,
            lastVisitedAtByWorktreeId: nextLastVisitedAtByWorktreeId,
            folderWorkspacePathStatuses: {},
            sortEpoch: s.sortEpoch + 1,
            // Why: removing the last repo must reset activeView + clear activeWorktreeId so App renders Landing, not an empty settings/terminal pane.
            ...(nextRepos.length === 0
              ? {
                  activeView: 'terminal' as const,
                  activeWorktreeId: null,
                  activeWorkspaceKey: null,
                  activeWorkspaceExecutionHostId: null,
                  activeRepoId: null
                }
              : {})
          }
        })
      } catch (err) {
        console.error('Failed to remove repo:', err)
        // Why: bulk and background callers aggregate their own failures, so only opted-in single-project entry points toast (#11994).
        if (options?.errorFeedback === 'toast') {
          toast.error(
            translate('auto.store.slices.repos.removeProjectFailed', 'Failed to remove project'),
            {
              description: err instanceof Error ? err.message : String(err),
              duration: ERROR_TOAST_DURATION
            }
          )
        }
      }
    }
  }
}
