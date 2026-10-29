import { codehubApi } from '@/lib/codehub-api'
import {
  lookupGitHubWorkItemDetailsForSource,
  lookupGitHubWorkItemForSource
} from '@/lib/github-work-item-source-lookup'
import { nativeTaskPortDeps } from '../native-task-port'
import { resolveReferenceRepo } from '../task-reference-repo'
import { findVersionTaskWorktrees } from '../scoped-task-workspace'
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
export async function mapLimit<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = []
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
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
  before?: string
) {
  const feature: Pick<FeatureData, 'body' | 'createdAt' | 'pulls' | 'problems'> = {
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
        }
      } else if (ref.provider === 'codehub') {
        const detail = await codehubApi.viewTask({
          repoPath: repo.path,
          repoId: repo.id,
          kind: 'issue',
          iid: task.iid
        })
        addBodyLinks(detail.description, task)
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
          // Historical views must not load later PR files, comments and checks.
          if (before) {
            const item = await lookupGitHubWorkItemForSource({
              repoPath: repo.path,
              repoId: repo.id,
              sourceContext: root.source,
              number,
              type: 'pr'
            })
            if (
              item &&
              validTime(item.createdAt) &&
              Date.parse(item.createdAt) > Date.parse(before)
            ) {
              return null
            }
          }
          const detail = await lookupGitHubWorkItemDetailsForSource({
            repoPath: repo.path,
            repoId: repo.id,
            sourceContext: root.source,
            number,
            type: 'pr'
          })
          if (!detail) {
            throw new Error('PR 详情未返回')
          }
          return {
            number,
            tasks: [...pullTasks.get(number)!.values()],
            url: detail.item.url,
            title: detail.item.title,
            body: detail.body,
            state: detail.item.state,
            createdAt: detail.item.createdAt,
            mergedAt: detail.item.mergedAt,
            revision: detail.headSha,
            readAt
          }
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
