import { validTime, type FeatureData, type FeatureEvent } from './feature-model'
import { featureTimeline, type ActualStage } from './feature-timeline'
import type { PlannedStageHours } from '../milestone-feature-facts'

const HOUR = 3600000
const DEFAULT_HOURS = { Plan: 24, Design: 48, Build: 12, Test: 24, Deploy: 12, Maintain: 24 }
const SOURCE_LABELS = {
  Plan: '计划 PR',
  Design: '设计 PR',
  Build: '开发 PR',
  Test: '首次交付验收 PR',
  Deploy: '部署时间',
  Maintain: '后续版本验收 PR'
}
export type TimelineSlot = ActualStage & {
  state: 'done' | 'current' | 'future' | 'unknown' | 'untracked'
  offset: number
  hours: number
  placeholder: boolean
  planned: boolean
  source?: FeatureEvent
  hint: string
}

/** Display widths never become evidence timestamps or planned dates. */
export function featureTimelineLayout(feature: FeatureData, plannedHours: PlannedStageHours = {}) {
  const timeline = featureTimeline(feature)
  const versions = feature.events.filter((event) => event.phase === 'version')
  versions.push(
    ...(feature.archives ?? []).filter(
      (event) =>
        event.phase === 'version' && !versions.some((known) => known.version === event.version)
    )
  )
  const completed: Record<ActualStage['id'], FeatureEvent | undefined> = {
    Plan: timeline.points.intent,
    Design: timeline.points.design,
    Build: timeline.points.development,
    Test: timeline.points.first,
    Deploy: undefined,
    Maintain: timeline.deliveries.findLast((event) => event.deliveryKind === 'maintenance')
  }
  let offset = 0
  const slots: TimelineSlot[] = timeline.segments.map((stage, index) => {
    const group = timeline.sources.find((item) => item.id === stage.id)
    const single =
      group?.events.length === 1
        ? group.events[0]
        : stage.id === 'Test' && versions.length === 1
          ? versions[0]
          : undefined
    // A running maintenance interval has not yet produced its endpoint source.
    const source =
      stage.id === 'Maintain' && stage.ongoing ? undefined : (completed[stage.id] ?? single)
    const pull = feature.pulls.find((item) => item.url === source?.url)
    const issueFallback = stage.id === 'Build' && source?.url === feature.root.url
    const number = source?.url.match(/\/(?:pull|merge_requests)\/([1-9]\d*)\/?$/)?.[1]
    const sourceLabel = issueFallback
      ? `特性 Issue #${feature.root.iid}`
      : `${SOURCE_LABELS[stage.id]}${number ? ` #${number}` : ''}`
    const status =
      stage.id === 'Test' && source && !completed.Test
        ? source.label.includes('未达成')
          ? '目标未达成'
          : source.delivered
            ? '交付顺序未确认'
            : '交付未确认'
        : issueFallback
          ? '已关闭'
          : validTime(source?.at)
            ? '已合入'
            : pull?.state === 'draft'
              ? 'Draft'
              : pull && ['open', 'opened'].includes(pull.state)
                ? '待合入'
                : pull?.state === 'closed'
                  ? '已关闭未合入'
                  : source
                    ? '合入时间未记录'
                    : '未记录'
    const laterEvidence = timeline.segments.slice(index + 1).some((later) => completed[later.id])
    const state =
      stage.id === 'Deploy'
        ? 'untracked'
        : stage.ongoing
          ? 'current'
          : completed[stage.id]
            ? 'done'
            : laterEvidence || feature.problems.length || validTime(stage.start)
              ? 'unknown'
              : 'future'
    const placeholder = stage.duration === null
    const planned =
      placeholder &&
      (state === 'future' || state === 'untracked') &&
      Number.isFinite(plannedHours[stage.id]) &&
      plannedHours[stage.id]! > 0
    const hours = placeholder
      ? planned
        ? plannedHours[stage.id]!
        : DEFAULT_HOURS[stage.id]
      : stage.duration! / HOUR
    const slot: TimelineSlot = {
      ...stage,
      state,
      offset,
      hours,
      placeholder,
      planned,
      source,
      hint:
        stage.id === 'Deploy'
          ? '部署时间 · 未跟踪'
          : stage.id === 'Test' && !source && versions.length
            ? '首次交付 · 未确认'
            : `${sourceLabel} · ${status}`
    }
    offset += hours
    return slot
  })
  const markers: { id: string; label: string; at: string; offset: number }[] = []
  if (timeline.points.baseline) {
    markers.push({ id: 'baseline', label: '周期起点', at: timeline.points.baseline.at, offset: 0 })
  }
  for (const [index, key, label] of [
    [0, 'intent', '意图确认'],
    [1, 'design', '设计定稿'],
    [2, 'development', '开发交付']
  ] as const) {
    const point = timeline.points[key]
    const slot = slots[index]!
    if (point) {
      markers.push({ id: key, label, at: point.at, offset: slot.offset + slot.hours })
    }
  }
  const current = slots.find((stage) => stage.state === 'current')
  if (current && validTime(current.end)) {
    markers.push({
      id: 'observed',
      label: `当前 · ${current.id}`,
      at: current.end,
      offset: current.offset + current.hours
    })
  }
  // A failed goal still has an acceptance source; it is not a completed Test stage.
  const deliveries = versions.map((event) => {
    const time = Date.parse(event.at)
    const actual = slots.find(
      (slot) =>
        !slot.placeholder &&
        validTime(slot.start) &&
        validTime(slot.end) &&
        time >= Date.parse(slot.start) &&
        time <= Date.parse(slot.end)
    )
    const slot =
      event.deliveryKind === 'first'
        ? slots[3]!
        : event.deliveryKind === 'maintenance'
          ? slots[5]!
          : (actual ?? slots[3]!)
    const hours =
      validTime(event.at) && !slot.placeholder && validTime(slot.start)
        ? Math.max(0, Math.min(slot.hours, (Date.parse(event.at) - Date.parse(slot.start)) / HOUR))
        : slot.hours
    return { event, offset: slot.offset + hours }
  })
  return { slots, markers, deliveries, total: offset }
}
