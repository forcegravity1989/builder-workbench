import { useCallback, useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import { useSnapshotCache } from '../snapshot-cache'
import type { TaskReadHome } from '../task-reference-repo'
import {
  emptyMembershipRead,
  membershipEntry,
  membershipRepo,
  refreshVersionIssues,
  versionIssueReferences
} from './version-membership'

const noMembership = {
  read: () => emptyMembershipRead,
  subscribe: () => () => {}
}

export type VersionMembership = ReturnType<typeof useVersionMembership>

export function useVersionMembership(
  scope: TaskReadHome | null,
  plan: { version: string; goals: readonly { goalId: string }[] } | null | undefined
) {
  const repo = useAppStore((state) => membershipRepo(state.repos, scope))
  const version = plan?.version
  const entry = repo && version ? membershipEntry(repo, version) : noMembership
  const { issues, error, busy } = useSnapshotCache(entry)
  useEffect(() => {
    if (repo && version) {
      void refreshVersionIssues(repo, version)
    }
  }, [repo, version, entry])
  const refresh = useCallback(
    () => (repo && version ? refreshVersionIssues(repo, version, true) : Promise.resolve()),
    [repo, version]
  )
  const goals = plan?.goals
  const references = useMemo(
    () => (issues && version && goals ? versionIssueReferences(issues, version, goals) : null),
    [issues, version, goals]
  )
  return {
    references,
    error: error ?? (scope && version && !repo ? '未找到本版所属仓库' : null),
    busy,
    refresh
  }
}
