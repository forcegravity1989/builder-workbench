import { z } from 'zod'
import { MetricScopeSchema } from './metrics'
import { MaterialVersion } from './version-material-common'
import { VersionTimeWindowSchema } from './version-time-window'
import { milestoneDeliveryWindow } from './milestone-delivery-window'
import type { CharterStatus, CharterSubmitOutcome } from './charter'

export const MILESTONES_PATH = '.bw/milestones.json'
const Id = z.string().trim().min(1).max(160)
const Ref = z.strictObject({ version: MaterialVersion, cycleId: Id })
export const MilestonePhases = ['Plan', 'Design', 'Build', 'Test', 'Deploy', 'Maintain'] as const
// Civil time in the project's calendar (Asia/Shanghai), with an exclusive end.
const PlannedTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/)
  .refine((value) => z.iso.date().safeParse(value.slice(0, 10)).success, '阶段日期无效')
export const MilestoneStageSchema = z.strictObject({
  phase: z.enum(MilestonePhases),
  start: PlannedTime,
  end: PlannedTime
})
// Discard retired goal projections when reading existing deliveries.
export const MilestoneDeliverySchema = z.object({
  id: Id,
  version: Ref,
  // Empty means no recorded phase plan, not a default or completed delivery.
  stages: z.array(MilestoneStageSchema).max(5)
})
export const MilestoneFeatureSchema = z.strictObject({
  id: Id,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  title: z.string().trim().min(1).max(200),
  owner: z.string().trim().min(1).max(100),
  deliveries: z.array(MilestoneDeliverySchema).min(1).max(100)
})
export const ScheduledVersionSchema = z.strictObject({
  version: MaterialVersion,
  cycleId: Id,
  timeWindow: VersionTimeWindowSchema.optional()
})
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
export const MilestoneNodeSchema = z
  .strictObject({
    id: Id,
    date: z.iso.date().optional(),
    month: Month.optional(),
    outcome: z.string()
  })
  .refine((node) => Boolean(node.date) !== Boolean(node.month), '节点必须有日期或原月份')
export type MilestoneNode = z.infer<typeof MilestoneNodeSchema>

const LegacyMonths = z.array(z.strictObject({ month: Month, outcome: z.string() })).max(240)
export function upgradeMilestoneMaterial(input: unknown): unknown {
  if (
    !input ||
    typeof input !== 'object' ||
    !('schema_version' in input) ||
    input.schema_version !== 2 ||
    !('months' in input) ||
    'milestones' in input
  ) {
    return input
  }
  const { months, ...rest } = input
  const parsed = LegacyMonths.safeParse(months)
  if (!parsed.success) {
    return input
  }
  const monthsByName = new Set(parsed.data.map((m) => m.month))
  if (
    monthsByName.size !== parsed.data.length ||
    !('features' in input) ||
    !Array.isArray(input.features) ||
    input.features.some((f) => !monthsByName.has(f?.month))
  ) {
    return input
  }
  return {
    ...rest,
    schema_version: 3,
    milestones: parsed.data
      .filter((m) => m.outcome.trim())
      .map((m) => ({ id: `month-${m.month}`, ...m }))
  }
}
export const MilestoneMaterialSchema = z
  .strictObject({
    schema_version: z.literal(3),
    milestones: z.array(MilestoneNodeSchema).max(2000),
    features: z.array(MilestoneFeatureSchema).max(2000),
    versionPlans: z.array(ScheduledVersionSchema).max(2000).optional()
  })
  .superRefine((value, context) => {
    if (
      new Set(value.milestones.map((m) => m.id)).size !== value.milestones.length ||
      new Set(value.features.map((f) => f.id)).size !== value.features.length
    ) {
      context.addIssue({ code: 'custom', message: '里程碑或特性身份重复' })
    }
    if (value.milestones.some((m) => !m.outcome.trim())) {
      context.addIssue({ code: 'custom', message: '请补全里程碑成果' })
    }
    if (value.milestones.some((m) => m.outcome.trim().length > 200)) {
      context.addIssue({ code: 'custom', message: '里程碑成果最多 200 字' })
    }
    const versions = value.versionPlans ?? []
    if (
      new Set(versions.map((v) => v.cycleId)).size !== versions.length ||
      new Set(versions.map((v) => v.version.toLowerCase())).size !== versions.length
    ) {
      context.addIssue({ code: 'custom', message: '版本名称或身份不能重复' })
    }
  })
