import type { Repo } from '../../../shared/repo-types'
import type { MetricRange } from '../../../shared/workbench/metrics'
import { addCalendarDays, dayInTimezone } from '../../../shared/workbench/metric-windows'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import { isGitHubBackedRepo } from '../../../shared/project-host-setup-projection'

export type SdlcProvider = 'github' | 'codehub'

export function sdlcProviderOf(
  repo: Pick<Repo, 'upstream' | 'repoIcon' | 'gitRemoteIdentity'> | null | undefined
): SdlcProvider | null {
  if (!repo) {
    return null
  }
  if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    return 'codehub'
  }
  return isGitHubBackedRepo(repo) ? 'github' : null
}

export type CommitPoint = { timestamp?: number }

export type CommitBuckets = {
  /** Per-bucket counts; null marks buckets the truncated history cannot vouch for — never zero-filled. */
  counts: (number | null)[]
  /** True when the native history cap cut off older commits. */
  truncated: boolean
}

export function bucketCommitCounts(
  items: CommitPoint[],
  range: MetricRange,
  timezone: string,
  hasMore: boolean
): CommitBuckets {
  const step = range.granularity === 'week' ? 7 : 1
  const buckets: string[] = []
  for (let day = range.since; day < range.until; day = addCalendarDays(day, step)) {
    buckets.push(day)
  }
  const dated = items
    .map((item) => (typeof item.timestamp === 'number' ? item.timestamp : null))
    .filter((timestamp): timestamp is number => timestamp !== null && Number.isFinite(timestamp))
  const counts = buckets.map((bucketStart) => {
    const bucketEnd = addCalendarDays(bucketStart, step)
    if (hasMore || dated.length !== items.length) {
      return null
    }
    return dated.filter((timestamp) => {
      const day = dayInTimezone(new Date(timestamp).toISOString(), timezone)
      return day >= bucketStart && day < bucketEnd
    }).length
  })
  return { counts, truncated: hasMore }
}

export type SdlcSnapshot = { count: number; truncated: boolean; readAt: string; source?: string }
export type SdlcSeries<T> = { kind: 'ready'; value: T } | { kind: 'error'; message: string }

export type SdlcCommits = {
  items: CommitPoint[]
  hasMore: boolean
  readAt: string
  source?: string
}
