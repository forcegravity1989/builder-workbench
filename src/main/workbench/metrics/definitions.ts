import { createHash } from 'node:crypto'
import { parse } from 'smol-toml'
import { z } from 'zod'
import type {
  MetricDefinition,
  MetricFeature,
  MetricProblem
} from '../../../shared/workbench/metrics'
import { SourceCommit } from '../../../shared/workbench/version-material'

const Definition = z.object({
  name: z.string().trim().min(1),
  def: z.string().trim().min(1),
  target: z.string().default(''),
  unit: z.string().default(''),
  feature: z.string().trim().default(''),
  leads: z.string().trim().optional(),
  collect: z.object({
    kind: z.string(),
    run: z.array(z.string().refine((value) => !value.includes('\0'))).optional(),
    retro: z.boolean().default(false)
  })
})
const Feature = z.object({
  name: z.string().trim().min(1),
  value: z.string().trim().default('')
})
const File = z.object({
  schema_version: z.literal(2),
  feature: z.array(z.unknown()).default([]),
  north_star: z.unknown().optional(),
  lagging: z.array(z.unknown()).default([]),
  leading: z.array(z.unknown()).default([])
})

/** Feature declarations order the tabs and carry the value text; they never imply a metric. */
function decodeFeatures(entries: unknown[], problems: MetricProblem[]): MetricFeature[] {
  const features: MetricFeature[] = []
  for (const entry of entries) {
    const parsed = Feature.safeParse(entry)
    if (!parsed.success) {
      problems.push({ code: 'invalid-feature', message: '特性声明需要非空 name，value 须为文本' })
      continue
    }
    if (features.some((item) => item.name === parsed.data.name)) {
      problems.push({
        code: 'ambiguous-feature',
        name: parsed.data.name,
        message: '特性名称重复，只采用第一条'
      })
      continue
    }
    features.push(parsed.data)
  }
  return features
}

/** Long-term targets are intentions; changing a target cannot change measured facts. */
export function metricDefinitionHash(definition: Omit<MetricDefinition, 'ref' | 'target'>): string {
  const fields = [
    definition.name,
    definition.def,
    definition.unit,
    definition.role,
    definition.feature,
    definition.leads ?? '',
    definition.collect.kind,
    definition.collect.run,
    definition.collect.retro
  ]
  return `sha256:${createHash('sha256').update(JSON.stringify(fields)).digest('hex')}`
}

export function decodeMetricDefinitions(
  raw: string | null,
  configurationCommit: string
): {
  features: MetricFeature[]
  definitions: MetricDefinition[]
  problems: MetricProblem[]
} {
  SourceCommit.parse(configurationCommit)
  const problems: MetricProblem[] = []
  if (raw === null) {
    return {
      features: [],
      definitions: [],
      problems: [{ code: 'not-configured', message: '尚未配置指标' }]
    }
  }
  let file: z.infer<typeof File>
  try {
    file = File.parse(parse(raw))
  } catch (error) {
    return {
      features: [],
      definitions: [],
      problems: [
        {
          code: 'invalid-definition',
          message: `指标定义无法解析：${error instanceof Error ? error.message : String(error)}`
        }
      ]
    }
  }
  const features = decodeFeatures(file.feature, problems)
  const entries: { role: MetricDefinition['role']; value: unknown }[] = [
    ...(file.north_star === undefined
      ? []
      : [{ role: 'north_star' as const, value: file.north_star }]),
    ...file.lagging.map((value) => ({ role: 'lagging' as const, value })),
    ...file.leading.map((value) => ({ role: 'leading' as const, value }))
  ]
  const candidates: Omit<MetricDefinition, 'ref'>[] = []
  const names = new Map<string, number>()
  for (const entry of entries) {
    const parsed = Definition.safeParse(entry.value)
    if (!parsed.success) {
      problems.push({ code: 'invalid-definition', message: '指标缺少名称、口径或有效采集配置' })
      continue
    }
    const { collect, ...definition } = parsed.data
    names.set(definition.name, (names.get(definition.name) ?? 0) + 1)
    if (collect.kind !== 'script' || !collect.run?.length || !collect.run[0].trim()) {
      problems.push({
        code: 'collector-required',
        name: definition.name,
        message: '需配置真实采集脚本；人工记录不作为本期实测'
      })
      continue
    }
    if (!collect.retro) {
      problems.push({
        code: 'history-required',
        name: definition.name,
        message: '需配置能按日、周查询历史的采集脚本'
      })
      continue
    }
    candidates.push({
      role: entry.role,
      ...definition,
      collect: { kind: 'script', run: collect.run, retro: true }
    })
  }
  const unique = candidates.filter((definition) => {
    if (names.get(definition.name) === 1) {
      return true
    }
    problems.push({
      code: 'ambiguous-name',
      name: definition.name,
      message: '指标名称重复，需先消歧才能引用'
    })
    return false
  })
  const definitions: MetricDefinition[] = []
  for (const definition of unique) {
    if (definition.role === 'leading') {
      const targets = unique.filter(
        (target) =>
          target.role === 'lagging' &&
          (definition.leads
            ? target.name === definition.leads
            : target.feature === definition.feature)
      )
      if (targets.length !== 1) {
        problems.push({
          code: 'ambiguous-relation',
          name: definition.name,
          message: '引领指标需要明确关联的滞后指标'
        })
        continue
      }
      definition.leads = targets[0].name
    }
    const { target, ...identity } = definition
    definitions.push({
      ...definition,
      target,
      ref: {
        name: definition.name,
        definitionHash: metricDefinitionHash(identity),
        configurationCommit
      }
    })
  }
  return { features, definitions, problems }
}
