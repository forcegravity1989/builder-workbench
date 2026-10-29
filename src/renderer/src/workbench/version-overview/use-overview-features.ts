import { useEffect, useState } from 'react'
import { nativeTaskReferenceReader } from '../native-task-port'
import { cycleTaskRead, type TaskReferenceValue } from '../task-reference-reader'
import type { VersionCatalogState } from '../use-version-catalog'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { CycleTaskReference, CycleTaskSnapshot } from '../version-cycle/ports'
import {
  taskKey,
  referenceForPlan,
  featureNumber,
  pullPhase,
  eventsFromPulls,
  validTime,
  PARSER_REVISION,
  type FeatureData,
  type FeaturePull
} from './feature-model'

import { versionDeliveryEvents } from './version-evidence'
import { readVersionEvidence } from './read-version-evidence'
import { mapLimit, readFeatureEvidence } from './read-feature-evidence'

const problemText = (e: unknown) => (e instanceof Error ? e.message : String(e))
export function useOverviewFeatures(args: {
  catalog: VersionCatalogState
  plan: PlanningMaterial | null
  planSource: 'committed' | 'draft'
  version: string
  before?: string
  historical: boolean
  refreshToken: number
}) {
  const { catalog, plan, planSource, version, before, historical, refreshToken } = args
  const key = JSON.stringify([
    catalog.scope,
    plan?.tasks,
    catalog.catalog?.entries.map((e) => [e.version, e.tasks, e.goals, e.material, e.draft]),
    version,
    before,
    historical,
    refreshToken,
    catalog.worktrees.map((tree) => [
      tree.id,
      tree.repoId,
      tree.hostId,
      tree.runtimeOwnerEnvironmentId,
      tree.linkedPR,
      tree.linkedWorkItem,
      tree.workbenchVersionBinding
    ])
  ])
  const [state, setState] = useState<{
    key: string
    features: FeatureData[]
    problems: string[]
    loading: boolean
  }>({ key: '', features: [], problems: [], loading: true })
  useEffect(() => {
    let cancelled = false
    if (!catalog.scope || !plan) {
      return () => {
        cancelled = true
      }
    }
    const scope = catalog.scope
    void (async () => {
      const versionEvidence = await readVersionEvidence(catalog)
      const entries = versionEvidence.plans.filter((entry) => entry.version !== version)
      entries.unshift({ version, tasks: plan.tasks, goals: plan.goals, source: planSource })
      const refs = [
        ...new Map(
          [...entries.flatMap((entry) => entry.tasks), ...plan.tasks].map((r) => [taskKey(r), r])
        ).values()
      ]
      const values = await nativeTaskReferenceReader.read(scope, refs, refreshToken > 0)
      const reads = new Map<string, { task: CycleTaskSnapshot; value: TaskReferenceValue }>()
      const problems: string[] = [...versionEvidence.problems]
      values.forEach((value, i) => {
        const ref = refs[i]!,
          read = cycleTaskRead(ref, value)
        if (read.kind === 'ready' && value.kind !== 'unavailable' && value.item.type === 'issue') {
          reads.set(taskKey(ref), { task: read.task, value })
        } else if (read.kind === 'unavailable') {
          problems.push(`${ref.repository} #${ref.number}：${read.error}`)
        }
      })
      const needed = new Map<string, CycleTaskReference>()
      for (const ref of plan.tasks) {
        const read = reads.get(taskKey(ref))
        if (!read) {
          continue
        }
        const number = featureNumber(read.task)
        if (number !== null) {
          const root = { ...ref, number }
          needed.set(taskKey(root), root)
        } else if (read.task.title.includes('【特性#')) {
          problems.push(`#${ref.number} 的特性引用不明确`)
        }
      }
      const missing = [...needed.values()].filter((r) => !reads.has(taskKey(r)))
      if (missing.length) {
        const roots = await nativeTaskReferenceReader.read(scope, missing)
        roots.forEach((value, i) => {
          const read = cycleTaskRead(missing[i]!, value)
          if (
            read.kind === 'ready' &&
            value.kind !== 'unavailable' &&
            value.item.type === 'issue'
          ) {
            reads.set(taskKey(missing[i]!), { task: read.task, value })
          }
        })
      }
      const features = await mapLimit(
        [...needed.values()],
        async (ref): Promise<FeatureData | null> => {
          const rootRead = reads.get(taskKey(ref))?.task
          if (!rootRead?.labels?.some((label) => label.trim() === '特性')) {
            problems.push(`#${ref.number} 的特性主单未读取或未标记“特性”`)
            return null
          }
          const root = { ...rootRead, reference: referenceForPlan(rootRead.reference, plan.tasks) }
          const members = plan.tasks.flatMap((r) => {
            const task = reads.get(taskKey(r))?.task
            return task && taskKey({ ...r, number: featureNumber(task) ?? -1 }) === taskKey(ref)
              ? [{ ...task, reference: r }]
              : []
          })
          const feature: FeatureData = {
            root,
            body: '',
            members,
            pulls: [],
            events: [],
            problems: [],
            versions: []
          }
          feature.versions = entries.flatMap((entry) => {
            const matching = entry.tasks.filter((r) => {
              const task = reads.get(taskKey(r))?.task
              return task && taskKey({ ...r, number: featureNumber(task) ?? -1 }) === taskKey(ref)
            })
            return matching.length
              ? [
                  {
                    version: entry.version,
                    scope:
                      (entry.source === 'draft' ? '计划草稿 · ' : '') +
                        matching
                          .map((r) => entry.goals.find((g) => g.goalId === r.goalId)?.title)
                          .filter(Boolean)
                          .join('；') || '计划未记录目标范围'
                  }
                ]
              : []
          })
          const associated = [...reads.values()]
            .map((read) => read.task)
            .filter(
              (task) =>
                taskKey({ ...task.reference, number: featureNumber(task) ?? -1 }) === taskKey(ref)
            )
          Object.assign(
            feature,
            await readFeatureEvidence(root, associated, catalog, [
              ...new Set([version, ...feature.versions.map((item) => item.version)])
            ])
          )
          const pulls = historical && !before ? [] : feature.pulls
          feature.pulls = pulls
            .filter((p): p is FeaturePull => Boolean(p))
            .filter(
              (p) =>
                !before ||
                (validTime(p.createdAt) && Date.parse(p.createdAt) <= Date.parse(before)) ||
                (p.state === 'merged' &&
                  validTime(p.mergedAt) &&
                  Date.parse(p.mergedAt) <= Date.parse(before))
            )
          for (const pull of feature.pulls) {
            pull.phase = pullPhase(pull.body, feature.body, pull.url)
            pull.sessions = (pull.tasks ?? []).flatMap((task) =>
              entries
                .filter((entry) =>
                  entry.tasks.some((reference) => taskKey(reference) === taskKey(task.reference))
                )
                .map((entry) => ({
                  task: { ...task, reference: referenceForPlan(task.reference, entry.tasks) },
                  version: entry.version
                }))
            )
          }
          feature.events = eventsFromPulls(feature.pulls, before)
          if (
            (!historical || before) &&
            validTime(feature.createdAt) &&
            (!before || Date.parse(feature.createdAt) <= Date.parse(before))
          ) {
            feature.events.unshift({
              id: `${root.url}:created`,
              phase: 'issue',
              label: '特性 Issue 创建',
              at: feature.createdAt,
              url: root.url,
              readAt: root.readAt,
              rule: PARSER_REVISION
            })
          }
          return feature
        }
      )
      const validFeatures = features.filter((f): f is FeatureData => f !== null)
      for (const feature of validFeatures) {
        const associated = new Set(
          [...reads.values()]
            .filter(
              ({ task }) =>
                taskKey({ ...task.reference, number: featureNumber(task) ?? -1 }) ===
                taskKey(feature.root.reference)
            )
            .map(({ task }) => taskKey(task.reference))
        )
        if (historical && !before) {
          feature.events = []
          feature.problems.push('历史验收确认时间未记录，暂不展示动态时序')
          continue
        }
        feature.events.push(
          ...versionDeliveryEvents(
            versionEvidence.records,
            associated,
            before,
            versionEvidence.problems.length === 0 &&
              values.every((value) => value.kind !== 'unavailable') &&
              !catalog.catalog?.problems.length
          )
        )
        if (!feature.versions.some((v) => v.version === version)) {
          feature.versions.unshift({
            version,
            scope: plan.goals
              .filter((goal) => feature.members.some((m) => m.reference.goalId === goal.goalId))
              .map((goal) => goal.title)
              .join('；')
          })
        }
      }
      if (!cancelled) {
        setState({ key, features: validFeatures, problems, loading: false })
      }
    })().catch((e) => {
      if (!cancelled) {
        setState({ key, features: [], problems: [problemText(e)], loading: false })
      }
    })
    return () => {
      cancelled = true
    }
    // Identity includes source owners and plan references, not unrelated store renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state : { features: [], problems: [], loading: Boolean(plan) }
}