export type ScheduledVersion = z.infer<typeof ScheduledVersionSchema>
export type MilestoneFeature = z.infer<typeof MilestoneFeatureSchema>
export type MilestoneStage = z.infer<typeof MilestoneStageSchema>
export type MilestoneDelivery = z.infer<typeof MilestoneDeliverySchema>
export type MilestonePhase = MilestoneStage['phase']
export type MilestoneMaterial = z.infer<typeof MilestoneMaterialSchema>
export type MilestoneVersion = ScheduledVersion & {
  started: boolean
}
export type MilestoneDraft = { material: MilestoneMaterial; versions: ScheduledVersion[] }
export type MilestoneSnapshot = {
  head: string
  revision: string
  material: MilestoneMaterial
  versions: MilestoneVersion[]
  registeredVersions?: MilestoneVersion[]
  problems: string[]
}
export type MilestoneRead = {
  sourceNotice?: string
  mergedProposal?: boolean
  branchHead: string | null
  formal: MilestoneSnapshot
  proposal: MilestoneSnapshot | null
  review: Pick<CharterStatus, 'pr' | 'queryFailed' | 'remoteAvailable'>
}
export const MilestoneReadRequestSchema = z.strictObject({ scope: MetricScopeSchema })
export const MilestoneSubmitRequestSchema = z.strictObject({
  scope: MetricScopeSchema,
  expectedFormal: z.string().min(1),
  expectedProposal: z.string().nullable(),
  material: MilestoneMaterialSchema,
  versions: z.array(ScheduledVersionSchema).max(2000)
})
export type MilestoneSubmit = z.infer<typeof MilestoneSubmitRequestSchema>
export type MilestoneSubmitResult = { outcome: CharterSubmitOutcome; proposal: MilestoneSnapshot }

export const emptyMilestones = (): MilestoneMaterial => ({
  schema_version: 3,
  milestones: [],
  features: []
})
export function milestoneDraft(snapshot: MilestoneSnapshot): MilestoneDraft {
  const material = structuredClone(snapshot.material)
  delete material.versionPlans
  return {
    material,
    versions: snapshot.versions.map(({ version, cycleId, timeWindow }) => ({
      version,
      cycleId,
      ...(timeWindow ? { timeWindow: { ...timeWindow } } : {})
    }))
  }
}
export function milestoneProblems(draft: MilestoneDraft): string[] {
  const parsed = MilestoneMaterialSchema.safeParse(draft.material)
  const problems = parsed.success
    ? []
    : parsed.error.issues.map((issue) =>
        issue.code === 'custom' ? issue.message : '请核对里程碑、特性名称和负责人'
      )
  const versions = draft.versions
  if (
    new Set(versions.map((v) => v.cycleId)).size !== versions.length ||
    new Set(versions.map((v) => v.version.toLowerCase())).size !== versions.length
  ) {
    problems.push('版本名称或身份重复')
  }
  for (const version of versions) {
    if (!ScheduledVersionSchema.safeParse(version).success) {
      problems.push(`${version.version || '新版本'}：请核对名称及起止日期`)
    }
  }
  for (const feature of draft.material.features) {
    if (
      new Set(feature.deliveries.map((d) => d.id)).size !== feature.deliveries.length ||
      new Set(feature.deliveries.map((d) => d.version.cycleId)).size !== feature.deliveries.length
    ) {
      problems.push(`${feature.title}：同一特性不能重复安排同一版本`)
    }
    for (const [index, delivery] of feature.deliveries.entries()) {
      const version = versions.find(
        (v) => v.cycleId === delivery.version.cycleId && v.version === delivery.version.version
      )
      const expected = index === 0 ? MilestonePhases.slice(0, 5) : ['Maintain']
      if (
        delivery.stages.length &&
        delivery.stages.map((s) => s.phase).join() !== expected.join()
      ) {
        problems.push(`${feature.title}：首版使用 Plan 至 Deploy，后续版本使用 Maintain`)
      }
      const first = delivery.stages[0],
        last = delivery.stages.at(-1)
      if (!version?.timeWindow || !VersionTimeWindowSchema.safeParse(version.timeWindow).success) {
        problems.push(`${feature.title || '新特性'}：请安排有日期的版本`)
        continue
      }
      const window = milestoneDeliveryWindow(delivery, versions)!
      const previous =
        index > 0 ? milestoneDeliveryWindow(feature.deliveries[index - 1], versions) : undefined
      if (previous && window.start < previous.end) {
        problems.push(`${feature.title}：Maintain 不能早于上一版计划结束`)
      }
      if (!first || !last) {
        continue
      }
      if (!/T(00|12):00$/.test(first.start) || !/T(00|12):00$/.test(last.end)) {
        problems.push(`${feature.title}：排期起止须对齐半天，内部阶段可等比分配`)
      }
      const endDay = Date.parse(`${version.timeWindow.end}T00:00:00Z`) + 86400000
      if (
        first.start < `${version.timeWindow.start}T00:00` ||
        Date.parse(`${last.end}:00Z`) > endDay
      ) {
        problems.push(`${feature.title}：阶段超出 ${version.version}，请调整整段计划或版本范围`)
      }
      if (
        delivery.stages.some((s, i, all) => s.start >= s.end || (i > 0 && s.start < all[i - 1].end))
      ) {
        problems.push(`${feature.title}：阶段时间必须依次推进且不能重叠`)
      }
    }
  }
  return [...new Set(problems)]
}
export function reorderMilestoneFeature(
  features: MilestoneFeature[],
  from: string,
  to: string,
  side: 'before' | 'after'
): MilestoneFeature[] {
  const source = features.findIndex((f) => f.id === from),
    target = features.findIndex((f) => f.id === to)
  if (source === -1 || target === -1 || source === target) {
    return features
  }
  const next = [...features]
  const [moved] = next.splice(source, 1)
  const insertion = next.findIndex((f) => f.id === to) + (side === 'after' ? 1 : 0)
  next.splice(insertion, 0, moved)
  return next
}
