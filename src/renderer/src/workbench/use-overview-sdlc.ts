import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { MetricRange } from '../../../shared/workbench/metrics'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import {
  sdlcProviderOf,
  type SdlcCommits,
  type SdlcProvider,
  type SdlcSeries,
  type SdlcSnapshot
} from './overview-sdlc'
import { readSdlcCommits, readSdlcRemote } from './overview-sdlc-readings'

export type OverviewSdlcState = {
  provider: SdlcProvider | null
  commits: SdlcSeries<SdlcCommits> | null
  merges: SdlcSeries<SdlcCommits> | null
  issues: SdlcSeries<SdlcSnapshot> | null
  busy: boolean
}
export function useOverviewSdlc(args: {
  repo: Repo | null
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  baseWorktreePath: string | null
  range: MetricRange
}): OverviewSdlcState {
  const { repo, baseScope, baseWorktreeId, baseWorktreePath, range } = args
  const provider = useMemo(() => sdlcProviderOf(repo), [repo])
  const key = JSON.stringify([repo?.id, repo?.path, baseScope, baseWorktreeId, range])
  const [data, setData] = useState<
    Pick<OverviewSdlcState, 'commits' | 'merges' | 'issues'> & { key: string }
  >({
    key,
    commits: null,
    merges: null,
    issues: null
  })
  const [busy, setBusy] = useState(false)
  const epoch = useRef(0)
  const invalidate = useCallback(() => {
    epoch.current++
  }, [])
  const load = useCallback(async () => {
    const sequence = ++epoch.current
    if (!repo || !baseScope || !baseWorktreeId || !baseWorktreePath) {
      setData({ key, commits: null, merges: null, issues: null })
      setBusy(false)
      return
    }
    setBusy(true)
    const current = () => sequence === epoch.current
    const [commits, merges, issues] = await Promise.all([
      readSdlcCommits({
        ownerEnvironmentId: baseScope.runtimeOwnerEnvironmentId,
        worktreeId: baseWorktreeId,
        worktreePath: baseWorktreePath,
        range,
        current
      }),
      provider ? readSdlcRemote(repo, provider, 'pr', range, current) : null,
      provider ? readSdlcRemote(repo, provider, 'issue', range, current) : null
    ])
    if (current()) {
      setData({ key, commits, merges, issues })
      setBusy(false)
    }
  }, [repo, baseScope, baseWorktreeId, baseWorktreePath, provider, range, key])
  useEffect(() => {
    setData({ key, commits: null, merges: null, issues: null })
    void load()
    return invalidate
  }, [load, invalidate, key])
  return {
    provider,
    ...(data.key === key ? data : { commits: null, merges: null, issues: null }),
    busy
  }
}
