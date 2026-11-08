import { z } from 'zod'
import { MetricScopeSchema } from './metrics'
import { MaterialVersion } from './version-material-common'
import { VersionTimeWindowSchema } from './version-time-window'
import type { CharterStatus, CharterSubmitOutcome } from './charter'

export const MILESTONES_PATH = '.bw/milestones.json'
const Id = z.string().trim().min(1).max(160)
export const MilestonePhases = ['Plan', 'Design', 'Build', 'Test', 'Deploy', 'Maintain'] as const
// Civil time in the project's calendar (Asia/Shanghai), with an exclusive end.
const PlannedTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/)
  .refine((value) => z.iso.date().safeParse(value.slice(0, 10)).success, '阶段日期无效')
export const MilestonePlanPhases = ['Build', 'Maintain'] as const
export const MilestoneDeliverySchema = z.strictObject({
  id: Id,
  phase: z.enum(MilestonePlanPhases),
  timeWindow: z.strictObject({ start: PlannedTime, end: PlannedTime }).optional()
})
export const MilestoneFeatureSchema = z.strictObject({
  id: Id,
  title: z.string().trim().min(1).max(200),
  owner: z.string().trim().max(100),
  deliveries: z.array(MilestoneDeliverySchema).max(100)
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
function upgradeMonths(input: unknown): unknown {
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
/** Upgrade recorded dates only; an empty old stage plan remains explicitly undated. */
export function upgradeMilestoneMaterial(value: unknown): unknown {
  const input = upgradeMonths(value)
  const legacy = z
    .object({
      schema_version: z.literal(3),
      features: z.array(
        z.object({
          id: Id,
          month: Month,
          title: z.string(),
          owner: z.string(),
          deliveries: z.array(
            z.object({
              id: Id,
              version: z.object({ version: z.string(), cycleId: Id }),
              stages: z
                .array(
                  z.strictObject({
                    phase: z.enum(MilestonePhases),
                    start: PlannedTime,
                    end: PlannedTime
                  })
                )
                .max(5)
            })
          )
        })
      )
    })
    .passthrough()
    .safeParse(input)
  if (!legacy.success) return input
  return {
    ...legacy.data,
    schema_version: 4,
    features: legacy.data.features.map(({ id, title, owner, deliveries }) => ({
      id,
      title,
      owner,
      deliveries: deliveries.map((delivery, index) => ({
        id: delivery.id,
        phase: delivery.stages.length
          ? delivery.stages.every((stage) => stage.phase === 'Maintain')
            ? 'Maintain'
            : 'Build'
          : index
            ? 'Maintain'
            : 'Build',
        ...(delivery.stages.length
          ? {
              timeWindow: {
                start: delivery.stages.map((stage) => stage.start).sort()[0],
                end: delivery.stages
                  .map((stage) => stage.end)
                  .sort()
                  .at(-1)
              }
            }
          : {})
      }))
    }))
  }
}
export const MilestoneMaterialSchema = z
  .strictObject({
    schema_version: z.literal(4),
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
export type MilestoneDelivery = z.infer<typeof MilestoneDeliverySchema>
export type MilestonePhase = (typeof MilestonePhases)[number]
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
  schema_version: 4,
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
export function milestoneVersionConflict(
  versions: readonly ScheduledVersion[]
): string | undefined {
  const dated = versions
    .filter((v) => v.timeWindow)
    .toSorted((a, b) => a.timeWindow!.start.localeCompare(b.timeWindow!.start))
  for (let i = 1; i < dated.length; i++) {
    if (dated[i].timeWindow!.start <= dated[i - 1].timeWindow!.end)
      return dated[i - 1].version + ' 与 ' + dated[i].version + ' 日期重叠，请调整相关版本'
  }
}
export function milestoneProblems(draft: MilestoneDraft): string[] {
  const parsed = MilestoneMaterialSchema.safeParse(draft.material)
  const problems = parsed.success
    ? []
    : parsed.error.issues.map((issue) => {
        if (issue.code === 'custom') return issue.message
        if (issue.path.at(-1) === 'title') return '请填写特性名称（最多 200 字）'
        if (issue.path.at(-1) === 'owner') return '负责人最多 100 字'
        return '请核对里程碑内容及排期日期'
      })
  const versions = draft.versions
  if (
    new Set(versions.map((v) => v.cycleId)).size !== versions.length ||
    new Set(versions.map((v) => v.version.toLowerCase())).size !== versions.length
  )
    problems.push('版本名称或身份重复')
  for (const version of versions) {
    if (!ScheduledVersionSchema.safeParse(version).success)
      problems.push((version.version || '新版本') + '：请核对名称及起止日期')
  }
  const conflict = milestoneVersionConflict(versions)
  if (conflict) problems.push(conflict)
  for (const feature of draft.material.features) {
    if (new Set(feature.deliveries.map((d) => d.id)).size !== feature.deliveries.length)
      problems.push(feature.title + '：排期身份重复')
    const dated = feature.deliveries
      .filter((d) => d.timeWindow)
      .toSorted((a, b) => a.timeWindow!.start.localeCompare(b.timeWindow!.start))
    for (const [index, delivery] of dated.entries()) {
      const window = delivery.timeWindow!
      if (Date.parse(window.end + ':00Z') - Date.parse(window.start + ':00Z') < 43200000)
        problems.push((feature.title || '新特性') + '：每段安排至少保留半天')
      if (index && window.start < dated[index - 1].timeWindow!.end)
        problems.push((feature.title || '新特性') + '：同一特性的安排不能重叠')
    }
  }
  return [...new Set(problems)]
}
