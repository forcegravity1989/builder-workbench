import { z } from 'zod'
import { MetricScopeSchema } from './metrics'
import { MaterialVersion } from './version-material-common'
import { VersionTimeWindowSchema } from './version-time-window'
import type { CharterStatus, CharterSubmitOutcome } from './charter'

export const MILESTONES_PATH = '.bw/milestones.json'
const Id = z.string().trim().min(1).max(160)
const Ref = z.strictObject({ version: MaterialVersion, cycleId: Id })
export const MilestoneFeatureSchema = z.strictObject({
  id: Id,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  title: z.string().trim().min(1).max(200),
  owner: z.string().trim().min(1).max(100),
  pre: Ref.nullable(),
  release: Ref.nullable()
})
export const MilestoneMaterialSchema = z
  .strictObject({
    schema_version: z.literal(1),
    months: z
      .array(
        z.strictObject({
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          outcome: z.string().trim().max(200)
        })
      )
      .max(240),
    features: z.array(MilestoneFeatureSchema).max(2000)
  })
  .superRefine((value, context) => {
    if (
      new Set(value.months.map((m) => m.month)).size !== value.months.length ||
      new Set(value.features.map((f) => f.id)).size !== value.features.length
    ) {
      context.addIssue({ code: 'custom', message: '月份和特性身份不能重复' })
    }
    for (const f of value.features) {
      if (!value.months.some((m) => m.month === f.month)) {
        context.addIssue({ code: 'custom', message: '特性所属月份不存在' })
      }
    }
  })
export const ScheduledVersionSchema = z.strictObject({
  version: MaterialVersion,
  cycleId: Id,
  timeWindow: VersionTimeWindowSchema.optional()
})
export type ScheduledVersion = z.infer<typeof ScheduledVersionSchema>
export type MilestoneFeature = z.infer<typeof MilestoneFeatureSchema>
export type MilestoneMaterial = z.infer<typeof MilestoneMaterialSchema>
export type MilestoneVersion = ScheduledVersion & { started: boolean }
export type MilestoneDraft = { material: MilestoneMaterial; versions: ScheduledVersion[] }
export type MilestoneSnapshot = {
  head: string
  revision: string
  material: MilestoneMaterial
  versions: MilestoneVersion[]
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
  schema_version: 1,
  months: [],
  features: []
})
export function milestoneDraft(snapshot: MilestoneSnapshot): MilestoneDraft {
  return {
    material: structuredClone(snapshot.material),
    versions: snapshot.versions.map(({ version, cycleId, timeWindow }) => ({
      version,
      cycleId,
      ...(timeWindow ? { timeWindow: { ...timeWindow } } : {})
    }))
  }
}
export function milestoneProblems(draft: MilestoneDraft): string[] {
  const parsed = MilestoneMaterialSchema.safeParse(draft.material)
  const problems = parsed.success ? [] : ['请补齐特性名称、负责人，并核对月份']
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
    const locate = (ref: MilestoneFeature['pre']) =>
      ref && versions.find((v) => v.cycleId === ref.cycleId && v.version === ref.version)
    const pre = locate(feature.pre),
      release = locate(feature.release)
    if (!pre?.timeWindow || !release?.timeWindow) {
      problems.push(`${feature.title || '新特性'}：请安排有日期的 Pre 和 Release 版本`)
    } else if (pre.timeWindow.start > release.timeWindow.end) {
      problems.push(`${feature.title}：Pre 不能晚于 Release`)
    }
  }
  return [...new Set(problems)]
}
export function reorderMilestoneFeature(
  features: MilestoneFeature[],
  from: string,
  to: string
): MilestoneFeature[] {
  const source = features.findIndex((f) => f.id === from),
    target = features.findIndex((f) => f.id === to)
  if (source === -1 || target === -1 || source === target) {
    return features
  }
  const next = [...features]
  const [moved] = next.splice(source, 1)
  next.splice(target, 0, moved)
  return next
}

/** Containing windows win; in gaps snap to the nearest boundary. Later overlapping windows paint on top. */
export function pickMilestoneVersion(
  versions: ScheduledVersion[],
  date: number
): ScheduledVersion | null {
  const dated = versions
    .filter((v) => v.timeWindow)
    .toSorted((a, b) => a.timeWindow!.start.localeCompare(b.timeWindow!.start))
  const at = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86400000
  const containing = dated.findLast(
    (v) => at(v.timeWindow!.start) <= date && date < at(v.timeWindow!.end) + 1
  )
  if (containing) {
    return containing
  }
  const distance = (v: ScheduledVersion) =>
    Math.min(Math.abs(date - at(v.timeWindow!.start)), Math.abs(date - at(v.timeWindow!.end) - 1))
  return dated.reduce<ScheduledVersion | null>(
    (best, v) => (!best || distance(v) < distance(best) ? v : best),
    null
  )
}
