import { useEffect } from 'react'
import { createTaskPageCodeHubApi } from '@/lib/codehub-api'
import type { CodeHubTaskItem } from '../../../../shared/codehub-tasks'
import { RESULT_LIMIT } from './name-field/smart-workspace-name-field-model'
import type { TaskSourceContext } from '../../../../shared/work-items/task-source-context'

type CodeHubSearchInput = {
  debouncedQuery: string
  disabled?: boolean
  onCodeHubIssueSelect?: (item: CodeHubTaskItem, sourceContext: TaskSourceContext | null) => void
  repoBackedSearchTargets: readonly {
    repo: { id: string; path: string }
    codehubSourceContext: TaskSourceContext | null
  }[]
  setCodehubItems: (items: CodeHubTaskItem[]) => void
  setCodehubHasMore: (hasMore: boolean) => void
  setCodehubError: (error: string | null) => void
  setCodehubLoading: (loading: boolean) => void
  codehubRefreshNonce: number
}

// Why: the composer only links CodeHub issues (no MR/PR tab). Search reuses the
// existing codehub listTasks RPC and its owner/local host routing.
export function useSmartWorkspaceCodeHubSearch({
  foundation,
  sourceQueryWithinLimit,
  shouldQueryCodehub
}: {
  foundation: CodeHubSearchInput
  sourceQueryWithinLimit: boolean
  shouldQueryCodehub: boolean
}): void {
  const {
    debouncedQuery,
    disabled,
    onCodeHubIssueSelect,
    repoBackedSearchTargets,
    setCodehubItems,
    setCodehubHasMore,
    setCodehubError,
    setCodehubLoading,
    codehubRefreshNonce
  } = foundation

  useEffect(() => {
    // Why: always drop prior results/hasMore/error first so switching repo or
    // query never leaves stale, clickable rows from another project.
    setCodehubItems([])
    setCodehubHasMore(false)
    setCodehubError(null)
    if (!shouldQueryCodehub || disabled || !onCodeHubIssueSelect) {
      setCodehubLoading(false)
      return
    }
    const targets = repoBackedSearchTargets.filter((target) => target.codehubSourceContext !== null)
    const query = sourceQueryWithinLimit ? debouncedQuery.trim() : ''
    // Why: empty query keeps the design empty-state hint; it must not list the
    // first page of issues (search:undefined would return everything).
    if (targets.length === 0 || query === '') {
      setCodehubLoading(false)
      return
    }
    let stale = false
    setCodehubLoading(true)
    void Promise.allSettled(
      targets.map(async (target) => {
        const api = createTaskPageCodeHubApi(target.codehubSourceContext)
        const listed = await api.listTasks({
          repoPath: target.repo.path,
          repoId: target.repo.id,
          kind: 'issue',
          state: 'opened',
          limit: RESULT_LIMIT,
          search: query
        })
        return {
          hasMore: listed.hasMore,
          items: listed.items.map<CodeHubTaskItem>((item) => ({
            ...item,
            repoId: target.repo.id,
            repoPath: target.repo.path,
            host: listed.remote.host,
            project: listed.remote.project
          }))
        }
      })
    )
      .then((results) => {
        if (stale) {
          return
        }
        const items: CodeHubTaskItem[] = []
        const errors: string[] = []
        let hasMore = false
        for (const result of results) {
          if (result.status === 'fulfilled') {
            items.push(...result.value.items)
            hasMore ||= result.value.hasMore
          } else {
            errors.push(
              result.reason instanceof Error ? result.reason.message : String(result.reason)
            )
          }
        }
        setCodehubItems(items.slice(0, RESULT_LIMIT))
        setCodehubHasMore(hasMore || items.length > RESULT_LIMIT)
        // Why: login/permission/CLI failures must surface, not masquerade as "no results".
        setCodehubError(errors[0] ?? null)
      })
      .catch((error: unknown) => {
        if (!stale) {
          setCodehubItems([])
          setCodehubError(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!stale) {
          setCodehubLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [
    codehubRefreshNonce,
    debouncedQuery,
    disabled,
    onCodeHubIssueSelect,
    repoBackedSearchTargets,
    setCodehubError,
    setCodehubHasMore,
    setCodehubItems,
    setCodehubLoading,
    shouldQueryCodehub,
    sourceQueryWithinLimit
  ])
}
