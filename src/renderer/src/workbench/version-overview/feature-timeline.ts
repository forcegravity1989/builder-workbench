import {
  PARSER_REVISION,
  validTime,
  type FeatureData,
  type FeatureEvent,
  type FeaturePull
} from './feature-model'

export const OVERVIEW_TIME_ZONE = 'Asia/Shanghai'
export const MILESTONES = ['baseline', 'intent', 'design', 'development', 'pre', 'release'] as const
export type Milestone = (typeof MILESTONES)[number]
export const MILESTONE_LABELS: Record<Milestone, string> = {
  baseline: '周期起点',
  intent: '意图确认',
  design: '设计定稿',
  development: '开发交付',
  pre: 'Pre',
  release: 'Release'
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

/** Multiple PRs stay visible; an unspecified delivery set cannot be reduced to its latest PR. */
export function featureTimeline(feature: FeatureData) {
  const points: Partial<Record<Milestone, FeatureEvent>> = {}
  const plans = feature.events
    .filter((event) => event.phase === 'intent' && validTime(event.at))
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
  const design = feature.pulls.filter((pull) => pull.phase === 'design')
  const development = feature.pulls.filter((pull) => pull.phase === 'development')
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
  for (const key of ['pre', 'release'] as const) {
    points[key] = feature.events.find(
      (event) => event.delivered && event.deliveryKind === key && validTime(event.at)
    )
  }
  const segments = (
    [
      ['intent', '意图收敛', 'baseline', 'intent'],
      ['design', '设计评审', 'intent', 'design'],
      ['development', '开发', 'design', 'development'],
      ['pre', '测试与随版准备', 'development', 'pre'],
      ['release', '试用完善', 'pre', 'release']
    ] as const
  ).map(([id, label, from, to]) => {
    const start = points[from]?.at,
      end = points[to]?.at
    return {
      id,
      label,
      start,
      end,
      duration:
        start && end && Date.parse(end) >= Date.parse(start)
          ? Date.parse(end) - Date.parse(start)
          : null
    }
  })
  const sources = [
    {
      id: 'intent',
      label: '计划 PR',
      events: feature.archives?.filter((event) => event.phase === 'intent') ?? plans
    },
    {
      id: 'design',
      label: '设计 PR',
      events: design.map((pull) => pullEvent(pull, `设计 PR #${pull.number}`))
    },
    {
      id: 'development',
      label: '开发来源',
      events: development.length
        ? development.map((pull) => pullEvent(pull, `开发 PR #${pull.number}`))
        : points.development
          ? [points.development]
          : []
    },
    { id: 'pre', label: 'Pre 验收 PR', events: points.pre ? [points.pre] : [] },
    { id: 'release', label: 'Release 验收 PR', events: points.release ? [points.release] : [] },
    {
      id: 'version',
      label: '其他版本验收',
      events: (
        feature.archives?.filter((event) => event.phase === 'version') ??
        feature.events.filter((event) => event.phase === 'version')
      ).filter((event) => ![points.pre?.url, points.release?.url].includes(event.url))
    }
  ]
  return { points, segments, sources }
}
