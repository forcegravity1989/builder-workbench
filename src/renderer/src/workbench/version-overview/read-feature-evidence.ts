import { createOverviewProviderReader } from './overview-provider-port'
import { codehubApi } from '@/lib/codehub-api'
import { lookupGitHubWorkItemDetailsForSource } from '@/lib/github-work-item-source-lookup'
import { nativeTaskPortDeps } from '../native-task-port'
import { resolveReferenceRepo } from '../task-reference-repo'
import { findVersionTaskWorktrees } from '../scoped-task-workspace'
import { readCodeHubIssuePulls } from './codehub-issue-pulls'
import type { VersionCatalogState } from '../use-version-catalog'
import type { CycleTaskSnapshot } from '../version-cycle/ports'
import {
  taskKey,
  linkedPullNumbers,
  validTime,
  type FeatureData,
  type FeaturePull
} from './feature-model'

const problemText = (e: unknown) => (e instanceof Error ? e.message : String(e))
export async function mapLimit<T, R>(
  items: T[],
  run: (item: T) => Promise<R>,
  limit = 4
): Promise<R[]> {
  const output: R[] = []
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        output[i] = await run(items[i]!)
      }
    })
  )
  return output
}

export async function readFeatureEvidence(
  root: CycleTaskSnapshot,
  associated: CycleTaskSnapshot[],
  catalog: VersionCatalogState,
  versions: string[],
  before?: string,
  provider = createOverviewProviderReader()
) {
  const feature: Pick<FeatureData, 'body' | 'createdAt' | 'closedAt' | 'pulls' | 'problems'> = {
    body: '',
    pulls: [],
    problems: []
  }
  const ref = root.reference,
    scope = catalog.scope
  if (!scope) {
    feature.problems.push('工作区来源未就绪')
    return feature
  }
  const repo = resolveReferenceRepo(nativeTaskPortDeps(), scope, ref)
  if (!repo) {
    feature.problems.push('未找到原生仓库来源')
    return feature
  }
  const pullTasks = new Map<number, Map<string, CycleTaskSnapshot>>()
  const addPull = (number: number, task: CycleTaskSnapshot) => {
    if (!pullTasks.has(number)) {
      pullTasks.set(number, new Map())
    }
    pullTasks.get(number)!.set(taskKey(task.reference), task)
  }
  const addBodyLinks = (body: string, task: CycleTaskSnapshot) =>
    linkedPullNumbers(body, task.url).forEach((number) => addPull(number, task))
  await mapLimit(associated, async (task) => {
    try {
      if (ref.provider === 'github') {
        const detail = await lookupGitHubWorkItemDetailsForSource({
          repoPath: repo.path,
          repoId: repo.id,
          sourceContext: task.source,
          number: task.iid,
          type: 'issue'
        })
        if (!detail) {
          throw new Error('Issue 详情未返回')
        }
        addBodyLinks(detail.body, task)
        for (const activity of detail.timelineItems ?? []) {
          if (activity.source?.type === 'pr') {
            addBodyLinks(activity.source.url, task)
          }
        }
        if (task.iid === root.iid) {
          feature.body = detail.body
          feature.createdAt = detail.item.createdAt
          const stateEvents = (detail.timelineItems ?? [])
            .filter(
              (event) => ['closed', 'reopened'].includes(event.event) && validTime(event.createdAt)
            )
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
          const lastState = stateEvents.at(-1)
          feature.closedAt =
            detail.item.state === 'closed' && lastState?.event === 'closed'
              ? lastState.createdAt
              : undefined
        }
      } else if (ref.provider === 'codehub') {
        const detail = await codehubApi.viewTask({
          repoPath: repo.path,
          repoId: repo.id,
          kind: 'issue',
          iid: task.iid
        })
        addBodyLinks(detail.description, task)
        const related = readCodeHubIssuePulls(task)
        related.numbers.forEach((number) => addPull(number, task))
        if (task.iid === root.iid) {
          feature.body = detail.description
          feature.createdAt = detail.createdAt
        }
      }
      const candidates = versions.flatMap((relatedVersion) =>
        findVersionTaskWorktrees(catalog.worktrees, {
          version: relatedVersion,
          number: task.iid,
          source: task.source,
          provider: ref.provider as 'github' | 'codehub',
          repoId: repo.id
        })
      )
      for (const tree of candidates) {
        if (ref.provider === 'github' && tree.linkedPR) {
          addPull(tree.linkedPR, task)
        }
        if (
          ref.provider === 'codehub' &&
          tree.linkedWorkItem?.provider === 'codehub' &&
          tree.linkedWorkItem.type === 'mr'
        ) {
          addPull(tree.linkedWorkItem.number, task)
        }
      }
      if (
        ref.provider === 'codehub' &&
        ![...pullTasks.values()].some((tasks) => tasks.has(taskKey(task.reference)))
      ) {
        feature.problems.push(`#${task.iid}：${readCodeHubIssuePulls(task).reason}`)
      }
    } catch (e) {
      feature.problems.push(`#${task.iid}：${problemText(e)}`)
    }
  })
  const pulls = await mapLimit(
    [...pullTasks.keys()],
    async (number): Promise<FeaturePull | null> => {
      try {
        const readAt = new Date().toISOString()
        if (ref.provider === 'github') {
          const item = await provider.pull(catalog, root, number)
          if (!linkedPullNumbers(item.url, root.url).includes(number)) {
            throw new Error('PR 与特性 Issue 仓库身份不一致')
          }
          if (
            before &&
            validTime(item.createdAt) &&
            Date.parse(item.createdAt) > Date.parse(before)
          ) {
            return null
          }
          return { ...item, tasks: [...pullTasks.get(number)!.values()] }
        }
        const detail = await codehubApi.viewTask({
          repoPath: repo.path,
          repoId: repo.id,
          kind: 'mr',
          iid: number
        })

        return {
          number,
          tasks: [...pullTasks.get(number)!.values()],
          url: detail.url ?? '',
          title: detail.title,
          body: detail.description,
          state: detail.state,
          createdAt: detail.createdAt,
          mergedAt: detail.mergedAt,
          readAt
        }
      } catch (e) {
        feature.problems.push(`PR #${number}：${problemText(e)}`)
        return null
      }
    }
  )

  feature.pulls = pulls.filter((pull): pull is FeaturePull => pull !== null)
  return feature
}
