import {
  getRepoTaskSourceContext,
  getTaskPageRepoSourceContext
} from '@/components/task-page-source-context'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import { normalizeGitRemoteUrl } from '../../../shared/git-remote-identity'
import { getProjectProviderIdentity } from '../../../shared/project-host-setup-projection'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { codeHubTaskItemFromDetail } from './codehub-task-item'
import { createSnapshotCache } from './snapshot-cache'
import type { TaskPortDeps } from './task-port'
import {
  gitHubIdentityForTaskReference,
  knownGitHubIssueSource,
  resolveReferenceRepo,
  viewCodeHubTaskByIid,
  type TaskReadHome
} from './task-reference-repo'
import type { CycleTaskRead, CycleTaskReference } from './version-cycle/ports'

type ReadyValue = { source: TaskSourceContext; readAt: string } & (
  | { kind: 'github'; item: GitHubWorkItem }
  | { kind: 'codehub'; item: CodeHubTaskItem; state: string }
)
export type TaskReferenceValue =
  | ReadyValue
  | {
      kind: 'unavailable'
      error: string
      readAt: string
    }

export function cycleTaskRead(
  reference: CycleTaskReference,
  value: TaskReferenceValue
): CycleTaskRead {
  if (value.kind === 'unavailable') {
    return { reference, ...value }
  }
  const item = value.item
  return {
    kind: 'ready',
    reference,
    task: {
      reference,
      source: value.source,
      iid: value.kind === 'github' ? value.item.number : value.item.iid,
      title: item.title,
      state: value.kind === 'codehub' ? value.state : item.state,
      url: item.url,
      labels: item.labels,
      assignee:
        value.kind === 'github' ? value.item.assignees?.[0]?.login : value.item.assignees?.[0],
      readAt: value.readAt
    }
  }
}

/** Full native rows and board facts share one renderer-lifetime source cache.
 * A read always checks the provider; cached() only supplies the previous display. */
