import { acceptedIssueEvidence } from './version-acceptance/acceptance-task-evidence'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../shared/workbench/version-material'
import type {
  MilestoneFeature,
  MilestoneMaterial,
  MilestonePhase
} from '../../../shared/workbench/project-milestones'
import { plannedDay } from '../../../shared/workbench/milestone-sdlc'
import type { VersionOverviewMaterials } from './version-overview-materials'
import { taskKey, validTime, type FeatureData } from './version-overview/feature-model'
import type { CycleTaskRead, CycleTaskReference } from './version-cycle/ports'

export type MilestoneFeatureIdentity = Pick<FeatureData, 'root'> & { currentTitle?: string }

export type MilestoneVersionFacts = {
  /** Catalog identity remains known while the fixed plan reader is pending. */
  version?: { version: string; cycleId: string }
  plan: Pick<PlanningMaterial, 'version' | 'cycleId' | 'goals' | 'tasks' | 'timeWindow'> | null
  formalPlan: boolean
  /** Only a merged archive with its verified fixed plan can supply human results. */
  acceptance: Pick<AcceptanceMaterial, 'results' | 'taskSnapshot'> | null
  features: MilestoneFeatureIdentity[]
  /** Missing task identities are scoped to fixed-plan goals; material failures leave this absent. */
  identityFailures?: CycleTaskReference[]
  loading: boolean
  failed: boolean
  stale: boolean
  readAt?: string
}
export const milestoneVersionKey = (version: { version: string; cycleId: string }) =>
  JSON.stringify([version.version, version.cycleId])

export function milestoneMaterialFacts(materials: VersionOverviewMaterials) {
  const { plan, acceptance } = materials
  const document = plan.kind === 'ready' ? plan.document : null
  const hasContent =
    document &&
    (document.goals.length ||
      document.minutes ||
      document.workflow ||
      document.summary.progress.trim() ||
      document.summary.risks.trim())
  const formalPlan = plan.kind === 'ready' && plan.source === 'committed' && Boolean(hasContent)
  const fixed = acceptance.kind === 'ready' ? acceptance.document.planRef : null
  const status = materials.prStatuses.acceptance
  const verified =
    plan.kind === 'ready' &&
    formalPlan &&
    acceptance.kind === 'ready' &&
    acceptance.source === 'committed' &&
    fixed?.kind === 'committed' &&
    fixed.version === document?.version &&
    fixed.cycleId === document?.cycleId &&
    fixed.revision === plan.revision &&
    fixed.sourceCommit === plan.sourceCommit &&
    status?.state === 'merged' &&
    validTime(status.mergedAt)
  return {
    plan: document,
    formalPlan,
    acceptance: verified && acceptance.kind === 'ready' ? acceptance.document : null
  }
}

export function milestoneIssueSnapshot(
  reference: CycleTaskReference,
  acceptance: MilestoneVersionFacts['acceptance']
) {
  const matches = acceptance?.taskSnapshot?.filter(
    (snapshot) => taskKey(snapshot.reference) === taskKey(reference)
  )
  const snapshot = matches?.length === 1 ? matches[0] : undefined
  return snapshot?.kind === 'ready' ? snapshot : undefined
}

/** Recorded acceptance identities remain usable when live provider metadata changes. */
export function milestoneIssueFacts(
  plan: MilestoneVersionFacts['plan'],
  acceptance: MilestoneVersionFacts['acceptance'],
  reads: readonly CycleTaskRead[]
) {
  const features: MilestoneFeatureIdentity[] = []
  const identityFailures: CycleTaskReference[] = []
  const references = [
    ...new Map(
      [
        ...(plan?.tasks ?? []),
        ...(acceptance?.taskSnapshot?.map((item) => item.reference) ?? [])
      ].map((reference) => [taskKey(reference), reference])
    ).values()
  ]
  for (const reference of references) {
    const snapshot = milestoneIssueSnapshot(reference, acceptance)
    const live = reads.find((read) => taskKey(read.reference) === taskKey(reference))
    const root = snapshot
      ? { ...snapshot, reference }
      : live?.kind === 'ready'
        ? live.task
        : undefined
    if (!root) {
      identityFailures.push(reference)
    } else if (root.labels?.includes('特性')) {
      features.push({
        root,
        currentTitle: live?.kind === 'ready' ? live.task.title : undefined
      })
    }
  }
  return { features, identityFailures, failed: identityFailures.length > 0 }
}

const featureNames = (feature: MilestoneFeatureIdentity) =>
  [feature.root.title, feature.currentTitle].filter((name): name is string => Boolean(name))

const isMainFeature = (feature: MilestoneFeatureIdentity) =>
  feature.root.labels?.includes('特性') === true

