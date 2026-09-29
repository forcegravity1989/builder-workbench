import { z } from 'zod'
import type {
  MetricDefinition,
  MetricReadingEvidence,
  MetricWindow
} from '../../../shared/workbench/metrics'
import { MetricReadingEvidenceSchema } from '../../../shared/workbench/version-material'
import { isoWeekStart, metricBucketWindow } from '../../../shared/workbench/metric-windows'

const Value = z.union([z.number().finite(), z.string().trim().min(1)])
const Point = z.object({
  value: Value,
  week: z.string().optional(),
  day: z.string().optional(),
  coverage: z
    .object({
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true })
    })
    .optional()
})
const HistoryOutput = z.object({ points: z.array(Point) })

export class MetricCollectorError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'MetricCollectorError'
  }
}

/** Only successful process stdout reaches this decoder; stderr and failed stdout are diagnostics. */
export function decodeMetricOutput(input: {
  stdout: string
  definition: MetricDefinition
  window: MetricWindow
  collectedAt: string
  collectorRevision: string
  source: string
}): MetricReadingEvidence[] {
  const { definition, window, collectedAt } = input
  let raw: unknown
  try {
    raw = JSON.parse(input.stdout)
  } catch {
    throw new MetricCollectorError('invalid-output', '采集脚本必须输出一个合法 JSON')
  }
  const evidence = {
    ref: definition.ref,
    unit: definition.unit,
    collectedAt,
    collectorRevision: input.collectorRevision,
    source: input.source
  }
  const parsed = HistoryOutput.safeParse(raw)
  if (!parsed.success) {
    throw new MetricCollectorError(
      'invalid-output',
      '可回溯脚本必须返回 points，不能用当前 value 替代历史'
    )
  }
  const seen = new Set<string>()
  const points = parsed.data.points.map((point) => {
    const key = window.granularity === 'week' ? point.week : point.day
    if (
      !key ||
      (window.granularity === 'week' ? point.day !== undefined : point.week !== undefined)
    ) {
      throw new MetricCollectorError('invalid-output', '脚本点位粒度与查询不一致')
    }
    if (seen.has(key)) {
      throw new MetricCollectorError('invalid-output', '脚本返回了重复时间点')
    }
    seen.add(key)
    try {
      const day = window.granularity === 'week' ? isoWeekStart(key) : key
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
      ) {
        throw new Error('Invalid date')
      }
      return MetricReadingEvidenceSchema.parse({
        ...evidence,
        value: point.value,
        observation: metricBucketWindow(day, window, collectedAt, point.coverage)
      })
    } catch (error) {
      throw new MetricCollectorError(
        'invalid-output',
        error instanceof Error ? error.message : '无效时间点'
      )
    }
  })
  return points.sort((a, b) => {
    const aStart = a.observation.kind === 'window' ? a.observation.start : ''
    const bStart = b.observation.kind === 'window' ? b.observation.start : ''
    return Date.parse(aStart) - Date.parse(bStart)
  })
}
