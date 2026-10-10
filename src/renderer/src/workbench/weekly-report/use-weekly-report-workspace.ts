import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import { nativeWorkspaceScope, findNamedWorktree } from '../version-cycle/native-workspace'
import { WEEKLY_REPORT_BRANCH } from './native-weekly-report-session'

export function useWeeklyReportWorkspace() {
  const repos = useAppStore((state) => state.repos)
  const repoId = useAppStore((state) => state.activeRepoId ?? state.repos[0]?.id ?? null)
  const trees = useAppStore((state) => (repoId ? state.worktreesByRepo[repoId] : undefined))
  const activeHost = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const workspace = useMemo(() => {
    if (!trees?.length) {
      return { base: null, scope: null, tree: null, error: null }
    }
    try {
      const candidates = trees.filter((tree) => {
        if (!tree.isMainWorktree) {
          return false
        }
        const scope = nativeWorkspaceScope(tree)
        return (
          !activeHost ||
          scope.hostId === activeHost ||
          (scope.runtimeOwnerEnvironmentId &&
            toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId) === activeHost)
        )
      })
      if (candidates.length !== 1) {
        throw new Error('项目主工作区宿主不明确，请在项目墙选择目标项目后重试')
      }
      const base = candidates[0]!
      const scope = nativeWorkspaceScope(base)
      return { base, scope, tree: findNamedWorktree(scope, WEEKLY_REPORT_BRANCH), error: null }
    } catch (reason) {
      return {
        scope: null,
        base: null,
        tree: null,
        error: reason instanceof Error ? reason.message : String(reason)
      }
    }
  }, [trees, activeHost])
  const base = workspace.base
  const repo =
    repoId && workspace.scope
      ? (findRepoForHost(repos, repoId, {
          hostId: workspace.scope.runtimeOwnerEnvironmentId
            ? toRuntimeExecutionHostId(workspace.scope.runtimeOwnerEnvironmentId)
            : workspace.scope.hostId
        }) ?? findRepoForHost(repos, repoId, { hostId: workspace.scope.hostId }))
      : null
  const repository = repo?.gitRemoteIdentity?.canonicalKey ?? ''
  return { repoId, workspace, base, repo, repository }
}