/** The main Issue must have a current association to a known goal in this version. */
export function milestoneFeatureGoal(facts: MilestoneVersionFacts, featureKey: string) {
  const plan = facts.plan
  if (!plan || (facts.failed && !facts.stale && !facts.identityFailures)) {
    return undefined
  }
  const references = plan.tasks.filter((task) => taskKey(task) === featureKey)
  if (references.length !== 1) {
    return undefined
  }
  const goalId = references[0]?.goalId
  if (
    !goalId ||
    !plan.goals.some((goal) => goal.goalId === goalId) ||
    facts.identityFailures?.some((reference) => reference.goalId === goalId)
  ) {
    return undefined
  }
  const roots = facts.features.filter(
    (feature) =>
      isMainFeature(feature) &&
      plan.tasks.some(
        (task) => task.goalId === goalId && taskKey(task) === taskKey(feature.root.reference)
      )
  )
  return roots.length === 1 && taskKey(roots[0]!.root.reference) === featureKey ? goalId : undefined
}

export function milestoneAcceptedFeatureGoal(facts: MilestoneVersionFacts, featureKey: string) {
  if (
    !facts.plan ||
    !facts.formalPlan ||
    !facts.acceptance?.taskSnapshot ||
    (facts.failed && !facts.stale && !facts.identityFailures)
  ) {
    return undefined
  }
  const acceptance = { ...facts.acceptance, taskSnapshot: acceptedIssueEvidence(facts.acceptance) }
  const plan = { ...facts.plan, tasks: acceptance.taskSnapshot.map((item) => item.reference) }
  const recorded = milestoneIssueFacts(plan, acceptance, [])
  return milestoneFeatureGoal({ ...facts, plan, ...recorded }, featureKey)
}

/** Full trimmed names associate a roadmap row; provider/repository/number carries its history. */
export function resolveMilestoneFeature(
  row: MilestoneFeature,
  material: MilestoneMaterial,
  reads: readonly MilestoneVersionFacts[]
): { feature?: MilestoneFeatureIdentity; note: string } {
  const name = row.title.trim()
  const available = reads.filter(
    (read) => read.plan && (!read.failed || read.stale || read.identityFailures)
  )
  const candidates = new Map<string, MilestoneFeatureIdentity>()
  for (const read of available) {
    for (const feature of read.features) {
      if (
        name &&
        isMainFeature(feature) &&
        featureNames(feature).some((title) => title.includes(name)) &&
        (read.plan!.tasks.some((task) => taskKey(task) === taskKey(feature.root.reference)) ||
          Boolean(milestoneIssueSnapshot(feature.root.reference, read.acceptance)))
      ) {
        candidates.set(taskKey(feature.root.reference), feature)
      }
    }
  }
  if (candidates.size !== 1) {
    return { note: candidates.size ? '特性匹配不唯一' : '未关联特性' }
  }
  const feature = [...candidates.values()][0]!
  const owners = material.features.filter(
    (other) =>
      other.title.trim() &&
      featureNames(feature).some((title) => title.includes(other.title.trim()))
  )
  return owners.length === 1 && owners[0]!.id === row.id
    ? { feature, note: '' }
    : { note: '特性匹配不唯一' }
}

export type PlannedStageHours = Partial<Record<MilestonePhase, number>>

/** Clip macro planning to the adopted version; formal membership still comes from its fixed plan. */
export function milestoneStageHours(
  material: MilestoneMaterial | undefined,
  facts: MilestoneVersionFacts,
  feature: FeatureData
): PlannedStageHours {
  if (!material || !facts.formalPlan || !facts.plan?.timeWindow) {
    return {}
  }
  const key = taskKey(feature.root.reference)
  if (!milestoneFeatureGoal(facts, key)) {
    return {}
  }
  const rows = material.features.filter((row) => {
    const matched = resolveMilestoneFeature(row, material, [facts]).feature
    return matched && taskKey(matched.root.reference) === key
  })
  if (rows.length !== 1) {
    return {}
  }
  const start = plannedDay(`${facts.plan.timeWindow.start}T00:00`),
    end = plannedDay(`${facts.plan.timeWindow.end}T00:00`) + 1
  const result: PlannedStageHours = {}
  for (const delivery of rows[0].deliveries) {
    if (!delivery.timeWindow) {
      continue
    }
    const hours =
      Math.max(
        0,
        Math.min(end, plannedDay(delivery.timeWindow.end)) -
          Math.max(start, plannedDay(delivery.timeWindow.start))
      ) * 24
    if (Number.isFinite(hours) && hours > 0) {
      result[delivery.phase] = (result[delivery.phase] ?? 0) + hours
    }
  }
  return result
}
