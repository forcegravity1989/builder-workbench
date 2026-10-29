import type { CycleTaskReference, CycleTaskSnapshot } from '../version-cycle/ports'
import { normalizeGitRemoteUrl } from '../../../../shared/git-remote-identity'

export type FeaturePhase = 'design' | 'development' | 'pre' | 'release'
export const PHASE_LABELS: Record<FeaturePhase, string> = {
  design: '设计与联合评审',
  development: '开发',
  pre: 'Pre 试用与完善',
  release: 'Release'
}
export const PARSER_REVISION = 'feature-evidence-v2'
export type FeaturePull = {
  phase?: FeaturePhase | 'unknown'
  number: number
  url: string
  title: string
  body: string
  state: string
  tasks?: CycleTaskSnapshot[]
  createdAt?: string
  mergedAt?: string | null
  revision?: string
  readAt: string
}
export type FeatureEvent = {
  id: string
  phase: FeaturePhase | 'issue' | 'unknown' | 'version' | 'intent' | 'baseline'
  label: string
  at: string
  url: string
  tasks?: CycleTaskSnapshot[]
  revision?: string
  readAt: string
  rule: string
  version?: string
  delivered?: boolean
  deliveryKind?: 'pre' | 'release'
}
export type FeatureData = {
  root: CycleTaskSnapshot
  body: string
  createdAt?: string
  closedAt?: string
  planningComplete?: boolean
  members: CycleTaskSnapshot[]
  pulls: FeaturePull[]
  events: FeatureEvent[]
  archives?: FeatureEvent[]
  problems: string[]
  versions: { version: string; scope: string }[]
}
export function taskKey(ref: CycleTaskReference): string {
  return `${ref.provider}:${normalizeGitRemoteUrl(ref.repository) ?? ref.repository}:${ref.number}`
}
/** Goal membership belongs to the selected plan, not the cached Issue snapshot. */
export function referenceForPlan(
  reference: CycleTaskReference,
  references: readonly CycleTaskReference[]
): CycleTaskReference {
  return (
    references.find((candidate) => taskKey(candidate) === taskKey(reference)) ?? {
      ...reference,
      goalId: undefined
    }
  )
}
export function featureNumber(
  task: Pick<CycleTaskSnapshot, 'title' | 'labels' | 'iid'>
): number | null {
  if (task.labels?.some((label) => label.trim() === '特性')) {
    return task.iid
  }
  const ids = [
    ...new Set([...task.title.matchAll(/【特性#([1-9]\d*)】/g)].map((m) => Number(m[1])))
  ]
  return ids.length === 1 && Number.isSafeInteger(ids[0]) ? ids[0]! : null
}
export function validTime(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)))
}
/** Only explicit stage declarations, never PR order or changed-file guesses. */
export function pullPhase(
  body: string,
  associationBody = '',
  pullUrl = ''
): FeaturePhase | 'unknown' {
  const values = [
    ...body.matchAll(/^\s*(?:交付阶段|阶段)\s*[:：]\s*(设计|开发|Pre|Release)\s*$/gim)
  ].map((m) => m[1]!.toLowerCase())
  if (pullUrl) {
    for (const line of associationBody.split(/\r?\n/)) {
      const role = /^\s*(?:[-*]\s*)?(设计|开发)\s*(?:PR|MR)\s*[:：]/i.exec(line)
      if (
        role &&
        [...line.matchAll(/https?:\/\/[^\s<>"\])]+/g)].some(
          (match) => match[0].replace(/\/$/, '') === pullUrl.replace(/\/$/, '')
        )
      ) {
        values.push(role[1]!.toLowerCase())
      }
    }
  }
  const unique = [...new Set(values)]
  if (unique.length !== 1) {
    return 'unknown'
  }
  return (
    ({ 设计: 'design', 开发: 'development', pre: 'pre', release: 'release' } as const)[
      unique[0] as '设计' | '开发' | 'pre' | 'release'
    ] ?? 'unknown'
  )
}
/** A PR labelled Pre/Release is still a PR, not proof of publication. */
export function eventsFromPulls(pulls: readonly FeaturePull[], before?: string): FeatureEvent[] {
  const cutoff = validTime(before) ? Date.parse(before) : Infinity
  const events: FeatureEvent[] = []
  for (const pull of pulls) {
    const phase = pull.phase ?? pullPhase(pull.body)
    const label = phase === 'unknown' ? 'PR' : `${PHASE_LABELS[phase]} PR`
    for (const [at, action] of [
      [pull.createdAt, '提交'],
      [pull.state === 'merged' ? pull.mergedAt : null, '合入']
    ] as const) {
      if (!validTime(at) || Date.parse(at) > cutoff) {
        continue
      }
      events.push({
        id: `${pull.url}:${action}`,
        phase,
        label: `${label} #${pull.number} ${action}`,
        at,
        url: pull.url,
        revision: pull.revision,
        readAt: pull.readAt,
        rule: PARSER_REVISION,
        tasks: pull.tasks
      })
    }
  }
  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
}
export function featureStage(
  pulls: readonly FeaturePull[],
  historical: boolean,
  events: readonly FeatureEvent[] = []
): string {
  const deliveries = events
    .filter((event) => event.delivered)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const delivered = deliveries.at(-1)
  const suffix = delivered ? ` · ${delivered.label}` : ''
  if (historical) {
    return delivered?.label ?? '历史记录'
  }
  const design = pulls.filter((p) => (p.phase ?? pullPhase(p.body)) === 'design')
  const development = pulls.filter((p) => (p.phase ?? pullPhase(p.body)) === 'development')
  if (development.some((p) => ['open', 'opened', 'draft'].includes(p.state))) {
    return `开发中${suffix}`
  }
  if (design.some((p) => ['open', 'opened', 'draft'].includes(p.state))) {
    return `设计评审中${suffix}`
  }
  if (delivered) {
    return delivered.label
  }
  if (development.some((p) => p.state === 'merged')) {
    return '已有实现合入'
  }
  if (design.some((p) => p.state === 'merged')) {
    return '已有设计合入'
  }
  return '阶段未记录'
}
export function linkedPullNumbers(body: string, issueUrl: string): number[] {
  let base: URL
  try {
    base = new URL(issueUrl)
  } catch {
    return []
  }
  const prefix = base.pathname.replace(/(?:\/-)?\/issues\/\d+\/?$/, '')
  const found = new Set<number>()
  for (const match of body.matchAll(/https?:\/\/[^\s<>"`\])]+/g)) {
    try {
      const url = new URL(match[0])
      const suffix = url.pathname.slice(prefix.length)
      const id = /^(?:\/pull\/|\/-\/merge_requests\/)([1-9]\d*)\/?$/.exec(suffix)
      if (
        url.origin === base.origin &&
        url.pathname.startsWith(prefix) &&
        id &&
        Number.isSafeInteger(Number(id[1]))
      ) {
        found.add(Number(id[1]))
      }
    } catch {
      /* An unparseable link is not an association. */
    }
  }
  return [...found]
}
export function timelineRange(events: readonly FeatureEvent[]) {
  const times = events.map((e) => Date.parse(e.at)).filter(Number.isFinite)
  if (!times.length) {
    return null
  }
  const start = Math.min(...times),
    end = Math.max(...times)
  return {
    start,
    end,
    duration: end - start,
    position: (time: number) => (end === start ? 50 : ((time - start) / (end - start)) * 100)
  }
}

export function timelineClusters(events: readonly FeatureEvent[], width: number) {
  const range = timelineRange(events)
  const clusters: { x: number; events: FeatureEvent[] }[] = []
  if (!range) {
    return clusters
  }
  for (const event of [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const x = 80 + (range.position(Date.parse(event.at)) * (width - 160)) / 100
    const last = clusters.at(-1)
    if (last && x - last.x < 36) {
      last.events.push(event)
    } else {
      clusters.push({ x, events: [event] })
    }
  }
  return clusters
}
