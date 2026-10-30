import type { MilestonePhase } from '../../../../shared/workbench/project-milestones'
import {
  PARSER_REVISION,
  validTime,
  type FeatureData,
  type FeatureEvent,
  type FeaturePull
} from './feature-model'

export const OVERVIEW_TIME_ZONE = 'Asia/Shanghai'
export const MILESTONES = ['baseline', 'intent', 'design', 'development', 'first'] as const
export type Milestone = (typeof MILESTONES)[number]
export const MILESTONE_LABELS: Record<Milestone, string> = {
  baseline: '周期起点',
  intent: 'Plan · 意图确认',
  design: 'Design · 设计定稿',
  development: 'Build · 开发交付',
  first: '首次交付'
}
export type ActualStage = {
  id: MilestonePhase
  label: string
  start?: string
  end?: string
  duration: number | null
  ongoing: boolean
}

/** BW's agreed reporting baseline, not an observed work-session start. */
export function cycleBaseline(planMergedAt: string): string | null {
  if (!validTime(planMergedAt)) {
    return null
  }
  const offset = 8 * 3600000
  const local = new Date(Date.parse(planMergedAt) + offset)
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7))
  local.setUTCHours(9, 0, 0, 0)
  return new Date(local.getTime() - offset).toISOString()
}
function pullEvent(pull: FeaturePull, label: string): FeatureEvent {
  return {
    id: pull.url,
    phase: pull.phase ?? 'unknown',
    label,
    at: pull.state === 'merged' && validTime(pull.mergedAt) ? pull.mergedAt : '',
    url: pull.url,
    readAt: pull.readAt,
    revision: pull.revision,
    rule: PARSER_REVISION
  }
}
function interval(
  id: MilestonePhase,
  label: string,
  start?: string,
  end?: string,
  ongoing = false
): ActualStage {
  const duration =
    validTime(start) && validTime(end) && Date.parse(end) >= Date.parse(start)
      ? Date.parse(end) - Date.parse(start)
      : null
  return { id, label, start, end, duration, ongoing: duration !== null && ongoing }
}

