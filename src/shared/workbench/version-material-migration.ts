import { z } from 'zod'
import {
  MaterialRevision,
  MaterialVersion,
  type AcceptanceMaterial,
  type PlanningMaterial,
  type VersionGoal
} from './version-material'
import { VersionMaterialScopeSchema } from './version-material-request'

export const VersionMigrationReadSchema = VersionMaterialScopeSchema.extend({
  workflow: z.literal('plan'),
  version: MaterialVersion,
  cycleId: z.string().trim().min(1),
  sourceRevision: MaterialRevision.optional()
})
export const VersionMigrationApplySchema = VersionMigrationReadSchema.omit({
  sourceRevision: true
}).extend({
  expectedRevision: MaterialRevision
})
export type VersionMigrationRead = z.infer<typeof VersionMigrationReadSchema>
export type VersionMigrationApply = z.infer<typeof VersionMigrationApplySchema>
export type LegacyResultDraft = {
  goalId: string
  title: string
  note: string
  deliveries: { title: string; location: string }[]
}
export type VersionMigrationPreview = {
  sourceRevision: string
  backupName: string
  plan: PlanningMaterial
  previousVersion: string | null
  results: LegacyResultDraft[]
  warnings: string[]
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const array = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record) : []

function legacyNotes(goal: Record<string, unknown>): string {
  const notes = [text(goal.note)]
  for (const [field, label] of [
    ['metric', '旧指标'],
    ['target', '旧目标值'],
    ['baseline', '旧基线'],
    ['reading', '旧读数'],
    ['deadline', '旧截止约定'],
    ['owner', '旧负责人']
  ]) {
    if (text(goal[field])) {
      notes.push(`${label}：${text(goal[field])}（待核）`)
    }
  }
  return notes.filter(Boolean).join('\n')
}

/** Converts text and explicit references; never turns old tone/confirmation/readings into evidence. */
export function previewSchema2Migration(
  value: unknown,
  version: string,
  cycleId: string,
  sourceRevision: string
): VersionMigrationPreview {
  const legacy = record(value)
  if (legacy.schema_version !== 2 || legacy.version !== version) {
    throw new Error('原材料不是所选版本的 schema2 文件')
  }
  const previousVersion =
    text(legacy.previous_version) || text(record(legacy.previous_version).version) || null
  if (previousVersion) {
    MaterialVersion.parse(previousVersion)
  }
  const warnings = ['旧确认、状态颜色和人工读数只保留为历史文字，不转换为新认可或采集证据。']
  const oldPlan = record(legacy.plan)
  if (!Array.isArray(oldPlan.goals)) {
    throw new Error('旧计划的目标列表无法解释，保留原文件待核')
  }
  const oldGoals = array(oldPlan.goals)
  const ids = new Set<string>()
  const goals: VersionGoal[] = oldGoals.map((goal, index) => {
    const candidate = text(goal.id) || text(goal.label) || `legacy-goal-${index + 1}`
    const goalId = ids.has(candidate) ? `legacy-goal-${index + 1}-${candidate}` : candidate
    ids.add(goalId)
    return { goalId, title: text(goal.title), acceptance: legacyNotes(goal), metricTargets: [] }
  })
  const tasks: PlanningMaterial['tasks'] = []
  for (const task of array(oldPlan.tasks)) {
    let parsed: URL | null = null
    try {
      parsed = new URL(text(task.url))
    } catch {
      /* Missing provenance stays in the preserved original. */
    }
    const match = parsed?.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/)
    if (
      !parsed ||
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'github.com' ||
      !match ||
      (task.number && Number(task.number) !== Number(match[3]))
    ) {
      warnings.push(
        `任务 ${text(task.title) || String(task.number ?? '')} 缺少无歧义来源，保留原件待核。`
      )
      continue
    }
    const goalLabel = text(task.goal).replace(`${version}/`, '')
    const matches = oldGoals.flatMap((goal, index) =>
      text(goal.id) === goalLabel || text(goal.label) === goalLabel ? [goals[index].goalId] : []
    )
    tasks.push({
      provider: 'github',
      repository: `${parsed.hostname}/${match[1]}/${match[2]}`,
      number: Number(match[3]),
      ...(matches.length === 1 ? { goalId: matches[0] } : {})
    })
    if (goalLabel && matches.length !== 1) {
      warnings.push(`任务 #${match[3]} 的目标关联待核，未猜测匹配。`)
    }
  }
  const oldResults = record(legacy.results)
  const results = array(oldResults.goals).map((goal, index) => ({
    goalId: text(goal.id) || text(goal.label) || `legacy-result-${index + 1}`,
    title: text(goal.title),
    note: legacyNotes(goal),
    deliveries: array(oldResults.deliverables)
      .filter((item) => text(item.goal) === text(goal.id) || text(item.goal) === text(goal.label))
      .map((item) => ({ title: text(item.label), location: text(item.url) }))
  }))
  if (results.length && !previousVersion) {
    warnings.push('旧结果未明确 previous_version，不能导入任何版本的验收；原件保留待核。')
  }
  const summary = record(legacy.summary)
  const progress = text(summary.progress)
  return {
    sourceRevision,
    backupName: `schema2-${MaterialRevision.parse(sourceRevision).slice(7)}.json`,
    previousVersion,
    results,
    warnings,
    plan: {
      schema_version: 3,
      version,
      cycleId,
      summary: {
        progress: progress
          ? `旧材料所述${previousVersion ?? '未明确版本'}进展（待核）：\n${progress}`
          : '',
        risks: text(summary.risks)
      },
      goals,
      tasks
    }
  }
}

/** Caller supplies a plan it actually read; ambiguous goal identities require human mapping. */
export function importLegacyAcceptanceResults(
  preview: VersionMigrationPreview,
  plan: PlanningMaterial,
  planRef: AcceptanceMaterial['planRef'],
  cycleId: string
): AcceptanceMaterial {
  if (
    !preview.previousVersion ||
    preview.previousVersion !== plan.version ||
    planRef.version !== plan.version ||
    planRef.cycleId !== plan.cycleId
  ) {
    throw new Error('先选择旧结果实际所属版本的计划修订')
  }
  const results = preview.results.map((result) => {
    const matches = plan.goals.filter(
      (goal) => goal.goalId === result.goalId && goal.title === result.title
    )
    if (matches.length !== 1) {
      throw new Error(`旧结果 ${result.title} 与已读计划不一致，请先人工核对目标对应`)
    }
    return {
      goalId: matches[0].goalId,
      deliveries: result.deliveries,
      readings: [],
      note: `${result.note}\n迁移来源：${preview.backupName} · ${preview.sourceRevision}；原状态及确认未导入。`,
      nextStep: ''
    }
  })
  return {
    schema_version: 3,
    version: plan.version,
    cycleId,
    planRef,
    preparedArtifacts: [],
    results
  }
}
