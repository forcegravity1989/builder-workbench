import { createOverviewProviderReader } from './overview-provider-port'
import { nativeTaskReferenceReader } from '../native-task-port'
import { cycleTaskRead } from '../task-reference-reader'
import type { VersionCatalogState } from '../use-version-catalog'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { CycleTaskReference, CycleTaskSnapshot } from '../version-cycle/ports'
import {
  taskKey,
  referenceForPlan,
  featureNumber,
  pullPhase,
  validTime,
  type FeatureData,
  type FeaturePull
} from './feature-model'

import { applyVersionEvidence, type OverviewVersionPlan } from './version-evidence'
import { readVersionEvidence } from './read-version-evidence'
import { mapLimit, readFeatureEvidence } from './read-feature-evidence'
import { featureHistoryScopes } from './feature-history-scope'

export type OverviewFeatureArgs = {
  catalog: VersionCatalogState
  plan: PlanningMaterial
  planSource: 'committed' | 'draft'
  version: string
  before?: string
  historical: boolean
}
export async function readOverviewFeatures(args: OverviewFeatureArgs, force: boolean) {
  const { catalog, plan, planSource, version, before, historical } = args
  const scope = catalog.scope
  if (!scope) {
    throw new Error('项目来源未就绪')
  }
  const reads = new Map<string, CycleTaskSnapshot>()
  const failures = new Map<string, string>()
  const problems: string[] = []
  const readVersions = () =>
    readVersionEvidence(catalog, force, { document: plan, source: planSource })
  const history = historical ? await readVersions() : undefined
  const snapshots = history?.plans.find((entry) => entry.version === version)?.taskSnapshot
  const identities = new Map<string, Pick<CycleTaskSnapshot, 'iid' | 'title' | 'labels'>>()
  for (const ref of plan.tasks) {
    const matches = snapshots?.filter((snapshot) => taskKey(snapshot.reference) === taskKey(ref))
    const snapshot = matches?.length === 1 ? matches[0] : undefined
    if (snapshot?.kind === 'ready') {
      identities.set(taskKey(ref), {
        iid: snapshot.iid,
        title: snapshot.title,
        labels: snapshot.labels
      })
    }
  }
  const identityFor = (ref: CycleTaskReference) =>
    identities.get(taskKey(ref)) ?? reads.get(taskKey(ref))
  async function readTasks(refs: CycleTaskReference[], required = false) {
    const values = await nativeTaskReferenceReader.read(scope!, refs, force)
    values.forEach((value, i) => {
      const ref = refs[i]!,
        read = cycleTaskRead(ref, value)
      if (read.kind === 'ready' && value.kind !== 'unavailable' && value.item.type === 'issue') {
        reads.set(taskKey(ref), read.task)
      } else if (read.kind === 'unavailable') {
        const message = `${ref.repository} #${ref.number}：${read.error}`
        failures.set(taskKey(ref), message)
        if (required) {
          problems.push(message)
        }
      }
    })
  }
  await readTasks([...new Map(plan.tasks.map((ref) => [taskKey(ref), ref])).values()], true)
  const needed = new Map<string, CycleTaskReference>()
  for (const ref of plan.tasks) {
    const read = identityFor(ref)
    if (!read) {
      continue
    }
    const number = featureNumber(read)
    if (number !== null) {
      const root = { ...ref, number }
      needed.set(taskKey(root), root)
    } else if (read.title.includes('【特性#')) {
      problems.push(`#${ref.number} 的特性引用不明确`)
    }
  }
  const missing = [...needed.values()].filter((r) => !reads.has(taskKey(r)))
  if (missing.length) {
    await readTasks(missing)
  }
  const roots = [...needed.values()].filter((ref) => {
    if (
      reads.has(taskKey(ref)) &&
      identityFor(ref)?.labels?.some((label) => label.trim() === '特性')
    ) {
      return true
    }
    problems.push(`#${ref.number} 的特性主单未读取或未标记“特性”`)
    return false
  })
  if (!roots.length) {
    return { features: [], problems }
  }
  const versionEvidence = history ?? (await readVersions())
  const historyComplete =
    catalog.materialReady &&
    !catalog.materialError &&
    !(catalog.catalog?.entries ?? []).some(
      (entry) =>
        (entry.material.plan || entry.material.acceptance || entry.problems.length > 0) &&
        !versionEvidence.plans.some(
          (read) => read.version === entry.version && read.source === 'committed'
        )
    )
  const entries = versionEvidence.plans.filter((entry) => entry.version !== version)
  const current = versionEvidence.plans.find((entry) => entry.version === version)
  entries.unshift({
    version,
    tasks: plan.tasks,
    goals: plan.goals,
    source: planSource,
    taskSnapshot: historical ? current?.taskSnapshot : undefined,
    archive: current?.archive,
    confirmation: planSource === 'committed' ? current?.confirmation : undefined
  })
  // Failed materials may still have catalog references, but cannot supply verified goal scope.
  const relationEntries: OverviewVersionPlan[] = [
    ...entries,
    ...(catalog.catalog?.entries ?? [])
      .filter((entry) => !entries.some((read) => read.version === entry.version))
      .map((entry) => ({
        version: entry.version,
        tasks: entry.tasks,
        goals: [],
        source:
          entry.material.plan || entry.material.acceptance
            ? ('committed' as const)
            : ('draft' as const)
      }))
  ]
  const cutoff = historical ? before : undefined
  const discovery = featureHistoryScopes(relationEntries, roots, version, reads, cutoff)
  await readTasks(discovery.candidates.filter((ref) => !failures.has(taskKey(ref))))
  const { scopes } = featureHistoryScopes(relationEntries, roots, version, reads, cutoff)
  const versionProblems = [
    ...versionEvidence.problems,
    ...(catalog.catalog?.entries ?? []).flatMap((entry) =>
      entry.problems.map((problem) => ({
        version: entry.version,
        message: `${entry.version}：${problem.message}`
      }))
    )
  ]
  const provider = createOverviewProviderReader()
  const features = await mapLimit(roots, async (ref): Promise<FeatureData> => {
    const rootRead = reads.get(taskKey(ref))!
    const root = {
      ...rootRead,
      ...identityFor(ref),
      reference: referenceForPlan(rootRead.reference, plan.tasks)
    }
    const members = plan.tasks.flatMap((r) => {
      const task = reads.get(taskKey(r))
      const identity = identityFor(r)
      return task &&
        identity &&
        taskKey({ ...r, number: featureNumber(identity) ?? -1 }) === taskKey(ref)
        ? [{ ...task, ...identity, reference: r }]
        : []
    })
    const relation = scopes.get(taskKey(ref))!
    const relatedKeys = new Set([...relation.byVersion.values()].flatMap((keys) => [...keys]))
    relatedKeys.add(taskKey(ref))
    const scopedEntries = entries
      .map((entry) => ({
        ...entry,
        tasks: entry.tasks.filter((r) => relation.byVersion.get(entry.version)?.has(taskKey(r)))
      }))
      .filter((entry) => entry.tasks.length)
    const scopedRecords = versionEvidence.records
      .map((record) => ({
        ...record,
        plan: {
          ...record.plan,
          tasks: record.plan.tasks.filter((r) =>
            relation.byVersion.get(record.version)?.has(taskKey(r))
          )
        }
      }))
      .filter((record) => record.plan.tasks.length)
    const relatedProblems = versionProblems
      .filter((problem) => problem.version === version || relation.byVersion.has(problem.version))
      .map((problem) => problem.message)
    const feature: FeatureData = {
      root,
      body: '',
      members,
      pulls: [],
      events: [],
      problems: [],
      versions: []
    }
    feature.versions = scopedEntries.flatMap((entry) => {
      const matching = entry.tasks
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
    const associated = [...reads.values()].filter((task) =>
      relatedKeys.has(taskKey(task.reference))
    )
    Object.assign(
      feature,
      await readFeatureEvidence(
        root,
        associated,
        catalog,
        [...new Set([version, ...feature.versions.map((item) => item.version)])],
        before,
        provider
      )
    )
    feature.problems.push(
      ...relatedProblems,
      ...[...relatedKeys].flatMap((key) => (failures.has(key) ? [failures.get(key)!] : []))
    )
    const pulls = historical && !before ? [] : feature.pulls
    feature.pulls = pulls
      .filter((p): p is FeaturePull => Boolean(p))
      .filter((p) => {
        if (
          !before ||
          (p.state === 'merged' &&
            validTime(p.mergedAt) &&
            Date.parse(p.mergedAt) <= Date.parse(before))
        ) {
          return true
        }
        if (validTime(p.createdAt)) {
          return Date.parse(p.createdAt) <= Date.parse(before)
        }
        feature.problems.push(`PR/MR #${p.number} 创建时间未记录，历史阶段待核对`)
        return true
      })
    for (const pull of feature.pulls) {
      if (
        historical &&
        before &&
        validTime(pull.mergedAt) &&
        Date.parse(pull.mergedAt) > Date.parse(before)
      ) {
        pull.state = 'unknown'
        pull.mergedAt = undefined
      }
      pull.phase = pullPhase(pull.body, feature.body, pull.url)
    }
    applyVersionEvidence(
      feature,
      scopedEntries,
      scopedRecords,
      relatedKeys,
      historical,
      before,
      historyComplete && relation.complete && relatedProblems.length === 0,
      version
    )
    return feature
  })
  for (const feature of features) {
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
  return { features, problems }
}