/** Both overviews project these same facts. Unspecified multi-PR completion stays unknown. */
export function featureTimeline(feature: FeatureData) {
  const points: Partial<Record<Milestone, FeatureEvent>> = {}
  const plans = feature.events
    .filter((e) => e.phase === 'intent' && validTime(e.at))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  if (feature.planningComplete !== false && plans[0]) {
    points.intent = plans[0]
    const at = cycleBaseline(plans[0].at)
    if (at) {
      points.baseline = {
        ...plans[0],
        id: `${plans[0].id}:baseline`,
        phase: 'baseline',
        label: '约定周期起点，非实际开工',
        at
      }
    }
  }
  const design = feature.pulls.filter((p) => p.phase === 'design')
  const development = feature.pulls.filter((p) => p.phase === 'development')
  for (const [key, pulls] of [
    ['design', design],
    ['development', development]
  ] as const) {
    const pull = pulls.length === 1 ? pulls[0] : undefined
    if (!feature.problems.length && pull?.state === 'merged' && validTime(pull.mergedAt)) {
      points[key] = pullEvent(pull, MILESTONE_LABELS[key])
    }
  }
  if (
    !feature.problems.length &&
    !development.length &&
    feature.root.state === 'closed' &&
    validTime(feature.closedAt)
  ) {
    points.development = {
      id: `${feature.root.url}:closed`,
      phase: 'development',
      label: '特性 Issue 关闭兜底',
      at: feature.closedAt,
      url: feature.root.url,
      readAt: feature.root.readAt,
      rule: PARSER_REVISION
    }
  }
  const deliveries = feature.events
    .filter((e) => e.delivered && e.deliveryKind && validTime(e.at))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  points.first = deliveries.find((e) => e.deliveryKind === 'first')
  const observed = feature.observedAt
  const segments: ActualStage[] = (
    [
      ['Plan', '意图收敛', 'baseline', 'intent'],
      ['Design', '设计评审', 'intent', 'design'],
      ['Build', '开发', 'design', 'development'],
      ['Test', '验收前交付', 'development', 'first']
    ] as const
  ).map(([id, label, from, to]) => {
    const fromIndex = MILESTONES.indexOf(from)
    const laterKnown = MILESTONES.slice(fromIndex + 1).some((key) => points[key])
    const ambiguous =
      (id === 'Design' && design.length > 1) || (id === 'Build' && development.length > 1)
    const ongoing = !points[to] && !laterKnown && !feature.problems.length && !ambiguous
    return interval(
      id,
      label,
      points[from]?.at,
      points[to]?.at ?? (ongoing ? observed : undefined),
      ongoing
    )
  })
  segments.push(interval('Deploy', '未跟踪'))
  const first = points.first
  const firstPlan = plans.find((p) => p.version === first?.version)
  const laterPlans = first
    ? plans.filter(
        (p) =>
          p.version !== first.version &&
          firstPlan &&
          Date.parse(p.at) > Date.parse(firstPlan.at) &&
          !feature.events.some(
            (e) =>
              e.phase === 'version' &&
              e.version === p.version &&
              validTime(e.at) &&
              Date.parse(e.at) <= Date.parse(first.at)
          )
      )
    : []
  const laterDeliveries = deliveries.filter((e) => e.deliveryKind === 'maintenance')
  const last = laterDeliveries.at(-1)
  // Maintain includes the wait between first delivery and the next explicitly related version.
  const pending = laterPlans.some(
    (p) =>
      !laterDeliveries.some((e) => e.version === p.version) &&
      !feature.events.some(
        (e) =>
          last &&
          e.phase === 'version' &&
          e.version === p.version &&
          validTime(e.at) &&
          Date.parse(e.at) <= Date.parse(last.at)
      )
  )
  const maintaining = Boolean(first && (last || laterPlans.length))
  segments.push(
    interval(
      'Maintain',
      '持续完善',
      maintaining ? first?.at : undefined,
      pending ? observed : last?.at,
      pending
    )
  )
  const sources = [
    {
      id: 'Plan',
      label: '计划 PR',
      events: feature.archives?.filter((e) => e.phase === 'intent') ?? plans
    },
    {
      id: 'Design',
      label: '设计 PR',
      events: design.map((p) => pullEvent(p, `设计 PR #${p.number}`))
    },
    {
      id: 'Build',
      label: '开发来源',
      events: development.length
        ? development.map((p) => pullEvent(p, `开发 PR #${p.number}`))
        : points.development
          ? [points.development]
          : []
    },
    { id: 'Test', label: '首次交付验收', events: first ? [first] : [] },
    { id: 'Maintain', label: '维护交付验收', events: laterDeliveries },
    {
      id: 'version',
      label: '其他版本验收',
      events: (
        feature.archives?.filter((e) => e.phase === 'version') ??
        feature.events.filter((e) => e.phase === 'version')
      ).filter((e) => !deliveries.some((d) => d.url && d.url === e.url))
    }
  ]
  return { points, deliveries, segments, sources }
}

export function featureStage(feature: FeatureData, historical: boolean): string {
  const timeline = featureTimeline(feature)
  const delivered = timeline.deliveries.at(-1)
  if (historical) {
    return delivered?.label ?? '历史记录'
  }
  const ongoing = timeline.segments.findLast((stage) => stage.ongoing)
  if (ongoing) {
    return `${ongoing.id} · ${ongoing.label}中`
  }
  if (delivered) {
    return delivered.label
  }
  if (
    feature.pulls.some(
      (p) => p.phase === 'development' && ['open', 'opened', 'draft'].includes(p.state)
    )
  ) {
    return 'Build · 开发中'
  }
  if (
    feature.pulls.some((p) => p.phase === 'design' && ['open', 'opened', 'draft'].includes(p.state))
  ) {
    return 'Design · 评审中'
  }
  if (timeline.points.development) {
    return 'Test · 开发已交付'
  }
  if (timeline.points.design) {
    return 'Build · 设计已定稿'
  }
  return '阶段未记录'
}