export function createTaskReferenceReader(deps: TaskPortDeps) {
  const cache = createSnapshotCache<TaskReferenceValue | null>(() => null, 500)
  // One pool across overlapping goals/pages, including CodeHub's issue/MR fallback.
  let active = 0
  const waiting: (() => void)[] = []
  async function limited<T>(run: () => Promise<T>): Promise<T> {
    if (active < 6) {
      active++
    } else {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    try {
      return await run()
    } finally {
      const next = waiting.shift()
      if (next) {
        next()
      } else {
        active--
      }
    }
  }
  function locate(home: TaskReadHome, reference: CycleTaskReference) {
    const repo = resolveReferenceRepo(deps, home, reference)
    const context =
      repo && (reference.provider === 'github' || reference.provider === 'codehub')
        ? getTaskPageRepoSourceContext(repo, reference.provider)
        : null
    const issueSource =
      repo && reference.provider === 'github'
        ? gitHubIdentityForTaskReference(repo, reference.repository)
        : undefined
    const source =
      context?.localTaskAccount && issueSource
        ? {
            ...context,
            taskRemoteCandidates: undefined,
            providerIdentity: { provider: 'github' as const, ...issueSource }
          }
        : context
    // 任务数据固定本机，缓存按远端项目身份归并；同一项目跨主机多行登记共用一份。
    const repository = normalizeGitRemoteUrl(reference.repository) ?? reference.repository
    const key = JSON.stringify([
      reference.provider,
      reference.kind,
      repository,
      knownGitHubIssueSource(repo ?? undefined, repository),
      source?.providerIdentity,
      repo?.issueSourcePreference ?? 'auto',
      reference.number
    ])
    return { repo, source, key, entry: cache(key) }
  }
  function forRepo(
    value: TaskReferenceValue,
    repo: ReturnType<typeof resolveReferenceRepo>
  ): TaskReferenceValue {
    if (value.kind === 'unavailable' || !repo) {
      return value
    }
    const source = getRepoTaskSourceContext(repo, value.kind) ?? value.source
    return value.kind === 'github'
      ? { ...value, item: { ...value.item, repoId: repo.id }, source }
      : { ...value, item: { ...value.item, repoId: repo.id, repoPath: repo.path }, source }
  }
  function unavailable(reason: unknown): TaskReferenceValue {
    return {
      kind: 'unavailable',
      error: reason instanceof Error ? reason.message : String(reason),
      readAt: deps.now()
    }
  }
  type Job = ReturnType<typeof locate> & {
    reference: CycleTaskReference
    consumers: Set<AbortSignal | undefined>
    needed(): boolean
    finish(value: TaskReferenceValue): void
  }
  const pendingJobs = new Map<string, Job>()
  function requireJob(job: Job) {
    if (!job.needed()) {
      const reason = new DOMException('读取已取消', 'AbortError')
      job.finish(unavailable(reason))
      throw reason
    }
  }
  async function single(job: Job): Promise<void> {
    try {
      const value = await limited(async (): Promise<ReadyValue> => {
        requireJob(job)
        const { repo, source, reference } = job
        if (!repo) {
          throw new Error(`未在已登记项目中找到引用仓库 ${reference.repository}`)
        }
        if (!source) {
          throw new Error(`provider ${reference.provider} 尚未接入 Workbench 任务读取`)
        }
        if (reference.provider === 'github') {
          const item = await deps.lookupGitHubWorkItem({
            repoPath: repo.path,
            repoId: repo.id,
            sourceContext: source,
            number: reference.number,
            issueSource: source.localTaskAccount
              ? gitHubIdentityForTaskReference(repo, reference.repository)
              : knownGitHubIssueSource(repo, reference.repository)
          })
          if (!item) {
            throw new Error(`GitHub 未返回编号 ${reference.number} 的工作项`)
          }
          return {
            kind: 'github',
            item: { ...item, repoId: repo.id },
            source: getRepoTaskSourceContext(repo, 'github') ?? source,
            readAt: deps.now()
          }
        }
        const { kind, detail } = await viewCodeHubTaskByIid(deps, repo, reference, () =>
          requireJob(job)
        )
        if (!/^(open|opened|closed|merged)$/i.test(detail.state)) {
          throw new Error(`CodeHub 未返回可识别的任务状态：${detail.state}`)
        }
        const item = codeHubTaskItemFromDetail({ detail, kind, repo })
        if (!item.url) {
          throw new Error('CodeHub 未返回该任务的链接')
        }
        return { kind: 'codehub', item, state: detail.state, source, readAt: deps.now() }
      })
      job.finish(value)
    } catch (reason) {
      job.finish(unavailable(reason))
    }
  }
  async function load(jobs: Job[]): Promise<void> {
    const groups = new Map<string, { owner: string; repo: string; host: string; jobs: Job[] }>()
    const singles: Job[] = []
    for (const job of jobs) {
      // Fork issue preferences and PR remotes are resolved by the native reader;
      // a project identity alone cannot choose the repository for kindless refs.
      const parsed = job.repo
        ? getProjectProviderIdentity({
            gitRemoteIdentity: job.repo.gitRemoteIdentity,
            upstream: null,
            repoIcon: null
          })
        : null
      if (
        !deps.lookupGitHubWorkItems ||
        job.reference.provider !== 'github' ||
        !job.source ||
        (job.repo &&
          knownGitHubIssueSource(job.repo, job.reference.repository) &&
          job.reference.repository !== job.repo.gitRemoteIdentity?.canonicalKey) ||
        !parsed ||
        job.repo?.upstream ||
        (job.repo?.gitRemoteIdentity?.remoteName &&
          job.repo.gitRemoteIdentity.remoteName !== 'origin') ||
        job.repo?.issueSourcePreference === 'upstream' ||
        parsed.host?.includes(':')
      ) {
        singles.push(job)
        continue
      }
      const host = parsed.host ?? 'github.com'
      const key = JSON.stringify([host, parsed.owner, parsed.repo])
      const group = groups.get(key)
      if (group) {
        group.jobs.push(job)
      } else {
        groups.set(key, { host, owner: parsed.owner, repo: parsed.repo, jobs: [job] })
      }
    }
    const reads: Promise<void>[] = singles.map(single)
    for (const group of groups.values()) {
      // Match one native GraphQL query per call: failure cannot discard another
      // successful chunk, and no call exceeds the native 200-number ceiling.
      for (let start = 0; start < group.jobs.length; start += 20) {
        const chunk = group.jobs.slice(start, start + 20)
        reads.push(
          limited(() => {
            const needed = chunk.filter((job) => job.needed())
            if (!needed.length) {
              return Promise.resolve({ items: [] })
            }
            return deps.lookupGitHubWorkItems!({
              host: group.host === 'github.com' ? null : group.host,
              owner: group.owner,
              repo: group.repo,
              numbers: [...new Set(needed.map((job) => job.reference.number))]
            })
          }).then(
            async (result) => {
              const byNumber = new Map(result.items.map((item) => [item.number, item]))
              await Promise.all(
                chunk.map(async (job) => {
                  const item = byNumber.get(job.reference.number)
                  if (item && job.repo && job.source) {
                    job.finish({
                      kind: 'github',
                      item: { ...item, repoId: job.repo.id },
                      source: getRepoTaskSourceContext(job.repo, 'github') ?? job.source,
                      readAt: deps.now()
                    })
                    return
                  }
                  await single(job)
                })
              )
            },
            () => Promise.all(chunk.map(single)).then(() => {})
          )
        )
      }
    }
    await Promise.all(reads)
  }
  async function read(
    home: TaskReadHome,
    references: readonly CycleTaskReference[],
    force = false,
    signal?: AbortSignal
  ): Promise<TaskReferenceValue[]> {
    signal?.throwIfAborted()
    if (force) {
      // A click during a previous load requests another source check after it.
      await Promise.all(references.flatMap((ref) => locate(home, ref).entry.pending ?? []))
      signal?.throwIfAborted()
    }
    const jobs: Job[] = []
    const pending = references.map((reference) => {
      const target = locate(home, reference)
      const { entry } = target
      if (!entry.pending) {
        let complete = () => {}
        let settled = false
        entry.pending = new Promise<void>((resolve) => {
          complete = resolve
        })
        const consumers = new Set([signal])
        const needed = () => [...consumers].some((consumer) => !consumer?.aborted)
        const job: Job = {
          ...target,
          reference,
          consumers,
          needed,
          finish(value) {
            if (settled) {
              return
            }
            settled = true
            if (needed()) {
              entry.publish(value)
            }
            pendingJobs.delete(target.key)
            entry.pending = null
            complete()
          }
        }
        pendingJobs.set(target.key, job)
        jobs.push(job)
      } else {
        pendingJobs.get(target.key)?.consumers.add(signal)
      }
      return entry.pending.then(() =>
        forRepo(entry.read() ?? unavailable('未读取到任务'), target.repo)
      )
    })
    void load(jobs).catch((reason) => {
      for (const job of jobs) {
        if (job.entry.pending) {
          job.finish(unavailable(reason))
        }
      }
    })
    const values = await Promise.all(pending)
    signal?.throwIfAborted()
    return values
  }
  function cached(
    home: TaskReadHome,
    references: readonly CycleTaskReference[]
  ): TaskReferenceValue[] | null {
    const values = references.map((reference) => {
      const { entry, repo } = locate(home, reference)
      const value = entry.read()
      return value && forRepo(value, repo)
    })
    return values.some(Boolean) ? values.map((value) => value ?? unavailable('尚未读取')) : null
  }
  const key = (home: TaskReadHome, references: readonly CycleTaskReference[]) =>
    JSON.stringify(references.map((reference) => locate(home, reference).key))
  return { read, cached, key }
}

export type TaskReferenceReader = ReturnType<typeof createTaskReferenceReader>
